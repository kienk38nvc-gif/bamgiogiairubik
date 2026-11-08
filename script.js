
// ==========================================
// 1. DOM & CONFIGURATION
// ==========================================

const $ = id => document.getElementById(id);

// Trạng thái đồng hồ
// idle | inspection | holding | running | stopped
let state = 'idle';

let startAt = 0;
let raf = 0;
let current = 0;

// Inspection
let inspectionStart = 0;
let inspectionInterval = null;
let inspectionDuration = 15;
let inspectionDurationMs = inspectionDuration * 1000;

// Hold-to-ready (giữ 0.3s trước khi chạy)
const HOLD_DURATION = 300;
let holdTimeout = null;
let holdStart = 0;

// Âm thanh
let audioContext = null;

// Lịch sử
let solves = [];

try {
    solves = JSON.parse(
        localStorage.getItem('cubeTimerSolves') || '[]'
    );
    if (!Array.isArray(solves)) solves = [];
} catch {
    solves = [];
}

// Lọc lịch sử
let viewMode = 'all';

// Ngăn giữ phím lặp
let spacePressed = false;


// ==========================================
// 2. AUDIO - ÂM THANH
// ==========================================

function initAudio() {

    if (!audioContext) {
        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (AudioContextClass) {
            audioContext = new AudioContextClass();
        }
    }

    if (audioContext?.state === 'suspended') {
        audioContext.resume();
    }
}

function playBeep(freq = 1000, duration = 0.5) {

    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = freq;

    gain.gain.setValueAtTime(0.3, audioContext.currentTime);

    gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
}


// ==========================================
// 3. INSPECTION SETTINGS
// ==========================================

$('inspectionSelect').addEventListener('change', e => {

    if (state !== 'idle') {
        reset();
    }

    inspectionDuration = Number(e.target.value);
    inspectionDurationMs = inspectionDuration * 1000;

    $('inspectionDisplay').textContent =
        inspectionDuration === 0
            ? 'OFF'
            : inspectionDuration + 's';

    $('timer').textContent = '00:00.00';

    $('hint').textContent =
        inspectionDuration === 0
            ? 'Nhấn SPACE để bắt đầu giải'
            : 'Nhấn SPACE để bắt đầu Inspection';
});


// ==========================================
// 4. SCRAMBLE — Chuẩn WCA (chống triệt tiêu trục)
// ==========================================

const faces  = ['R', 'L', 'U', 'D', 'F', 'B'];
const suffix = ['', "'", '2'];

// Nhóm đối diện: R-L, U-D, F-B
const opposite = { R:'L', L:'R', U:'D', D:'U', F:'B', B:'F' };

function scramble() {

    let a    = [];
    let last = '';
    let prev = '';   // Nước đi trước last (để chống R L R')

    for (let i = 0; i < 20; i++) {

        let f;

        do {
            f = faces[Math.floor(Math.random() * faces.length)];
        } while (
            f === last ||                            // Trùng mặt vừa đánh
            (f === opposite[last] && f === opposite[prev])  // Cả 3 cùng trục
        );

        a.push(f + suffix[Math.floor(Math.random() * suffix.length)]);

        prev = last;
        last = f;
    }

    const text = a.join('   ');
    $('scramble').textContent = text;
    return text;
}


// ==========================================
// 5. FORMAT TIME
// ==========================================

function format(ms) {

    if (ms === null || !Number.isFinite(ms)) {
        return 'DNF';
    }

    let totalSeconds = ms / 1000;
    let minutes      = Math.floor(totalSeconds / 60);
    let seconds      = (totalSeconds % 60).toFixed(2);

    return (
        String(minutes).padStart(2, '0') +
        ':' +
        seconds.padStart(5, '0')
    );
}


// ==========================================
// 6. INSPECTION COUNTDOWN
// ==========================================

function startInspection() {

    if (state !== 'idle') return;

    // Nếu không dùng Inspection → chờ giữ phím để bắt đầu
    if (inspectionDuration === 0) {
        enterHolding();
        return;
    }

    initAudio();

    state = 'inspection';
    current = 0;
    inspectionStart = performance.now();

    $('timer').className = '';
    $('hint').textContent = 'Đang Inspection · Nhấn SPACE để sẵn sàng';

    function updateInspection() {

        if (state !== 'inspection') return;

        let elapsed   = performance.now() - inspectionStart;
        let remaining = Math.max(0, inspectionDurationMs - elapsed);
        let seconds   = Math.ceil(remaining / 1000);

        $('inspectionDisplay').textContent = seconds + 's';
        $('timer').textContent = seconds + 's';

        if (remaining <= 0) {

            clearInterval(inspectionInterval);
            inspectionInterval = null;

            // Hết giờ → tự động DNF theo WCA
            state = 'idle';
            $('timer').textContent = 'DNF';
            $('timer').className   = 'dnf';
            $('inspectionDisplay').textContent =
                inspectionDuration + 's';
            $('hint').textContent =
                'Hết Inspection! Nhấn SPACE để tiếp tục';

            playBeep(600, 0.8);
        }
    }

    updateInspection();
    inspectionInterval = setInterval(updateInspection, 50);
}


// ==========================================
// 7. HOLD-TO-READY (Giữ phím 0.3s → xanh lá → Thả → chạy)
// ==========================================

function enterHolding() {

    // Cho phép bắt đầu holding từ idle hoặc inspection
    if (state !== 'idle' && state !== 'inspection') return;

    // Dừng đếm inspection
    clearInterval(inspectionInterval);
    inspectionInterval = null;

    state = 'holding';
    holdStart = performance.now();

    $('timer').className   = 'holding';
    $('hint').textContent  = 'Đang giữ · Thả để bắt đầu...';

    holdTimeout = setTimeout(() => {

        if (state !== 'holding') return;

        $('timer').className  = 'ready';
        $('hint').textContent = 'Thả SPACE để bắt đầu!';

        playBeep(1200, 0.15);

    }, HOLD_DURATION);
}


function releaseHolding() {

    if (state !== 'holding') return;

    clearTimeout(holdTimeout);
    holdTimeout = null;

    let held = performance.now() - holdStart;

    if (held >= HOLD_DURATION) {
        // Giữ đủ lâu → bắt đầu tính giờ
        startTimer();
    } else {
        // Thả quá sớm → chỉ về idle, KHÔNG reset hiển thị kết quả
        state = 'idle';
        $('timer').className = '';
        $('hint').textContent =
            inspectionDuration === 0
                ? 'Nhấn SPACE để bắt đầu giải'
                : 'Nhấn SPACE để bắt đầu Inspection';
    }
}


// ==========================================
// 8. START TIMER
// ==========================================

function startTimer() {

    state   = 'running';
    current = 0;
    startAt = performance.now();

    $('timer').className  = '';
    $('hint').textContent = 'Đang giải · Nhấn SPACE để dừng';

    raf = requestAnimationFrame(tick);
}


// ==========================================
// 9. TIMER TICK
// ==========================================

function tick() {

    if (state !== 'running') return;

    current = performance.now() - startAt;

    $('timer').textContent = format(current);

    raf = requestAnimationFrame(tick);
}


// ==========================================
// 10. STOP TIMER
// ==========================================

function stop() {

    if (state !== 'running') return;

    cancelAnimationFrame(raf);

    current = performance.now() - startAt;

    state = 'stopped';

    $('timer').textContent = format(current);
    $('timer').className   = 'stopped';

    // Lưu kết quả (mặc định: không phạt)
    let currentScramble = $('scramble').textContent.trim();

    solves.unshift({
        ms:      current,
        result:  current,   // Chưa có phạt
        penalty: 'ok',      // 'ok' | '+2' | 'dnf'
        at:      Date.now(),
        scramble: currentScramble
    });

    localStorage.setItem('cubeTimerSolves', JSON.stringify(solves));

    render();

    $('hint').textContent =
        'Đã lưu · Nhấn SPACE để tiếp tục';

    // Sinh scramble mới
    scramble();

    // Reset inspection display
    $('inspectionDisplay').textContent =
        inspectionDuration === 0 ? 'OFF' : inspectionDuration + 's';
}


// ==========================================
// 11. KEYBOARD & POINTER EVENTS
// ==========================================

function onDown() {

    initAudio();

    if (state === 'running') {
        stop();
        return;
    }

    if (state === 'stopped' || state === 'idle') {
        state = 'idle';          // Chuẩn hóa về idle trước
        startInspection();
        return;
    }

    if (state === 'inspection') {
        enterHolding();
        return;
    }
}

function onUp() {

    if (state === 'holding') {
        releaseHolding();
    }
}


// --- Bàn phím ---
document.addEventListener('keydown', e => {

    if (
        e.code === 'Space' &&
        !['INPUT', 'SELECT', 'TEXTAREA'].includes(
            document.activeElement.tagName
        )
    ) {
        e.preventDefault();

        if (spacePressed || e.repeat) return;
        spacePressed = true;

        onDown();
    }

    if (e.key === 'Escape') {
        reset();
        closeFeature();
    }
});

document.addEventListener('keyup', e => {

    if (e.code === 'Space') {

        e.preventDefault();

        if (!spacePressed) return;
        spacePressed = false;

        onUp();
    }
});


// --- Chuột / cảm ứng ---
$('timerArea').addEventListener('pointerdown', e => {

    e.preventDefault();

    if (spacePressed) return;
    spacePressed = true;

    initAudio();
    onDown();
});

document.addEventListener('pointerup', () => {

    if (!spacePressed) return;
    spacePressed = false;

    onUp();
});


// ==========================================
// 12. RESET
// ==========================================

function reset() {

    cancelAnimationFrame(raf);
    clearInterval(inspectionInterval);
    clearTimeout(holdTimeout);

    inspectionInterval = null;
    holdTimeout        = null;
    state              = 'idle';
    spacePressed       = false;
    current            = 0;

    $('timer').textContent = '00:00.00';
    $('timer').className   = '';

    $('inspectionDisplay').textContent =
        inspectionDuration === 0 ? 'OFF' : inspectionDuration + 's';

    $('hint').textContent =
        inspectionDuration === 0
            ? 'Nhấn SPACE để bắt đầu giải'
            : 'Nhấn SPACE để bắt đầu Inspection';
}


// ==========================================
// 13. PENALTY — Áp dụng cho lượt giải vừa xong
// ==========================================

function applyPenalty(penalty) {

    // Chỉ áp dụng khi vừa dừng (state === 'stopped')
    // hoặc áp dụng ngay từ bảng lịch sử qua index
    if (solves.length === 0) return;

    let s = solves[0];

    s.penalty = penalty;

    if (penalty === 'dnf') {
        s.result = null;
    } else if (penalty === '+2') {
        s.result = s.ms + 2000;
    } else {
        s.result = s.ms;
    }

    localStorage.setItem('cubeTimerSolves', JSON.stringify(solves));

    render();
}

function applyPenaltyAt(index, penalty) {

    if (index < 0 || index >= solves.length) return;

    let s = solves[index];

    s.penalty = penalty;

    if (penalty === 'dnf') {
        s.result = null;
    } else if (penalty === '+2') {
        s.result = s.ms + 2000;
    } else {
        s.result = s.ms;
    }

    localStorage.setItem('cubeTimerSolves', JSON.stringify(solves));

    render();
}

function deleteSolveAt(index) {

    if (index < 0 || index >= solves.length) return;

    solves.splice(index, 1);

    localStorage.setItem('cubeTimerSolves', JSON.stringify(solves));

    render();
}


// ==========================================
// 14. STATISTICS
// ==========================================

function visibleSolves() {

    if (viewMode === 'day') {

        return solves.filter(s =>
            new Date(s.at).toDateString() ===
            new Date().toDateString()
        );
    }

    return solves;
}


function avgAt(i, n, data = visibleSolves()) {

    if (data.length - i < n) return null;

    let a = data
        .slice(i, i + n)
        .map(x => x.result);

    a.sort((x, y) => (x ?? Infinity) - (y ?? Infinity));

    // Ao5+ bỏ 1 tốt nhất và 1 xấu nhất
    if (n >= 5) {
        a = a.slice(1, -1);
    }

    // DNF còn lại sau khi bỏ → kết quả DNF
    if (a.some(x => x === null)) return null;

    return a.reduce((sum, x) => sum + x, 0) / a.length;
}


function currentAvg(n) {
    return avgAt(0, n);
}


function bestAvg(n) {

    let data = visibleSolves();
    let best = null;

    for (let i = 0; i <= data.length - n; i++) {

        let value = avgAt(i, n, data);

        if (value !== null && (best === null || value < best)) {
            best = value;
        }
    }

    return best;
}


function bestSingle() {

    let values = visibleSolves()
        .map(x => x.result)
        .filter(x => x !== null);

    return values.length ? Math.min(...values) : null;
}


function txt(value) {
    return value === null ? '—' : format(value);
}


// ==========================================
// 15. RENDER STATISTICS & HISTORY
// ==========================================

function render() {

    let data  = visibleSolves();
    let valid = data.filter(x => x.result !== null);

    // Thẻ thống kê
    $('miniSingle').textContent =
        data.length ? txt(data[0].result) : '—';

    $('miniBest').textContent = txt(bestSingle());

    $('miniAo5').textContent  = txt(currentAvg(5));

    $('miniAo12').textContent = txt(currentAvg(12));

    $('pbAo5').textContent    = txt(bestAvg(5));


    // Overview
    let rows = [
        ['SINGLE',    data.length ? data[0].result : null, bestSingle()],
        ['AO5',       currentAvg(5),    bestAvg(5)],
        ['AO12',      currentAvg(12),   bestAvg(12)],
        ['AO100',     currentAvg(100),  bestAvg(100)],
        ['AO1000',    currentAvg(1000), bestAvg(1000)],
        [
            'TOTAL AVG',
            valid.length
                ? valid.reduce((a, x) => a + x.result, 0) / valid.length
                : null,
            null
        ]
    ];

    $('overview').innerHTML = rows.map(r => `

        <div class="overview-row">

            <span>${r[0]}</span>

            <strong>${txt(r[1])}</strong>

            <strong>${txt(r[2])}</strong>

        </div>

    `).join('');


    // History
    $('times').innerHTML = '';

    if (data.length === 0) {

        $('times').innerHTML = `
            <div class="empty">
                Chưa có lượt giải nào.<br>
                Nhấn SPACE để bắt đầu!
            </div>
        `;
    }

    // Ánh xạ index hiển thị → index trong solves[] gốc
    let globalData = solves;

    data.slice(0, 100).forEach((s, i) => {

        // Tìm index gốc trong solves[]
        let globalIndex = globalData.indexOf(s);

        let row = document.createElement('div');
        row.className = 'time-row';

        let n = document.createElement('span');
        let a = document.createElement('span');
        let t = document.createElement('span');
        let actions = document.createElement('div');

        n.textContent = (data.length - i) + '.';

        a.textContent =
            i + 5 <= data.length
                ? txt(avgAt(i, 5, data))
                : '—';

        // Hiển thị kết quả + nhãn phạt
        let timeLabel = txt(s.result);
        if (s.penalty === '+2') timeLabel += ' (+2)';

        t.textContent = timeLabel;
        t.className   = 'single' + (s.result === null ? ' penalty' : '');
        t.title       = new Date(s.at).toLocaleString('vi-VN') +
                        (s.scramble ? '\n' + s.scramble : '');

        // Nút hành động
        actions.className = 'row-actions';

        let penaltyOk  = makePenaltyBtn('OK',   'ok',   globalIndex, s.penalty);
        let penaltyPlus = makePenaltyBtn('+2',  '+2',  globalIndex, s.penalty);
        let penaltyDnf  = makePenaltyBtn('DNF', 'dnf', globalIndex, s.penalty);
        let deleteBtn   = makeDeleteBtn(globalIndex);

        actions.append(penaltyOk, penaltyPlus, penaltyDnf, deleteBtn);

        row.append(n, a, t, actions);
        $('times').append(row);
    });


    // Biểu đồ
    drawCharts();
}


function makePenaltyBtn(label, penalty, index, currentPenalty) {

    let btn = document.createElement('button');
    btn.textContent = label;
    btn.className   = 'action-btn penalty-btn' +
                      (currentPenalty === penalty ? ' active' : '');

    btn.onclick = e => {
        e.stopPropagation();
        applyPenaltyAt(index, penalty);
    };

    return btn;
}


function makeDeleteBtn(index) {

    let btn = document.createElement('button');
    btn.textContent = '✕';
    btn.className   = 'action-btn delete-btn';
    btn.title       = 'Xóa lượt giải này';

    btn.onclick = e => {
        e.stopPropagation();
        if (confirm('Xóa lượt giải này?')) {
            deleteSolveAt(index);
        }
    };

    return btn;
}


// ==========================================
// 16. CANVAS CONTEXT
// ==========================================

function createCanvasContext(id, height = 150) {

    let canvas = $(id);
    let rect   = canvas.getBoundingClientRect();
    let d      = window.devicePixelRatio || 1;

    canvas.width  = Math.max(1, rect.width * d);
    canvas.height = height * d;

    let ctx = canvas.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);

    return { x: ctx, w: rect.width, h: height };
}


// ==========================================
// 17. PROGRESS CHART & DISTRIBUTION
// ==========================================

function drawCharts() {

    // --- Line Chart (Progress) ---
    let lineData = visibleSolves()
        .slice(0, 30)
        .map(x => x.result === null ? null : x.result / 1000)
        .reverse();

    let lineObj = createCanvasContext('lineChart');
    let ctx     = lineObj.x;
    let w       = lineObj.w;
    const H     = 150;

    ctx.clearRect(0, 0, w, H);

    let validLine = lineData.filter(x => x !== null);
    let max       = validLine.length
        ? Math.max(...validLine) * 1.1
        : 15;

    max = Math.max(max, 1);

    // Lưới trục Y
    ctx.strokeStyle = '#303847';
    ctx.fillStyle   = '#7e8797';
    ctx.font        = '10px Arial';

    for (let i = 0; i < 4; i++) {

        let y          = 145 - i * (130 / 3);
        let labelValue = max * i / 3;

        ctx.beginPath();
        ctx.moveTo(25, y);
        ctx.lineTo(w - 5, y);
        ctx.stroke();

        ctx.fillText(labelValue.toFixed(1) + 's', 2, y + 3);
    }

    // Vẽ đường
    ctx.strokeStyle = '#7180ff';
    ctx.lineWidth   = 2;
    ctx.beginPath();

    let drawn = false;

    lineData.forEach((v, i) => {

        if (v === null) return;

        let x = 27 + i * (w - 35) / Math.max(1, lineData.length - 1);
        let y = 145 - (v / max) * 130;

        if (!drawn || lineData[i - 1] === null) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }

        drawn = true;
    });

    ctx.stroke();

    // Vẽ chấm nếu chỉ có 1 điểm
    if (validLine.length === 1) {

        let idx = lineData.findIndex(v => v !== null);
        let x   = 27 + idx * (w - 35) / Math.max(1, lineData.length - 1);
        let y   = 145 - (lineData[idx] / max) * 130;

        ctx.fillStyle = '#7180ff';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    }


    // --- Bar Chart (Distribution — tự động theo dữ liệu thực tế) ---
    let barObj  = createCanvasContext('barChart');
    let q       = barObj.x;
    let bwWidth = barObj.w;

    let vals = visibleSolves()
        .filter(x => x.result !== null)
        .map(x => x.result / 1000);

    q.clearRect(0, 0, bwWidth, H);

    if (vals.length === 0) {
        q.fillStyle = '#7e8797';
        q.font      = '12px Arial';
        q.fillText('Chưa có dữ liệu', bwWidth / 2 - 50, 80);
        return;
    }

    // Tính động min/max và chia 7 bin
    const NUM_BINS = 7;
    let minVal = Math.floor(Math.min(...vals));
    let maxVal = Math.ceil(Math.max(...vals));

    if (maxVal === minVal) maxVal = minVal + 1;

    let binSize = (maxVal - minVal) / NUM_BINS;
    let bins    = Array(NUM_BINS).fill(0);

    vals.forEach(v => {

        let idx = Math.min(
            NUM_BINS - 1,
            Math.floor((v - minVal) / binSize)
        );

        bins[idx]++;
    });

    let bm = Math.max(1, ...bins);

    bins.forEach((v, i) => {

        let bw = (bwWidth - 35) / NUM_BINS - 5;
        let x  = 25 + i * (bwWidth - 30) / NUM_BINS;
        let y  = 140 - (v / bm) * 120;

        q.fillStyle   = '#5968dc';
        q.globalAlpha = 0.8;

        q.beginPath();
        q.roundRect(x, y, bw, 140 - y, 5);
        q.fill();

        q.globalAlpha = 1;
        q.fillStyle   = '#8992a3';
        q.font        = '9px Arial';

        // Nhãn bin: "10s-12s"
        let lo = (minVal + i * binSize).toFixed(0);
        let hi = (minVal + (i + 1) * binSize).toFixed(0);

        q.fillText(lo + 's', x, 150);
    });
}


// ==========================================
// 18. HISTORY TABS
// ==========================================

$('allTab').onclick = () => {

    viewMode = 'all';

    $('allTab').classList.add('active');
    $('dayTab').classList.remove('active');

    render();
};


$('dayTab').onclick = () => {

    viewMode = 'day';

    $('dayTab').classList.add('active');
    $('allTab').classList.remove('active');

    render();
};


// ==========================================
// 19. CLEAR HISTORY
// ==========================================

$('clearHistory').onclick = () => {

    if (solves.length === 0) {
        alert('Lịch sử đang trống!');
        return;
    }

    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử giải không?')) {

        solves = [];
        localStorage.removeItem('cubeTimerSolves');
        render();

        $('hint').textContent = 'Đã xóa toàn bộ lịch sử giải!';
    }
};


// ==========================================
// 20. BUTTON EVENTS
// ==========================================

// Nút Bắt đầu / Dừng
$('startBtn').onclick = () => {

    if (state === 'running') {
        stop();
    } else if (state === 'stopped' || state === 'idle') {
        startInspection();
    } else if (state === 'inspection') {
        enterHolding();
    }
};


// Reset
$('resetBtn').onclick = reset;


// Scramble mới
$('newScramble').onclick = scramble;


// Copy Scramble
$('copyScramble').onclick = async () => {

    try {
        await navigator.clipboard.writeText(
            $('scramble').textContent.trim()
        );
        $('copyScramble').textContent = 'Đã copy!';
        setTimeout(() => {
            $('copyScramble').textContent = 'Copy';
        }, 1200);
    } catch {
        alert('Không thể copy Scramble!');
    }
};


// ==========================================
// 21. ALGORITHMS
// ==========================================

const algorithms = [

    { name: 'F2L - Ghép góc và cạnh',    category: 'F2L', moves: "U R U' R' U' F' U F" },
    { name: 'F2L - Trường hợp cơ bản',   category: 'F2L', moves: "U R U' R'" },
    { name: 'F2L - Ghép từ bên trái',    category: 'F2L', moves: "U' L' U L U F U' F'" },
    { name: 'OLL - Tạo dấu cộng vàng',   category: 'OLL', moves: "F R U R' U' F'" },
    { name: 'OLL - Dạng chữ L',          category: 'OLL', moves: "F U R U' R' F'" },
    { name: 'OLL - Dạng chữ T',          category: 'OLL', moves: "R U R' U' R' F R F'" },
    { name: 'PLL - Đổi cạnh tầng cuối',  category: 'PLL', moves: "R U' R U R U R U' R' U' R2" },
    { name: 'PLL - Hoán vị góc',         category: 'PLL', moves: "U R U' L' U R' U' L" },
    { name: 'PLL - T-Perm',              category: 'PLL', moves: "R U R' U' R' F R2 U' R' U' R U R' F'" },
    { name: 'PLL - Y-Perm',              category: 'PLL', moves: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },

];


function showAlgorithms(category = 'ALL', keyword = '') {

    let data = algorithms.filter(a => {

        let matchCategory =
            category === 'ALL' || a.category === category;

        let matchName =
            a.name.toLowerCase().includes(keyword.toLowerCase()) ||
            a.moves.toLowerCase().includes(keyword.toLowerCase());

        return matchCategory && matchName;
    });

    // Chỉ cập nhật phần danh sách công thức (không render lại search + tabs)
    // để tránh giật focus
    let container = $('featureContent');

    // Nếu chưa có search & tabs, render lần đầu
    if (!$('algorithmSearch')) {

        container.innerHTML = `

            <input
                class="feature-search"
                id="algorithmSearch"
                placeholder="Tìm kiếm công thức..."
            >

            <div class="feature-tabs" id="algorithmTabs">

                ${['ALL', 'F2L', 'OLL', 'PLL'].map(c => `
                    <button data-category="${c}" class="${c === category ? 'active-tab' : ''}">
                        ${c}
                    </button>
                `).join('')}

            </div>

            <div id="algorithmList"></div>

        `;

        $('algorithmSearch').addEventListener('input', e => {

            let currentCat =
                container.querySelector('[data-category].active-tab')
                    ?.dataset.category || 'ALL';

            showAlgorithms(currentCat, e.target.value);
        });

        document.querySelectorAll('[data-category]').forEach(btn => {

            btn.onclick = () => {

                document.querySelectorAll('[data-category]')
                    .forEach(b => b.classList.remove('active-tab'));

                btn.classList.add('active-tab');

                showAlgorithms(
                    btn.dataset.category,
                    $('algorithmSearch').value
                );
            };
        });
    }

    // Cập nhật trạng thái active-tab
    document.querySelectorAll('[data-category]').forEach(b => {
        b.classList.toggle('active-tab', b.dataset.category === category);
    });

    // Chỉ cập nhật danh sách
    $('algorithmList').innerHTML = data.length
        ? data.map((a, i) => `

            <div class="feature-card">

                <h3>${a.name}</h3>

                <p>Nhóm: ${a.category}</p>

                <div class="algorithm">${a.moves}</div>

                <button data-copy="${i}">Copy công thức</button>

            </div>

        `).join('')
        : '<p>Không tìm thấy công thức.</p>';


    // Copy công thức
    $('algorithmList').querySelectorAll('[data-copy]').forEach(btn => {

        btn.onclick = async () => {

            let item = data[Number(btn.dataset.copy)];

            try {
                await navigator.clipboard.writeText(item.moves);
                btn.textContent = 'Đã copy!';
                setTimeout(() => {
                    btn.textContent = 'Copy công thức';
                }, 1500);
            } catch {
                btn.textContent = 'Không thể copy';
                setTimeout(() => {
                    btn.textContent = 'Copy công thức';
                }, 1500);
            }
        };
    });
}


// ==========================================
// 22. LESSONS
// ==========================================

const lessons = [

    {
        title: 'Bài 1: Tạo dấu cộng trắng',
        content: 'Tìm 4 viên cạnh có màu trắng. Đưa chúng về đúng vị trí quanh tâm trắng, đồng thời khớp màu cạnh bên với tâm tương ứng.'
    },

    {
        title: 'Bài 2: Hoàn thành tầng 1',
        content: 'Tìm 4 viên góc có màu trắng. Đưa từng viên góc vào đúng vị trí để hoàn thành mặt trắng và tầng đầu tiên.'
    },

    {
        title: 'Bài 3: Giải tầng 2',
        content: 'Tìm các viên cạnh không có màu vàng ở tầng trên. Đưa chúng xuống đúng vị trí ở tầng giữa bằng phương pháp F2L cơ bản.'
    },

    {
        title: 'Bài 4: Tạo dấu cộng vàng',
        content: "Đưa các cạnh màu vàng lên mặt trên. Có thể gặp dạng chấm, chữ L hoặc đường thẳng. Sử dụng công thức F R U R' U' F'."
    },

    {
        title: 'Bài 5: Hoàn thành mặt vàng',
        content: 'Định hướng các góc màu vàng để toàn bộ mặt trên có màu vàng.'
    },

    {
        title: 'Bài 6: Hoàn thành Rubik',
        content: 'Hoán vị các góc và cạnh ở tầng cuối để tất cả các mặt của Rubik đồng nhất màu.'
    }

];


let lessonIndex = 0;


function showLesson() {

    let lesson = lessons[lessonIndex];

    $('featureContent').innerHTML = `

        <div class="feature-card">

            <small>
                LESSON ${lessonIndex + 1} / ${lessons.length}
            </small>

            <h3>${lesson.title}</h3>

            <p>${lesson.content}</p>

        </div>

        <div class="lesson-navigation">

            <button id="previousLesson"
                ${lessonIndex === 0 ? 'disabled' : ''}>

                ← Bài trước

            </button>

            <button id="nextLesson"
                ${lessonIndex === lessons.length - 1 ? 'disabled' : ''}>

                Bài tiếp →

            </button>

        </div>

    `;

    $('previousLesson').onclick = () => changeLesson(-1);
    $('nextLesson').onclick     = () => changeLesson(1);
}


function changeLesson(step) {

    lessonIndex = Math.max(
        0,
        Math.min(lessons.length - 1, lessonIndex + step)
    );

    showLesson();
}


// ==========================================
// 23. ANALYSIS
// ==========================================

function showAnalysis() {

    let data   = visibleSolves();
    let valid  = data.filter(s => s.result !== null);
    let total  = data.length;

    let average = valid.length
        ? valid.reduce((sum, s) => sum + s.result, 0) / valid.length
        : null;

    let best = valid.length
        ? Math.min(...valid.map(s => s.result))
        : null;

    let dnf    = data.filter(s => s.result === null).length;
    let plusTwo = data.filter(s => s.penalty === '+2').length;

    $('featureContent').innerHTML = `

        <div class="feature-card">

            <h3>Detailed Analysis</h3>

            <p>Tổng số lượt giải: <strong>${total}</strong></p>

            <p>Lượt hợp lệ: <strong>${valid.length}</strong></p>

            <p>DNF: <strong>${dnf}</strong></p>

            <p>+2: <strong>${plusTwo}</strong></p>

            <p>Trung bình: <strong>${txt(average)}</strong></p>

            <p>Best Single: <strong>${txt(best)}</strong></p>

            <p>Best Ao5: <strong>${txt(bestAvg(5))}</strong></p>

            <p>Best Ao12: <strong>${txt(bestAvg(12))}</strong></p>

        </div>

    `;

    drawAnalysisChart();
}


// ==========================================
// 24. ANALYSIS CHART
// ==========================================

function drawAnalysisChart() {

    let canvas = $('analysisChart');
    let rect   = canvas.getBoundingClientRect();
    let d      = window.devicePixelRatio || 1;

    canvas.width  = Math.max(1, rect.width * d);
    canvas.height = 180 * d;

    let ctx = canvas.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);

    let values = visibleSolves()
        .slice(0, 30)
        .filter(s => s.result !== null)
        .map(s => s.result / 1000)
        .reverse();

    ctx.clearRect(0, 0, rect.width, 180);

    if (values.length === 0) {

        ctx.fillStyle = '#858d9c';
        ctx.font      = '13px Arial';
        ctx.fillText('Chưa có dữ liệu giải', 10, 30);
        return;
    }

    let max = Math.max(...values, 10);

    ctx.strokeStyle = '#6575ff';
    ctx.lineWidth   = 2;
    ctx.beginPath();

    values.forEach((v, i) => {

        let x = 10 + i * (rect.width - 20) / Math.max(1, values.length - 1);
        let y = 160 - (v / max) * 140;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();

    // Chấm nếu 1 điểm
    if (values.length === 1) {

        let x = 10;
        let y = 160 - (values[0] / max) * 140;

        ctx.fillStyle = '#6575ff';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}


// ==========================================
// 25. OPEN / CLOSE FEATURES
// ==========================================

function openFeature(title) {

    $('featureTitle').textContent = title;
    $('featureView').classList.add('show');

    // Ẩn / hiện canvas analysis
    $('analysisContent').style.display =
        title === 'Analysis' ? 'block' : 'none';
}


function closeFeature() {
    $('featureView').classList.remove('show');
}


$('algBtn').onclick = () => {

    openFeature('Algorithms');

    // Reset featureContent để tạo lại search + tabs
    $('featureContent').innerHTML = '';

    showAlgorithms();
};


$('lessonBtn').onclick = () => {

    openFeature('Lessons');
    lessonIndex = 0;
    showLesson();
};


$('analysisBtn').onclick = () => {

    openFeature('Analysis');
    showAnalysis();
};


$('closeFeature').onclick = closeFeature;


// Click bên ngoài để đóng
$('featureView').addEventListener('click', e => {

    if (e.target === $('featureView')) {
        closeFeature();
    }
});


// ==========================================
// 26. RESIZE
// ==========================================

window.addEventListener('resize', () => {

    drawCharts();

    if (
        $('featureView').classList.contains('show') &&
        $('featureTitle').textContent === 'Analysis'
    ) {
        drawAnalysisChart();
    }
});


// ==========================================
// 27. INITIALIZE
// ==========================================

$('inspectionDisplay').textContent =
    inspectionDuration + 's';

scramble();

render();

$('timer').textContent = '00:00.00';

$('hint').textContent = 'Nhấn SPACE để bắt đầu Inspection';
