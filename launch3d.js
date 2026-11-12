// launch3d.js: テーマ「ローンチ制御」の 3D
// study3d.js の box / rod / mat / label / sizeLabel / setLabel / makeCar / makeRoad、partinfo.js の tagPart を使う

// 札をつくって置く
function tag3d(parent, text, x, y, z, color, h) {
  const t = label(text, color || '#ffd54f');
  sizeLabel(t, h);
  t.position.set(x, y, z);
  parent.add(t);
  return t;
}
// 力の矢印（長さは update で変える）
function arrow3d(parent, color, key) {
  const a = tagPart(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.1, color, 0.03, 0.02), key);
  parent.add(a);
  return a;
}
function setArrow(a, from, dir, len, head) {
  a.visible = len > 0.005;
  a.position.copy(from);
  a.setDirection(dir);
  a.setLength(Math.max(len, 0.006), head, head * 0.7);
}
// 部品を、伝えている力の大きさ k (0〜1) で橙色に光らせる
function heat(obj, k) {
  obj.traverse(x => { if (x.material && x.material.emissive) x.material.emissive.setRGB(0.9 * k, 0.45 * k, 0); });
}

// ---------- タイヤの接地面（1. 摩擦円 2. スリップ率 3. ホイールスピン） ----------
// タイヤは前（+x）へ転がる。路面の印は、車速で後ろへ流れる
// 接地面のゴムを「ブラシの毛」に見立てて、たわみ（つかんでいる所）とすべり（赤）を見せる
const PATCH = { a: 0.07, n: 14, h: 0.03, show: 4 };   // 接地面の長さの半分 (m)、毛の数、毛の高さ（見やすく高くした値）、たわみを何倍に見せるか
function buildTire(world) {
  const r = CAR.tire;
  const road = tagPart(new THREE.Group(), 'road');
  world.add(road);
  box(road, 4, 0.02, 0.7, 0x4a5258, 0, -0.01, 0);
  const marks = new THREE.Group();
  // 路面の小石: 車速で後ろへ流れて、地面の動きを見せる。白線のような規則正しい模様はちらつくので、暗い色の小石をばらばらに置く
  [[-1.7, 0.2], [-1.2, -0.25], [-0.8, 0.05], [-0.35, 0.28], [0.15, -0.2], [0.6, 0.22], [1.0, -0.05], [1.5, 0.27], [1.85, -0.22]].forEach(([x, z], k) => box(marks, 0.03 + 0.01 * (k % 3), 0.006, 0.03 + 0.01 * ((k + 1) % 3), 0x353b40, x, 0.003, z));
  road.add(marks);
  // タイヤ（中の接地面が見えるように透かす）。溝の線で回り方を見せる
  const tire = tagPart(new THREE.Group(), 'tire');
  tire.position.y = r;
  world.add(tire);
  tire.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 48).rotateX(Math.PI / 2), mat(0x1d1f22, { transparent: true, opacity: 0.45, depthWrite: false })));
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, g = box(tire, 0.012, 0.012, 0.21, k ? 0x6a737a : 0xd40000, r * Math.sin(a), r * Math.cos(a), 0);
    g.rotation.z = -a;
  }
  // 接地面の毛: 上（ベルト）を支点に、先が路面をつかんでたわむ
  const bristles = [];
  for (let k = 0; k < PATCH.n; k++) {
    const pivot = new THREE.Group();
    pivot.position.set(PATCH.a - (k + 0.5) * 2 * PATCH.a / PATCH.n, PATCH.h, 0);
    world.add(pivot);
    tagPart(box(pivot, 0.006, PATCH.h, 0.17, 0x7fc8f8, 0, -PATCH.h / 2, 0), 'tread');
    bristles.push(pivot);
  }
  // 摩擦円（路面の上に置いた輪）と、矢印
  const circle = tagPart(new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), mat(0xffd54f, { side: THREE.DoubleSide })), 'frictionCircle');
  circle.position.y = 0.004;
  world.add(circle);
  const fx = arrow3d(world, 0xf0a81c, 'arrow:路面がタイヤを押す力'), fy = arrow3d(world, 0x8fd694, 'arrow:横の力'), sum = arrow3d(world, 0xffffff, 'arrow:合わせた力'), load = arrow3d(world, 0xb39ddb, 'arrow:荷重');
  const tags = { fx: tag3d(world, '', 0, 0, 0, '#f0a81c', 0.04), fy: tag3d(world, '', 0, 0, 0, '#8fd694', 0.04), load: tag3d(world, '', 0.1, r + 0.42, 0, '#b39ddb', 0.04),
    v: tag3d(world, '', -0.12, -0.03, 0.3, '#b9c7cd', 0.025), w: tag3d(world, '', 0, 0.17, 0.12, '#ffffff', 0.025), s: tag3d(world, '', 0, 0.21, 0.12, '#ffd54f', 0.032) };
  return { marks, tire, bristles, circle, fx, fy, sum, load, tags, roll: 0, parts: { tire: [tire], patch: bristles, circle: [circle], fx: [fx], load: [load] } };
}
// o: { s スリップ率、fx 前後の力 (N)、fy 横の力 (N)、limit 摩擦円の半径 μW (N)、load 荷重 (N)、v 見せる車速 (m/s)、circle 摩擦円を出すか }
const FORCE_LEN = 0.05 / 1000;   // 力 1 kN を 5 cm の矢印にする
function updateTire(it, dt, o) {
  const r = CAR.tire, wr = o.v / (1 - Math.min(0.95, o.s));   // タイヤの周速 ω × r
  it.marks.children.forEach(m => { m.position.x -= o.v * dt; if (m.position.x < -2) m.position.x += 4; });   // 端まで流れたら、反対の端へ（画面の外で戻す）
  it.tire.rotation.z -= wr / r * dt;
  // ブラシの毛: 前の端から入ってきた毛は、s × ξ だけたわむ。たわみが摩擦で支えられる限界（放物線）を超えた所は、すべる
  const sSl = PEAK, dMax = PEAK * PATCH.a / 2;   // 接地面が全部すべり始めるスリップ率と、真ん中で支えられる一番大きいたわみ
  it.bristles.forEach((b, k) => {
    const xi = (k + 0.5) * 2 * PATCH.a / PATCH.n, q = xi / (2 * PATCH.a), limit = 4 * dMax * q * (1 - q);
    const slide = o.s * xi > limit, d = Math.min(o.s * xi, limit) * PATCH.show;
    b.rotation.z = -Math.atan2(d, PATCH.h);    // 先が前へ出る向きにたわむ
    b.children[0].material.color.setHex(o.s < 0.003 ? 0x8e979c : slide ? 0xe57373 : 0x7fc8f8);
  });
  const L = FORCE_LEN, o0 = new THREE.Vector3(0, 0.012, 0), fyv = o.fy || 0;   // 矢印は、接地面の真ん中から
  setArrow(it.fx, o0, new THREE.Vector3(Math.sign(o.fx) || 1, 0, 0), Math.abs(o.fx) * L, 0.03);
  setArrow(it.fy, o0, new THREE.Vector3(0, 0, Math.sign(fyv) || 1), Math.abs(fyv) * L, 0.03);
  const total = Math.hypot(o.fx, fyv), over = total > o.limit * 1.001;
  it.sum.visible = it.circle.visible = !!o.circle;
  if (o.circle) {
    setArrow(it.sum, o0, new THREE.Vector3(o.fx, 0, fyv).normalize(), total * L, 0.035);
    it.sum.setColor(over ? 0xe57373 : 0xffffff);
    it.circle.scale.setScalar(Math.max(0.001, o.limit * L));
    it.circle.material.color.setHex(over ? 0xe57373 : 0xffd54f);
  }
  setArrow(it.load, new THREE.Vector3(0, r + 0.38, 0), new THREE.Vector3(0, -1, 0), o.load * L * 0.6, 0.03);
  setLabel(it.tags.load, `荷重 W ${n1(o.load / 1000)} kN`);
  setLabel(it.tags.fx, `前後の力 ${n1(o.fx / 1000)} kN`);
  it.tags.fx.position.set(o.fx * L / 2, 0.05, 0.02);   // 札は矢印の真ん中の上（スマホでも見切れないように）
  setLabel(it.tags.fy, `横の力 ${n1((o.fy || 0) / 1000)} kN`);
  it.tags.fy.visible = !!fyv;
  it.tags.fy.position.set(0, 0.03, fyv * L + Math.sign(fyv) * 0.04);
  setLabel(it.tags.v, '路面の流れ = 車速 v');
  setLabel(it.tags.w, `タイヤの周速 ω × r = 車速の ${n2(wr / Math.max(o.v, 1e-6))} 倍`);
  setLabel(it.tags.s, o.text);
}

// ---------- 車の中の力の流れ（4. クラッチの役割 5. ローンチ制御）。後輪駆動（FR） ----------
function buildFlow(world, ecu) {
  const road = makeRoad(4, 120, -60);
  const car = makeCar(0x9fb8c8);
  world.add(road, car);
  [car.userData.body, car.children[1]].forEach(m => { m.material.transparent = true; m.material.opacity = 0.18; m.material.depthWrite = false; });
  const eng = tagPart(box(car, 0.6, 0.42, 0.5, 0x6a737a, 1.3, 0.62, 0), 'engineLong');
  const clutch = tagPart(rod(car, 0.16, 0.05, 0x7a5c2e, 0.92, 0.55, 0), 'clutchDisc');
  const trans = tagPart(box(car, 0.55, 0.3, 0.32, 0xb0b8bd, 0.55, 0.5, 0), 'transmission');
  const prop = tagPart(rod(car, 0.035, 1.6, 0x8e979c, -0.45, 0.42, 0), 'propShaft');
  const diff = tagPart(box(car, 0.26, 0.24, 0.3, 0x3c454b, -1.3, CAR.tire, 0), 'diff');
  const axle = tagPart(rod(car, 0.03, 1.5, 0x8e979c, 0, 0, 0), 'driveShaft');
  axle.geometry.rotateY(Math.PI / 2);
  axle.position.set(-1.3, CAR.tire, 0);
  const rear = car.userData.wheels.filter(w => w.position.x < 0), front = car.userData.wheels.filter(w => w.position.x > 0);
  const fx = arrow3d(car, 0xf0a81c, 'arrow:路面がタイヤを押す力');
  // 部品の上の札: 伝えているトルクと力
  const tags = { eng: tag3d(car, '', 1.3, 1.25, 0.9, '#ffd54f', 0.17), clutch: tag3d(car, '', 0.85, 1.6, 0.9, '#ffd54f', 0.17), trans: tag3d(car, '', 0.4, 1.95, 0.9, '#ffd54f', 0.17),
    tire: tag3d(car, '', -1.3, 1.25, 1.1, '#ffd54f', 0.17), road: tag3d(car, '', -0.7, -0.25, 1.1, '#f0a81c', 0.17), slip: tag3d(car, '', -1.3, 1.6, 1.1, '#ffffff', 0.2) };
  let ecuBox = null;
  if (ecu) {
    ecuBox = tagPart(box(car, 0.22, 0.08, 0.16, 0x2e7d32, 0.6, 0.85, 0.45), 'launchEcu');
    tags.ecu = tag3d(car, '', 0.6, 2.35, 0.9, '#8fd694', 0.17);
  }
  return { road, car, rear, front, fx, tags, eng, clutch, trans, prop, diff, axle, ecuBox,
    parts: { engine: [eng], clutch: [clutch], trans: [trans], drive: [prop, diff, axle], tire: rear, ecu: ecuBox ? [ecuBox] : [], road: [fx] } };
}
// p: launchSim の1点。slow: 何倍ゆっくり見せるか
function updateFlow(it, dt, p, slow, ecu) {
  const N = total(0), ms = p.v / 3.6 / slow;
  it.road.userData.stripes.position.x = (it.road.userData.stripes.position.x - ms * dt) % 6;
  it.front.forEach(w => { w.rotation.z -= ms / CAR.tire * dt; });
  it.rear.forEach(w => { w.rotation.z -= p.wheel / slow * dt; });
  const tw = p.tc * N * CAR.eff, f = tw / CAR.tire;   // タイヤの軸のトルクと、それが地面を押す力
  const roadF = muAt(p.s, P.mu) * rearLoad(p.a * G);
  heat(it.eng, p.te / 200);
  heat(it.clutch, p.tc / 200);
  [it.trans, it.prop, it.diff, it.axle].forEach(o => heat(o, p.tc / 200));
  setLabel(it.tags.eng, `エンジン ${n0(p.te)} N·m（${n0(p.rpm)} rpm）`);
  setLabel(it.tags.clutch, p.lock ? `クラッチ つながった ${n0(p.tc)} N·m` : `クラッチ 半クラッチ ${n0(p.tc)} N·m`);
  setLabel(it.tags.trans, `1速 × デフで ${n1(N)} 倍`);
  setLabel(it.tags.tire, `タイヤの軸 ${n0(tw)} N·m → ${n1(f / 1000)} kN`);
  setLabel(it.tags.road, `路面が受け持つ力 ${n1(roadF / 1000)} kN`);
  setLabel(it.tags.slip, `スリップ率 ${n0(p.s * 100)}%${p.s > 0.2 ? '（ホイールスピン）' : ''}`);
  it.tags.slip.userData.color = p.s > 0.2 ? '#e57373' : '#ffffff';
  setArrow(it.fx, new THREE.Vector3(-1.3, 0.03, 1.0), new THREE.Vector3(1, 0, 0), roadF / 1000 * 0.18, 0.15);
  if (ecu) {
    heat(it.ecuBox, 0.6);
    setLabel(it.tags.ecu, `ECU: トルクの上限 ${n0(p.lim)} N·m（目標のスリップ率 ${P.aim}%）`);
  }
}

// ---------- 湿式多板クラッチと油圧（6. DCT・AT） ----------
// 穴のあいた円板（軸は x、厚さ th）
function ringPlate(parent, rIn, rOut, th, color, key) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const m = tagPart(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 40 }).translate(0, 0, -th / 2).rotateY(Math.PI / 2), mat(color)), key);
  parent.add(m);
  return m;
}
// 軸は x。左のピストンを油圧で押すと、摩擦板と鋼板が右の受け板に押し付けられて、トルクを伝える
const PACK = { plates: 9, th: 0.004, gap: 0.0015 * 4, back: 0.06 };   // 板の数（鋼板5 + 摩擦板4）、板の厚さ、すきま（4倍に見せる）、受け板の位置
function buildPack(world) {
  const shell = tagPart(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.16, 48, 1, true).rotateZ(Math.PI / 2), mat(0xb0b8bd, { transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })), 'clutchDrum');
  world.add(shell);
  tagPart(rod(world, 0.02, 0.36, 0x8e979c, 0.04, 0, 0), 'inputShaft');   // ハブと軸（変速機側）
  ringPlate(world, 0.035, 0.11, 0.008, 0x6a737a, 'backingPlate').position.x = PACK.back + 0.006;
  const plates = [];
  for (let k = 0; k < PACK.plates; k++) {
    const steel = k % 2 === 0;
    // 鋼板は外側でドラム（エンジン側）に、摩擦板は内側でハブ（変速機側）にかみ合う
    plates.push(steel ? ringPlate(world, 0.05, 0.11, PACK.th, 0xc7ced2, 'steelPlate') : ringPlate(world, 0.035, 0.095, PACK.th, 0x7a5c2e, 'frictionPlate'));
  }
  const piston = ringPlate(world, 0.022, 0.11, 0.012, 0x3b8fd6, 'clutchPiston');
  const oil = ringPlate(world, 0.022, 0.105, 1, 0x1e88e5, 'oilChamber');
  oil.material.transparent = true; oil.material.opacity = 0.6;
  // リターンスプリング（ピストンを戻すばね）
  const springs = [0, 1, 2, 3].map(k => tagPart(rod(world, 0.006, 1, 0xd40000, 0, 0.028 * Math.cos(k * Math.PI / 2), 0.028 * Math.sin(k * Math.PI / 2)), 'returnSpring'));
  ringPlate(world, 0.021, 0.035, 0.004, 0xd40000, 'returnSpring').position.x = PACK.back;   // ばねの受け
  // 油圧の道: ECU（TCU）→ ソレノイド弁 → 油の通り道 → ピストンの裏
  tagPart(box(world, 0.06, 0.03, 0.05, 0x2e7d32, -0.17, 0.22, 0), 'tcu');
  tagPart(box(world, 0.04, 0.06, 0.04, 0x455a64, -0.17, 0.14, 0), 'solenoidValve');
  const line = tagPart(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-0.17, 0.11, 0], [-0.17, 0.0, 0.0], [-0.1, 0, 0]].map(p => new THREE.Vector3(...p))), 20, 0.006, 8), mat(0x1e88e5)), 'oilLine');
  world.add(line);
  const tags = { tcu: tag3d(world, 'ECU（TCU）', -0.17, 0.27, 0, '#8fd694', 0.022), valve: tag3d(world, 'ソレノイド弁', -0.26, 0.14, 0, '#b9c7cd', 0.02),
    p: tag3d(world, '', -0.05, -0.16, 0, '#7fc8f8', 0.025), t: tag3d(world, '', 0.05, 0.17, 0, '#ffd54f', 0.025) };
  return { plates, piston, oil, springs, line, tags, parts: { piston: [piston, oil], plates, springs, valve: [line] } };
}
// p: 油圧 (MPa)、kiss: ピストンが板に触れる油圧 (MPa)、t: 伝えるトルク (N·m)
function updatePack(it, p, kiss, t) {
  const close = Math.min(1, p / kiss), gap = PACK.gap * (1 - close);   // 油圧がキスポイントに届くまでは、すきまが減るだけ
  let x = PACK.back;
  for (let k = PACK.plates - 1; k >= 0; k--) {    // 右の受け板から左へ並べる
    x -= PACK.th / 2;
    it.plates[k].position.x = x;
    x -= PACK.th / 2 + gap;
  }
  const px = x - 0.006;
  it.piston.position.x = px;
  const left = -0.07, len = px - 0.006 - left;   // 油の部屋は、ピストンの裏からドラムの左の壁まで
  it.oil.position.x = left + len / 2;
  it.oil.scale.set(Math.max(0.001, len), 1, 1);
  it.springs.forEach(s => { s.position.x = (px + 0.006 + PACK.back) / 2; s.scale.set(PACK.back - px - 0.006, 1, 1); });
  heat(it.line, Math.min(1, p / 1.5));
  it.plates.forEach(m => heat(m, close >= 1 ? Math.min(1, t / 250) : 0));
  setLabel(it.tags.p, `クラッチ圧 ${n2(p)} MPa${p < kiss ? '（すきまを詰めている）' : ''}`);
  setLabel(it.tags.t, `伝えるトルク ${n0(t)} N·m`);
}
