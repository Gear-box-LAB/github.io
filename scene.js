// scene.js: 3Dの図。状態が変わるたびに部品を作り直し、毎フレーム回す
// 図の中の向き: 軸は z 方向、上下は y。全体を90°回して、画面では左（エンジン）→ 右（タイヤ）に見せる

const A = 2.4;          // 上の軸とカウンタ軸の距離
const PAIR = 1.7;       // 1個のスリーブが受け持つ2枚のギヤの間隔
const GROUP = 3.2;      // スリーブ同士の間隔
const RED_Z = -1.9;     // 減速ギヤの位置
const SLIDE = 0.35;     // スリーブが動く量
const SLOW = 1 / 40;    // 目で追えるように、回転を1/40の速さで見せる
const COLOR = {
  stage: 0x17303a, steel: 0x9fb0b8, free: 0xeef2f3, power: 0xf0a81c, dark: 0x4a606b,
  brass: 0xc9a24a, key: 0xd9534f, groove: 0x14232b, disc: 0x9a6248, rubber: 0x55656e, pick: 0x4da3ff
};

const canvas = el('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const world = new THREE.Scene();
world.background = new THREE.Color(COLOR.stage);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
const controls = new THREE.OrbitControls(camera, canvas);
world.add(new THREE.HemisphereLight(0xffffff, 0x1b2b33, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.position.set(4, 8, 10);
world.add(sun);
const box = new THREE.Group();
box.rotation.y = Math.PI / 2;
world.add(box);

let spinners = [];    // 回る部品: { mesh, angle（今の角度を返す関数）, axis }
let sliders = [];     // スリーブ: { group, k, home }
const sleeveNow = [0, 0, 0, 0];                              // スリーブの今の位置（-1〜1）
const spin = { engine: 0, input: 0, output: 0, tire: 0, hub: 0, dog: 0 };    // 各軸が今までに回った角度

const gearZ = i => Math.floor(i / 2) * GROUP + (i % 2) * PAIR;
const sleeveZ = k => k * GROUP + PAIR / 2;

// ---------- 形 ----------
// 歯車の輪郭（点の並び）。歯の大きさ（モジュール）は 2 × 半径 ÷ 歯数
function toothOutline(count, radius) {
  const m = 2 * radius / count;
  const tip = radius + m * 0.9;
  const root = radius - m * 1.1;
  const pitch = 2 * Math.PI / count;
  const tooth = [[-0.5, root], [-0.3, root], [-0.15, tip], [0.15, tip], [0.3, root]];   // 歯1枚ぶん
  const points = [];
  for (let k = 0; k < count; k++) {
    tooth.forEach(([offset, r]) => {
      const a = (k + offset) * pitch;
      points.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a)));
    });
  }
  return points;
}

// 円の輪郭
function circle(radius) {
  return new THREE.Path().absarc(0, 0, radius, 0, 2 * Math.PI).getPoints(48);
}

// 輪郭を軸方向に押し出して、板にする。hole を渡すと、その形の穴があく
function extrude(outline, hole, width) {
  const shape = new THREE.Shape(outline);
  if (hole) shape.holes.push(new THREE.Path(hole));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geometry.translate(0, 0, -width / 2);
  return geometry;
}

const gearGeometry = (count, radius, width) => extrude(toothOutline(count, radius), null, width);

// 円柱（軸方向は z）。sides を小さくすると多角形になり、回転が見える
function cylinder(radius, length, sides) {
  return new THREE.CylinderGeometry(radius, radius, length, sides || 32).rotateX(Math.PI / 2);
}

// 歯車Aとかみ合う歯車Bの角度。beta = AからBを見た向き
function meshAngle(angleA, teethA, teethB, beta) {
  return (beta - angleA) * teethA / teethB + beta + Math.PI - Math.PI / teethB;
}

// ---------- 部品を置く ----------
// kind = 色の名前、on = 力が通っている（橙色）。クリックした部品は青。angle = 回る部品の角度を返す関数
function put(geometry, kind, part, on, y, z, angle, parent) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: part === state.picked ? COLOR.pick : on ? COLOR.power : COLOR[kind],
    metalness: 0.3, roughness: 0.55, flatShading: true
  }));
  mesh.position.set(0, y, z);
  mesh.userData.part = part;
  (parent || box).add(mesh);
  if (angle) spinners.push({ mesh, angle, axis: 'z' });
  return mesh;
}

// 回っているのが見えるように、円柱の0°の位置に赤い線を1本引く
function addMark(mesh, radius, length) {
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, length), new THREE.MeshBasicMaterial({ color: 0xd40000 }));
  line.position.y = radius;
  line.userData.part = mesh.userData.part;
  mesh.add(line);
}

function shaft(part, from, to, y, on, angle) {
  addMark(put(cylinder(0.16, to - from), 'steel', part, on, y, (from + to) / 2, angle), 0.16, to - from);
}

// ギヤの組（下 = カウンタ軸の固定ギヤ、上 = アウトプット軸の空転ギヤ）
function addGearPair(g, i, on, counterAngle) {
  const part = 'gear:' + i;
  const z = gearZ(i);
  const scale = g.reverse ? 0.78 : 1;     // リバースは2枚を離して、間にアイドラを入れる
  const lower = scale * A * g.counter / (g.counter + g.out);
  const upper = scale * A - lower;
  put(gearGeometry(g.counter, lower, 0.5), 'steel', part, on, -A, z, counterAngle);

  let upperAngle = () => meshAngle(counterAngle(), g.counter, g.out, Math.PI / 2);
  if (g.reverse) {
    // アイドラ: 2枚の両方とかみ合う位置を、2つの円の交点から求める
    const count = 15;
    const radius = lower * count / g.counter;
    const d1 = lower + radius;
    const d2 = upper + radius;
    const y = (d1 * d1 - d2 * d2 - A * A) / (2 * A);
    const x = -Math.sqrt(d2 * d2 - y * y);
    const idlerAngle = () => meshAngle(counterAngle(), g.counter, count, Math.atan2(y + A, x));
    put(gearGeometry(count, radius, 0.5), 'steel', 'idler', on, y, z, idlerAngle).position.x = x;
    upperAngle = () => meshAngle(idlerAngle(), count, g.out, Math.atan2(-y, -x));
  }
  put(gearGeometry(g.out, upper, 0.5), 'free', part, on, 0, z, upperAngle);

  if (state.step < STEP_SLEEVE) return;
  const side = i % 2 === 0 ? 1 : -1;      // スリーブのある側
  put(gearGeometry(14, 0.5, 0.3), 'free', part, on, 0, z + side * 0.4, upperAngle);   // ドグ歯
  if (state.step >= STEP_SYNCHRO) put(cylinder(0.56, 0.12), 'brass', 'synchro', false, 0, z + side * 0.62);
}

// ハブ、スリーブ、シフトフォーク。スリーブとフォークは一緒に左右へ動く
function addSleeve(k, flow, outputAngle) {
  const on = flow && sleevePos(k) !== 0;
  const group = new THREE.Group();
  box.add(group);
  sliders.push({ group, k, home: sleeveZ(k) });
  put(cylinder(0.45, 0.5), 'steel', 'sleeve:' + k, on, 0, sleeveZ(k));
  put(gearGeometry(14, 0.62, 0.55), 'dark', 'sleeve:' + k, on, 0, 0, outputAngle, group);
  // フォーク。ドラムがある段階では、ドラムの手前まで伸ばし、溝へはまる赤いピンを付ける
  const top = state.step >= STEP_DRUM ? DRUM_Y + 0.2 : 2.15;
  put(new THREE.BoxGeometry(0.2, top - 0.65, 0.16), 'dark', 'fork:' + k, false, (top + 0.65) / 2, 0, null, group);
  if (state.step >= STEP_DRUM) put(new THREE.CylinderGeometry(0.09, 0.09, 0.45).rotateZ(Math.PI / 2), 'key', 'fork:' + k, false, DRUM_Y, 0, null, group);
}

// フライホイール、クラッチディスク、プレッシャープレート
function addClutch(on) {
  const gap = state.clutchOn ? 0 : 0.3;   // 切ると、プレッシャープレートが離れる
  put(gearGeometry(72, 1.7, 0.35), 'steel', 'clutch', false, 0, -5.6, () => spin.engine);
  put(cylinder(1.35, 0.12, 10), 'disc', 'clutch', on, 0, -5.36 + gap / 2, () => spin.input);
  put(cylinder(1.5, 0.2, 12), 'dark', 'clutch', false, 0, -5.2 + gap, () => spin.engine);
}

// 最終減速（デフ）、車軸、タイヤ
function addTire(z, on) {
  put(new THREE.BoxGeometry(1, 1, 1), 'dark', 'tire', false, 0, z);
  const axle = put(new THREE.CylinderGeometry(0.12, 0.12, 2.6).rotateZ(Math.PI / 2), 'steel', 'tire', on, 0, z);
  axle.position.x = 1.3;
  const tire = put(gearGeometry(36, 1.5, 0.8).rotateY(Math.PI / 2), 'rubber', 'tire', false, 0, z);
  tire.position.x = 3;
  spinners.push({ mesh: tire, angle: () => spin.tire, axis: 'x' });
}

// ---------- 図を作り直す ----------
function buildScene() {
  box.children.slice().forEach(child => box.remove(child));
  spinners = [];
  sliders = [];
  if (state.detail) return buildSynchro();   // シンクロの拡大図（synchro.js）

  const c = calc(state.gear);
  const list = shownGears();
  const endZ = gearZ(Math.max(list.length - 1, 0)) + 2;
  const flow = c.rpm > 0 && (state.step === 1 || c.engaged);   // 力がタイヤ側まで通っている
  const inputAngle = () => spin.input;
  const counterAngle = () => meshAngle(spin.input, c.z1, c.z2, -Math.PI / 2);
  const outputAngle = () => spin.output;
  const redUpper = A * c.z1 / (c.z1 + c.z2);

  shaft('shaft:input', state.step >= STEP_CLUTCH ? -5.3 : -4.4, RED_Z + 0.5, 0, flow, inputAngle);
  put(gearGeometry(c.z1, redUpper, 0.5), 'steel', 'red', flow, 0, RED_Z, inputAngle);
  put(gearGeometry(c.z2, A - redUpper, 0.5), 'steel', 'red', flow, -A, RED_Z, counterAngle);
  shaft('shaft:counter', RED_Z - 0.6, state.step === 1 ? RED_Z + 1.5 : endZ - 1.2, -A, flow, counterAngle);

  if (state.step >= STEP_OUTPUT) shaft('shaft:output', RED_Z + 0.9, endZ, 0, flow, outputAngle);
  list.forEach((g, i) => addGearPair(g, i, flow && i === state.gear, counterAngle));
  if (state.step >= STEP_SLEEVE) {
    for (let k = 0; k < sleeveCount(); k++) addSleeve(k, flow, outputAngle);
    put(cylinder(0.07, endZ - 0.5), 'dark', 'fork:0', false, 2.15, (endZ - 1.5) / 2);   // フォークが滑る棒
  }
  if (state.step >= STEP_DRUM) buildDrum();   // シフトドラム（drum.js）
  if (state.step >= STEP_CLUTCH) addClutch(flow);
  if (state.step >= STEP_TIRE) addTire(endZ + 0.5, flow);
}

// 今の段階の部品が全部入るように、カメラを置き直す
function frameCamera() {
  if (state.detail) {
    controls.target.set(-0.7, 0, 0);
    camera.position.set(1.6, 2.4, 8.5 / Math.min(1, camera.aspect));
    return;
  }
  const from = state.step >= STEP_CLUTCH ? -6 : -4.6;
  let to = state.step === 1 ? 0 : gearZ(Math.max(shownGears().length - 1, 0)) + 2;
  if (state.step >= STEP_TIRE) to += 2.5;
  const half = Math.tan(camera.fov * Math.PI / 360);
  const drum = state.step >= STEP_DRUM;      // ドラムがあると、図が上に高くなる
  const height = drum ? 4.4 : 3.4;
  const centerY = drum ? -0.4 : -A / 2;
  const distance = Math.max((to - from) / 2 / (half * camera.aspect), height / half) * 1.25;
  const middle = (from + to) / 2;
  controls.target.set(middle, centerY, 0);
  camera.position.set(middle + distance * 0.3, centerY + distance * 0.35, distance * 0.9);
}

// ---------- 毎フレーム ----------
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const c = calc(state.gear);
  const perRpm = 2 * Math.PI / 60 * SLOW * dt;   // 1rpmあたり、このフレームで進む角度
  spin.engine += state.rpm * perRpm;
  spin.input += c.rpm * perRpm;
  spin.output += c.outRpm * perRpm;
  spin.tire += c.tireRpm * perRpm;
  spinners.forEach(s => { s.mesh.rotation[s.axis] = s.angle(); });
  const drum = !state.detail && state.step >= STEP_DRUM;
  if (drum) moveDrum(dt);
  sliders.forEach(s => {
    // ドラムがある段階では、スリーブは溝の形のとおりに動く。ない段階では、選んだ位置へ直接動く
    if (drum) sleeveNow[s.k] = groovePos(s.k, drumNow);
    else sleeveNow[s.k] += (sleevePos(s.k) - sleeveNow[s.k]) * Math.min(1, dt * 10);
    s.group.position.z = s.home + sleeveNow[s.k] * SLIDE;
  });
  if (state.detail) moveSynchro(dt);
  controls.update();
  renderer.render(world, camera);
  requestAnimationFrame(frame);
}

// ---------- 大きさ合わせとクリック ----------
new ResizeObserver(() => {
  const width = el('stageBox').clientWidth;
  const height = el('stageBox').clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}).observe(el('stageBox'));

// ドラッグ（視点の回転）とクリック（部品を選ぶ）を、動いた距離で見分ける
const ray = new THREE.Raycaster();
let downAt = [0, 0];
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('click', e => {
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = canvas.getBoundingClientRect();
  const point = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(point, camera);
  const hit = ray.intersectObjects(box.children, true)[0];
  pick(hit ? hit.object.userData.part : null, e.clientX - r.left, e.clientY - r.top);   // pick は app.js
});

requestAnimationFrame(frame);
