// vdyn3d.js: テーマ「車両運動性能」の 3D（study3d.js の makeCar / makeRoad / box / rod / mat / label と、partinfo.js の tagPart を使う）

// ---------- 前後にゆれる車と、乗っている人 ----------
// 車体（ばね上）を、加速度に合わせて前後に傾け、人の頭を前後にゆらす（見やすいように大きくしている）
function buildPitchCar(world) {
  const road = makeRoad(5, 120, -60);
  const car = makeCar(0x9fb8c8);
  const sprung = new THREE.Group();   // 車体（タイヤより上のばねに乗っている部分）
  car.add(sprung);
  [car.userData.body, car.children[1]].forEach(m => { car.remove(m); sprung.add(m); m.material.transparent = true; m.material.opacity = 0.35; m.material.depthWrite = false; });
  // 運転する人: 胴と頭（頭は首のまわりに前後にゆれる）
  const seat = new THREE.Group();
  seat.position.set(-0.1, 0.75, 0.35);
  sprung.add(seat);
  tagPart(box(seat, 0.22, 0.45, 0.3, 0x3b5f8a, 0, 0.22, 0), 'driver');
  const neck = new THREE.Group();
  neck.position.y = 0.47;
  seat.add(neck);
  const head = tagPart(new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), mat(0xe0b896)), 'driver');
  head.position.y = 0.12;
  neck.add(head);
  world.add(road, car);
  const tag = label('');
  sizeLabel(tag, 0.3);
  tag.position.set(0, 2.3, 0);
  world.add(tag);
  return { road, car, sprung, neck, tag, parts: { driver: [seat], body: [sprung] } };
}
// a: 前後の加速度 (G)、kmh: 車速、text: 札
function updatePitchCar(it, dt, a, kmh, text) {
  const ms = kmh / 3.6 / SLOW;
  it.road.userData.stripes.position.x = (it.road.userData.stripes.position.x - ms * dt) % 6;
  it.car.userData.wheels.forEach(w => { w.rotation.z -= ms / CAR.tire * dt; });
  it.sprung.rotation.z = a * 0.08;          // 加速すると後ろが沈む（スクワット）、減速で前が沈む（ダイブ）。大きく見せている
  it.neck.rotation.z = a * 0.9;             // 頭は、加速で後ろへ、減速で前へ（大きく見せている）
  setLabel(it.tag, text);
}

// ---------- 上下の乗り心地: 4分の1の車（車体、ばね、ショックアブソーバー、タイヤ） ----------
function spring3d(parent, key) {   // ばね（つる巻き）: 高さ 1 でつくり、scale.y で長さを変える
  const pts = [];
  for (let k = 0; k <= 120; k++) { const a = k / 120 * Math.PI * 2 * 7; pts.push(new THREE.Vector3(0.09 * Math.cos(a), k / 120, 0.09 * Math.sin(a))); }
  const m = tagPart(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.012, 6), mat(0xd40000)), key);
  parent.add(m);
  return m;
}
function buildQuarter(world) {
  const road = tagPart(new THREE.Group(), 'road');
  world.add(road);
  box(road, 12, 0.04, 1.2, 0x4a5258, 0, -0.02, 0);
  // 段差（でっぱり）: 高さ 3 cm、長さ 1 m の山（上下の動きと同じく、高さを 3 倍に見せる）
  const bump = tagPart(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 32, 1, false, 0, Math.PI).rotateX(Math.PI / 2), mat(0x6a737a)), 'bump');
  bump.scale.y = 0.09 / 0.5;
  road.add(bump);
  const wheel = new THREE.Group();
  world.add(wheel);
  const tire = tagPart(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 32).rotateX(Math.PI / 2), mat(0x1d1f22)), 'tire');
  wheel.add(tire);
  box(tire, 0.06, 0.1, 0.24, 0xd40000, 0, 0.24, 0);
  tagPart(box(wheel, 0.5, 0.05, 0.08, 0x6a737a, 0, 0, -0.18), 'unsprung');   // ばね下（タイヤ、ホイール、ブレーキ、アーム）
  const body = tagPart(box(world, 1.1, 0.35, 0.8, 0x9fb8c8, 0, 0, -0.1), 'sprungMass');
  const sp = spring3d(world, 'coilSpring');
  sp.position.set(-0.18, 0, -0.18);
  const damperLow = tagPart(rod(world, 0.035, 1, 0x3c454b, 0, 0, 0), 'shockAbsorber');
  damperLow.geometry.rotateZ(Math.PI / 2);
  damperLow.position.set(0.18, 0, -0.18);
  const damperHigh = tagPart(rod(world, 0.02, 1, 0xb0b8bd, 0, 0, 0), 'shockAbsorber');
  damperHigh.geometry.rotateZ(Math.PI / 2);
  damperHigh.position.set(0.18, 0, -0.18);
  [['車体（ばね上）', 0, 1.35], ['ばね', -0.5, 0.75], ['ショックアブソーバー', 0.62, 0.75], ['タイヤ（ばね下）', 0, -0.05]].forEach(([s, x, y]) => {
    const t = label(s, '#ffd54f');
    sizeLabel(t, 0.08);
    t.position.set(x, y, 0.4);
    world.add(t);
  });
  return { road, bump, wheel, tire, body, sp, damperLow, damperHigh, roll: 0, parts: { body: [body], spring: [sp], damper: [damperLow, damperHigh], tire: [wheel] } };
}
// zs: 車体の上下の動き、zu: タイヤの上下の動き (m)、xb: 段差の位置 (m、タイヤの真下が 0)、kmh: 車速。上下の動きは 3 倍に大きく見せる
function updateQuarter(it, dt, zs, zu, xb, kmh) {
  const S = 3, base = { wheel: 0.3, body: 1.0 };
  it.bump.position.x = xb;
  it.bump.visible = Math.abs(xb) < 6;
  const yw = base.wheel + zu * S, yb = base.body + zs * S;
  it.wheel.position.y = yw;
  it.roll += kmh / 3.6 / SLOW / 0.3 * dt;
  it.tire.rotation.z = -it.roll;
  it.body.position.y = yb;
  // ばねとショックアブソーバーは、タイヤの軸から車体の下までつなぐ
  const bottom = yw + 0.03, top = yb - 0.175;
  it.sp.position.y = bottom;
  it.sp.scale.y = top - bottom;
  it.damperLow.position.y = bottom + (top - bottom) * 0.3;
  it.damperLow.scale.set(1, (top - bottom) * 0.6, 1);
  it.damperHigh.position.y = top - (top - bottom) * 0.25;
  it.damperHigh.scale.set(1, (top - bottom) * 0.5, 1);
}
