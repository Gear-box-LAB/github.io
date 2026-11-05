// vehicle.js: CAR STUDY LAB「車両運動性能」
// 1. 発進性能 2. 加速性能 3. 登坂性能 4. 減速性能 5. Jerk 6. 上下の乗り心地 7. 原因の切り分け
// 計算は dyn.js（ドライブラインの 2 慣性 + ばね）、3D は study3d.js（車と力の矢印）と vdyn3d.js

const P = { mass: 1000, grade: 0, pedal: 40, ctime: 1.2, speed: 0, gear: 1, rise: 0.05, k: 12000, slope: 0, ks: 20, cs: 1.5, kmh: 30 };
const pct = v => `${v}%`, sec = v => `${n2(Number(v))} 秒`, gearText = g => GEARS[g][0];
const C = { drive: 0xf0a81c, roll: 0x8fd694, air: 0x7fc8f8, grade: 0xe57373, net: 0xffffff, brake: 0xb39ddb };

// ---------- 計算結果を保存して、同じ条件ならもう一度計算しない ----------
const cache = {};
function sim(o) {
  const key = JSON.stringify(o);
  if (!cache[key]) cache[key] = simDrive(o);
  return cache[key];
}
// 線の、時間 t の値
function valueAt(series, t) {
  let v = series.length ? series[0][1] : 0;
  for (const [x, y] of series) { if (x > t) break; v = y; }
  return v;
}
// 再生（3D とグラフの縦の線を、計算の時間に合わせて動かす）。slow: 何倍ゆっくり見せるか
const PLAY = { t: -1, slow: 1, end: 0 };
function startPlay(end, slow) { PLAY.t = 0; PLAY.end = end; PLAY.slow = slow || 1; }
function tickPlay(dt, s) {
  PLAY.t += dt / PLAY.slow;
  if (s) P.speed = Math.max(0, valueAt(s.speed, PLAY.t));
  return PLAY.t < PLAY.end;
}
const playing = () => PLAY.t >= 0;
const nowOr = (series, fallback) => (playing() ? valueAt(series, PLAY.t) : fallback);

// 各項目の条件
const launchOpt = () => ({ g: 0, mass: P.mass, grade: P.grade, pedal: P.pedal / 100, rise: 0.1, clutch: true, clutchTime: P.ctime, time: 4 });
const tipOpt = () => ({ g: P.gear - 1, mass: P.mass, pedal: P.pedal / 100, rise: P.rise, k: P.k, c: DL.c, v0: speedAt(P.gear - 1, 2000), T0: 20, time: 2 });
// 原因の切り分け: クラッチの摩擦係数の傾きがマイナスのときは、ジャダーが見えるように、ドライブラインの減衰を小さめにする
const diagOpt = () => ({ g: 0, mass: P.mass, grade: P.grade, pedal: 0.6, rise: P.rise, k: P.k, c: DL.c, cSlip: P.slope < 0 ? 10 : DL.c, slope: P.slope, clutch: true, clutchTime: 1.2, time: 4 });
const BASE = { g: 0, mass: 1000, grade: 0, pedal: 0.6, rise: 0.15, k: 12000, c: DL.c, slope: 0, clutch: true, clutchTime: 1.2, time: 4 };

// 加速性能: 各段の、アクセル全開の加速度 (G)。回る部品の分も重く見える（δ）
const accelG = (g, v, mass) => (driveAt(g, v) - resistTotal(v, 0, mass)) / (mass * (1 + delta(g, mass))) / G;
const usable = (g, v) => rpmAt(g, v) >= IDLE && rpmAt(g, v) <= REDLINE;
// 0 → 100 km/h と、60 → 100 km/h（追い越し）の時間。いつも一番加速する段を使う（変速の時間は入れない）
function accelTimes(mass) {
  let v = 0, t = 0, t60 = null, t100 = null;
  while (v < 100 && t < 60) {
    const a = Math.max(...GEARS.map((x, g) => (usable(g, Math.max(v, speedAt(0, IDLE))) ? accelG(g, Math.max(v, speedAt(0, IDLE)), mass) : -1)));
    v += a * G * 0.01 * 3.6;
    t += 0.01;
    if (t60 === null && v >= 60) t60 = t;
    if (v >= 100) t100 = t;
  }
  return { t100, pass: t100 - t60 };
}
// 減速性能: エンジンブレーキ（燃料を止めて、エンジンの摩擦で止める力）と走行抵抗による減速度 (G)
const engineBrake = (g, v) => (usable(g, v) || rpmAt(g, v) > REDLINE ? FRICTION_TORQUE(rpmAt(g, v)) * total(g) / CAR.tire : 0);
const decelG = (g, v, mass) => (g < 0 ? resistTotal(v, 0, mass) / (mass + J_WHEELS / CAR.tire ** 2) : (engineBrake(g, v) + resistTotal(v, 0, mass)) / (mass * (1 + delta(g, mass)))) / G;

// ---------- 上下の乗り心地: 4分の1の車（車体 ms、タイヤ mu、ばね ks、ショックアブソーバー cs、タイヤのばね kt） ----------
const QC = { ms: 250, mu: 35, kt: 180000, h: 0.03, L: 1.0 };
function quarterSim(ks, cs, kmh) {
  const v = Math.max(1, kmh) / 3.6, dt = 0.0005, out = { body: [], wheel: [], road: [], xb: [] };
  let zs = 0, vs = 0, zu = 0, vu = 0, t = 0;
  const x0 = 2;   // 段差は、はじめタイヤの 2 m 前にある
  for (let s = 0; t < 3; s++) {
    t += dt;
    const x = v * t - x0;   // タイヤが、段差の始まりからどれだけ進んだか
    const zr = x > 0 && x < QC.L ? QC.h * Math.sin(Math.PI * x / QC.L) : 0;
    const fs = ks * (zu - zs) + cs * (vu - vs);
    const as = fs / QC.ms;
    const au = (QC.kt * (zr - zu) - fs) / QC.mu;
    vs += as * dt; zs += vs * dt; vu += au * dt; zu += vu * dt;
    if (s % 20 === 0) { out.body.push([t, as / G]); out.wheel.push([t, zu]); out.road.push([t, zr]); out.xb.push([t, x0 - v * t]); out.zs = out.zs || []; out.zs.push([t, zs]); }
  }
  return out;
}
const bodyHz = ks => Math.sqrt(ks * QC.kt / (ks + QC.kt) / QC.ms) / (2 * Math.PI);
const wheelHz = ks => Math.sqrt((ks + QC.kt) / QC.mu) / (2 * Math.PI);
let QS = null;
const quarter = () => { const key = `${P.ks}|${P.cs}|${P.kmh}`; if (!QS || QS.key !== key) QS = Object.assign(quarterSim(P.ks * 1000, P.cs * 1000, P.kmh), { key }); return QS; };

// ---------- 数式の考え方 ----------
const WHY = {
  need: { text: '車を加速させる力は、タイヤが地面を押す力（駆動力）から、走行抵抗と坂道の力を引いた残りです。逆に、加速度 a で発進したいなら、m × a に走行抵抗と坂道の分を足しただけの駆動力が要ります（運動方程式 F = m × a）。',
    mark: { glow: ['rear', 'roof'], text: '駆動力 = m × a + 走行抵抗 + 坂道' } },
  clutchT: { text: '発進のときは、クラッチをすべらせながら（半クラッチ）力を伝えます。伝えるトルクは、押し付ける力と摩擦係数で決まり、運転する人やコンピューターが少しずつ強くします。つながる（すべりが 0 になる）瞬間に、トルクの変わり方が急だと、ゆれ（しゃくり）が出ます。' },
  accel: { text: '駆動力から走行抵抗を引いた残りを、重さで割ったものが加速度です。重さには、回る部品（エンジン、変速機、タイヤ）も一緒に速くする分 δ を足します。1 G は重力と同じ強さ（9.81 m/s²）です。',
    mark: { glow: ['top', 'body'], text: '余裕駆動力 ÷ 見かけの重さ' } },
  delta: { text: '車が速くなるときは、車体だけでなく、エンジンやタイヤの回転も速くしないといけません。回転を速くするのに使うエネルギー 1/2 × J × ω² を、車が進むエネルギー 1/2 × m × v² の形に直すと、J × (i × i<sub>f</sub>)² ÷ r² の重さが車に加わったのと同じになります。エンジンは車速の (i × i<sub>f</sub>) ÷ r 倍で回るので、2乗で効きます。δ は、それを車の重さ m で割った割合です。',
    mark: { glow: ['wheels'], text: '回る部品も一緒に速くする' } },
  gv: { text: 'G-V 線図は、横軸に車速、縦軸にその車速でのアクセル全開の加速度をとり、段ごとに線を描いた図です。どの段で、どれくらい力強く加速できるかが1枚でわかり、メーカーで加速性能を話すときの基本の図です。線の上の端をつないだ形（包絡線）がなめらかなほど、変速しても加速がとぎれません。',
    mark: { glow: ['rear'], text: '各段のアクセル全開の加速度' } },
  times: { text: '加速度を時間で足し合わせる（積分する）と、車速になります。0 → 100 km/h（発進加速）と、60 → 100 km/h（追い越し加速）は、加速性能のよく使う目安です。ここでは、いつも一番加速する段を使い、変速の時間は入れていません。' },
  hold: { text: '坂で止まっているには、重力の坂に沿う分 m × g × sin θ と同じ力が要ります。タイヤの軸のトルクに直して、ギヤ比で割ると、エンジン（クラッチ）が出すべきトルクになります。半クラッチでこれより小さいトルクしか伝えていない間は、車は後ろに下がります。',
    mark: { glow: ['roof'], gravity: true, text: '坂に沿う重力に勝つトルク' } },
  rollback: { text: '後ろに下がった距離は、車速がマイナスの間の「速さ × 時間」を足したものです。実際の車は、ブレーキを少しの間保つ仕組み（ヒルスタートアシスト）で、これを防いでいます。' },
  engineBrake: { text: 'アクセルを離すと、燃料が止まり、エンジンの中の摩擦トルクが、変速機とデフで i × i<sub>f</sub> 倍になってタイヤを止める向きにはたらきます（エンジンブレーキ）。低い段ほどギヤ比が大きく、エンジンも速く回るので、強く効きます。',
    mark: { glow: ['rear'], text: '摩擦トルク × ギヤ比 ÷ r' } },
  coast: { text: 'N（クラッチを切る）では、エンジンブレーキがなく、走行抵抗だけで遅くなります（惰行）。車を惰行させて減り方を測ると、走行抵抗がわかります（コーストダウン試験）。' },
  jerk: { text: 'Jerk（ジャーク、加加速度）は、加速度が1秒あたりにどれだけ変わるかです。加速度そのものより、その変わり方の急さが、体が「ガクッ」と感じる強さに効きます。グラフの加速度の線の傾きが Jerk です。',
    mark: { glow: ['driver'], text: '加速度の変わり方の急さ' } },
  rise: { text: 'アクセルを踏んでも、エンジンのトルクはすぐには上がりません。空気が入るのに時間がかかり、さらに ECU が、わざとゆっくり上げます（トルクのなまし）。立ち上がりの時間を長くすると Jerk としゃくりは小さくなりますが、反応が遅い（もたつく）と感じます。ちょうどよい所を決めるのが、ドライバビリティの調整です。' },
  shuffle: { text: 'エンジン側（重さ J1）と車（J2）が、ねじれるドライブシャフト（ばね k）でつながっています。2つの物がばねでつながると、ばねの硬さと重さで決まる速さで、行ったり来たりゆれます（固有振動数）。低い段ほど、エンジン側がギヤ比の2乗だけ重く見えるので、振動数が低くなります（1速で 3 Hz くらい）。',
    mark: { glow: ['body', 'driver'], text: 'エンジン側と車が、ドライブシャフトのばねでゆれる' } },
  bodyHz: { text: '車体（ばね上）は、ばねとタイヤのばねを直列につないだばねに乗っています。このばねと車体の重さで決まる振動数が、ふわふわとゆれる速さです（1〜1.5 Hz）。人が歩くときの上下の速さに近く、心地よいとされています。',
    mark: { glow: ['body', 'spring'], text: '車体 + ばね → 1〜1.5 Hz' } },
  wheelHz: { text: 'タイヤとホイール（ばね下）は軽く、硬いタイヤのばねに乗っているので、速く（10〜15 Hz）ゆれます。路面の小さな凸凹を、車体に伝える前に吸収する役目です。',
    mark: { glow: ['tire'], text: 'ばね下 + タイヤのばね → 10〜15 Hz' } },
  zeta: { text: 'ショックアブソーバーは、速く動くほど大きな抵抗を出して、ゆれを止めます。弱すぎるとふわふわゆれ続け、強すぎると段差の衝撃がそのまま伝わってゴツゴツします。人は 4〜8 Hz の上下のゆれに特に敏感なので、その間をどう抑えるかが乗り心地の調整です。',
    mark: { glow: ['damper'], text: 'ゆれを止める力' } },
  diagnose: { text: '「発進がギクシャクする」と言われたら、まずゆれの振動数を見ます。ドライブラインのねじれ（しゃくり）は、段で決まる低い振動数（1速で 2〜5 Hz）で、クラッチがつながった後に出ます。クラッチのジャダーは、半クラッチの間に出て、だんだん大きくなります。重さや坂道は、ゆれではなく、加速が弱い・後ろに下がる、という形で出ます。' }
};

// 力の矢印（車の 3D、study3d.js の car）: 駆動力、転がり、空気、坂道
const arrowsWith = (drive, mass) => {
  const r = resist(P.speed, P.grade, mass);
  return [['駆動力', drive, C.drive, 'rear'], ['転がり抵抗', -r.roll, C.roll, 'front'], ['空気抵抗', -r.air, C.air, 'nose'], ['勾配抵抗', -r.grade, C.grade, 'roof']];
};
const timeChart = (yLabel, yMin, yMax, yStep, series, dots, xMax) => ({ xLabel: '時間 (秒)', yLabel, xMax: xMax || 4, xStep: 0.5, yMin, yMax, yStep, series, dots, vline: playing() ? PLAY.t : undefined });
const reach = (s, kmh) => { const p = s.speed.find(([, v]) => v >= kmh); return p ? p[0] : null; };

const LESSONS_VEHICLE = [
  {
    name: '発進性能', title: '発進性能: 止まった所から、どれだけ速く、なめらかに動き出せるか',
    scene: 'car', controls: [['車の重さ (kg)', 'mass', 800, 2000, 50], ['坂道の勾配 (%)', 'grade', 0, 20, 1], ['アクセル (%)', 'pedal', 20, 80, 5, pct], ['クラッチをつなぐ時間', 'ctime', 0.5, 2.5, 0.1, sec]],
    runLabel: '発進する', start: () => startPlay(4, 1.5), tick: dt => tickPlay(dt, sim(launchOpt())), reset: () => { PLAY.t = -1; P.speed = 0; P.pedal = 60; },
    arrows: () => arrowsWith(nowOr(sim(launchOpt()).force, 0), P.mass),
    text: [
      '<b>発進性能</b>は、止まった所から動き出すときの、速さ（0 → 20 km/h の時間、発進の加速度）と、なめらかさ（ゆれ、ショック）のことです。お客様が一番よく感じる性能の1つです。',
      '<b>構造</b>: エンジン → クラッチ（半クラッチ）→ 変速機（1速）→ デフ → ドライブシャフト → タイヤ と力が伝わります。止まっているときは、クラッチをすべらせながら、少しずつ力を伝えます。',
      '<b>見る所</b>: 「発進する」を押すと、グラフの加速度の線と、3D の力の矢印が動きます。クラッチがつながる瞬間に、加速度が小さくゆれるのが「しゃくり」です。重さ、坂道、アクセル、クラッチをつなぐ時間を変えて、発進の速さとゆれを比べてください。',
      'ここでは、半クラッチの間、運転する人がエンジンを 1,500 rpm に保ち、エンジンのトルクに合わせてクラッチをつなぐとしています。'
    ],
    symbols: 'F: 駆動力、R: 走行抵抗、m: 車の重さ、g: 9.81 m/s²、θ: 坂の角度、a: 加速度、δ: 回る部品（エンジン、変速機、タイヤ）を一緒に速くする分の重さの割合、J<sub>e</sub>: エンジン側の慣性モーメント、J<sub>w</sub>: タイヤ4本の慣性モーメント。',
    formula: () => {
      const s = sim(launchOpt()), t20 = reach(s, 20), amax = Math.max(...s.points.map(p => p[1]));
      return [
        ['発進に必要な駆動力', 'F = m × a + R + m × g × sin θ', `0.2 G で発進するには ${n0(P.mass * 0.2 * G + resistTotal(0, P.grade, P.mass))} N`, WHY.need],
        ['半クラッチで伝えるトルク', `${sub('T', 'c')} = μ × ${sub('F', '押し付け')} × ${sub('R', 'm')} × 2（面）`, `つながるまで ${s.lockAt ? n2(s.lockAt) + ' 秒' : '（つながらない）'}`, WHY.clutchT],
        ['加速度', 'a = (F − R − m × g × sin θ) / (m × (1 + δ))', `一番大きい加速度 ${n2(amax)} G、0 → 20 km/h ${t20 ? n2(t20) + ' 秒' : '（4 秒では届かない）'}`, WHY.accel]
      ];
    },
    chart: () => {
      const s = sim(launchOpt()), t20 = reach(s, 20);
      return timeChart('前後の加速度 (G)', -0.2, 0.6, 0.1, [{ name: '加速度', color: '#f0a81c', points: s.points }],
        s.events.map(e => ({ x: e.x, y: valueAt(s.points, e.x), label: e.label })).concat(t20 ? [{ x: t20, y: valueAt(s.points, t20), color: '#7fc8f8', label: '20 km/h' }] : []));
    },
    readout: () => { const s = sim(launchOpt()), w = waveOf(s.points, s.lockAt || 4); return `${playing() ? `${n1(PLAY.t)} 秒: 車速 ${n1(valueAt(s.speed, PLAY.t))} km/h、加速度 ${n2(valueAt(s.points, PLAY.t))} G。` : ''}0 → 20 km/h ${reach(s, 20) ? n2(reach(s, 20)) + ' 秒' : '−'}、つながった後のゆれ ${n2(w.osc)} G（${n1(w.hz)} Hz）`; }
  },
  {
    name: '加速性能', title: '加速性能: G-V 線図で、どの車速でどれだけ加速できるかを見る',
    scene: 'car', controls: [['車の重さ (kg)', 'mass', 800, 2000, 50], ['車速 (km/h)', 'speed', 0, 200, 5]],
    reset: () => { P.grade = 0; P.speed = 60; },
    arrows: () => { const g = GEARS.map((x, k) => k).filter(k => usable(k, P.speed)).sort((a, b) => accelG(b, P.speed, P.mass) - accelG(a, P.speed, P.mass))[0]; return arrowsWith(g === undefined ? 0 : driveAt(g, P.speed), P.mass); },
    text: [
      '<b>加速性能</b>は、走っている車が、どれだけ速く速度を上げられるかです。0 → 100 km/h の時間や、合流や追い越しで使う 60 → 100 km/h の時間で表します。',
      '<b>G-V 線図</b>: 横軸に車速、縦軸にアクセル全開の加速度 (G) をとって、段ごとに線を描いた図です。テーマ「駆動力線図と走行抵抗」の駆動力線図から走行抵抗を引き、重さで割ったものです。',
      '<b>見る所</b>: 低い段ほど加速度が大きく、上の段ほど小さくなります。となりの段の線の間に段差があると、変速したときに加速が落ちたと感じます。重さを変えると、すべての線が下がります。車速のスライダーで、3D の力の矢印も変わります。'
    ],
    symbols: 'a: 加速度 (G)、F: 駆動力、R: 走行抵抗、m: 車の重さ、δ: 回る部品の分。',
    formula: () => { const r = accelTimes(P.mass); return [
      ['G-V 線図の線', 'a(v) = (F(v) − R(v)) / (m × (1 + δ)) ÷ g', `時速 ${P.speed} km: ` + GEARS.map((x, g) => (usable(g, P.speed) ? `${x[0]} ${n2(accelG(g, P.speed, P.mass))} G` : null)).filter(Boolean).join('、'), WHY.gv],
      ['回る部品の分 δ', `δ = (${sub('J', 'e')} × (i × ${sub('i', 'f')})² + ${sub('J', 'w')}) / (m × r²)`, GEARS.map((x, g) => `${x[0]} ${n2(delta(g, P.mass))}`).join('、'), WHY.delta],
      ['0 → 100 km/h と 60 → 100 km/h', 't = ∫ dv / a(v)', `${n1(r.t100)} 秒、${n1(r.pass)} 秒（${P.mass} kg、変速の時間なし）`, WHY.times]
    ]; },
    chart: () => ({
      xLabel: '車速 (km/h)', yLabel: 'アクセル全開の加速度 (G)', xMax: 240, xStep: 40, yMax: 0.7, yStep: 0.1,
      series: GEARS.map((x, g) => ({ name: x[0], color: COLORS[g], points: driveLine(g).map(([v]) => [v, accelG(g, v, P.mass)]) })),
      vline: P.speed
    }),
    readout: () => { const r = accelTimes(P.mass); return `${P.mass} kg: 0 → 100 km/h ${n1(r.t100)} 秒、60 → 100 km/h ${n1(r.pass)} 秒（変速の時間を入れない目安）`; }
  },
  {
    name: '登坂性能', title: '登坂性能: 坂を登れるか、坂道で後ろに下がらずに発進できるか',
    scene: 'car', controls: [['坂道の勾配 (%)', 'grade', 0, 30, 1], ['車の重さ (kg)', 'mass', 800, 2000, 50], ['アクセル (%)', 'pedal', 20, 80, 5, pct], ['クラッチをつなぐ時間', 'ctime', 0.5, 2.5, 0.1, sec]],
    runLabel: '坂道で発進する', start: () => startPlay(4, 1.5), tick: dt => tickPlay(dt, sim(launchOpt())), reset: () => { PLAY.t = -1; P.speed = 0; P.grade = 10; P.pedal = 60; },
    arrows: () => arrowsWith(nowOr(sim(launchOpt()).force, 0), P.mass),
    text: [
      '<b>登坂性能</b>には2つあります。① 一番低い段で、どれだけ急な坂を登れるか（登坂能力。テーマ「駆動力線図と走行抵抗」の 4. で見られます）。② 坂の途中で止まった所から、後ろに下がらずに発進できるか（坂道発進）。ここでは ② を見ます。',
      '<b>構造</b>: 坂では、重力 m × g の一部 m × g × sin θ が、いつも車を後ろへ引っぱります。これに勝つトルクを、クラッチとギヤで作らないといけません。',
      '<b>見る所</b>: 「坂道で発進する」を押すと、グラフに車速の線が出ます。半クラッチで伝えるトルクが、坂の力より小さい間は、車速がマイナス（後ろに下がる）になります。勾配と重さを上げたり、クラッチを速くつないだりして比べてください（ブレーキは使わない計算です）。'
    ],
    symbols: 'θ: 坂の角度（勾配 % = tan θ × 100）、r: タイヤの半径、i: 1速の変速比、i<sub>f</sub>: 最終減速比。',
    formula: () => {
      const s = sim(launchOpt()), th = Math.atan(P.grade / 100);
      const back = s.speed.reduce((d, [, v], i) => d + (v < 0 ? -v / 3.6 * 0.01 : 0), 0);
      return [
        ['坂で止まっているのに要るエンジンのトルク', `T = m × g × sin θ × r / (i × ${sub('i', 'f')} × η)`, `${P.grade}% で ${n1(P.mass * G * Math.sin(th) * CAR.tire / (total(0) * CAR.eff))} N·m`, WHY.hold],
        ['後ろに下がった距離', 'd = ∫ (車速 < 0) dt', back > 0.005 ? `約 ${n0(back * 100)} cm` : '下がらない', WHY.rollback]
      ];
    },
    chart: () => { const s = sim(launchOpt()); return timeChart('車速 (km/h)', -5, 30, 5, [{ name: '車速', color: '#f0a81c', points: s.speed }, { name: '', color: 'rgba(255,255,255,0.5)', points: [[0, 0], [4, 0]], width: 1 }], s.events.map(e => ({ x: e.x, y: valueAt(s.speed, e.x), label: e.label }))); },
    readout: () => { const s = sim(launchOpt()), min = Math.min(...s.speed.map(p => p[1])); return `勾配 ${P.grade}%、${P.mass} kg: ` + (min < -0.05 ? `一度 ${n1(-min)} km/h で後ろに下がってから発進` : '後ろに下がらずに発進') + (s.lockAt ? `、${n2(s.lockAt)} 秒でクラッチがつながる` : '、4 秒ではクラッチがつながらない'); }
  },
  {
    name: '減速性能', title: '減速性能: アクセルを離したときの、エンジンブレーキと走行抵抗',
    scene: 'car', controls: [['段（0 = N）', 'gear', 0, 6, 1, v => (Number(v) ? GEARS[v - 1][0] : 'N')], ['車速 (km/h)', 'speed', 10, 200, 5], ['車の重さ (kg)', 'mass', 800, 2000, 50]],
    reset: () => { P.grade = 0; P.speed = 60; P.gear = 3; },
    arrows: () => { const r = resist(P.speed, 0, P.mass); return [['エンジンブレーキ', P.gear ? -engineBrake(P.gear - 1, P.speed) : 0, C.brake, 'rear'], ['転がり抵抗', -r.roll, C.roll, 'front'], ['空気抵抗', -r.air, C.air, 'nose']]; },
    text: [
      '<b>減速性能</b>は、アクセルを離したときや、ブレーキを踏んだときの、遅くなり方です。アクセルを離しただけで、思ったように遅くなるか（エンジンブレーキの効き）も、運転のしやすさに大きく効きます。',
      '<b>構造</b>: アクセルを離すと燃料が止まり（燃料カット）、エンジンの中の摩擦が、タイヤを止める向きのトルクになります。これがギヤで大きくなってタイヤに伝わります。N にすると、エンジンブレーキはなくなり、走行抵抗だけになります。',
      '<b>見る所</b>: グラフは、段ごとの、アクセルを離したときの減速度 (G) です。低い段ほど強く効きます。ふつうのブレーキは 0.3 G くらい、急ブレーキは 0.8 G くらいなので、エンジンブレーキはそれよりずっと弱い力です。'
    ],
    symbols: `${sub('T', 'f')}: エンジンの摩擦トルク、i: 変速比、i<sub>f</sub>: 最終減速比、r: タイヤの半径、R: 走行抵抗。`,
    formula: () => [
      ['エンジンブレーキの力', `${sub('F', 'eb')} = ${sub('T', 'f')}(n) × i × ${sub('i', 'f')} / r`, P.gear ? `${gearText(P.gear - 1)}、時速 ${P.speed} km で ${n0(engineBrake(P.gear - 1, P.speed))} N（${n0(rpmAt(P.gear - 1, P.speed))} rpm）` : 'N: なし', WHY.engineBrake],
      ['N のときの減速度（惰行）', 'a = R / m', `時速 ${P.speed} km で ${n2(decelG(-1, P.speed, P.mass))} G`, WHY.coast]
    ],
    chart: () => ({
      xLabel: '車速 (km/h)', yLabel: 'アクセルを離したときの減速度 (G)', xMax: 200, xStep: 40, yMax: 0.3, yStep: 0.05,
      series: GEARS.map((x, g) => ({ name: x[0], color: COLORS[g], width: P.gear === g + 1 ? 4 : 2, points: sample(200, v => decelG(g, v, P.mass), 2).filter(([v]) => v >= speedAt(g, IDLE) && v <= speedAt(g, REDLINE)) }))
        .concat([{ name: 'N（惰行）', color: '#ffffff', width: P.gear ? 2 : 4, points: sample(200, v => decelG(-1, v, P.mass), 2) }]),
      vline: P.speed
    }),
    readout: () => `${P.gear ? gearText(P.gear - 1) : 'N'}、時速 ${P.speed} km: 減速度 ${n2(P.gear ? decelG(P.gear - 1, P.speed, P.mass) : decelG(-1, P.speed, P.mass))} G` + (P.gear && !usable(P.gear - 1, P.speed) ? '（この段では回せない車速）' : '')
  },
  {
    name: 'Jerk', title: 'Jerk（加加速度）: 加速度の変わり方の急さが、「ガクッ」と感じる強さ',
    scene: 'custom', cam: [[2.2, 1.6, 5.0], [0, 0.8, 0]], hint3d: '車体の傾きと、頭のゆれは、見やすいように大きくしています。',
    controls: [['段', 'gear', 1, 6, 1, v => GEARS[v - 1][0]], ['アクセル (%)', 'pedal', 20, 100, 5, pct], ['トルクの立ち上がりの時間', 'rise', 0.02, 0.4, 0.02, sec]],
    runLabel: 'アクセルを踏む', start: () => startPlay(2, 3), tick: dt => tickPlay(dt, sim(tipOpt())), reset: () => { PLAY.t = -1; P.gear = 2; P.rise = 0.05; },
    build3d: world => buildPitchCar(world),
    update3d: (it, dt) => { const s = sim(tipOpt()); updatePitchCar(it, dt, nowOr(s.points, 0), nowOr(s.speed, speedAt(P.gear - 1, 2000)), `${n2(nowOr(s.points, 0))} G`); },
    text: [
      '<b>Jerk</b>（ジャーク、加加速度）は、加速度が1秒あたりにどれだけ変わるかです。アクセルを踏んだ瞬間に「ガクッ」と来るか、「スッ」と来るかは、加速度の大きさより、Jerk の大きさで決まります。',
      '<b>構造</b>: アクセルを踏む → 空気が入る → エンジンのトルクが上がる → ドライブラインがねじれる → タイヤの力が上がる、の順に伝わります。ECU は、トルクの上がり方をわざとなまして、Jerk を調整します。',
      '<b>見る所</b>: 「アクセルを踏む」を押すと、3D の車が加速度に合わせて傾き、頭がゆれます（ゆっくり見せています）。トルクの立ち上がりの時間を短くすると、Jerk と、その後のゆれ（しゃくり）が大きくなります。長くすると、なめらかですが、反応が遅く感じます。'
    ],
    symbols: 'j: Jerk (G/s)、a: 加速度 (G)、t: 時間、τ: トルクの立ち上がりの時間。',
    formula: () => { const s = sim(tipOpt()), jm = Math.max(...s.jerk.map(p => Math.abs(p[1]))); return [
      ['Jerk', 'j = da / dt', `一番大きい Jerk ${n1(jm)} G/s（${n1(jm * G)} m/s³）`, WHY.jerk],
      ['トルクの立ち上がり', `T(t) = ${sub('T', '目標')} × (1 − e<sup>−t/τ</sup>)`, `τ = ${n2(P.rise)} 秒 → ゆれ ${n2(waveOf(s.points, 0.05).osc)} G`, WHY.rise]
    ]; },
    chart: () => { const s = sim(tipOpt()); return timeChart('加速度 (G)、Jerk (G/s ÷ 10)', -0.4, 0.8, 0.2, [{ name: '加速度 (G)', color: '#f0a81c', points: s.points, width: 3 }, { name: 'Jerk ÷ 10 (G/s)', color: '#7fc8f8', points: s.jerk.map(([t, j]) => [t, j / 10]), width: 1.5 }], [], 2); },
    readout: () => { const s = sim(tipOpt()); return `${gearText(P.gear - 1)}、2,000 rpm からアクセル ${P.pedal}%: 一番大きい Jerk ${n1(Math.max(...s.jerk.map(p => Math.abs(p[1]))))} G/s、ゆれ ${n2(waveOf(s.points, 0.05).osc)} G`; }
  },
  {
    name: '上下の乗り心地', title: '上下の乗り心地（Ride comfort）: 段差を越えたときの、ばねとショックアブソーバー',
    scene: 'custom', cam: [[1.6, 1.4, 3.4], [0, 0.6, 0]], hint3d: '車の4分の1（1輪分）です。上下の動きは、見やすいように3倍に大きくしています。',
    controls: [['ばね (kN/m)', 'ks', 10, 40, 1], ['ショックアブソーバー (kN·s/m)', 'cs', 0.5, 4, 0.1], ['車速 (km/h)', 'kmh', 10, 60, 5]],
    runLabel: '段差を越える', start: () => startPlay(3, 2), tick: dt => tickPlay(dt), reset: () => { PLAY.t = -1; },
    build3d: world => buildQuarter(world),
    update3d: (it, dt) => { const q = quarter(); updateQuarter(it, dt, nowOr(q.zs, 0), nowOr(q.wheel, 0), nowOr(q.xb, 2), playing() ? P.kmh : 0); },
    text: [
      '<b>乗り心地</b>（Ride comfort）は、路面の凸凹や段差から、乗っている人に伝わるゆれの小ささです。上下のゆれのほか、前後のゆれ（しゃくり。テーマ「ドライブライン」の 4.）も含みます。',
      '<b>構造</b>: 車体（ばね上）は、ばねとショックアブソーバー（ダンパー）を通して、タイヤとホイール（ばね下）に乗り、タイヤもゴムのばねとして路面に乗っています。2つの重さと2つのばねの組み合わせです。',
      '<b>見る所</b>: 「段差を越える」を押すと、高さ 3 cm、長さ 1 m の山を越えます。グラフは車体の上下の加速度です。ばねを硬くするとゆれが速くなり、ショックアブソーバーを弱くするとゆれ続けます。強くしすぎると、段差の衝撃が大きくなります。'
    ],
    symbols: `${sub('k', 's')}: ばね、${sub('k', 't')}: タイヤのばね ${QC.kt / 1000} kN/m、${sub('m', 's')}: 車体（1輪分）${QC.ms} kg、${sub('m', 'u')}: ばね下 ${QC.mu} kg、${sub('c', 's')}: ショックアブソーバー。`,
    formula: () => { const ks = P.ks * 1000, cs = P.cs * 1000; return [
      ['車体の振動数', `${sub('f', '1')} = (1 / 2π) × √(${sub('k', 's')} × ${sub('k', 't')} / (${sub('k', 's')} + ${sub('k', 't')}) / ${sub('m', 's')})`, `${n2(bodyHz(ks))} Hz`, WHY.bodyHz],
      ['タイヤ（ばね下）の振動数', `${sub('f', '2')} = (1 / 2π) × √((${sub('k', 's')} + ${sub('k', 't')}) / ${sub('m', 'u')})`, `${n1(wheelHz(ks))} Hz`, WHY.wheelHz],
      ['減衰比（車体）', `ζ = ${sub('c', 's')} / (2 × √(${sub('k', 's')} × ${sub('m', 's')}))`, `${n2(cs / (2 * Math.sqrt(ks * QC.ms)))}（0.2〜0.4 がふつう）`, WHY.zeta]
    ]; },
    chart: () => { const q = quarter(); return timeChart('車体の上下の加速度 (G)', -0.6, 0.6, 0.2, [{ name: '車体の加速度', color: '#f0a81c', points: q.body, width: 3 }, { name: '段差（高さ cm ÷ 10）', color: 'rgba(223,230,233,0.5)', points: q.road.map(([t, z]) => [t, z * 10]), width: 1.5 }], [], 3); },
    readout: () => { const q = quarter(); return `車体 ${n2(bodyHz(P.ks * 1000))} Hz、ばね下 ${n1(wheelHz(P.ks * 1000))} Hz、一番大きい上下の加速度 ${n2(Math.max(...q.body.map(p => Math.abs(p[1]))))} G`; }
  },
  {
    name: '原因の切り分け', title: '原因の切り分け: 「発進がギクシャクする」は、どこが原因か',
    scene: 'custom', cam: [[2.2, 1.6, 5.0], [0, 0.8, 0]], hint3d: '車体の傾きと、頭のゆれは、見やすいように大きくしています。',
    controls: [['ドライブラインのねじり剛性 k', 'k', 4000, 30000, 1000], ['エンジントルクの立ち上がり', 'rise', 0.02, 0.4, 0.02, sec], ['車の重さ (kg)', 'mass', 800, 2000, 50], ['坂道の勾配 (%)', 'grade', 0, 20, 1], ['クラッチの摩擦係数の傾き', 'slope', -0.35, 0.2, 0.05, v => n2(Number(v))]],
    actions: [['はじめの状態に戻す', () => { Object.assign(P, { k: 12000, rise: 0.15, mass: 1000, grade: 0, slope: 0 }); showStep(state.step); }]],
    runLabel: '発進する', start: () => startPlay(4, 2), tick: dt => tickPlay(dt, sim(diagOpt())), reset: () => { PLAY.t = -1; P.rise = 0.15; },
    build3d: world => buildPitchCar(world),
    update3d: (it, dt) => { const s = sim(diagOpt()); updatePitchCar(it, dt, nowOr(s.points, 0), nowOr(s.speed, 0), `${n2(nowOr(s.points, 0))} G`); },
    text: [
      'お客様から「発進がギクシャクする」と言われても、原因が変速機とは限りません。ドライブラインのねじれ、エンジントルクの出し方、車の重さ、坂道、クラッチの摩擦など、いくつもの候補があります。<b>ゆれの振動数と、いつ起きるか</b>で見分けます。',
      '<table><tr><th>見え方</th><th>原因の候補</th><th>見分け方</th></tr><tr><td>つながった後に、数回ガクガク</td><td>ドライブラインのねじれ（しゃくり）</td><td>段で決まる低い振動数（1速 2〜5 Hz）</td></tr><tr><td>アクセルを踏んだ瞬間にガクッ</td><td>エンジントルクの上がり方が急</td><td>Jerk が大きい。立ち上がりをなますと小さくなる</td></tr><tr><td>半クラッチの間にブルブル、だんだん大きく</td><td>クラッチのジャダー</td><td>つながる前に出る。5〜15 Hz</td></tr><tr><td>加速が弱い、もたつく</td><td>重さ、坂道、トルク不足</td><td>ゆれはなく、加速度が低いまま</td></tr><tr><td>動き出しで後ろに下がる</td><td>坂道（クラッチの伝えるトルク不足）</td><td>車速がマイナスになる</td></tr></table>',
      '<b>見る所</b>: スライダーで原因を1つずつ変え、「発進する」を押してください。グラフの灰色の線が、はじめの状態です。下の読み取りに、計算で見つけた症状が出ます。'
    ],
    symbols: 'k: ねじり剛性、τ: トルクの立ち上がりの時間、μ: クラッチの摩擦係数。',
    formula: () => { const s = sim(diagOpt()); return [
      ['しゃくりの振動数（1速）', `f = (1 / 2π) × √(k × (1 / ${sub('J', '1')} + 1 / ${sub('J', '2')}))`, `${n1(shuffleHz(0, P.k, P.mass))} Hz（はじめの状態 ${n1(shuffleHz(0))} Hz）`, WHY.shuffle],
      ['見分け方', '振動数 と 起きる時（つながる前 / 後）', diagnose(s).join('、') || 'ギクシャクしていない', WHY.diagnose]
    ]; },
    chart: () => { const s = sim(diagOpt()), b = sim(BASE); return timeChart('前後の加速度 (G)', -0.4, 0.6, 0.1, [{ name: 'はじめの状態', color: 'rgba(223,230,233,0.4)', points: b.points, width: 1.5 }, { name: '今の条件', color: '#f0a81c', points: s.points, width: 3 }], s.events.map(e => ({ x: e.x, y: valueAt(s.points, e.x), label: e.label }))); },
    readout: () => `計算で見つけた症状: ${diagnose(sim(diagOpt())).join('、') || 'ギクシャクしていない（なめらかに発進）'}`
  }
];

// 発進の計算の結果から、症状を見つける
function diagnose(s) {
  const out = [], lock = s.lockAt || 4;
  const before = waveOf(s.points.filter(([t]) => t > 0.3 && t < lock), 0), after = waveOf(s.points, lock);
  const back = Math.min(...s.speed.map(p => p[1])) < -0.3;
  if (before.osc > 0.05 && before.hz > 4) out.push(`半クラッチの間に ${n1(before.hz)} Hz のゆれ → クラッチのジャダー`);
  if (after.osc > 0.08) out.push(`つながった後に ${n1(after.hz)} Hz のゆれ ${n2(after.osc)} G → トルクの上がり方が急で、ドライブラインのねじれ（しゃくり）が出る`);
  else if (after.osc > 0.04 && after.hz > 0 && after.hz < 2.5) out.push(`ゆっくりした ${n1(after.hz)} Hz のゆれ → ドライブラインがやわらかい（ねじり剛性が低い）`);
  if (!back && Math.max(...s.jerk.map(p => Math.abs(p[1]))) > 3) out.push('Jerk が大きい → トルクの変わり方が急');
  if (back) out.push('後ろに下がる → 坂道でクラッチのトルクが足りない');
  if (!s.lockAt || valueAt(s.speed, 4) < 15) out.push('加速が弱い → 重さ・坂道・トルク不足');
  return out;
}

startCourse(LESSONS_VEHICLE, 'ドライブラインのねじり剛性・減衰、クラッチ、ばね、ショックアブソーバーなどは、説明用の値です。車は 1,000 kg、タイヤの半径 0.315 m、最終減速比 4.1、1速〜6速の変速比はギヤボックスLABの初期値、エンジンは 2.0 L の自然吸気を想定しています。');
