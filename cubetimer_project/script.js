
// ==========================================
// 1. DOM & CONFIGURATION
// ==========================================

const $ = id => document.getElementById(id);

// Trạng thái đồng hồ
let state = 'idle';
// idle | inspection | ready | running

let startAt = 0;
let raf = 0;
let current = 0;

// Inspection
let inspectionStart = 0;
let inspectionInterval = null;

let inspectionDuration = 15;
let inspectionDurationMs = inspectionDuration * 1000;

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

function playBeep() {

    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 1000;

    gain.gain.setValueAtTime(
        0.3,
        audioContext.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + 0.5
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.5);
}


// ==========================================
// 3. INSPECTION SETTINGS
// ==========================================

// Thay đổi thời gian Inspection
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
            ? 'Inspection đã tắt'
            : 'Nhấn giữ SPACE để bắt đầu Inspection';
});


// ==========================================
// 4. SCRAMBLE
// ==========================================

const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
const suffix = ['', "'", '2'];

function scramble() {

    let a = [];
    let last = '';

    for (let i = 0; i < 20; i++) {

        let f;

        do {
            f = faces[Math.floor(Math.random() * faces.length)];
        } while (f === last);

        a.push(
            f + suffix[Math.floor(Math.random() * suffix.length)]
        );

        last = f;
    }

    $('scramble').textContent = a.join('   ');
}


// ==========================================
// 5. FORMAT TIME
// ==========================================

function format(ms) {

    if (ms === null || !Number.isFinite(ms)) {
        return 'DNF';
    }

    let totalSeconds = ms / 1000;

    let minutes = Math.floor(totalSeconds / 60);

    let seconds = (totalSeconds % 60).toFixed(2);

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

    // Không sử dụng Inspection
    if (inspectionDuration === 0) {
        start();
        return;
    }

    initAudio();

    state = 'inspection';

    current = 0;

    inspectionStart = performance.now();

    $('hint').textContent =
        'Đang Inspection · Thả SPACE để bắt đầu';

    $('timer').className = '';

    function updateInspection() {

        if (state !== 'inspection') return;

        let elapsed =
            performance.now() - inspectionStart;

        let remaining = Math.max(
            0,
            inspectionDurationMs - elapsed
        );

        let seconds = Math.ceil(remaining / 1000);

        // Cập nhật ô Inspection
        $('inspectionDisplay').textContent =
            seconds + 's';

        // Cập nhật đồng hồ chính
        $('timer').textContent = seconds + 's';

        // Hết thời gian
        if (remaining <= 0) {

            clearInterval(inspectionInterval);

            inspectionInterval = null;

            state = 'ready';

            $('inspectionDisplay').textContent = '0s';

            $('timer').textContent = '00:00.00';

            $('timer').className = 'ready';

            $('hint').textContent =
                'HẾT INSPECTION · Thả SPACE để bắt đầu';

            playBeep();
        }
    }

    updateInspection();

    inspectionInterval = setInterval(
        updateInspection,
        50
    );
}


// ==========================================
// 7. START TIMER
// ==========================================

function start() {

    if (state === 'running') return;

    clearInterval(inspectionInterval);
    inspectionInterval = null;

    state = 'running';

    current = 0;

    startAt = performance.now();

    $('timer').className = '';

    $('hint').textContent =
        'Đang giải · Nhấn SPACE để dừng';

    raf = requestAnimationFrame(tick);
}


// ==========================================
// 8. TIMER TICK
// ==========================================

function tick() {

    if (state !== 'running') return;

    current = performance.now() - startAt;

    $('timer').textContent = format(current);

    raf = requestAnimationFrame(tick);
}


// ==========================================
// 9. STOP TIMER
// ==========================================

function stop() {

    if (state !== 'running') return;

    cancelAnimationFrame(raf);

    current = performance.now() - startAt;

    state = 'idle';

    $('timer').textContent = format(current);

    let penalty = $('penalty').value;

    let result = penalty === 'dnf'
        ? null
        : current + Number(penalty) * 1000;

    solves.unshift({
        ms: current,
        result: result,
        at: Date.now()
    });

    // Lưu lịch sử
    localStorage.setItem(
        'cubeTimerSolves',
        JSON.stringify(solves)
    );

    render();

    scramble();

    $('inspectionDisplay').textContent =
        inspectionDuration === 0
            ? 'OFF'
            : inspectionDuration + 's';

    $('hint').textContent =
        'Đã lưu kết quả · Giữ SPACE để giải tiếp';
}


// ==========================================
// 10. KEYBOARD & MOUSE EVENTS
// ==========================================

function down() {

    if (state === 'running') {
        stop();
        return;
    }

    if (state !== 'idle') return;

    startInspection();
}


function up() {

    // Đang Inspection hoặc đã hết Inspection
    if (state === 'inspection' || state === 'ready') {
        start();
    }
}


// Bàn phím
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

        initAudio();

        down();
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

        up();
    }
});


// Chuột / cảm ứng
$('timerArea').addEventListener('pointerdown', e => {

    e.preventDefault();

    if (spacePressed) return;

    spacePressed = true;

    initAudio();

    down();
});

document.addEventListener('pointerup', () => {

    if (!spacePressed) return;

    spacePressed = false;

    up();
});


// ==========================================
// 11. RESET
// ==========================================

function reset() {

    cancelAnimationFrame(raf);

    clearInterval(inspectionInterval);

    inspectionInterval = null;

    state = 'idle';

    spacePressed = false;

    current = 0;

    $('timer').textContent = '00:00.00';

    $('timer').className = '';

    $('inspectionDisplay').textContent =
        inspectionDuration === 0
            ? 'OFF'
            : inspectionDuration + 's';

    $('hint').textContent =
        inspectionDuration === 0
            ? 'Nhấn SPACE để bắt đầu giải'
            : 'Nhấn giữ SPACE để bắt đầu Inspection';
}


// ==========================================
// 12. STATISTICS
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


// Tính trung bình Ao5, Ao12...
function avgAt(i, n, data = visibleSolves()) {

    if (data.length - i < n) return null;

    let a = data
        .slice(i, i + n)
        .map(x => x.result);

    a.sort((x, y) =>
        (x ?? Infinity) - (y ?? Infinity)
    );

    // Ao5 trở lên bỏ 1 kết quả tốt nhất và 1 kết quả xấu nhất
    if (n >= 5) {
        a = a.slice(1, -1);
    }

    // Nếu DNF vẫn còn sau khi bỏ kết quả xấu nhất
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

        if (
            value !== null &&
            (best === null || value < best)
        ) {
            best = value;
        }
    }

    return best;
}


function bestSingle() {

    let values = visibleSolves()
        .map(x => x.result)
        .filter(x => x !== null);

    return values.length
        ? Math.min(...values)
        : null;
}


function txt(value) {

    return value === null
        ? '—'
        : format(value);
}


// ==========================================
// 13. RENDER STATISTICS & HISTORY
// ==========================================

function render() {

    let data = visibleSolves();

    let valid = data.filter(x => x.result !== null);

    // Thẻ thống kê
    $('miniSingle').textContent =
        data.length ? txt(data[0].result) : '—';

    $('miniBest').textContent =
        txt(bestSingle());

    $('miniAo5').textContent =
        txt(currentAvg(5));

    $('miniAo12').textContent =
        txt(currentAvg(12));

    $('pbAo5').textContent =
        txt(bestAvg(5));


    // Overview
    let rows = [

        ['SINGLE', data.length ? data[0].result : null, bestSingle()],

        ['AO5', currentAvg(5), bestAvg(5)],

        ['AO12', currentAvg(12), bestAvg(12)],

        ['AO100', currentAvg(100), bestAvg(100)],

        ['AO1000', currentAvg(1000), bestAvg(1000)],

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

    data.slice(0, 100).forEach((s, i) => {

        let row = document.createElement('div');

        row.className = 'time-row';

        let n = document.createElement('span');
        let a = document.createElement('span');
        let t = document.createElement('span');

        n.textContent = (data.length - i) + '.';

        a.textContent =
            i + 5 <= data.length
                ? txt(avgAt(i, 5, data))
                : '—';

        t.textContent = txt(s.result);

        t.className =
            'single' + (s.result === null ? ' penalty' : '');

        t.title = new Date(s.at).toLocaleString('vi-VN');

        row.append(n, a, t);

        $('times').append(row);
    });


    // Biểu đồ
    drawCharts();
}


// ==========================================
// 14. CANVAS CONTEXT
// ==========================================

function createCanvasContext(id, height = 150) {

    let canvas = $(id);

    let rect = canvas.getBoundingClientRect();

    let d = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, rect.width * d);

    canvas.height = height * d;

    let ctx = canvas.getContext('2d');

    ctx.setTransform(d, 0, 0, d, 0, 0);

    return {
        x: ctx,
        w: rect.width,
        h: height
    };
}


// ==========================================
// 15. PROGRESS CHART & DISTRIBUTION
// ==========================================

function drawCharts() {

    // Line Chart
    let lineData = visibleSolves()
        .slice(0, 30)
        .map(x => x.result === null ? null : x.result / 1000)
        .reverse();

    let lineObj = createCanvasContext('lineChart');

    let ctx = lineObj.x;
    let w = lineObj.w;

    ctx.clearRect(0, 0, w, 150);

    ctx.strokeStyle = '#303847';
    ctx.fillStyle = '#7e8797';
    ctx.font = '10px Arial';

    for (let i = 0; i < 4; i++) {

        let y = 12 + i * 39;

        ctx.beginPath();
        ctx.moveTo(25, y);
        ctx.lineTo(w - 5, y);
        ctx.stroke();

        ctx.fillText(i * 5 + 's', 2, y + 3);
    }

    let max = Math.max(
        15,
        ...lineData.filter(x => x !== null)
    );

    ctx.strokeStyle = '#7180ff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    lineData.forEach((v, i) => {

        if (v === null) return;

        let x = 27 + i * (w - 35) /
            Math.max(1, lineData.length - 1);

        let y = 145 - v / max * 130;

        if (i === 0 || lineData[i - 1] === null) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();


    // Bar Chart
    let barObj = createCanvasContext('barChart');

    let q = barObj.x;
    let bwWidth = barObj.w;

    let vals = visibleSolves()
        .filter(x => x.result !== null)
        .map(x => x.result / 1000);

    let bins = Array(7).fill(0);

    vals.forEach(v => {

        let index = Math.max(
            0,
            Math.min(6, Math.floor(v / 2) - 3)
        );

        bins[index]++;
    });

    let bm = Math.max(1, ...bins);

    q.clearRect(0, 0, bwWidth, 150);

    bins.forEach((v, i) => {

        let bw = (bwWidth - 35) / 7 - 5;

        let x = 25 + i * (bwWidth - 30) / 7;

        let y = 140 - v / bm * 120;

        q.fillStyle = '#5968dc';

        q.globalAlpha = 0.8;

        q.beginPath();

        q.roundRect(x, y, bw, 140 - y, 5);

        q.fill();

        q.globalAlpha = 1;

        q.fillStyle = '#8992a3';

        q.font = '10px Arial';

        q.fillText((i + 3) * 2 + 's', x, 150);
    });
}


// ==========================================
// 16. HISTORY TABS
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
// 17. CLEAR HISTORY
// ==========================================

$('clearHistory').onclick = () => {

    if (solves.length === 0) {

        alert('Lịch sử đang trống!');

        return;
    }

    let confirmDelete = confirm(
        'Bạn có chắc chắn muốn xóa toàn bộ lịch sử giải không?'
    );

    if (confirmDelete) {

        solves = [];

        localStorage.removeItem('cubeTimerSolves');

        render();

        $('hint').textContent =
            'Đã xóa toàn bộ lịch sử giải!';
    }
};


// ==========================================
// 18. BUTTON EVENTS
// ==========================================

// Nút bắt đầu / dừng
$('startBtn').onclick = () => {

    if (state === 'running') {
        stop();
    } else if (state === 'idle') {
        start();
    } else {
        start();
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
            $('scramble').textContent
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
// 19. ALGORITHMS
// ==========================================

const algorithms = [

    {
        name: 'F2L - Ghép góc và cạnh',
        category: 'F2L',
        moves: "U R U' R' U' F' U F"
    },

    {
        name: 'F2L - Trường hợp cơ bản',
        category: 'F2L',
        moves: "U R U' R'"
    },

    {
        name: 'OLL - Tạo dấu cộng vàng',
        category: 'OLL',
        moves: "F R U R' U' F'"
    },

    {
        name: 'OLL - Dạng chữ L',
        category: 'OLL',
        moves: "F U R U' R' F'"
    },

    {
        name: 'PLL - Đổi cạnh tầng cuối',
        category: 'PLL',
        moves: "R U' R U R U R U' R' U' R2"
    },

    {
        name: 'PLL - Hoán vị góc',
        category: 'PLL',
        moves: "U R U' L' U R' U' L"
    }

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


    $('featureContent').innerHTML = `

        <input
            class="feature-search"
            id="algorithmSearch"
            placeholder="Tìm kiếm công thức..."
        >

        <div class="feature-tabs">

            ${['ALL', 'F2L', 'OLL', 'PLL'].map(c => `

                <button data-category="${c}">
                    ${c}
                </button>

            `).join('')}

        </div>

        ${data.length ? data.map((a, i) => `

            <div class="feature-card">

                <h3>${a.name}</h3>

                <p>Nhóm: ${a.category}</p>

                <div class="algorithm">
                    ${a.moves}
                </div>

                <button data-copy="${i}">
                    Copy công thức
                </button>

            </div>

        `).join('') : '<p>Không tìm thấy công thức.</p>'}

    `;


    let search = $('algorithmSearch');

    search.value = keyword;

    search.addEventListener('input', e => {

        let value = e.target.value;

        showAlgorithms(category, value);

        let newSearch = $('algorithmSearch');

        newSearch.focus();

        newSearch.setSelectionRange(
            value.length,
            value.length
        );
    });


    // Chọn danh mục
    document.querySelectorAll('[data-category]').forEach(btn => {

        btn.onclick = () => {
            showAlgorithms(btn.dataset.category);
        };
    });


    // Copy công thức
    document.querySelectorAll('[data-copy]').forEach(btn => {

        btn.onclick = async () => {

            let item = data[Number(btn.dataset.copy)];

            try {

                await navigator.clipboard.writeText(item.moves);

                btn.textContent = 'Đã copy!';

            } catch {

                btn.textContent = 'Không thể copy';
            }
        };
    });
}


// ==========================================
// 20. LESSONS
// ==========================================

const lessons = [

    {
        title: 'Bài 1: Tạo dấu cộng trắng',

        content:
            'Tìm 4 viên cạnh có màu trắng. Đưa chúng về đúng vị trí quanh tâm trắng, đồng thời khớp màu cạnh bên với tâm tương ứng.'
    },

    {
        title: 'Bài 2: Hoàn thành tầng 1',

        content:
            'Tìm 4 viên góc có màu trắng. Đưa từng viên góc vào đúng vị trí để hoàn thành mặt trắng và tầng đầu tiên.'
    },

    {
        title: 'Bài 3: Giải tầng 2',

        content:
            'Tìm các viên cạnh không có màu vàng ở tầng trên. Đưa chúng xuống đúng vị trí ở tầng giữa bằng phương pháp F2L cơ bản.'
    },

    {
        title: 'Bài 4: Tạo dấu cộng vàng',

        content:
            "Đưa các cạnh màu vàng lên mặt trên. Có thể gặp dạng chấm, chữ L hoặc đường thẳng. Sử dụng công thức F R U R' U' F'."
    },

    {
        title: 'Bài 5: Hoàn thành mặt vàng',

        content:
            'Định hướng các góc màu vàng để toàn bộ mặt trên có màu vàng.'
    },

    {
        title: 'Bài 6: Hoàn thành Rubik',

        content:
            'Hoán vị các góc và cạnh ở tầng cuối để tất cả các mặt của Rubik đồng nhất màu.'
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

    $('nextLesson').onclick = () => changeLesson(1);
}


function changeLesson(step) {

    lessonIndex = Math.max(
        0,
        Math.min(
            lessons.length - 1,
            lessonIndex + step
        )
    );

    showLesson();
}


// ==========================================
// 21. ANALYSIS
// ==========================================

function showAnalysis() {

    let data = visibleSolves();

    let valid = data.filter(s => s.result !== null);

    let total = data.length;

    let average = valid.length
        ? valid.reduce((sum, s) => sum + s.result, 0) / valid.length
        : null;

    let best = valid.length
        ? Math.min(...valid.map(s => s.result))
        : null;

    let dnf = data.filter(s => s.result === null).length;

    let plusTwo = data.filter(s =>
        s.result !== null &&
        s.result - s.ms === 2000
    ).length;


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
// 22. ANALYSIS CHART
// ==========================================

function drawAnalysisChart() {

    let canvas = $('analysisChart');

    let rect = canvas.getBoundingClientRect();

    let d = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, rect.width * d);

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

        ctx.fillText('Chưa có dữ liệu giải', 10, 30);

        return;
    }

    let max = Math.max(...values, 10);

    ctx.strokeStyle = '#6575ff';

    ctx.lineWidth = 2;

    ctx.beginPath();

    values.forEach((v, i) => {

        let x = 10 + i * (rect.width - 20) /
            Math.max(1, values.length - 1);

        let y = 160 - (v / max) * 140;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();
}


// ==========================================
// 23. OPEN / CLOSE FEATURES
// ==========================================

function openFeature(title) {

    $('featureTitle').textContent = title;

    $('featureView').classList.add('show');
}


function closeFeature() {

    $('featureView').classList.remove('show');
}


$('algBtn').onclick = () => {

    openFeature('Algorithms');

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
// 24. RESIZE
// ==========================================

window.addEventListener('resize', () => {

    drawCharts();

    if ($('featureView').classList.contains('show') &&
        $('featureTitle').textContent === 'Analysis') {

        drawAnalysisChart();
    }
});


// ==========================================
// 25. INITIALIZE
// ==========================================

// Đồng bộ Inspection ban đầu
$('inspectionDisplay').textContent =
    inspectionDuration + 's';

// Tạo Scramble
scramble();

// Hiển thị thống kê
render();

// Trạng thái ban đầu
$('timer').textContent = '00:00.00';

$('hint').textContent =
    'Nhấn giữ SPACE để bắt đầu Inspection';
