// study.js: CAR STUDY LAB のグラフで学ぶページ（駆動力線図、エンジン）で共通に使うもの
//   車とエンジンの値、計算、グラフの描き方、段階の切り替え
// ページごとの段階は drive.js / engine.js に書き、最後に startCourse(LESSONS) を呼ぶ

const el = id => document.getElementById(id);
const n0 = v => Math.round(v);
const n1 = v => v.toFixed(1);
const n2 = v => v.toFixed(2);
const n3 = v => v.toFixed(3);
const sub = (letter, mark) => `${letter}<sub>${mark}</sub>`;
const RPM = 2 * Math.PI / 60;   // rpm → rad/s
const G = 9.81;

// ---------- 車とエンジン（ギヤボックスLABの初期値と、説明用の仮の値） ----------
const CAR = { mass: 1000, tire: 0.315, final: 4.1, eff: 0.92, roll: 0.012, cda: 0.65, air: 1.2 };
const GEARS = [['1速', 3.64], ['2速', 2.10], ['3速', 1.38], ['4速', 1.00], ['5速', 0.79], ['6速', 0.65]];
const IDLE = 1000;       // グラフに描く一番低い回転数 (rpm)
const REDLINE = 7000;    // レッドゾーン (rpm)
const J_ENGINE = 0.18;   // エンジン側の慣性モーメント (kg·m²)。CAR STUDY のイナーシャと同じ値
const J_WHEELS = 4 * 1.0;   // タイヤ4本の慣性モーメント (kg·m²)
// 2.0 L の自然吸気エンジンを想定したトルクカーブ（回転数 rpm, トルク N·m）
const TORQUE = [[1000, 140], [2000, 168], [3000, 182], [4000, 194], [4500, 200], [5000, 198], [6000, 186], [6500, 165], [7000, 125]];
const COLORS = ['#f0a81c', '#7fc8f8', '#8fd694', '#e57373', '#b39ddb', '#ffd54f'];

// エンジンのトルク（表の点を直線でつなぐ）
function torqueAt(rpm) {
  if (rpm <= TORQUE[0][0]) return TORQUE[0][1];
  for (let k = 1; k < TORQUE.length; k++) {
    const [r1, t1] = TORQUE[k - 1], [r2, t2] = TORQUE[k];
    if (rpm <= r2) return t1 + (t2 - t1) * (rpm - r1) / (r2 - r1);
  }
  return TORQUE[TORQUE.length - 1][1];
}
const powerAt = rpm => torqueAt(rpm) * rpm * RPM / 1000;   // 出力 (kW) = T × ω
const total = g => GEARS[g][1] * CAR.final;                 // 変速比 × 最終減速比
// 車速 v (km/h) のときの、g 段のエンジン回転数
const rpmAt = (g, v) => v / 3.6 / CAR.tire * total(g) / RPM;
// g 段で、車速 v (km/h) のときの駆動力 (N) = T × i × if × η / r
const driveAt = (g, v) => torqueAt(rpmAt(g, v)) * total(g) * CAR.eff / CAR.tire;
// g 段で、エンジン回転数 rpm のときの車速 (km/h)
const speedAt = (g, rpm) => rpm * RPM / total(g) * CAR.tire * 3.6;
// 走行抵抗 (N): 転がり + 空気 + 坂道（勾配 grade %）
function resist(v, grade, mass, cda) {
  const m = mass || CAR.mass, ms = v / 3.6, a = Math.atan((grade || 0) / 100);
  return { roll: CAR.roll * m * G * Math.cos(a), air: 0.5 * CAR.air * (cda || CAR.cda) * ms * ms, grade: m * G * Math.sin(a) };
}
const resistTotal = (v, grade, mass, cda) => { const r = resist(v, grade, mass, cda); return r.roll + r.air + r.grade; };
// 回転部分の重さを加える割合 δ: 回る物の J を、車の重さに直したもの（CAR STUDY イナーシャの段階7）
const delta = (g, mass) => (J_ENGINE * total(g) ** 2 + J_WHEELS) / ((mass || CAR.mass) * CAR.tire ** 2);

// ---------- グラフ ----------
// spec: { xLabel, yLabel, xMax, yMax, yMin, series: [{ name, color, points: [[x, y]], dash, width }], vline: x, dots: [{ x, y, color, label }], xStep, yStep }
function drawChart(spec) {
  const canvas = el('chart');
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
  const g = canvas.getContext('2d');
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, w, h);
  const pad = { left: 64, right: 18, top: 44, bottom: 46 };
  const yMin = spec.yMin || 0;
  const x = v => pad.left + v / spec.xMax * (w - pad.left - pad.right);
  const y = v => h - pad.bottom - (v - yMin) / (spec.yMax - yMin) * (h - pad.top - pad.bottom);

  // 目盛り
  g.font = '12px sans-serif';
  g.strokeStyle = 'rgba(223, 230, 233, 0.18)';
  g.fillStyle = '#b9c7cd';
  g.lineWidth = 1;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let v = yMin; v <= spec.yMax + 1e-9; v += spec.yStep) {
    g.beginPath(); g.moveTo(pad.left, y(v)); g.lineTo(w - pad.right, y(v)); g.stroke();
    g.fillText(Number(v.toFixed(2)), pad.left - 6, y(v));
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let v = 0; v <= spec.xMax + 1e-9; v += spec.xStep) {
    g.beginPath(); g.moveTo(x(v), pad.top); g.lineTo(x(v), h - pad.bottom); g.stroke();
    g.fillText(v, x(v), h - pad.bottom + 6);
  }
  g.fillStyle = '#dfe6e9';
  g.fillText(spec.xLabel, (pad.left + w - pad.right) / 2, h - 18);
  g.save(); g.translate(14, (pad.top + h - pad.bottom) / 2); g.rotate(-Math.PI / 2); g.fillText(spec.yLabel, 0, 0); g.restore();

  // 線（グラフの外にはみ出す所は描かない）
  g.save();
  g.beginPath(); g.rect(pad.left, pad.top, w - pad.left - pad.right, h - pad.top - pad.bottom); g.clip();
  spec.series.forEach(s => {
    g.strokeStyle = s.color; g.lineWidth = s.width || 2.5; g.setLineDash(s.dash || []);
    g.beginPath();
    s.points.forEach(([px, py], k) => (k ? g.lineTo(x(px), y(py)) : g.moveTo(x(px), y(py))));
    g.stroke();
  });
  g.setLineDash([]);
  if (spec.vline !== undefined) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(x(spec.vline), pad.top); g.lineTo(x(spec.vline), h - pad.bottom); g.stroke();
    g.setLineDash([]);
  }
  (spec.dots || []).forEach(d => {
    g.fillStyle = d.color || '#ffffff';
    g.beginPath(); g.arc(x(d.x), y(d.y), 5, 0, Math.PI * 2); g.fill();
    if (d.label) { g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(d.label, x(d.x) + 7, y(d.y) - 3); }
  });
  g.restore();

  // 凡例（上の帯）
  let lx = pad.left;
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '12px sans-serif';
  spec.series.filter(s => s.name).forEach(s => {
    g.strokeStyle = s.color; g.lineWidth = 3; g.setLineDash(s.dash || []);
    g.beginPath(); g.moveTo(lx, 18); g.lineTo(lx + 18, 18); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#dfe6e9'; g.fillText(s.name, lx + 22, 18);
    lx += 30 + g.measureText(s.name).width;
  });
}

// 関数 f を、x = 0〜max で細かく点にする
const sample = (max, f, step) => { const pts = []; for (let v = 0; v <= max + 1e-9; v += step || max / 200) pts.push([v, f(v)]); return pts; };
// g 段の駆動力の線（その段で回せる回転数の範囲だけ）
const driveLine = g => sample(speedAt(g, REDLINE), v => driveAt(g, v), 1).filter(([v]) => rpmAt(g, v) >= IDLE);

// ---------- 段階の切り替え（drive.js / engine.js から呼ぶ） ----------
let LESSONS = [];
const state = { step: 1, tab: 'structure', running: false };
let NOTE = '車は 1,000 kg、タイヤの半径 0.315 m、最終減速比 4.1、伝達効率 0.92 です。変速比はギヤボックスLABの初期値、エンジンは 2.0 L の自然吸気を想定した説明用の仮の値です。';

// lessons: 項目の一覧。note: 数式タブの最後に出す、値の注意書き（なければ上の NOTE）
function startCourse(lessons, note) {
  LESSONS = lessons;
  if (note) NOTE = note;
  el('steps').addEventListener('click', e => { if (e.target.dataset.step) showStep(Number(e.target.dataset.step)); });
  el('prev').addEventListener('click', () => showStep(state.step - 1));
  el('next').addEventListener('click', () => showStep(state.step + 1));
  el('tabs').addEventListener('click', e => { if (e.target.dataset.tab) { state.tab = e.target.dataset.tab; closeWhy(); renderLesson(); } });
  // 数式の行をクリックすると考え方を開き、3D の図に印を出す（explain.js）
  why.onMark = setMark;
  why.on3d = () => { setView('3d'); renderLesson(); };
  bindWhy(el('lessonOutput'), () => lesson().formula(), renderLesson);
  el('controls').addEventListener('input', e => {
    const key = e.target.dataset.key;
    P[key] = Number(e.target.value);
    e.target.nextElementSibling.textContent = valueText(key);
    renderLesson();
  });
  el('run').addEventListener('click', () => { const l = lesson(); if (l.start) { l.start(); state.running = true; } });
  // 項目ごとのボタン（actions: [[名前, 押したときの動き, 今選ばれているか]]）
  el('controls').addEventListener('click', e => {
    const k = e.target.dataset.action;
    if (k === undefined) return;
    lesson().actions[k][1]();
    if (lesson().start) state.running = true;
    draw();
  });
  el('showChart').addEventListener('click', () => { setView('chart'); renderLesson(); });
  el('show3d').addEventListener('click', () => setView('3d'));
  new ResizeObserver(draw).observe(el('chart'));
  showStep(1);
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // live の項目（走りながらの操作）は、いつも動かす
    if (lesson().live) { lesson().tick(dt); draw(); }
    else if (state.running) { state.running = lesson().tick(dt); draw(); if (!state.running) renderLesson(); }
    frame3d(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const lesson = () => LESSONS[state.step - 1];
const valueText = key => { const c = lesson().controls.find(x => x[1] === key); return c && c[5] ? c[5](P[key]) : P[key]; };

function draw() {
  const l = lesson();
  if (view.mode === 'chart') drawChart(l.chart());
  el('readout').innerHTML = l.readout ? l.readout() : '';
  (l.actions || []).forEach((a, k) => { const b = el('controls').querySelector(`[data-action="${k}"]`); if (b) b.classList.toggle('current', !!(a[2] && a[2]())); });
}

function showStep(step) {
  if (LESSONS.length && lesson().leave) lesson().leave();   // 前の項目の後片付け（加速くらべの表など）
  state.step = Math.min(LESSONS.length, Math.max(1, step));
  state.running = false;
  why.open = -1;
  view.markSpec = null;   // Step を変えたら、考え方と印を閉じる
  const l = lesson();
  el('steps').innerHTML = LESSONS.map((x, i) =>
    `<button type="button" data-step="${i + 1}" class="${i + 1 === state.step ? 'current' : ''}">${i + 1}. ${x.name}</button>`).join('');
  el('controls').innerHTML = (l.actions || []).map((a, k) => `<button type="button" data-action="${k}">${a[0]}</button>`).join('')
    + (l.controls || []).map(([label, key, min, max, step]) =>
    `<label>${label} <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${P[key]}"> <span>${valueText(key)}</span></label>`).join('');
  el('run').hidden = !l.start;
  el('run').textContent = l.runLabel || '';
  if (l.reset) l.reset();
  setView(view.want);
  renderLesson();
}

function renderLesson() {
  const l = lesson();
  el('lessonTitle').textContent = `${state.step}. ${l.title}`;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('current', b.dataset.tab === state.tab));
  el('lessonOutput').innerHTML = state.tab === 'structure'
    ? l.text.map(t => `<p>${t}</p>`).join('')
    : formulaHTML(l.formula(), !!l.scene && view.mode === 'chart')
      + `<p class="note">${l.symbols || ''} ${NOTE}</p>`;
  el('prev').disabled = state.step === 1;
  el('next').disabled = state.step === LESSONS.length;
  draw();
}
