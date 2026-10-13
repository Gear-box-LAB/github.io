// clutch.js: クラッチ（段階9から）。単板と多板の形、多板の拡大図、半クラッチの動き（簡単な物理計算）
//
// 多板クラッチ（バイクの湿式多板クラッチを例にした形）
//   エンジン側: フライホイール、かご（バスケット）、摩擦板（茶色、外側の爪がかごの溝に入る）、プレッシャープレート、ばね
//   インプット軸側: ハブ（外側の歯）、鋼の板（スチールプレート、内側の歯がハブの歯に入る）
//   摩擦板と鋼の板を交互に重ね、ばねの力で押し付けて、摩擦で回転を伝える

const PLATE_T = 0.07;       // 摩擦板と鋼の板の厚さ
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

// 板の並び。多板: 摩擦板（f）と鋼の板（s）を交互に、両端は摩擦板。単板: クラッチディスク（d）が1枚
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

// ---------- 半クラッチの物理計算 ----------
// エンジン側と車側を、2つの回る物（慣性モーメント）として計算する
//   滑っている間: エンジン側は「エンジントルク − クラッチのトルク」、車側は「クラッチのトルク」で回転が変わる
//   滑っていない間: 2つが一体で回る
// 運転者は、アクセルでエンジン回転数を「エンジン回転数」の欄の値に保とうとする

const J_ENGINE = 0.15;      // エンジン側の慣性モーメント (kg·m²)
const J_INPUT = 0.02;       // インプット軸側（クラッチの板、インプット軸、カウンタ軸、ギヤ）の慣性モーメント
const CAR_MASS = 1000;      // 車の質量 (kg)
const sim = { pedal: 0, engine: 3000, input: 3000, output: 0, torque: 0, slipping: false, stalled: false, message: '' };

const RPM = 2 * Math.PI / 60;   // rpm → rad/s

// 車の質量を、インプット軸から見た慣性モーメントに直したもの（つながっている段があるときだけ）
function carInertia(c) {
  return c.engaged ? CAR_MASS * c.radius ** 2 / (c.total * c.final) ** 2 : 0;
}

function resetSim() {
  Object.assign(sim, { pedal: 0, engine: state.rpm, input: state.rpm, output: 0, torque: 0, slipping: false, stalled: false, message: '' });
  el('pedal').value = 0;
}

function stepSim(dt) {
  const c = calc(state.gear);
  const jIn = J_INPUT + carInertia(c);
  const engineTorque = sim.stalled ? 0 : Math.max(-20, Math.min(state.torque, 0.5 * (state.rpm - sim.engine)));
  const capacity = engage() * clutch().capacity;
  const together = engineTorque * jIn / (J_ENGINE + jIn);   // 一体で回るときに、クラッチを通るトルク
  const slip = sim.engine - sim.input;

  if (Math.abs(slip) < 20 && Math.abs(together) <= capacity) {
    sim.slipping = false;
    sim.torque = together;
    sim.engine += engineTorque / (J_ENGINE + jIn) * dt / RPM;
    sim.input = sim.engine;
  } else {
    sim.slipping = capacity > 0;
    sim.torque = capacity * Math.sign(slip);
    sim.engine += (engineTorque - sim.torque) / J_ENGINE * dt / RPM;
    sim.input += sim.torque / jIn * dt / RPM;
  }
  if (c.engaged) sim.output = sim.input / c.total;   // 段に入っていれば、アウトプット軸はインプット軸と一緒に動く
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

// 図の下に出す、今の状態
function simReadout() {
  const slip = sim.engine - sim.input;
  const status = sim.stalled ? 'エンスト' : engage() === 0 ? '切れている' : sim.slipping ? '半クラッチ（滑っている）' : 'つながっている';
  const speed = sim.output / state.car.finalRatio * 2 * Math.PI * state.car.tire / 2 * 60 / 1000;
  return `エンジン ${n0(sim.engine)} rpm ／ インプット軸 ${n0(sim.input)} rpm ／ 回転差 ${n0(slip)} rpm ／ ${status} ／ 車速 ${n1(speed)} km/h`
    + (sim.message ? `<br><b>${sim.message}</b>` : '');
}
