// clutch.js: クラッチ（段階9から）。単板と多板の形、多板の拡大図、半クラッチの動き（簡単な物理計算）
//
// 多板クラッチ（バイクの湿式多板クラッチを例にした形）
//   エンジン側: フライホイール、かご（バスケット）、ドライブプレート（茶色、外側の爪がかごの溝に入る）、プレッシャープレート、ばね
//   インプット軸側: ハブ（外側の歯）、ドリブンプレート（鋼の板、内側の歯がハブの歯に入る）
//   ドライブプレートとドリブンプレートを交互に重ね、ばねの力で押し付けて、摩擦で回転を伝える

const PLATE_T = 0.07;       // ドライブプレートとドリブンプレートの厚さ
const GAP_MAX = 0.035;      // ペダルを踏み切ったときの、板と板のすき間
const EXPLODE_GAP = 0.35;   // 「分解して見る」で、板と板の間に足す間隔
const MAIN_Z0 = -6.4;       // 全体の図での、フライホイールの後ろの面の位置

let pack = null;            // クラッチの部品: { z0, items: [{ mesh, t }], pressure, springs, basket, back, hub, release, length }
let clutchExplodeNow = 0;

// 四角い爪が count 個ある輪郭。base = 爪のない所の半径、tab = 爪の先の半径（base より小さいと内向きの爪）
// width = 爪の幅（1 で隙間なし）、offset = 爪の角度をずらす量
function tabOutline(count, base, tab, width, offset) {
  const points = [];
  for (let k = 0; k < count; k++) {
    const a = (offset || 0) + k * 2 * Math.PI / count;
    const w = width * Math.PI / count;
    [[a - w, base], [a - w, tab], [a + w, tab], [a + w, base]].forEach(([b, r]) => points.push(new THREE.Vector2(r * Math.cos(b), r * Math.sin(b))));
  }
  return points;
}

// 長さ1の板（z = 0〜1）。scale.z で長さを変えて使う
const unitExtrude = (outline, hole) => extrude(outline, hole, 1).translate(0, 0, 0.5);

// 板の並び。多板: ドライブプレート（f）とドリブンプレート（s）を交互に、両端はドライブプレート。単板: クラッチディスク（d）が1枚
function plateOrder() {
  if (state.clutch.type === 'single') return ['d'];
  const order = [];
  for (let k = 0; k < state.clutch.plates; k++) order.push('f', 's');
  order.pop();
  return order;
}

// 押し付けている割合（1 = 完全につながる、0 = 切れている）。ペダル20%までは完全、70%以上で切れる
const engage = () => Math.min(1, Math.max(0, (0.7 - sim.pedal) / 0.5));

function buildClutch(z0) {
  const engine = () => spin.engine;
  const input = () => spin.input;
  const single = state.clutch.type === 'single';
  pack = { z0, items: [], springs: [] };

  put(gearGeometry(72, 1.75, 0.3), 'steel', 'clutch:flywheel', false, 0, z0 - 0.15, engine);   // フライホイール（外周はスターター用の歯）
  plateOrder().forEach(kind => {
    let mesh;
    if (kind === 'f') mesh = put(extrude(tabOutline(12, 1.3, 1.48, 0.42), circle(0.82), PLATE_T), 'disc', 'clutch:friction', false, 0, 0, engine);
    if (kind === 's') mesh = put(extrude(circle(1.3), tabOutline(16, 0.8, 0.7, 0.45, Math.PI / 16), PLATE_T), 'steel', 'clutch:steel', false, 0, 0, input);
    if (kind === 'd') mesh = put(extrude(circle(1.35), circle(0.2), 0.1), 'disc', 'clutch:disc', false, 0, 0, input);
    pack.items.push({ mesh, t: kind === 'd' ? 0.1 : PLATE_T });
  });
  // プレッシャープレート: 外側の爪がかごの溝に入り、エンジン側と一緒に回る
  pack.pressure = put(extrude(tabOutline(12, 1.3, 1.48, 0.42), circle(0.82), 0.14), 'steel', 'clutch:pressure', false, 0, 0, engine);

  // かご（バスケット）と後ろの板。中が見えるように透かす
  pack.basket = put(unitExtrude(circle(1.6), tabOutline(12, 1.4, 1.52, 0.5)), 'case', 'clutch:basket', false, 0, z0, engine);
  pack.back = put(extrude(circle(1.6), circle(0.3), 0.08), 'case', 'clutch:basket', false, 0, 0, engine);
  [pack.basket, pack.back].forEach(mesh => ghost(mesh, state.clutchClear || !state.clutchDetail ? 0.25 : 1));

  // ハブ（インプット軸と一体。外側の歯に、鋼の板の内側の歯が入る）。単板では、ディスクの中心のハブになる
  pack.hub = put(unitExtrude(tabOutline(16, 0.62, 0.78, 0.42), circle(0.2)), 'steel', 'clutch:hub', false, 0, z0, input);

  // ばね6本（らせん）。プレッシャープレートを押し付ける
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3;
    const points = [];
    for (let n = 0; n <= 60; n++) {
      const turn = n / 60 * 5 * 2 * Math.PI;
      points.push(new THREE.Vector3(1.05 * Math.cos(a) + 0.09 * Math.cos(turn), 1.05 * Math.sin(a) + 0.09 * Math.sin(turn), n / 60));
    }
    pack.springs.push(put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 120, 0.018, 5), 'brass', 'clutch:spring', false, 0, 0, engine));
  }
  // レリーズベアリング: ペダルを踏むと前へ出て、ばねを縮める（図は簡略化）
  pack.release = put(extrude(circle(0.42), circle(0.2), 0.12), 'dark', 'clutch:release', false, 0, 0);
  if (single) pack.springs.forEach(s => { s.visible = false; });   // 単板は、ダイヤフラムスプリングを省略して描く

  // 部品が入る長さ（すき間が最大のとき）
  const thickness = pack.items.reduce((sum, item) => sum + item.t, 0) + 0.14;
  pack.length = thickness + (pack.items.length + 1) * GAP_MAX + 0.4;
  movePack(0);
}

// 毎フレーム: ペダルの位置で、板と板のすき間を変える。拡大図では「分解して見る」の間隔も足す
function movePack(dt) {
  clutchExplodeNow += ((state.clutchDetail && state.clutchExplode ? 1 : 0) - clutchExplodeNow) * Math.min(1, dt * 6);
  const gap = GAP_MAX * Math.min(1, Math.max(0, (sim.pedal - 0.7) / 0.3));   // つながっている間は、板どうしが触れている
  const extra = EXPLODE_GAP * clutchExplodeNow;
  let z = pack.z0 + gap + extra;
  pack.items.concat([{ mesh: pack.pressure, t: 0.14 }]).forEach(item => {
    item.mesh.position.z = z + item.t / 2;
    z += item.t + gap + extra;
  });
  const pressureBack = pack.pressure.position.z + 0.07;
  const backZ = pack.z0 + pack.length + extra * (pack.items.length + 2);
  pack.springs.forEach(s => { s.position.z = pressureBack; s.scale.z = backZ - pressureBack; });
  pack.back.position.z = backZ + 0.04;
  pack.basket.scale.z = backZ - pack.z0;
  pack.hub.scale.z = pressureBack - pack.z0;
  pack.release.position.z = backZ + 0.25 - 0.15 * sim.pedal;
}

// 多板クラッチの拡大図: クラッチだけを大きく描く
function buildClutchDetail() {
  put(cylinder(0.25, 0.6), 'steel', 'car:engine', false, 0, -1.3, () => spin.engine);                // エンジンのクランク軸の先
  addMark(put(cylinder(0.16, 4), 'steel', 'shaft:input', false, 0, 1.2, () => spin.input), 0.16, 4);  // インプット軸
  buildClutch(-1);
}

// ---------- クラッチの物理計算 ----------
// 回る物を3つに分けて計算する
//   エンジン側: エンジン、フライホイール、ドライブプレート（いつもエンジンと同じ速さ）
//   インプット軸側: ドリブンプレート、インプット軸、カウンタ軸、ギヤ
//   車: 段に入っているときだけ、インプット軸側と一緒に動く（タイヤ、車の質量）
// クラッチが切れていると、エンジンの力は後ろへ伝わらない。インプット軸側は抵抗で少しずつ遅くなり、
// 段に入っていれば車と一緒に惰性で走って、走行抵抗で少しずつ遅くなる
// 湿式（多板）は、切れていてもオイルの粘りで少しだけ引きずられる（引きずりトルク）

const J_ENGINE = 0.15;      // エンジン側の慣性モーメント (kg·m²)
const J_INPUT = 0.02;       // インプット軸側の慣性モーメント (kg·m²)
const CAR_MASS = 1000;      // 車の質量 (kg)
const BEARING = { fixed: 0.6, perRad: 0.004 };   // インプット軸側の軸受けとギヤ（オイルをかき回す）の抵抗: 0.6 N·m + 0.004 N·m × 角速度
const WET_DRAG = 0.0012;    // 湿式の引きずり: 回転差 1 rad/s あたりの N·m
const REV_LIMIT = 6500;
const BRAKE_MAX = 0.8 * 1000 * 9.81;   // ブレーキ100%の力 (N): 車 1,000 kg を 0.8 G で止める力     // 自動クラッチが許す、変速後のエンジン回転数の上限 (rpm)
const ROAD = { rolling: 0.012, airCdA: 0.65, air: 1.2 };   // 転がり抵抗係数、空気抵抗（Cd × 前面投影面積 m²）、空気の密度 kg/m³
const RPM = 2 * Math.PI / 60;   // rpm → rad/s
const sim = { brake: 0, pedal: 0, engine: 3000, input: 3000, output: 0, torque: 0, slipping: false, transmitting: false, stalled: false, message: '' };

// 車の質量を、インプット軸から見た慣性モーメントに直したもの（段に入っているときだけ）
function carInertia(c) {
  return c.engaged ? CAR_MASS * c.radius ** 2 / (c.total * c.final) ** 2 : 0;
}

// インプット軸側を止めようとするトルク（大きさ）。軸受けの抵抗と、段に入っていれば走行抵抗
// 走行抵抗 (N): 転がり抵抗 + 空気抵抗。止まっていれば 0
// 走行抵抗 + ブレーキ (N)。止まっていれば 0（止まった車を、逆に動かさない）
function roadForce(c) {
  if (Math.abs(sim.output) < 1) return 0;
  const v = Math.abs(sim.output) / c.final * RPM * c.radius;   // 車速 (m/s)
  return ROAD.rolling * CAR_MASS * 9.81 + 0.5 * ROAD.air * ROAD.airCdA * v * v + sim.brake * BRAKE_MAX;
}

function inputLoad(c) {
  const bearing = BEARING.fixed + BEARING.perRad * Math.abs(sim.input) * RPM;
  if (!c.engaged) return bearing;
  return bearing + roadForce(c) * c.radius / Math.abs(c.total * c.final);
}

// 運転者（AMTでは制御）がアクセルで目指すエンジン回転数
//   エンジン回転数を入力にしたとき: その値
//   車速を入力にしたとき: 段に入ってクラッチがつながっていれば、目標の車速に必要な回転数。
//   半クラッチ中で目標より遅ければ、発進用の 2000 rpm。それ以外はアイドリング
const LAUNCH_RPM = 2000;
function engineTarget(c) {
  if (state.input !== 'speed') return state.rpm;
  if (!c.engaged) return IDLE_RPM;
  if (sim.slipping || engage() < 1) return carSpeed() < state.speed ? LAUNCH_RPM : IDLE_RPM;
  // 走行抵抗に勝つぶんのアクセルを足す（アクセルの効き 0.5 N·m/rpm で割って、回転数の上乗せに直す）
  return Math.min(REV_LIMIT, Math.max(IDLE_RPM, speedRpm(state.gear) + inputLoad(c) / 0.5));
}

// 今の車速 (km/h)
const carSpeed = () => sim.output / state.car.finalRatio * Math.PI * state.car.tire * 60 / 1000;

// value を、0 をまたがない範囲で amount だけ 0 に近づける（抵抗で止まるときに、逆に回り出さないように）
const towardZero = (value, amount) => Math.sign(value) * Math.max(0, Math.abs(value) - amount);

function resetSim() {
  const start = state.input === 'speed' ? IDLE_RPM : state.rpm;
  Object.assign(sim, { brake: 0, pedal: 0, engine: start, input: start, output: 0, torque: 0, slipping: false, transmitting: false, stalled: false, message: '' });
  Object.assign(amt, { phase: 'idle', drive: false, launch: false });
  el('pedal').value = 0;
  el('brake').value = 0;
  el('brakeValue').textContent = '0%';
}

function stepSim(dt) {
  stepAmt(dt);   // 自動クラッチ（AMT）のときは、ペダルと段をここで操作する
  const c = calc(state.gear);
  const jIn = J_INPUT + carInertia(c);
  const load = inputLoad(c);
  const engineTorque = sim.stalled ? 0 : Math.max(-20, Math.min(state.torque, 0.5 * (engineTarget(c) - sim.engine)));
  const capacity = engage() * clutch().capacity;
  const slip = sim.engine - sim.input;

  // つながっていられるか: エンジン側とインプット軸側が一体で回ると仮定して、クラッチを通るトルクが容量以下なら滑らない
  const alpha = (engineTorque - Math.sign(sim.input || 1) * load) / (J_ENGINE + jIn);
  const through = engineTorque - J_ENGINE * alpha;
  if (capacity > 0 && Math.abs(slip) < 20 && Math.abs(through) <= capacity) {
    sim.slipping = false;
    sim.torque = through;
    sim.engine += alpha * dt / RPM;
    sim.input = sim.engine;
  } else {
    // 滑っている（半クラッチ）か、切れている。切れているときは、湿式の引きずりだけが伝わる
    const drag = state.clutch.type === 'multi' ? WET_DRAG * slip * RPM : 0;
    sim.slipping = capacity > 0;
    sim.torque = capacity * Math.sign(slip) + drag;
    sim.engine += (engineTorque - sim.torque) / J_ENGINE * dt / RPM;
    sim.input += sim.torque / jIn * dt / RPM;
    sim.input = towardZero(sim.input, load / jIn * dt / RPM);
  }
  if (c.engaged) sim.output = sim.input / c.total;   // 段に入っていれば、アウトプット軸と車はインプット軸と一緒に動く
  else {
    // ニュートラル: アウトプット軸はタイヤと常につながっているので、惰性で走る車に回される。
    // 走行抵抗で車が遅くなるぶん、アウトプット軸も遅くなる（車の減速度 = 走行抵抗 ÷ 質量 を、アウトプット軸の回転に直す）
    const c0 = calc(0);
    const slowDown = roadForce(c0) * c0.final / (CAR_MASS * c0.radius);   // アウトプット軸の角減速度 (rad/s²)
    sim.output = towardZero(sim.output, slowDown * dt / RPM);
  }
  sim.transmitting = capacity > 0 && Math.abs(sim.torque) > 1;
  if (!sim.stalled && sim.engine < 400) {
    sim.stalled = true;
    sim.engine = Math.max(0, sim.engine);
    sim.message = 'エンストしました。エンジン回転数が下がりすぎました。ペダルを踏んで「エンジンをかけ直す」を押してください。';
  }
}

// 段を変えるとき: クラッチが切れていれば、シンクロがインプット軸の回転をアウトプット軸に合わせる
function shiftWithClutch(gear) {
  if (gear === state.gear) return;
  if (engage() > 0) {
    sim.message = 'クラッチペダルを70%以上踏んでから、段を変えてください（つながったままでは、シンクロが回転を合わせられません）。';
    return;
  }
  state.gear = gear;
  sim.message = '';
  const c = calc(gear);
  if (c.engaged) sim.input = sim.output * c.total;
}

// ---------- 自動クラッチ（AMT: MTのクラッチ操作と変速を、機械が代わりに行う） ----------
// 1回の変速: クラッチを切る（0.15秒）→ 段を変える（0.25秒、シンクロが回転を合わせる）→ クラッチをつなぐ
// つなぐときは、半クラッチの範囲（ペダル70%〜20%）だけゆっくり動かす。発進のときは、さらにゆっくり
// D（自動で変速）: 停車中は1速で発進し、エンジン回転数が目標に近づいたら1段上げ、1300 rpm を下回ったら1段下げる

const amt = { phase: 'idle', timer: 0, target: NEUTRAL, drive: false, launch: false };

// 1段上げるか
//   エンジン回転数を入力にしたとき: エンジン回転数が目標に近づいたら
//   車速を入力にしたとき: 2800 rpm を超えたか、目標の車速に近づいたら。ただし上げた後が 1500 rpm を下回るなら上げない
function wantUpshift(next) {
  if (state.input !== 'speed') return sim.engine > state.rpm - 150;
  const after = Math.abs(sim.output * calc(next).total);
  return after > 1500 && (sim.engine > 2800 || carSpeed() > state.speed - 3);
}

function requestShift(gear) {
  if (gear === state.gear || amt.phase !== 'idle') return;
  // 変えた後にエンジンが回りすぎる段には、変えない（エンジンを守る）
  const after = gear === NEUTRAL ? 0 : Math.abs(sim.output * calc(gear).total);
  if (after > REV_LIMIT) {
    sim.message = `${gearName(gear)}に変えると、エンジンが約${n0(after)} rpm まで回ってしまうので、変えません（上限 ${REV_LIMIT} rpm）。`;
    return;
  }
  sim.message = '';
  Object.assign(amt, { phase: 'open', timer: 0, target: gear, launch: Math.abs(sim.output) < 50 });
}

function stepAmt(dt) {
  if (state.clutchMode !== 'auto') return;
  amt.timer += dt;
  if (amt.phase === 'open') {
    sim.pedal = Math.min(1, sim.pedal + dt / 0.15);
    if (sim.pedal >= 1) Object.assign(amt, { phase: 'shift', timer: 0 });
  } else if (amt.phase === 'shift' && amt.timer > 0.25) {
    shiftWithClutch(amt.target);
    Object.assign(amt, { phase: amt.target === NEUTRAL ? 'idle' : 'close', timer: 0 });
    update();   // 段が変わったので、図とボタンを作り直す（app.js）
  } else if (amt.phase === 'close') {
    const half = sim.pedal < 0.7 && sim.pedal > 0.2;
    const speed = !half ? 4 : amt.launch ? 0.35 : 1.2;   // 1秒あたりに戻すペダルの量
    sim.pedal = Math.max(0, sim.pedal - speed * dt);
    if (sim.pedal === 0) amt.phase = 'idle';
  } else if (amt.phase === 'idle' && amt.drive) {
    const forward = drumOrder().filter(g => g !== NEUTRAL && !state.gears[g].reverse);
    const now = forward.indexOf(state.gear);
    if (now < 0) requestShift(forward[0]);
    else if (now < forward.length - 1 && wantUpshift(forward[now + 1])) requestShift(forward[now + 1]);
    else if (sim.engine < 1300 && now > 0) requestShift(forward[now - 1]);
  }
}

// 図の下に出す、今の状態
function simReadout() {
  const slip = sim.engine - sim.input;
  const status = sim.stalled ? 'エンスト' : engage() === 0 ? '切れている（エンジンの力は後ろへ伝わらない）' : sim.slipping ? '半クラッチ（滑りながら伝えている）' : 'つながっている';
  const speed = carSpeed();
  const auto = state.clutchMode === 'auto' ? ` ／ 自動クラッチ: ${{ idle: '待機', open: 'クラッチを切っている', shift: '段を変えている', close: 'クラッチをつないでいる' }[amt.phase]}` : '';
  const target = state.input === 'speed' ? `目標の車速 ${n0(state.speed)} km/h ／ ` : '';
  return target + (sim.brake > 0 ? `ブレーキ ${n0(sim.brake * 100)}% ／ ` : '') + `エンジン（ドライブプレート） ${n0(sim.engine)} rpm ／ インプット軸（ドリブンプレート） ${n0(sim.input)} rpm ／ 回転差 ${n0(slip)} rpm ／ クラッチを通るトルク ${n0(sim.torque)} N·m ／ ${status} ／ 車速 ${n1(speed)} km/h${auto}`
    + (sim.message ? `<br><b>${sim.message}</b>` : '');
}
