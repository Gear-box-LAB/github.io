// run.js: CAR STUDY LAB「エンジンの始動から停止まで」
//   1. 始動と吹け上がり  2. スターターモーター  3. エンジンが止まるまで  4. シフトとアクセルでのエンジンの動き
// エンジンのトルクカーブ、車の値、変速比は study.js と同じ（ほかのテーマと同じ車）

const P = { warm: 1, volt: 12, stopRpm: 750, flyJ: 0.18, pedal: 0 };   // スライダーで変える値
const IDLE_RPM = 750;       // 暖まっているときのアイドル回転数
const COLD_IDLE = 1200;     // 冷えているときのアイドル回転数（暖機のため高め）
const AMP = 35;             // 圧縮の反発トルクの山 (N·m)。4気筒では1回転に2回。平均すると 0（押し返されて戻る）
const STARTER = { stall: 100, free: 300 };   // スターター（12 V）を、クランクで見たときの、止まっているときのトルクと、空回りの回転数
const SUB = 0.0005;         // 計算の時間のきざみ (秒)
const warmText = v => (v ? '暖まっている' : '冷えている');

// エンジンの中の摩擦トルク (N·m)。ピストンとシリンダー、軸受け、ポンプ損失など。冷えていると油が硬く、1.6 倍
const frictionWarm = n => 10 + 0.004 * Math.abs(n) + 3e-7 * n * n;
const friction = n => frictionWarm(n) * (P.warm ? 1 : 1.6);
// 燃焼で出せる最大のトルク（摩擦を引く前）。トルクカーブ（摩擦を引いた後の値）に、摩擦を足したもの
const combMax = n => torqueAt(Math.max(n, IDLE)) + frictionWarm(n);
// スターターのトルク（クランクで見た値）: 止まっているとき一番大きく、速く回るほど小さくなる。電圧に比例
const starterTorque = (n, volt) => Math.max(0, STARTER.stall * volt / 12 * (1 - n / (STARTER.free * volt / 12)));
// 圧縮の反発: ピストンが空気を押し縮めると押し返され（+ は回転を止める向き）、膨らむときに押し戻す
const compress = th => AMP * Math.sin(2 * th);
// アイドル制御（ECU）: 目標の回転数に合うように、燃料と空気の量（燃焼の割合 0〜1）を決める
const idleCmd = (n, target) => Math.min(0.5, Math.max(0, friction(target) / combMax(target) + 0.0004 * (target - n)));
// クランキングの回転数: スターターのトルク = 摩擦トルク になる回転数
function crankingRpm(volt) { for (let n = 0; n <= 400; n += 1) if (starterTorque(n, volt) <= friction(n)) return n; return 400; }

// エンジン1台分の状態。w: 角速度 (rad/s)、th: クランクの角度、cmd: 燃焼の割合、starter: スターターがかみ合っているか
const newEngine = rpm => ({ t: 0, w: rpm * RPM, th: 0, cmd: 0, starter: false, torque: 0, points: [[0, rpm]], events: [], peak: rpm, stopped: false });
// エンジンを dt 秒進める: J × α = 燃焼 + スターター − 摩擦 − 圧縮
function stepEngine(E, dt, J) {
  const n = E.w / RPM;
  E.torque = E.cmd * combMax(n) + (E.starter ? starterTorque(n, P.volt) : 0) - Math.sign(E.w) * friction(n);
  E.w += (E.torque - compress(E.th)) / J * dt;
  E.th += E.w * dt;
  E.t += dt;
  E.peak = Math.max(E.peak, E.w / RPM);
  if (Math.round(E.t * 200) !== Math.round((E.t - dt) * 200)) E.points.push([E.t, E.w / RPM]);
}
const addEvent = (E, text) => E.events.push({ x: E.t, y: E.w / RPM, label: text });
// 燃料もスターターもないとき: ほとんど止まって、圧縮の反発も摩擦で押さえられたら、止まったことにする
function settle(E) {
  if (E.t > 0.05 && Math.abs(E.w) < 1 && Math.abs(compress(E.th)) < frictionWarm(0) * 1.5) { E.w = 0; E.stopped = true; addEvent(E, `停止 ${n2(E.t)} 秒`); }
}

// ---------- 1. 始動 ----------
const SIM_SLOW = 3;   // 1〜3 は、実際の 1/3 の速さで見せる（始動は1秒ほどで終わるので）
let S = newEngine(0);
S.phase = 'off';
function startUp() {
  S = Object.assign(newEngine(0), { phase: 'crank', fireAt: 0 });
  S.starter = true;
  addEvent(S, 'キー START');
}
function tickStart(dt) {
  for (let k = 0; k < dt / SIM_SLOW / SUB; k++) {
    const n = S.w / RPM;
    if (S.phase === 'crank' && S.th >= 4 * Math.PI && n > 100) { S.phase = 'fire'; S.fireAt = S.t; addEvent(S, '初爆'); }
    if (S.phase !== 'crank' && S.starter && n > 500) { S.starter = false; addEvent(S, 'スターター OFF'); }
    if (S.phase === 'fire' && S.t - S.fireAt > 0.5) { S.phase = 'idle'; addEvent(S, 'アイドル制御'); }
    S.cmd = S.phase === 'crank' ? 0 : S.phase === 'fire' ? (P.warm ? 0.35 : 0.45) : idleCmd(n, P.warm ? IDLE_RPM : COLD_IDLE);
    stepEngine(S, SUB, J_ENGINE);
  }
  return S.t < 5;
}
const PHASE_TEXT = { off: 'キー OFF', crank: 'クランキング（スターターで回している）', fire: '初爆 → 始動増量で吹け上がる', idle: 'アイドル制御で、目標の回転数に落ち着く' };

// ---------- 2. スターターだけで回す ----------
let C = newEngine(0);
function startCrank() { C = newEngine(0); C.starter = true; addEvent(C, 'スターター ON'); }
function tickCrank(dt) {
  for (let k = 0; k < dt / SIM_SLOW / SUB && !C.stopped; k++) {
    if (C.starter && C.t >= 2) { C.starter = false; addEvent(C, 'キーを離す'); }   // 2 秒でキーを離す → 摩擦で止まる
    stepEngine(C, SUB, J_ENGINE);
    if (!C.starter) settle(C);
  }
  return !C.stopped && C.t < 4;
}

// ---------- 3. 止まるまで ----------
let D = newEngine(P.stopRpm);
function startStop() {
  D = newEngine(P.stopRpm);
  addEvent(D, 'キー OFF');
}
function tickStop(dt) {
  for (let k = 0; k < dt / SIM_SLOW / SUB && !D.stopped; k++) {
    stepEngine(D, SUB, P.flyJ);
    settle(D);
  }
  return !D.stopped && D.t < 8;
}

// ---------- 4. シフトとアクセル（走りながら） ----------
const SHIFTS = [['R', -3.5], ['N', 0]].concat(GEARS);   // R、N、1速〜6速
const TC_MAX = 250;        // クラッチが伝えられる最大のトルク (N·m)
const SHIFT_CUT = 0.5;     // クラッチを切ってから、次の段に入れるまでの時間 (秒)
const ENGAGE = 0.8;        // 半クラッチで、クラッチを完全につなぐまでの時間 (秒)
let R;
function resetDrive() {
  R = { t: 0, w: IDLE_RPM * RPM, th: 0, v: 0, g: 1, target: 1, phase: 'free', c: 0, timer: 0, pedal: 0, brake: false, cut: false,
    script: null, msg: 'N（ニュートラル）でアイドル中です。アクセルや、R・1速〜6速のボタンで動かしてください。', points: [[0, IDLE_RPM]], marks: [{ x: 0, y: IDLE_RPM, label: 'N' }] };
}
resetDrive();
const ratioOf = g => SHIFTS[g][1] * CAR.final;   // 変速比 × 最終減速比（R は −）
const gearName = g => SHIFTS[g][0];
const jv = g => (SHIFTS[g][1] ? CAR.mass * CAR.tire ** 2 / ratioOf(g) ** 2 : 0);   // 車をエンジンから見た J

function shiftTo(g, msg) {
  const back = SHIFTS[g][1] < 0, fwd = SHIFTS[g][1] > 0;
  if ((back && R.v > 0.5) || (fwd && R.v < -0.5)) { R.msg = '進む向きが逆の段には、止まってから入れます（ブレーキを押してください）。'; return; }
  R.target = g;
  R.phase = 'cut';
  R.timer = SHIFT_CUT;
  R.msg = msg || `クラッチを切って ${gearName(g)} へ。クラッチが切れている間は、燃料を絞るので、エンジンは摩擦で回転が下がります。`;
}

function stepDrive(dt) {
  const n = R.w / RPM, i = ratioOf(R.g);
  if (n > REDLINE) R.cut = true;               // レブリミッター: 7,000 rpm を超えたら燃料を止める
  if (n < REDLINE - 200) R.cut = false;
  // 変速中はアクセルを離す。半クラッチの間は、クラッチをつなぐのに合わせて、少しずつ踏む
  const want = R.script ? R.pedal : P.pedal / 100;
  // 発進（ほぼ止まっているとき）は、エンストしないように、はじめから半分くらい踏む
  const pedal = R.phase === 'cut' ? 0 : R.phase === 'engage' ? want * Math.max(R.c, Math.abs(R.v) < 3 ? 0.5 : 0) : want;
  const cmd = R.cut ? 0 : Math.max(pedal, idleCmd(n, IDLE_RPM));
  const te = cmd * combMax(n) - friction(n);   // エンジンがクラッチに出すトルク
  // 走行抵抗（進む向きと逆）とブレーキ
  const resist = Math.sign(R.v) * resistTotal(Math.abs(R.v) * 3.6) + (R.brake ? Math.sign(R.v) * 6000 : 0);
  let force;
  if (R.phase === 'locked') {
    // クラッチがつながっている: エンジンと車が一緒に動く。回る部品の分も重く見える（δ）
    force = te * i * CAR.eff / CAR.tire;
    const m = CAR.mass + (J_ENGINE * i * i + J_WHEELS) / CAR.tire ** 2;
    R.v += (force - resist) / m * dt;
    R.w = R.v / CAR.tire * i;
    if (R.w / RPM < 650) { R.phase = 'engage'; R.c = 0.5; }   // 遅くなってエンストしそう → 半クラッチにする
  } else {
    const wg = R.v / CAR.tire * i;   // 車の速さに合うエンジンの角速度
    const tc = R.phase === 'engage' && i ? R.c * TC_MAX * Math.sign(R.w - wg) : 0;
    R.w += (te - tc) / J_ENGINE * dt;
    force = tc * i * CAR.eff / CAR.tire;
    R.v += (force - resist) / (CAR.mass + J_WHEELS / CAR.tire ** 2) * dt;
    if (R.phase === 'engage') {
      R.c = R.w / RPM < 500 ? Math.max(0, R.c - dt) : Math.min(1, R.c + dt / ENGAGE);   // エンストしそうなら、半クラッチを浅く
      if (Math.abs(R.w - R.v / CAR.tire * i) < 1 && R.c > 0.3) { R.phase = 'locked'; if (!R.script) R.msg = `クラッチがつながりました。エンジンの回転数は、車の速さと ${gearName(R.g)} の変速比で決まります。`; }
    }
  }
  if (Math.abs(R.v) < 0.05 && Math.abs(force) < CAR.roll * CAR.mass * G) R.v = 0;   // 止まっている車は、転がり抵抗より小さい力では動かない
  if (R.phase === 'cut' && (R.timer -= dt) <= 0) {
    R.g = R.target;
    R.phase = SHIFTS[R.g][1] ? 'engage' : 'free';
    R.c = 0;
    R.marks.push({ x: R.t, y: R.w / RPM, label: gearName(R.g) });
  }
  R.th += R.w * dt;
  R.t += dt;
  if (Math.round(R.t * 20) !== Math.round((R.t - dt) * 20)) R.points.push([R.t, R.w / RPM]);
}

// 自動で見る: N → R → N → 1速 → 6速 の順に、決まった操作をする
const SCRIPT = [
  { msg: 'N（ニュートラル）: クラッチの先に何もつながっていません。エンジンはアイドル 750 rpm で回っています。', g: 1, pedal: 0, done: s => s.t > 1.5 },
  { msg: 'N でアクセルを踏む: 回すのはエンジン側の部品（J = 0.18 kg·m²）だけなので、一気に吹け上がります。', pedal: 0.6, done: s => s.t > 1.0 },
  { msg: 'アクセルを離す: 燃料が止まり、エンジンの中の摩擦で回転が下がって、アイドルに戻ります。', pedal: 0, done: s => s.t > 2.0 },
  { msg: 'R（リバース）: 半クラッチでつなぐと、エンジンの回転がいったん下がり、車が後ろへ動き出します。', g: 0, pedal: 0.3, done: s => s.t > 3.5 },
  { msg: 'ブレーキで止めて N に戻します。', g: 1, pedal: 0, brake: true, done: s => R.v === 0 && s.t > 1.5 },
  { msg: '1速で発進: 1速は変速比が大きいので、エンジンから見た車が軽く（J が小さく）、回転が速く上がります。', g: 2, pedal: 0.85, done: () => R.phase === 'locked' && R.w / RPM > 5500 },
  { msg: '2速へアップシフト: クラッチを切ると、エンジンは摩擦で少し回転が下がり、つなぐと 2速の回転数（車速で決まる）にそろいます。', g: 3, pedal: 0.85, done: () => R.phase === 'locked' && R.w / RPM > 5500 },
  { msg: '3速へ: 変速の後の回転数は「変速前 × 次の変速比 ÷ 今の変速比」に下がります。', g: 4, pedal: 0.85, done: () => R.phase === 'locked' && R.w / RPM > 5500 },
  { msg: '4速へ: 上の段ほど車が重く見え、回転の上がり方がゆっくりになります。', g: 5, pedal: 0.85, done: s => s.t > 5 },
  { msg: '5速へ: 走行抵抗（空気抵抗）も大きくなり、加速がさらに鈍くなります。', g: 6, pedal: 0.85, done: s => s.t > 4 },
  { msg: '6速へ: 回転はとてもゆっくりしか上がりません。高い段は、速く楽に走るための段です。', g: 7, pedal: 0.85, done: s => s.t > 5 },
  { msg: 'アクセルを離すと、エンジンブレーキと走行抵抗で、車も回転もゆっくり下がります。自動の見本はここまでです。', pedal: 0, done: s => s.t > 3 }
];
function startScript() {
  resetDrive();
  R.script = { k: -1, t: 0 };
  nextScript();
}
function nextScript() {
  const s = R.script;
  s.k += 1;
  s.t = 0;
  if (s.k >= SCRIPT.length) { R.script = null; R.pedal = 0; return; }
  const step = SCRIPT[s.k];
  R.pedal = step.pedal;
  R.brake = !!step.brake;
  if (step.g !== undefined && step.g !== R.g) shiftTo(step.g, step.msg);
  R.msg = step.msg;
}
function tickDrive(dt) {
  for (let k = 0; k < dt / 0.002; k++) {
    stepDrive(0.002);
    if (R.script) {
      R.script.t += 0.002;
      if (SCRIPT[R.script.k].done(R.script)) nextScript();
    }
    if (R.brake && !R.script && R.v === 0) R.brake = false;
  }
  R.points = R.points.filter(([x]) => x > R.t - 30);
  R.marks = R.marks.filter(m => m.x > R.t - 30);
}
const manual = () => { R.script = null; R.pedal = 0; };   // 手で操作したら、自動の見本はやめる
const clutchText = () => ({ free: R.g === 1 ? 'N（何もつながっていない）' : '切れている', cut: '切れている（変速中）', engage: `半クラッチ（${n0(R.c * 100)}%）`, locked: 'つながっている' })[R.phase];

// ---------- 数式の考え方（式の行をクリックすると開く） ----------
const WHY = {
  crank: { text: 'エンジンは自分では回り始められません。燃料を燃やすには、ピストンで空気を吸って押し縮める必要があり、それにはクランクが回っていないといけないからです。そこで、スターターモーターがリングギヤを回して、クランクを外から回します（クランキング）。このとき、スターターのトルクで、摩擦と圧縮の反発に勝って回ります。',
    mark: { glow: ['starter'], text: 'スターターがクランクを外から回す' } },
  fire: { text: '回転が上がって空気を吸えるようになると、ECU（エンジンを制御するコンピューター）が燃料を噴き、点火します。最初に燃えること（初爆）で、燃焼のトルクが生まれます。燃焼のトルクは摩擦よりずっと大きく、回すのはエンジン側の部品（J）だけなので、回転が一気に上がります。',
    mark: { glow: ['pistons'], text: '燃焼がピストンを押す' } },
  flare: { text: '始動直後は、シリンダーが冷えていて燃料が霧になりにくく、燃え残りやすい状態です。エンストしないように、ECU は燃料と空気を多めに入れます（始動増量）。その分、回転はアイドルより高く吹け上がります。これが、キーを回した直後に「ブォン」と回転が上がる理由です。',
    mark: { glow: ['pistons', 'flywheel'], text: '始動増量で多めに燃やす' } },
  idle: { text: 'アイドルでは、燃焼のトルクと摩擦トルクがつり合い、回転数が一定になります。ECU は回転数を見ながら、スロットル（または補助の空気の通り道）と燃料を調整して、目標の回転数に合わせます。冷えているときは、エンジンと触媒を早く暖めるため、目標を高くします（ファストアイドル）。' },
  starterT: { text: 'スターターは直流モーターです。止まっているときは電流が一番多く流れ、トルクが最大です。回り始めると、モーターが発電機のように逆向きの電圧（逆起電力）を出すので、流れる電流が減り、トルクも下がります。そのため、トルクは回転数に対して、ほぼ直線で下がります。電圧が下がると、線全体が下がります。',
    mark: { glow: ['starter'], text: '速く回るほど、トルクは下がる' } },
  starterGear: { text: 'モーターのトルクは小さいので、小さいピニオン（歯の少ない歯車）で、フライホイールの外周の大きいリングギヤを回します。歯の数の比（およそ 10〜15）だけ、トルクが大きくなり、回転は遅くなります。ギヤボックスと同じ「トルクと回転の交換」です。',
    mark: { glow: ['starter', 'flywheel'], text: 'ピニオン → リングギヤで、トルク約12倍' } },
  crankRpm: { text: 'スターターのトルクは速く回るほど下がり、摩擦トルクは速く回るほど上がります。2本の線が交わる回転数で、トルクがつり合って、それ以上速くならなくなります。これがクランキングの回転数（およそ 150〜300 rpm）です。電圧が低い、または冷えて油が硬いと、交わる所が左に動き、回りが遅くなります。',
    mark: { glow: ['starter'], text: 'スターターのトルク = 摩擦 で回転が決まる' } },
  current: { text: 'モーターに流れる電流は、電池の電圧 V から逆起電力（回る速さに比例）を引いて、巻き線の抵抗 R で割った値です。止まっているときは逆起電力が 0 なので、とても大きな電流（数百 A）が流れます。始動のときにライトが少し暗くなるのは、このためです。' },
  decel: { text: 'キーを OFF にすると、燃料と点火が止まり、燃焼のトルクが 0 になります。残るのは摩擦トルクだけで、これが回転を止める向きにはたらきます。回る物の運動方程式 J × α = T に、T = −摩擦トルク を入れた形です。',
    mark: { glow: ['flywheel', 'torque'], text: '摩擦トルクが回転を止める' } },
  stopTime: { text: '摩擦トルクがだいたい一定とみなすと、回転は一定の割合で下がります（α = −T_f ÷ J）。止まるまでの時間は、最初の角速度 ω₀ を α で割った値です。J が大きい（重いフライホイール）ほど、ゆっくり止まります。',
    mark: { glow: ['flywheel'], text: 'J が大きいほど、ゆっくり止まる' } },
  stopEnergy: { text: '回っているエンジンは、回転のエネルギー 1/2 × J × ω² を持っています。燃焼が止まると、このエネルギーが摩擦で熱になって、0 になったときに止まります。' },
  rock: { text: '止まる直前は回転が遅く、ピストンが空気を押し縮めると、その反発に勝てずに押し戻されます。そのため、最後に少し逆に回ってから止まります（揺り戻し）。グラフの最後で、回転数が少しマイナスになる所です。',
    mark: { glow: ['pistons'], text: '圧縮に押し戻される' } },
  neutral: { text: 'N では、クラッチの先に何もつながっていないので、エンジンが回すのは自分の回る部品だけ（J = 0.18 kg·m²）です。回る物の運動方程式 J × α = T から、J が小さいほど回転が速く上がります。アクセルを離すと、燃料が止まり、摩擦トルクで回転が下がります。',
    mark: { glow: ['pistons', 'flywheel'], text: 'エンジン側の J だけ → 速く上がる' } },
  inGear: { text: '段に入ってクラッチがつながると、エンジンは車も一緒に動かします。車の重さは、エンジンから見ると J_v = m × r² ÷ (i × i<sub>f</sub>)² の回しにくさに見えます（テーマ「回転体のイナーシャ」の 7.）。低い段ほど i が大きく、車が軽く見えるので、回転が速く上がります。',
    mark: { glow: ['wheels', 'flywheel'], text: '車の重さもエンジンから見ると J' } },
  after: { text: 'クラッチがつながっていると、エンジンの回転数は車速と変速比で決まります（n = 車速 ÷ r × i × i<sub>f</sub>）。変速の一瞬、車速はほとんど変わらないので、つないだ後の回転数は「変速前 × 次の変速比 ÷ 今の変速比」に下がります。',
    mark: { glow: ['crank'], text: '車速そのまま → 回転は変速比に比例' } },
  cut: { text: 'アップシフトでクラッチを切ると、エンジンは何も回さなくなり、アクセルも離すので、摩擦トルクだけで回転が下がります（N でアクセルを離したときと同じ）。下がった回転数と、次の段の回転数の差が小さいほど、つないだときのショックが小さくなります。差は半クラッチの摩擦で埋めます。',
    mark: { glow: ['flywheel'], text: '切っている間は、摩擦で回転が下がる' } }
};

// ---------- 項目 ----------
const LESSONS_RUN = [
  {
    name: '始動と吹け上がり', title: 'キーを回すと、なぜ回転が一度高く吹け上がるのか',
    scene: 'engine', starter: true, circuit: true, slow3d: 10,
    controls: [['エンジンの温度', 'warm', 0, 1, 1, warmText]],
    runLabel: 'キーを START に回す',
    start: startUp,
    tick: tickStart,
    reset: () => { S = Object.assign(newEngine(0), { phase: 'off' }); },
    text: [
      'キーを START に回すと、次の順番でエンジンがかかります。「キーを START に回す」を押して、グラフと 3D で確かめてください（実際の 1/3 の速さで見せています）。3D では、部品をタッチすると名前と説明が出ます。',
      '<b>キーからの電気の流れ</b>（3D の配線が光ります）: キーを ON にすると、ECU と燃料ポンプに電気が入ります。START まで回すと、バッテリー → キー → スターターリレー → マグネットスイッチ と小さな電流が流れます（黄色）。マグネットスイッチがピニオンを押し出し、接点を閉じると、太いケーブルからスターターのモーターに大きな電流が流れます（橙色）。エンジンがかかったら、ECU がインジェクターと点火コイルに、燃料を噴く合図と火花の合図を送り続けます（青）。押しボタン式のエンジンスタートでも、ECU が同じ順番で行っています。',
      '<b>① クランキング</b>: スターターモーターのピニオン（小さい歯車）が飛び出して、フライホイールの外周のリングギヤにかみ合い、クランクを約 200 rpm で回します。エンジンは自分では回り始められないので、外から回して、空気を吸わせて押し縮めます。',
      '<b>② 初爆</b>: 回転が安定すると、ECU（エンジンを制御するコンピューター）が燃料を噴いて点火します。燃焼のトルクは摩擦よりずっと大きく、回すのはエンジン側の部品だけなので、回転が一気に上がります。500 rpm を超えると、スターターは外れます。',
      '<b>③ 吹け上がり</b>: 始動直後は、エンストしないように燃料と空気を多めに入れます（始動増量）。その分、アイドルより高く吹け上がります。キーを回した直後の「ブォン」という音の正体です。',
      '<b>④ アイドル</b>: その後、ECU が燃料と空気を減らし、目標の回転数に落ち着かせます。冷えているときは、エンジンと排気をきれいにする触媒を早く暖めるため、目標を高く（ファストアイドル）します。温度のスライダーで比べてください。'
    ],
    symbols: 'J: エンジン側の慣性モーメント 0.18 kg·m²、α: 角加速度、T<sub>s</sub>: スターターのトルク、T<sub>f</sub>: 摩擦トルク、T<sub>圧縮</sub>: 圧縮の反発。',
    formula: () => [
      ['クランキング中', `J × α = ${sub('T', 's')} − ${sub('T', 'f')} − ${sub('T', '圧縮')}`, `約 ${crankingRpm(P.volt)} rpm で回る（スターターのトルク = 摩擦）`, WHY.crank],
      ['初爆の後', `J × α = ${sub('T', '燃焼')} − ${sub('T', 'f')}`, `燃焼 ${n0((P.warm ? 0.35 : 0.45) * combMax(1000))} N·m − 摩擦 ${n0(friction(500))} N·m で、一気に回転が上がる`, WHY.fire],
      ['吹け上がりの高さ', '始動増量: 0.5 秒だけ燃料と空気を多めに', S.phase === 'off' ? '「キーを START に回す」を押すと出ます' : `一番高い回転数 ${n0(S.peak)} rpm`, WHY.flare],
      ['アイドル', `${sub('T', '燃焼')} = ${sub('T', 'f')}（つり合い）`, `目標 ${P.warm ? IDLE_RPM : COLD_IDLE} rpm、摩擦 ${n1(friction(P.warm ? IDLE_RPM : COLD_IDLE))} N·m とつり合う`, WHY.idle]
    ],
    chart: () => ({
      xLabel: '時間 (秒)', yLabel: 'エンジン回転数 (rpm)', xMax: 5, xStep: 1, yMax: 2000, yStep: 250,
      series: [{ name: 'エンジン回転数', color: '#f0a81c', points: S.points },
        { name: `アイドルの目標 ${P.warm ? IDLE_RPM : COLD_IDLE} rpm`, color: 'rgba(255,255,255,0.6)', points: [[0, P.warm ? IDLE_RPM : COLD_IDLE], [5, P.warm ? IDLE_RPM : COLD_IDLE]], dash: [4, 4], width: 1 }],
      dots: S.events
    }),
    engine3d: () => ({ rpm: S.w / RPM, torque: S.torque, starter: S.starter, key: S.phase === 'off' ? 'off' : S.starter ? 'start' : 'on', fuel: S.phase === 'fire' || S.phase === 'idle', text: `${n0(S.w / RPM)} rpm　${PHASE_TEXT[S.phase].split('（')[0]}` }),
    readout: () => `${PHASE_TEXT[S.phase]}　${n0(S.w / RPM)} rpm（${warmText(P.warm)}エンジン）` + (S.phase !== 'off' ? `、一番高い回転数 ${n0(S.peak)} rpm` : '')
  },
  {
    name: 'スターターモーター', title: 'スターターが回る仕組みと、クランキングの回転数が決まる所',
    scene: 'engine', starter: true, circuit: true, slow3d: 10,
    controls: [['電池の電圧 (V)', 'volt', 8, 13, 0.5], ['エンジンの温度', 'warm', 0, 1, 1, warmText]],
    runLabel: 'スターターだけ回す（燃料なし）',
    start: startCrank,
    tick: tickCrank,
    reset: () => { C = newEngine(0); },
    text: [
      '<b>回す仕組み</b>: キーを START に回すと、小さな電流でスターターのリレーが入り、マグネットスイッチ（電磁石）に電気が流れます。マグネットスイッチは、① ピニオンを押し出してリングギヤにかみ合わせ、② 大きな電流（数百 A）をモーターに流す接点を閉じます。だから「かみ合ってから回る」順番になります。',
      'モーターのトルクは小さいので、歯の少ないピニオンで、歯の多いリングギヤを回し、トルクを約 10〜15 倍にします（ギヤボックスと同じ、トルクと回転の交換です）。エンジンがかかって速く回り出すと、ピニオンの中のワンウェイクラッチが空回りして、モーターが回されすぎないように守ります。キーを離すと、ばねでピニオンが戻ります。',
      '<b>回転数が決まる所</b>: グラフの橙の線がスターターのトルク、白い線がエンジンの摩擦トルクです。スターターは速く回るほどトルクが下がり、摩擦は速く回るほど上がるので、2本が交わる回転数で、つり合って一定になります。これがクランキングの回転数です。',
      '電池が弱って電圧が下がる、または冬に油が硬くなって摩擦が増えると、交わる所が左に動き、回りが遅くなります。遅すぎると、空気を押し縮める勢いが足りず、エンジンがかかりにくくなります。点線は、圧縮の反発で1回転に2回ゆれる摩擦の幅です。'
    ],
    symbols: `${sub('T', 'stall')}: 止まっているときのトルク、${sub('n', '0')}: 空回りの回転数、V: 電圧、I: 電流、k: モーターの定数、R: 巻き線の抵抗。`,
    formula: () => {
      const stall = STARTER.stall * P.volt / 12, free = STARTER.free * P.volt / 12;
      return [
        ['スターターのトルク（クランクで見た値）', `${sub('T', 's')} = ${sub('T', 'stall')} × (1 − n / ${sub('n', '0')})`, `${P.volt} V: ${sub('T', 'stall')} ${n0(stall)} N·m、${sub('n', '0')} ${n0(free)} rpm`, WHY.starterT],
        ['ピニオンとリングギヤ', `${sub('T', 'クランク')} = ${sub('T', 'モーター')} × ${STARTER_RATIO}`, `モーター ${n1(stall / STARTER_RATIO)} N·m → クランク ${n0(stall)} N·m`, WHY.starterGear],
        ['クランキングの回転数', `${sub('T', 's')}(n) = ${sub('T', 'f')}(n) になる n`, `約 ${crankingRpm(P.volt)} rpm（${warmText(P.warm)}エンジン）`, WHY.crankRpm],
        ['モーターの電流', 'I = (V − k × ω) / R', '止まっているとき最大。回り出すと逆起電力 k × ω で減る', WHY.current]
      ];
    },
    chart: () => {
      const n = crankingRpm(P.volt), now = C.w / RPM;
      return {
        xLabel: 'クランクの回転数 (rpm)', yLabel: 'トルク (N·m)', xMax: 400, xStep: 50, yMax: 140, yStep: 20,
        series: [{ name: `スターター（${P.volt} V）`, color: '#f0a81c', points: sample(400, x => starterTorque(x, P.volt), 5) },
          { name: '摩擦トルク', color: '#ffffff', points: sample(400, friction, 5), width: 3 },
          { name: '圧縮の反発のゆれ', color: 'rgba(255,255,255,0.4)', points: sample(400, x => friction(x) + AMP, 5), dash: [4, 4], width: 1 }],
        dots: [{ x: n, y: friction(n), label: `つり合う所 ${n} rpm` }].concat(C.t > 0 ? [{ x: Math.max(0, now), y: starterTorque(now, P.volt), color: '#f0a81c', label: `今 ${n0(now)} rpm` }] : [])
      };
    },
    engine3d: () => ({ rpm: C.w / RPM, torque: C.torque, starter: C.starter, key: C.starter ? 'start' : 'off', fuel: false, text: C.t > 0 ? `クランキング ${n0(C.w / RPM)} rpm` : 'スターター待ち' }),
    readout: () => `${P.volt} V、${warmText(P.warm)}エンジン: クランキングの回転数は約 ${crankingRpm(P.volt)} rpm` + (C.t > 0 ? `（今 ${n0(C.w / RPM)} rpm）` : '')
  },
  {
    name: 'エンジンが止まるまで', title: 'キーを OFF にすると、摩擦で回転が下がって止まる',
    scene: 'engine', starter: true, circuit: true, slow3d: 10,
    controls: [['キーを切るときの回転数 (rpm)', 'stopRpm', 750, 3000, 250], ['フライホイールの重さ（J, kg·m²）', 'flyJ', 0.1, 0.3, 0.02]],
    runLabel: 'キーを OFF にする',
    start: startStop,
    tick: tickStop,
    reset: () => { D = newEngine(P.stopRpm); },
    text: [
      'キーを OFF にすると、燃料の噴射と点火が止まり、燃焼のトルクが 0 になります。エンジンを止めるのは、エンジンの中の<b>摩擦</b>です。ピストンとシリンダーのこすれ、軸受け、空気を出し入れする損失（ポンプ損失）などが、回転を止める向きのトルクになります。',
      '回っているエンジンは、回転のエネルギー（1/2 × J × ω²）を持っています。このエネルギーが摩擦で少しずつ熱になり、0 になったときに止まります。アイドル（750 rpm）からなら、1〜2 秒ほどで止まります。「キーを OFF にする」を押して確かめてください（実際の 1/3 の速さで見せています）。',
      'フライホイールが重い（J が大きい）ほど、たくさんのエネルギーをためているので、止まるまで時間がかかります。高い回転数から切ったときも、エネルギーが多い（回転数の2乗に比例）ので、時間がかかります。',
      '止まる直前は、ピストンが空気を押し縮める反発に勝てずに押し戻され、少し逆に回ってから止まります（揺り戻し）。グラフの最後の、0 より下に少し出る所です。'
    ],
    symbols: `J: 慣性モーメント、ω: 角速度、${sub('T', 'f')}: 摩擦トルク。`,
    formula: () => {
      const w0 = P.stopRpm * RPM, tf = (friction(P.stopRpm) + friction(0)) / 2;
      return [
        ['回転の下がり方', `J × dω/dt = −${sub('T', 'f')}`, `${P.stopRpm} rpm で 1秒に約 ${n0(friction(P.stopRpm) / P.flyJ / RPM)} rpm 下がる`, WHY.decel],
        ['止まるまでの時間（目安）', `t ≈ J × ${sub('ω', '0')} / ${sub('T', 'f平均')}`, `${P.flyJ} × ${n1(w0)} ÷ ${n1(tf)} ≒ ${n2(P.flyJ * w0 / tf)} 秒` + (D.stopped ? `（計算では ${n2(D.t)} 秒）` : ''), WHY.stopTime],
        ['回転のエネルギー', `E = 1/2 × J × ${sub('ω', '0')}²`, `${n0(0.5 * P.flyJ * w0 * w0)} J → 摩擦で熱になる`, WHY.stopEnergy],
        ['最後の揺り戻し', `${sub('T', '圧縮')} > 回る勢い → 押し戻される`, '止まる直前に、少し逆に回る', WHY.rock]
      ];
    },
    chart: () => ({
      xLabel: '時間 (秒)', yLabel: 'エンジン回転数 (rpm)', xMax: Math.max(2, Math.ceil(D.t)), xStep: 0.5, yMax: 3200, yMin: -400, yStep: 400,
      series: [{ name: 'エンジン回転数', color: '#f0a81c', points: D.points }, { name: '', color: 'rgba(255,255,255,0.5)', points: [[0, 0], [8, 0]], width: 1 }],
      dots: D.events
    }),
    engine3d: () => ({ rpm: D.t > 0 ? D.w / RPM : P.stopRpm, torque: D.t > 0 ? D.torque : 0, key: D.t > 0 ? 'off' : 'on', fuel: D.t === 0, text: D.stopped ? '停止' : D.t > 0 ? `${n0(D.w / RPM)} rpm（燃料なし）` : `${P.stopRpm} rpm で回転中` }),
    readout: () => (D.t > 0 ? `キー OFF から ${n2(D.t)} 秒: ${n0(D.w / RPM)} rpm` + (D.stopped ? '（停止）' : '') : `キーを OFF にする前: ${P.stopRpm} rpm`) + `、フライホイール J = ${P.flyJ} kg·m²`
  },
  {
    name: 'シフトとアクセル', title: 'N・R・1速〜6速で、アクセルとアップシフトのときのエンジンの動き',
    scene: 'carEngine', live: true,
    actions: [['自動で見る', startScript, () => !!R.script]]
      .concat(SHIFTS.map((x, g) => [x[0], () => { manual(); shiftTo(g); }, () => R.target === g]))
      .concat([['ブレーキ', () => { manual(); R.brake = true; R.msg = 'ブレーキで止めます。'; }, () => R.brake]]),
    controls: [['アクセル (%)', 'pedal', 0, 100, 5]],
    reset: resetDrive,
    tick: dt => { if (!R.script && P.pedal > 0 && R.msg.startsWith('N（ニュートラル）でアイドル')) R.msg = 'アクセルを踏んでいます。'; tickDrive(dt); },
    text: [
      '「自動で見る」を押すと、N → R → N → 1速 → 6速 の順に、決まった操作をして見せます。R、N、1〜6 のボタンと、アクセルのスライダーで、自分で操作することもできます。グラフは、直近 30 秒のエンジン回転数です。',
      '<b>N でアクセルを踏む</b>: クラッチの先に何もつながっていないので、エンジンが回すのは自分の部品だけです。J が小さいので、一気に吹け上がり、7,000 rpm でレブリミッター（燃料を止める仕組み）がはたらきます。離すと、摩擦で回転が下がってアイドルに戻ります。',
      '<b>段に入れてアクセルを踏む</b>: クラッチがつながると、エンジンは車も一緒に動かします。車の重さはエンジンから見ると J に見え、低い段ほど軽く、高い段ほど重く見えます。だから 1速では回転が速く上がり、6速ではとてもゆっくりです。回転数は、車速と変速比で決まります。',
      '<b>アップシフト</b>: クラッチを切ると、エンジンは摩擦で回転が下がります。次の段に入れてクラッチをつなぐと、回転数は「変速前 × 次の変速比 ÷ 今の変速比」の回転数にそろいます。グラフの、のこぎりの歯の形です（テーマ「エンジンの性能曲線と変速点」の 3.）。',
      '<b>R（リバース）</b>: 変速比が大きく（この例では 3.5）、逆向きに回すので、車は後ろへゆっくり進みます。R や 1速で止まった状態から発進するときは、半クラッチで少しずつつなぎます。値は説明用の仮の値です。'
    ],
    symbols: `${sub('J', 'e')}: エンジン側の慣性モーメント 0.18 kg·m²、${sub('J', 'v')}: 車をエンジンから見た慣性モーメント、i: 変速比、${sub('i', 'f')}: 最終減速比 4.1、r: タイヤの半径、${sub('T', 'f')}: 摩擦トルク。`,
    formula: () => {
      const n = 5500;
      return [
        ['N でアクセルを踏んだとき', `α = (T − ${sub('T', 'f')}) / ${sub('J', 'e')}`, `アクセル全開で 1秒に約 ${n0((torqueAt(3000)) / J_ENGINE / RPM)} rpm 上がる（3,000 rpm のとき）`, WHY.neutral],
        ['段に入っているとき', `α = (T − ${sub('T', 'f')} − 走行抵抗の分) / (${sub('J', 'e')} + ${sub('J', 'v')})、${sub('J', 'v')} = m × r² / (i × ${sub('i', 'f')})²`,
          SHIFTS.slice(2).map((x, k) => `${x[0]} ${sub('J', 'v')} ${n2(jv(k + 2))}`).join('、') + ' kg·m²', WHY.inGear],
        ['変速した後の回転数', `${sub('n', '後')} = ${sub('n', '前')} × ${sub('i', '次')} / ${sub('i', '今')}`, GEARS.slice(0, -1).map((x, g) => `${x[0]}→${GEARS[g + 1][0]} ${n0(n * GEARS[g + 1][1] / x[1])} rpm`).join('、') + `（${n} rpm で変速）`, WHY.after],
        ['クラッチを切っている間', `${sub('J', 'e')} × dω/dt = −${sub('T', 'f')}`, `${n} rpm で 1秒に約 ${n0(friction(n) / J_ENGINE / RPM)} rpm 下がる`, WHY.cut]
      ];
    },
    chart: () => {
      const t0 = Math.max(0, R.t - 30);
      return {
        xLabel: '時間 (秒、直近 30 秒)', yLabel: 'エンジン回転数 (rpm)', xMax: 30, xStep: 5, yMax: 8000, yStep: 1000,
        series: [{ name: 'エンジン回転数', color: '#f0a81c', points: R.points.map(([x, y]) => [x - t0, y]) },
          { name: '', color: 'rgba(229,115,115,0.8)', points: [[0, REDLINE], [30, REDLINE]], dash: [3, 3], width: 1 }],
        dots: R.marks.map(m => ({ x: m.x - t0, y: m.y, label: m.label }))
      };
    },
    car3d: () => ({ rpm: R.w / RPM, kmh: R.v * 3.6, text: `${gearName(R.g)}　${n0(R.w / RPM)} rpm　${n0(Math.abs(R.v) * 3.6)} km/h` }),
    readout: () => `<b>${gearName(R.g)}</b>　エンジン ${n0(R.w / RPM)} rpm、車速 ${n0(R.v * 3.6)} km/h、アクセル ${n0((R.script ? R.pedal * 100 : P.pedal))}%、クラッチ: ${clutchText()}${R.cut ? '、レブリミッター（燃料カット）' : ''}<br>${R.msg}`
  }
];

startCourse(LESSONS_RUN, 'エンジンの摩擦トルク、スターター、クラッチ、リバースの変速比などは、2.0 L の自然吸気エンジンの車を想定した説明用の仮の値です。車は 1,000 kg、タイヤの半径 0.315 m、最終減速比 4.1、1速〜6速の変速比はギヤボックスLABの初期値です。');
