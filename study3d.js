// study3d.js: 駆動力線図・エンジンのページの「3D」表示（図と切り替えて見る）
// 各項目に scene があれば、3D に切り替えられる
//   'car'    車と力の矢印。矢印は lesson.arrows() → [[名前, 力 N（+ は前向き）, 色, 場所]]。坂は P.grade、車速は P.speed
//   'engine' 4気筒のクランクとピストン。lesson.engine3d() → { rpm, torque, text }
//   'race'   加速くらべの4台（engine.js の racers）

const SLOW = 10;   // 動きは 1/10 の速さで見せる（エンジンは 1/50）
const view = { labelScale: 1, want: 'chart', mode: 'chart', three: null, world: null, scene: null, items: [], markSpec: null, mark: null };   // markSpec: 数式の考え方の印（explain.js）   // want: 選んだ表示、mode: 今の表示

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
  enablePartInfo(canvas, () => camera, () => view.world);   // 部品をタッチすると名前と説明（partinfo.js）
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
  sprite.userData = { canvas, color: color || '#ffffff', text: null, h: 1 };
  setLabel(sprite, text);
  return sprite;
}
// 札の高さ h（3Dの長さ）を決める。横の長さは、文字の長さに合わせて setLabel が決める
function sizeLabel(sprite, h) {
  sprite.userData.h = h;
  const s = h * view.labelScale;   // スマホでカメラを引いたときは、札を少し大きくして読みやすくする
  sprite.scale.set(s * sprite.userData.canvas.width / 64, s, 1);
}
function setLabel(sprite, text) {
  if (sprite.userData.text === text) return;
  sprite.userData.text = text;
  let canvas = sprite.userData.canvas, g = canvas.getContext('2d');
  g.font = 'bold 34px sans-serif';
  const w = g.measureText(text).width + 24;
  // 文字が入りきらないときは、canvas を広げる（512 → 1024 → 2048）。文字が見切れないように
  const width = [512, 1024, 2048].find(x => x >= w + 8) || 2048;
  if (width !== canvas.width) {
    canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = 64;
    sprite.userData.canvas = canvas;
    sprite.material.map.dispose();
    sprite.material.map = new THREE.CanvasTexture(canvas);
    g = canvas.getContext('2d');
    g.font = 'bold 34px sans-serif';
  }
  g.clearRect(0, 0, width, 64);
  g.fillStyle = 'rgba(20, 35, 43, 0.75)';
  g.fillRect(width / 2 - w / 2, 4, w, 56);
  g.fillStyle = sprite.userData.color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, width / 2, 33);
  sprite.material.map.needsUpdate = true;
  sizeLabel(sprite, sprite.userData.h);
}

// 車（前は +x）。タイヤは回る
function makeCar(color) {
  const car = new THREE.Group();
  car.userData.body = tagPart(box(car, 4.2, 0.6, 1.7, color, 0, 0.62, 0), 'body');
  tagPart(box(car, 2.2, 0.5, 1.5, 0x22313a, -0.2, 1.17, 0), 'cabin');
  car.userData.wheels = [];
  [-1.3, 1.3].forEach(x => [-0.8, 0.8].forEach(z => {
    const wheel = tagPart(new THREE.Group(), 'tire');
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
  const road = tagPart(new THREE.Group(), 'road');
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
  const cam = { car: [[2.5, 4.5, 11], [0.5, 1, 0]], engine: l.circuit ? [[0.45, 0.55, 1.55], [0.03, 0.02, 0.12]] : [[0.75, 0.5, 1.0], [0.1, 0.06, 0]], race: [[-12, 6, 17], [-2, 0, 0]], carEngine: [[2.8, 3.6, 8.5], [0.6, 0.9, 0]] }[l.scene];
  camera.position.set(...cam[0]);
  controls.target.set(...cam[1]);
  // 縦長の画面（スマホ）では、札が左右で見切れないように、カメラを少し引く
  const aspect = el('scene3d').clientWidth / Math.max(1, el('scene3d').clientHeight);
  const pull = aspect < 1.2 ? Math.min(1.9, 1.2 / aspect) : 1;
  camera.position.sub(controls.target).multiplyScalar(pull).add(controls.target);
  view.labelScale = Math.sqrt(pull);
  ({ car: buildCar, engine: buildEngine, race: buildRace, carEngine: buildCarEngine })[l.scene]();
  controls.update();
  el('hint3d').textContent = {
    car: `部品をタッチすると、名前と説明が出ます。車の重さを変えると、車の大きさも変わります。ドラッグで向きを変えられます。動きは 1/${SLOW} の速さです。矢印の長さは、小さな力も見えるように、力の平方根に比例させています。`,
    engine: `部品をタッチすると、名前と説明が出ます。ドラッグで向きを変えられます。回転は 1/${l.slow3d || 50} の速さです。橙の矢印の長さがトルクの大きさです。ピストンの上が橙色に光るのが、燃焼（点火順序 1-3-4-2）です。`,
    carEngine: `部品をタッチすると、名前と説明が出ます。車体を透かして、エンジンを3倍の大きさで見せています。エンジンの回転は 1/50、タイヤと道路は 1/${SLOW} の速さです。ドラッグで向きを変えられます。`,
    race: '部品をタッチすると、名前と説明が出ます。札は変速する回転数（rpm）です。カメラは先頭の車について行きます。白い線は 100 m ごと、札は 500 m ごとです。ドラッグで向きを変えられます。'
  }[l.scene];
  showPart(null);   // 前の部品の説明を閉じる
  buildMark();
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
    const arrow = tagPart(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color, 0.3, 0.22), 'arrow:' + name.split('（')[0]);
    const tag = label(name, '#' + new THREE.Color(color).getHexString());
    sizeLabel(tag, 0.3);
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
const STARTER_RATIO = 12;   // スターターのピニオン1回転に対して、リングギヤ（クランク）は 1/12 回転
// エンジンの形をつくる。starter: true なら、フライホイールのリングギヤとスターターモーターも付ける
function makeEngine(parent, starter) {
  const g = new THREE.Group();
  parent.add(g);
  const crank = new THREE.Group();
  g.add(crank);
  tagPart(rod(crank, 0.018, 0.42, 0x8e979c, 0.02, 0, 0), 'crank');
  const phase = [0, Math.PI, Math.PI, 0];
  const pins = phase.map((p, k) => {
    const x = (k - 1.5) * BORE;
    tagPart(rod(crank, 0.016, 0.03, 0xc9a24a, x, CRANK_R * Math.cos(p), CRANK_R * Math.sin(p)), 'crankPin');
    tagPart(box(crank, 0.012, CRANK_R * 2 + 0.03, 0.05, 0x6a737a, x - 0.022, 0, 0), 'crankArm').rotation.x = p;
    return { x, p };
  });
  const fly = new THREE.Group();
  fly.position.x = 0.25;
  tagPart(fly, 'flywheel');
  rod(fly, 0.14, 0.025, 0x8e979c, 0, 0, 0);
  box(fly, 0.03, 0.03, 0.03, 0xd40000, 0, 0.12, 0);
  crank.add(fly);
  const pistons = pins.map(pin => ({
    pin,
    piston: (() => { const m = tagPart(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 32), mat(0xd7dde0)), 'piston'); g.add(m); return m; })(),
    link: tagPart(box(g, 0.014, ROD_L, 0.014, 0xb0b8bd, pin.x, 0, 0), 'conrod')
  }));
  tagPart(box(g, BORE * 4 + 0.02, 0.16, 0.11, 0x9fb8c8, 0, ROD_L + 0.03, 0, { transparent: true, opacity: 0.18, depthWrite: false }), 'block');
  // 燃焼の光: ピストンの上の燃焼室。燃えている間だけ、橙色にうすく光る
  pistons.forEach(pt => {
    pt.flame = tagPart(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false })), 'combustion');
    pt.flame.visible = false;
    g.add(pt.flame);
  });
  const eng = { g, crank, fly, pistons, angle: 0 };
  if (starter) {
    // リングギヤ: フライホイールの外周の歯
    const ring = tagPart(new THREE.Group(), 'ringGear');
    fly.add(ring);
    for (let k = 0; k < 72; k++) {
      const a = k / 72 * Math.PI * 2;
      box(ring, 0.022, 0.012, 0.008, 0x6a737a, 0, 0.146 * Math.cos(a), 0.146 * Math.sin(a)).rotation.x = -a;
    }
    // スターターモーター（本体、上にマグネットスイッチ）と、出入りするピニオン
    const motor = new THREE.Group();
    motor.position.set(0, -0.172, 0);
    g.add(motor);
    tagPart(rod(motor, 0.04, 0.16, 0x3c454b, 0.37, 0, 0), 'starterMotor');
    tagPart(rod(motor, 0.022, 0.12, 0xb0b8bd, 0.37, 0.055, 0), 'solenoid');
    const shaft = tagPart(rod(motor, 0.007, 0.1, 0x8e979c, 0.29, 0, 0), 'pinion');
    const pinion = tagPart(new THREE.Group(), 'pinion');
    motor.add(pinion);
    rod(pinion, 0.02, 0.022, 0xc9a24a, 0, 0, 0);
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2;
      box(pinion, 0.022, 0.01, 0.007, 0xc9a24a, 0, 0.024 * Math.cos(a), 0.024 * Math.sin(a)).rotation.x = -a;
    }
    Object.assign(eng, { motor, pinion, shaft, pinionX: 0.31 });
  }
  return eng;
}
// エンジンを rpm で回す（slow 分の1の速さで見せる）。starter: スターターがかみ合っているか
// 燃焼の順番（点火順序 1 → 3 → 4 → 2）: 各シリンダーが燃えるクランクの角度（2回転 = 4π で1回ずつ）
const FIRE_AT = [0, 3 * Math.PI, Math.PI, 2 * Math.PI];
const HEAD_Y = ROD_L + CRANK_R + 0.075;   // 燃焼室の天井（シリンダーヘッドの下の面）の高さ
// fuel: 燃料を燃やしているか（false なら光らない）、load: アクセルの踏み具合 0〜1（光の強さ）
function spinEngine(eng, rpm, slow, dt, starter, fuel, load) {
  eng.angle += rpm * RPM / slow * dt;
  eng.crank.rotation.x = eng.angle;
  eng.pistons.forEach(({ pin, piston, link, flame }, k) => {
    // ピストンが一番上に来た所で燃え始め、押し下げる間（約 80°）だけ光る
    const phase = (((eng.angle - FIRE_AT[k]) % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI);
    const glow = fuel && phase < 1.4 ? (1 - phase / 1.4) * (0.55 + 0.4 * (load === undefined ? 0.6 : load)) : 0;
    flame.visible = glow > 0.02;
    flame.material.opacity = glow;
    const a = eng.angle + pin.p;
    const py = CRANK_R * Math.cos(a), pz = CRANK_R * Math.sin(a);
    const top = py + Math.sqrt(ROD_L ** 2 - pz ** 2);
    piston.position.set(pin.x, top + 0.02, 0);
    const h = Math.max(0.005, HEAD_Y - (top + 0.045));   // ピストンの上の面から、燃焼室の天井まで
    flame.scale.y = h;
    flame.position.set(pin.x, top + 0.045 + h / 2, 0);
    link.position.set(pin.x, (py + top) / 2, pz / 2);
    link.rotation.x = Math.atan2(pz, top - py);
  });
  if (eng.pinion) {
    // マグネットスイッチがピニオンを押し出して、リングギヤにかみ合わせる。かみ合っている間は、クランクの 12 倍で逆に回る
    eng.pinionX += ((starter ? 0.25 : 0.31) - eng.pinionX) * Math.min(1, dt * 12);
    eng.pinion.position.x = eng.pinionX;
    if (starter) eng.pinion.rotation.x = -eng.angle * STARTER_RATIO;
  }
}

// 配線: 点を通る細い管。glow で光らせる（電気が流れているとき）
function wire(parent, points, color, r, key) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const m = tagPart(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, r, 6), mat(color, { emissive: 0x000000 })), key);
  parent.add(m);
  return m;
}
// 始動の電気の流れ: キー → スターターリレー → マグネットスイッチ、バッテリー → スターター、ECU → インジェクターと点火コイル
function makeCircuit(parent) {
  const g = new THREE.Group();
  parent.add(g);
  const key = tagPart(new THREE.Group(), 'key');   // キーシリンダーとキー（回る）
  key.position.set(-0.45, 0.12, 0.25);
  key.scale.setScalar(1.8);   // 見やすいように大きめ
  g.add(key);
  tagPart(rod(g, 0.055, 0.03, 0x3c454b, -0.45, 0.12, 0.23).rotateY(Math.PI / 2), 'key');
  box(key, 0.012, 0.045, 0.006, 0xc9a24a, 0, 0, 0.03);       // キーの差し込む所
  box(key, 0.04, 0.03, 0.006, 0xb0b8bd, 0, 0.035, 0.03);     // キーの持つ所
  const textMark = [['OFF', 0], ['ON', -0.9], ['ST', -1.4]];
  textMark.forEach(([s, a]) => { const tg = label(s, '#dfe6e9'); sizeLabel(tg, 0.028); tg.position.set(-0.45 + 0.085 * Math.sin(-a), 0.12 + 0.085 * Math.cos(a), 0.26); g.add(tg); });
  tagPart(box(g, 0.14, 0.1, 0.09, 0x2b2f33, 0.52, -0.06, 0.25), 'battery');
  tagPart(rod(g, 0.01, 0.02, 0xd40000, 0.48, -0.0, 0.25).rotateZ(Math.PI / 2), 'battery');   // + 端子
  tagPart(box(g, 0.035, 0.035, 0.035, 0x55656e, -0.2, -0.27, 0.22), 'relay');
  tagPart(box(g, 0.1, 0.03, 0.07, 0xb0b8bd, -0.45, -0.12, 0.25), 'ecu');
  for (let k = 0; k < 4; k++) {
    const x = (k - 1.5) * BORE;
    tagPart(box(g, 0.022, 0.05, 0.022, 0x2b2f33, x, 0.29, 0), 'coil');
    tagPart(rod(g, 0.008, 0.04, 0x8e979c, x, 0.24, 0.07).rotateZ(Math.PI / 2), 'injector');
  }
  const wires = {
    start: [wire(g, [[0.48, 0.0, 0.25], [0.1, 0.33, 0.35], [-0.45, 0.12, 0.22]], 0xe57373, 0.004, 'wireStart'),          // バッテリー → キー
            wire(g, [[-0.45, 0.1, 0.22], [-0.35, -0.2, 0.25], [-0.2, -0.27, 0.22]], 0xe57373, 0.004, 'wireStart'),         // キー → リレー
            wire(g, [[-0.2, -0.27, 0.22], [0.1, -0.3, 0.12], [0.37, -0.12, 0.02]], 0xe57373, 0.004, 'wireStart')],         // リレー → マグネットスイッチ
    main: [wire(g, [[0.52, -0.06, 0.2], [0.55, -0.25, 0.12], [0.45, -0.18, 0.03]], 0xd40000, 0.009, 'wireMain')],          // バッテリー → スターター
    ecu: [wire(g, [[-0.45, -0.12, 0.22], [-0.35, 0.33, 0.1], [-0.15, 0.33, 0.04], [0.15, 0.33, 0.04]], 0x7fc8f8, 0.004, 'wireEcu')]   // ECU → 点火コイル、インジェクター
  };
  // 部品の名前の札（つながりがわかるように）
  [['キー', -0.45, 0.24, 0.25], ['バッテリー', 0.52, 0.04, 0.25], ['スターターリレー', -0.2, -0.33, 0.22], ['ECU', -0.45, -0.18, 0.25], ['スターター', 0.4, -0.27, 0.03]].forEach(([s, x, y, z]) => {
    const tg = label(s, '#ffd54f');
    sizeLabel(tg, 0.035);
    tg.position.set(x, y, z);
    g.add(tg);
  });
  return { key, wires };
}

function buildEngine() {
  const l = lesson();
  const eng = makeEngine(view.world, l.starter);
  if (l.circuit) eng.circuit = makeCircuit(view.world);
  const arrow = tagPart(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.27, 0.15, 0), 0.1, 0xf0a81c, 0.04, 0.035), 'arrow:トルク');
  const tag = label('');
  sizeLabel(tag, 0.05);
  tag.position.set(0.05, 0.32, 0);
  view.world.add(arrow, tag);
  view.items = { eng, crank: eng.crank, fly: eng.fly, pistons: eng.pistons, arrow, tag };
}
function updateEngine(dt) {
  const it = view.items, e = lesson().engine3d();
  spinEngine(it.eng, e.rpm, lesson().slow3d || 50, dt, e.starter, e.fuel !== false, e.load);
  const c = it.eng.circuit;
  if (c) {
    // キーの位置（OFF → ON → START）。電気が流れている配線を光らせる
    c.key.rotation.z += ({ off: 0, on: -0.9, start: -1.4 }[e.key] - c.key.rotation.z) * Math.min(1, dt * 10);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 80);
    const glow = (list, on, color) => list.forEach(w => w.material.emissive.setHex(on ? color : 0).multiplyScalar(on ? 0.4 + 0.6 * pulse : 1));
    glow(c.wires.start, e.key === 'start', 0xffd54f);
    glow(c.wires.main, e.starter, 0xffa000);
    glow(c.wires.ecu, e.fuel, 0x7fc8f8);
  }
  it.arrow.visible = Math.abs(e.torque) > 0.5;
  it.arrow.setDirection(new THREE.Vector3(0, 0, Math.sign(e.torque) || 1));   // トルクの向き（− は回転を止める向き）
  it.arrow.setLength(Math.max(0.05, Math.abs(e.torque) / 200 * 0.3), 0.04, 0.035);
  setLabel(it.tag, e.text);
}

// 車の中のエンジン（走りながらの操作）: 車体を透かして、前にエンジン（3 倍の大きさ）を置く
function buildCarEngine() {
  const road = makeRoad(5, 120, -60);
  const car = makeCar(0x9fb8c8);
  car.traverse(x => { if (x.material && !car.userData.wheels.some(w => w.children.includes(x))) Object.assign(x.material, { transparent: true, opacity: 0.22, depthWrite: false }); });
  const eng = makeEngine(car, false);
  eng.g.scale.setScalar(3);
  eng.g.position.set(1.2, 0.55, 0);
  eng.g.rotation.y = Math.PI;   // フライホイールを後ろ（変速機の側）に向ける
  const tag = label('');
  sizeLabel(tag, 0.5);
  tag.position.set(0, 2.4, 0);
  view.world.add(road, car, tag);
  view.items = { road, car, eng, crank: eng.crank, fly: eng.fly, pistons: eng.pistons, tag };
}
function updateCarEngine(dt) {
  const it = view.items, c = lesson().car3d();
  spinEngine(it.eng, c.rpm, 50, dt, false, c.fuel, c.load);
  const ms = c.kmh / 3.6 / SLOW;
  it.road.userData.stripes.position.x = (it.road.userData.stripes.position.x - ms * dt) % 6;
  it.car.userData.wheels.forEach(w => { w.rotation.z -= ms / CAR.tire * dt; });
  setLabel(it.tag, c.text);
}

// 加速くらべ: 4本の車線に4台。x は走った距離 (m)
function buildRace() {
  const road = makeRoad(17, GOAL + 120, -20);
  view.world.add(road);
  for (let x = 0; x <= GOAL; x += 100) {
    box(view.world, 0.4, 0.04, 17, 0xffffff, x, 0, 0);
    if (x % 500) continue;   // 距離の札は 500 m ごと
    const tag = label(x === GOAL ? `ゴール ${x} m` : `${x} m`);
    sizeLabel(tag, 1);
    tag.position.set(x, 0.8, -10);
    view.world.add(tag);
  }
  const cars = racers.map((r, k) => {
    const car = makeCar(new THREE.Color(r.color).getHex());
    tagPart(car.userData.body, { name: r.name, text: '同じ車、同じエンジンで、変速する回転数だけが違います。' });
    car.position.z = (k - (racers.length - 1) / 2) * 3.2;
    const tag = label(r.short, r.color);
    sizeLabel(tag, 0.5);
    view.world.add(car, tag);
    return { car, tag };
  });
  road.userData.stripes.visible = false;
  for (let k = 0; k < 17; k++) box(view.world, 1, 0.05, 1, k % 2 ? 0x111111 : 0xffffff, GOAL + 0.5, 0, k - 8);   // ゴールの白黒の線
  view.items = { cars, lead: 0 };
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
  const move = lead - it.lead;   // 先頭の車について行く
  it.lead = lead;
  camera.position.x += move;
  controls.target.x += move;
  controls.update();
}

// ---------- 数式の考え方の印（explain.js の mark） ----------
// mark = { glow: [光らせる部品], gravity: true なら重力の矢印, text: そばに出す短い札 }
//   車:       'wheels' タイヤ、'body' 車体、'rear' 'front' 'nose' 'roof' 'top' その場所の力の矢印
//   エンジン: 'pistons' ピストン、'crank' クランク軸、'flywheel' フライホイール、'torque' トルクの矢印
function partsOf(name) {
  const it = view.items;
  if (view.scene === 'car') {
    if (name === 'wheels') return it.car.userData.wheels;
    if (name === 'body') return [it.car.userData.body];
    return it.arrows.filter(a => a.spot === name && a.arrow.visible).map(a => a.arrow);
  }
  if (view.scene === 'engine' || view.scene === 'carEngine') return { pistons: it.pistons.map(x => x.piston), crank: [it.crank], flywheel: [it.fly], torque: it.arrow ? [it.arrow] : [], starter: it.eng.motor ? [it.eng.motor] : [], wheels: it.car ? it.car.userData.wheels : [] }[name] || [];
  return [];
}

function setMark(spec) {
  view.markSpec = spec;
  if (view.mode === '3d') buildMark();
}

function buildMark() {
  if (view.mark) { view.world.remove(view.mark.group); view.mark.arrows.forEach(a => a.setColor(a.userData.color)); view.mark.mats.forEach(m => m.emissive.setRGB(0, 0, 0)); }
  view.mark = null;
  const m = view.markSpec;
  if (view.mode === '3d') el('hint3d').hidden = false;
  if (!m || view.scene === 'race') return;
  const group = new THREE.Group();
  view.world.add(group);
  const targets = (m.glow || []).flatMap(partsOf);
  const mats = [], arrows = [];
  targets.forEach(o => {
    if (o.setColor) { o.userData.color = o.line.material.color.getHex(); arrows.push(o); return; }   // 力の矢印は、点滅させる
    o.traverse(x => { if (x.material && x.material.emissive) mats.push(x.material); });             // 部品は、橙色に光らせる
  });
  const big = view.scene === 'car' || view.scene === 'carEngine';
  const tag = label(m.text || '', '#ffd54f');
  sizeLabel(tag, big ? 0.45 : 0.052);
  group.add(tag);
  // 重力 m × g（真下）と、そのうち路面を押す分 m × g × cos θ（路面に垂直）
  const gravity = m.gravity && big ? [0xffffff, 0xffd54f].map((color, j) => {
    const a = tagPart(new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 1, color, 0.3, 0.22), j ? 'arrow:路面を押す力' : 'arrow:重力');
    const t = label('', '#' + new THREE.Color(color).getHexString());
    sizeLabel(t, 0.4);
    group.add(a, t);
    return { a, t };
  }) : null;
  view.mark = { group, targets, mats, arrows, tag, gravity, time: 0 };
  el('hint3d').hidden = true;   // 印を出している間は、左上の説明を隠す（札と重ならないように）
}

function updateMark(dt) {
  const mk = view.mark;
  if (!mk) return;
  mk.time += dt;
  const k = 0.5 + 0.5 * Math.sin(mk.time * 6);
  mk.mats.forEach(m => m.emissive.setRGB(0.8 * k, 0.45 * k, 0));
  mk.arrows.forEach(a => a.setColor(k > 0.5 ? 0xffffff : a.userData.color));
  // 札は、光らせた部品のまとまりの上に置く
  const box3 = new THREE.Box3();
  mk.targets.forEach(o => box3.expandByObject(o));
  if (!box3.isEmpty()) {
    const c = box3.getCenter(new THREE.Vector3());
    mk.tag.position.set(c.x, box3.max.y + (view.scene === 'engine' ? 0.05 : 1.0), c.z);   // 矢印の札と重ならない高さ
  } else mk.tag.position.set(0, view.scene === 'engine' ? 0.4 : 3, 0);
  setLabel(mk.tag, view.markSpec.text || '');
  if (mk.gravity) {
    const { tilt, car } = view.items, theta = tilt.rotation.z, mass = P.mass || CAR.mass;
    const s = car.scale.x, mg = mass * G;
    [[mg, new THREE.Vector3(-0.6, 0.62, 1.3).multiplyScalar(s), `重力 m × g ${n0(mg)} N`, new THREE.Vector3(0, -1, 0)],
     [mg * Math.cos(theta), new THREE.Vector3(0.6, 0.62, 1.3).multiplyScalar(s), `路面を押す m × g × cosθ ${n0(mg * Math.cos(theta))} N`, new THREE.Vector3(Math.sin(theta), -Math.cos(theta), 0)]]
      .forEach(([force, local, text, dir], j) => {
        const { a, t } = mk.gravity[j], len = Math.min(2.2, 0.5 * Math.sqrt(force / 100));
        const at = tilt.localToWorld(local.clone());
        a.position.copy(at);
        a.setDirection(dir);
        a.setLength(len, 0.3, 0.22);
        t.position.set(at.x + (j ? 1.6 : -1.6), at.y - len - 0.3, at.z);
        setLabel(t, text);
      });
  }
}

// ---------- 図と3Dの切り替え ----------
function setView(want) {
  const l = lesson();
  view.want = want;
  view.mode = l.scene ? want : 'chart';
  el('chart').hidden = view.mode !== 'chart';
  el('scene3d').hidden = el('hint3d').hidden = view.mode !== '3d';
  el('show3d').disabled = !l.scene;
  el('show3d').title = l.scene ? '' : 'ここは図だけです';
  el('showChart').classList.toggle('current', view.mode === 'chart');
  el('show3d').classList.toggle('current', view.mode === '3d');
  if (view.mode === '3d') { if (!view.three) init3d(); build3d(); } else showPart(null);
}

// 毎フレーム（study.js のループから呼ぶ）
function frame3d(dt) {
  if (view.mode !== '3d') return;
  ({ car: updateCar, engine: updateEngine, race: updateRace, carEngine: updateCarEngine })[view.scene](dt);
  updateMark(dt);
  view.three.renderer.render(view.three.scene, view.three.camera);
}
