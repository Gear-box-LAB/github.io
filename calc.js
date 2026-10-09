// calc.js: 状態と計算。図（scene.js）も説明（app.js）も、ここの値を使う

const NEUTRAL = -1;
const MAX_GEARS = 8;

// 学ぶ順番。gears = その段階で図に出すギヤの組の数
const STEPS = [
  { group: '構造を知る', name: '歯車2枚', gears: 0 },
  { name: '軸3本', gears: 1 },
  { name: 'スリーブ', gears: 1 },
  { name: '2速を足す', gears: 2 },
  { name: 'シンクロ', gears: 2 },
  { name: '6速とリバース', gears: MAX_GEARS },
  { group: '組んでみる', name: '設計する', gears: MAX_GEARS },
  { group: '周辺を知る', name: 'クラッチ', gears: MAX_GEARS },
  { name: 'タイヤ', gears: MAX_GEARS }
];
// 部品が初めて出てくる段階
const STEP_OUTPUT = 2, STEP_SLEEVE = 3, STEP_SYNCHRO = 5, STEP_DESIGN = 7, STEP_CLUTCH = 8, STEP_TIRE = 9;

const state = {
  step: 1,
  tab: 'structure',     // 'structure'（構造）か 'formula'（数式）
  gear: NEUTRAL,        // 今つながっているギヤの番号
  picked: null,         // 図でクリックした部品
  clutchOn: true,
  rpm: 3000,            // エンジン回転数
  torque: 200,          // エンジントルク (N·m)
  red: { drive: 20, driven: 30 },   // インプット軸 → カウンタ軸の減速ギヤの歯数
  // out = アウトプット軸側（空転ギヤ）の歯数、counter = カウンタ軸側（固定ギヤ）の歯数
  gears: [
    { name: '1速', out: 34, counter: 14 },
    { name: '2速', out: 28, counter: 20 },
    { name: '3速', out: 24, counter: 26 },
    { name: '4速', out: 20, counter: 30 },
    { name: '5速', out: 18, counter: 34 },
    { name: '6速', out: 16, counter: 37 },
    { name: 'R', out: 36, counter: 13, reverse: true }
  ],
  // 以下は説明用の仮の値
  synchro: { force: 500, mu: 0.1, radius: 0.035, angle: 6.5, inertia: 0.02 },
  clutch: { mu: 0.3, force: 5000, outer: 0.11, inner: 0.075 },
  car: { finalRatio: 4.1, tire: 0.63, mu: 1.0, load: 600 }
};

const el = id => document.getElementById(id);
const safe = text => String(text).replace(/[&<>"]/g, '');
const n0 = value => Math.round(value);
const n1 = value => value.toFixed(1);
const n2 = value => value.toFixed(2);
const teeth = value => Math.min(80, Math.max(8, Math.round(Number(value) || 8)));
const positive = value => Math.max(0.001, Number(value) || 0.001);

const shownGears = () => state.gears.slice(0, STEPS[state.step - 1].gears);
const sleeveCount = () => Math.ceil(shownGears().length / 2);

// スリーブの位置: -1 = 左のギヤへ、0 = 中立、1 = 右のギヤへ
function sleevePos(k) {
  if (state.gear === k * 2) return -1;
  if (state.gear === k * 2 + 1) return 1;
  return 0;
}

// ギヤ比 = 回される側の歯数 ÷ 回す側の歯数（リバースは逆回転なのでマイナス）
function gearRatio(g) {
  const ratio = g.out / g.counter;
  return g.reverse ? -ratio : ratio;
}

// index番のギヤがつながったときの、全部の値
function calc(index) {
  const c = {};
  c.rpm = state.clutchOn ? state.rpm : 0;         // クラッチを切ると、インプット軸に回転が来ない
  c.torque = state.clutchOn ? state.torque : 0;
  c.z1 = state.red.drive;
  c.z2 = state.red.driven;
  c.red = c.z2 / c.z1;
  c.counterRpm = c.rpm / c.red;
  c.counterTorque = c.torque * c.red;

  c.gear = state.gears[index];
  c.engaged = c.gear !== undefined;
  c.ratio = c.engaged ? gearRatio(c.gear) : 0;
  c.total = c.red * c.ratio;                      // 変速比
  c.outRpm = c.engaged ? c.counterRpm / c.ratio : 0;
  c.outTorque = c.counterTorque * c.ratio;

  c.final = state.car.finalRatio;
  c.radius = state.car.tire / 2;
  c.tireRpm = c.outRpm / c.final;
  c.tireTorque = c.outTorque * c.final;
  c.speed = c.tireRpm * 2 * Math.PI * c.radius * 60 / 1000;   // km/h
  c.force = c.tireTorque / c.radius;                          // タイヤが地面を押す力 (N)
  return c;
}

// i番の空転ギヤの回転数（つながっていなくても、カウンタ軸に回されている）
const freeRpm = (i, c) => c.counterRpm / gearRatio(state.gears[i]);

// シンクロ: コーンの摩擦トルクと、i番のギヤの回転を合わせるのにかかる時間
function synchro(i, c) {
  const s = state.synchro;
  const torque = s.mu * s.force * s.radius / Math.sin(s.angle * Math.PI / 180);
  const diff = freeRpm(i, c) - c.outRpm;
  const time = s.inertia * 2 * Math.PI * Math.abs(diff) / 60 / torque;
  return { torque, diff, time };
}

// クラッチ: 摩擦面の平均半径と、伝えられる最大トルク（摩擦面は表と裏の2面）
function clutch() {
  const k = state.clutch;
  const radius = 2 / 3 * (k.outer ** 3 - k.inner ** 3) / (k.outer ** 2 - k.inner ** 2);
  const capacity = k.mu * k.force * radius * 2;
  return { radius, capacity, margin: capacity / state.torque };
}

// タイヤ: 路面との摩擦で決まる、押せる力の上限 (N)
const gripLimit = () => state.car.mu * state.car.load * 9.81;
