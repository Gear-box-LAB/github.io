// study3d.js: 駆動力線図・エンジンのページの「3D」表示（図と切り替えて見る）
// 各項目に scene があれば、3D に切り替えられる
//   'car'    車と力の矢印。矢印は lesson.arrows() → [[名前, 力 N（+ は前向き）, 色, 場所]]。坂は P.grade、車速は P.speed
//   'engine' 4気筒のクランクとピストン。lesson.engine3d() → { rpm, torque, text }
//   'race'   加速くらべの4台（engine.js の racers）

const SLOW = 10;   // 動きは 1/10 の速さで見せる（エンジンは 1/50）
const view = { want: 'chart', mode: 'chart', three: null, world: null, scene: null, items: [] };   // want: 選んだ表示、mode: 今の表示

// ---------- 準備（3D を初めて開いたときに1回） ----------
function init3d() {
  const canvas = el('scene3d');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 3000);
  const controls = new THREE.OrbitControls(camera, canvas);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(5, 10, 7);
  scene.add(sun);
  view.three = { renderer, scene, camera, controls };
  new ResizeObserver(() => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    camera.updateProjectionMatrix();
  }).observe(canvas);
}

// ---------- 形をつくる道具 ----------
const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, metalness: 0.3, roughness: 0.55 }, extra));

function box(group, w, h, d, color, x, y, z, extra) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}
// 軸が x 向きの円柱
function rod(group, r, length, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, 32).rotateZ(Math.PI / 2), mat(color));
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}
// 文字の札（canvas に書いて、いつもカメラの方を向く）
function label(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 64;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.userData = { canvas, color: color || '#ffffff', text: '' };
  setLabel(sprite, text);
  return sprite;
}
function setLabel(sprite, text) {
  if (sprite.userData.text === text) return;
  sprite.userData.text = text;
  const g = sprite.userData.canvas.getContext('2d');
  g.clearRect(0, 0, 512, 64);
  g.font = 'bold 34px sans-serif';
  const w = g.measureText(text).width + 24;
  g.fillStyle = 'rgba(20, 35, 43, 0.75)';
  g.fillRect(256 - w / 2, 4, w, 56);
  g.fillStyle = sprite.userData.color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 33);
  sprite.material.map.needsUpdate = true;
}

// 車（前は +x）。タイヤは回る
function makeCar(color) {
  const car = new THREE.Group();
  box(car, 4.2, 0.6, 1.7, color, 0, 0.62, 0);
  box(car, 2.2, 0.5, 1.5, 0x22313a, -0.2, 1.17, 0);
  car.userData.wheels = [];
  [-1.3, 1.3].forEach(x => [-0.8, 0.8].forEach(z => {
    const wheel = new THREE.Group();
    wheel.position.set(x, CAR.tire, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(CAR.tire, CAR.tire, 0.22, 32).rotateX(Math.PI / 2), mat(0x1d1f22));
    wheel.add(tire);
    box(wheel, 0.08, 0.12, 0.24, 0xd40000, 0, CAR.tire - 0.06, 0);   // 赤い印で回り方が見える
    car.add(wheel);
    car.userData.wheels.push(wheel);
  }));
  return car;
}
// 道路（しま模様は stripes で、流して走っているように見せる）
function makeRoad(width, length, from) {
  const road = new THREE.Group();
  box(road, length, 0.02, width, 0x4a5258, from + length / 2, -0.01, 0);
  road.userData.stripes = new THREE.Group();
  for (let x = from; x < from + length; x += 6) box(road.userData.stripes, 3, 0.03, 0.15, 0xdfe6e9, x, 0, 0);
  road.add(road.userData.stripes);
  return road;
}

// ---------- 項目ごとに組み立てる ----------
function build3d() {
  const l = lesson();
  const { scene, camera, controls } = view.three;
  if (view.world) scene.remove(view.world);
  view.world = new THREE.Group();
  view.scene = l.scene;
  view.items = [];
  scene.add(view.world);
  if (l.scene === 'car') buildCar(); else if (l.scene === 'engine') buildEngine(); else buildRace();
  const cam = { car: [[2.5, 4.5, 11], [0.5, 1, 0]], engine: [[0.75, 0.55, 0.95], [0.08, 0.12, 0]], race: [[-12, 6, 17], [-2, 0, 0]] }[l.scene];
  camera.position.set(...cam[0]);
  controls.target.set(...cam[1]);
  controls.update();
  el('hint3d').textContent = {
    car: `車の重さを変えると、車の大きさも変わります。ドラッグで向きを変えられます。動きは 1/${SLOW} の速さです。矢印の長さは、小さな力も見えるように、力の平方根に比例させています。`,
    engine: 'ドラッグで向きを変えられます。回転は 1/50 の速さです。橙の矢印の長さがトルクの大きさです。',
    race: '札は変速する回転数（rpm）です。カメラは先頭の車について行きます。白い線は 100 m ごとです。ドラッグで向きを変えられます。'
  }[l.scene];
}

// 車と力の矢印（坂は、道路と車をまとめて傾ける）
// 矢印を置く場所 [x, y, z, 札の高さ]: 後輪の接地点、前輪の接地点、車の前の端、屋根の上、さらに上
const SPOTS = { rear: [-1.3, 0.05, 1.3, 0.45], front: [1.3, 0.05, 1.0, -0.35], nose: [2.1, 0.62, 0, 0.4], roof: [0, 1.6, 0, 0.35], top: [0, 2.4, 0, 0.35] };
function buildCar() {
  const tilt = new THREE.Group();
  view.world.add(tilt);
  const road = makeRoad(5, 120, -60);
  const car = makeCar(0x9fb8c8);
  tilt.add(road, car);
  const arrows = lesson().arrows().map(([name, , color, spot]) => {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color, 0.3, 0.22);
    const tag = label(name, '#' + new THREE.Color(color).getHexString());
    tag.scale.set(2.4, 0.3, 1);
    tilt.add(arrow, tag);
    return { arrow, tag, spot };
  });
  view.items = { tilt, road, car, arrows };
}
function updateCar(dt) {
  const { tilt, road, car, arrows } = view.items;
  tilt.rotation.z = Math.atan((P.grade || 0) / 100);
  const s = Math.sqrt((P.mass || CAR.mass) / CAR.mass);   // 重い車ほど大きく見せる（1,000 kg で 1 倍）
  car.scale.setScalar(s);
  const ms = P.speed / 3.6 / SLOW;
  road.userData.stripes.position.x = (road.userData.stripes.position.x - ms * dt) % 6;
  car.userData.wheels.forEach(w => { w.rotation.z -= ms / CAR.tire * dt; });
  lesson().arrows().forEach(([name, force, , spot], k) => {
    const a = arrows[k], len = force ? 0.5 * Math.sqrt(Math.abs(force) / 100) : 0;
    const [x, y, z, dy] = SPOTS[spot].map(v => v * s);
    const dir = Math.sign(force) || 1;
    a.arrow.visible = len > 0;
    a.arrow.setDirection(new THREE.Vector3(dir, 0, 0));
    a.arrow.setLength(Math.max(len, 0.31), 0.3, 0.22);
    a.arrow.position.set(dir > 0 ? x : x - dir * len, y, z);   // 後ろ向きの力は、矢の先がその場所に来るように置く
    setLabel(a.tag, force ? `${name} ${n0(Math.abs(force))} N` : `${name}: なし`);
    a.tag.position.set(x + len / 2, y + dy, z);
  });
}

// 4気筒エンジン（クランク軸は x 向き）。ピストンはクランクの回転で上下する
const CRANK_R = 0.045, ROD_L = 0.14, BORE = 0.09;
function buildEngine() {
  const g = view.world;
  const crank = new THREE.Group();
  g.add(crank);
  rod(crank, 0.018, 0.42, 0x8e979c, 0.02, 0, 0);
  const phase = [0, Math.PI, Math.PI, 0];
  const pins = phase.map((p, k) => {
    const x = (k - 1.5) * BORE;
    rod(crank, 0.016, 0.03, 0xc9a24a, x, CRANK_R * Math.cos(p), CRANK_R * Math.sin(p));
    box(crank, 0.012, CRANK_R * 2 + 0.03, 0.05, 0x6a737a, x - 0.022, 0, 0).rotation.x = p;
    return { x, p };
  });
  const fly = new THREE.Group();
  fly.position.x = 0.25;
  rod(fly, 0.14, 0.025, 0x8e979c, 0, 0, 0);
  box(fly, 0.03, 0.03, 0.03, 0xd40000, 0, 0.12, 0);
  crank.add(fly);
  const pistons = pins.map(pin => ({
    pin,
    piston: (() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 32), mat(0xd7dde0)); g.add(m); return m; })(),
    link: box(g, 0.014, ROD_L, 0.014, 0xb0b8bd, pin.x, 0, 0)
  }));
  box(g, BORE * 4 + 0.02, 0.16, 0.11, 0x9fb8c8, 0, ROD_L + 0.03, 0, { transparent: true, opacity: 0.18, depthWrite: false });
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.27, 0.15, 0), 0.1, 0xf0a81c, 0.04, 0.035);
  const tag = label('');
  tag.scale.set(0.4, 0.05, 1);
  tag.position.set(0.05, 0.32, 0);
  g.add(arrow, tag);
  view.items = { crank, pistons, arrow, tag, angle: 0 };
}
function updateEngine(dt) {
  const it = view.items, e = lesson().engine3d();
  it.angle += e.rpm * RPM / 50 * dt;
  it.crank.rotation.x = it.angle;
  it.pistons.forEach(({ pin, piston, link }) => {
    const a = it.angle + pin.p;
    const py = CRANK_R * Math.cos(a), pz = CRANK_R * Math.sin(a);
    const top = py + Math.sqrt(ROD_L ** 2 - pz ** 2);
    piston.position.set(pin.x, top + 0.02, 0);
    link.position.set(pin.x, (py + top) / 2, pz / 2);
    link.rotation.x = Math.atan2(pz, top - py);
  });
  it.arrow.setLength(Math.max(0.05, e.torque / 200 * 0.3), 0.04, 0.035);
  setLabel(it.tag, e.text);
}

// 加速くらべ: 4本の車線に4台。x は走った距離 (m)
function buildRace() {
  const road = makeRoad(17, GOAL + 120, -20);
  view.world.add(road);
  for (let x = 0; x <= GOAL; x += 100) {
    box(view.world, 0.4, 0.04, 17, 0xffffff, x, 0, 0);
    const tag = label(x === GOAL ? `ゴール ${x} m` : `${x} m`);
    tag.scale.set(8, 1, 1);
    tag.position.set(x, 0.8, -10);
    view.world.add(tag);
  }
  const cars = racers.map((r, k) => {
    const car = makeCar(new THREE.Color(r.color).getHex());
    car.position.z = (k - (racers.length - 1) / 2) * 3.2;
    const tag = label(r.short, r.color);
    tag.scale.set(4, 0.5, 1);
    view.world.add(car, tag);
    return { car, tag };
  });
  road.userData.stripes.visible = false;
  for (let k = 0; k < 17; k++) box(view.world, 1, 0.05, 1, k % 2 ? 0x111111 : 0xffffff, GOAL + 0.5, 0, k - 8);   // ゴールの白黒の線
  view.items = { cars, lead: 0, shown: -1 };
}
function updateRace() {
  const it = view.items, { camera, controls } = view.three;
  let lead = 0;
  it.cars.forEach(({ car, tag }, k) => {
    const r = racers[k];
    car.position.x = r.x - 2.1;   // 車の前の端が、走った距離
    car.userData.wheels.forEach(w => { w.rotation.z = -r.x / CAR.tire; });
    tag.position.set(car.position.x, 1.9, car.position.z);
    lead = Math.max(lead, Math.min(r.x, GOAL));
  });
  showResults();
  const move = lead - it.lead;   // 先頭の車について行く
  it.lead = lead;
  camera.position.x += move;
  controls.target.x += move;
  controls.update();
}

// 400 m の結果の表（右上）。1位がゴールしてから、着いた順に行を足す
function showResults() {
  const it = view.items, done = racers.filter(r => r.tGoal !== null).sort((a, b) => a.tGoal - b.tGoal || (b.best ? 1 : 0) - (a.best ? 1 : 0));   // 同じタイムなら最適な点を上に
  if (done.length === 0) view.closed = false;   // 新しいレースが始まったら、閉じた表をまた出せるようにする
  el('results').hidden = view.closed || done.length === 0;
  el('hint3d').hidden = !el('results').hidden;   // 表を出す間は、左上の説明を隠す（スマホで重ならないように）
  if (done.length === it.shown) return;
  it.shown = done.length;
  el('resultsBody').innerHTML = done.map((r, k) => `<tr><td>${k + 1}位</td><td><span class="swatch" style="background:${r.color}"></span>${r.short}</td>`
    + `<td>${n3(r.tGoal)} 秒</td><td>${k ? (r.tGoal - done[k - 1].tGoal < 0.0005 ? '同着' : `+${n3(r.tGoal - done[k - 1].tGoal)} 秒`) : '−'}</td></tr>`).join('');
}

// ---------- 図と3Dの切り替え ----------
function setView(want) {
  const l = lesson();
  view.want = want;
  view.mode = l.scene ? want : 'chart';
  el('chart').hidden = view.mode !== 'chart';
  el('scene3d').hidden = el('hint3d').hidden = view.mode !== '3d';
  if (el('results')) el('results').hidden = true;   // 結果の表は、加速くらべの 3D のときだけ出す
  el('show3d').disabled = !l.scene;
  el('show3d').title = l.scene ? '' : 'ここは図だけです';
  el('showChart').classList.toggle('current', view.mode === 'chart');
  el('show3d').classList.toggle('current', view.mode === '3d');
  if (view.mode === '3d') { if (!view.three) init3d(); build3d(); }
}

// 毎フレーム（study.js のループから呼ぶ）
function frame3d(dt) {
  if (view.mode !== '3d') return;
  if (view.scene === 'car') updateCar(dt); else if (view.scene === 'engine') updateEngine(dt); else updateRace();
  view.three.renderer.render(view.three.scene, view.three.camera);
}
