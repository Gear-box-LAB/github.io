// car.js: FR車の模型。半透明の車体の中に、エンジン → クラッチ → トランスミッション → プロペラシャフト → デフ → 後輪 と並べる
// 単位はメートル。寸法は、FRの小型スポーツカー（マツダ ロードスター ND: 全長3,915 mm、全幅1,735 mm、
// 全高1,235 mm、ホイールベース2,310 mm）をおおよその目安にした。形は簡略化している
// トランスミッションは、今までの図（box）をそのまま縮小して、車の中に置く

const CAR = {
  length: 3.92, width: 1.735, height: 1.235,
  frontAxle: -1.35,       // 前輪の位置（車の前は x のマイナス側）
  rearAxle: 0.96,         // 後輪の位置（ホイールベース 2.31 m）
  track: 1.5,             // 左右のタイヤの間隔
  driveY: 0.33,           // エンジンとトランスミッションの軸の高さ
  boxScale: 0.035,        // 図の1目盛り = 35 mm（軸間距離 2.4 目盛り = 84 mm）
  boxStart: -0.4          // トランスミッションの前端（インプット軸の前端）の位置
};

let carGroup = null;
let carGround = null;     // 地面のマス

// 毎フレーム: 地面を、タイヤが転がった距離だけ後ろへ動かす（車は止まっていて、地面が動いて見える）
// タイヤの回転と同じ速さ（1/slow の速さ）で動かすので、タイヤは地面に対して滑らずに転がって見える
// マスは 1 m ごとに同じ模様なので、1 m 動いたら元の位置に戻しても見た目は変わらない
function moveGround() {
  const distance = spin.tire * state.car.tire / 2;   // タイヤが転がった距離 (m)。前進でプラス
  carGround.position.x = ((distance % 1) + 1) % 1;   // 車の前は x のマイナス側なので、地面はプラス側へ動く
}

// x 方向（車の前後）に伸びる円柱
const cylinderX = (radius, length, sides) => new THREE.CylinderGeometry(radius, radius, length, sides || 24).rotateZ(Math.PI / 2);

// 透けて見せる部品（車体やケース）。クリックでは選ばれず、中の部品をクリックできる
function ghost(mesh, opacity) {
  mesh.material.transparent = true;
  mesh.material.opacity = opacity;
  mesh.material.depthWrite = false;
  mesh.material.side = THREE.DoubleSide;
  mesh.userData.ghost = true;
  return mesh;
}

// 車体: 横から見た形を、車の幅だけ押し出す。前輪と後輪の上は、タイヤハウスとして丸く切る
function bodyGeometry(tireR) {
  const points = [[1.70, 0.18], [1.78, 0.42], [1.74, 0.88], [1.25, 0.92], [0.75, 1.20], [0.05, 1.22], [-0.45, 0.86], [-2.0, 0.66], [-2.15, 0.40], [-2.10, 0.18]];
  const outline = points.map(p => new THREE.Vector2(p[0], p[1]));
  // 下の線（前から後ろへ）。タイヤの上を丸く切り欠く
  [CAR.frontAxle, CAR.rearAxle].forEach(axle => {
    const radius = tireR + 0.06;
    const start = Math.asin((0.18 - tireR) / radius);
    for (let n = 0; n <= 16; n++) {
      const a = Math.PI - start - n / 16 * (Math.PI - 2 * start);   // 前の下 → 上 → 後ろの下
      outline.push(new THREE.Vector2(axle + radius * Math.cos(a), tireR + radius * Math.sin(a)));
    }
  });
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: CAR.width - 0.1, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3 });
  geometry.translate(0, 0, -(CAR.width - 0.1) / 2);
  return geometry;
}

// 部品を車の中に置く（x = 前後、y = 高さ、z = 左右）
function carPart(geometry, kind, part, x, y, z, angle, axis) {
  const mesh = put(geometry, kind, part, false, y, z, angle, carGroup);
  mesh.position.x = x;
  if (angle) spinners[spinners.length - 1].axis = axis || 'z';
  return mesh;
}

// タイヤ1本（タイヤ、ホイール、スポーク5本）。全部が同じ角度で回る
function addWheel(x, z, tireR) {
  const angle = () => spin.tire;
  carPart(cylinder(tireR, 0.2, 40), 'rubber', 'car:wheel', x, tireR, z, angle);
  carPart(cylinder(tireR * 0.62, 0.21, 32), 'case', 'car:wheel', x, tireR, z, angle);
  for (let k = 0; k < 5; k++) {
    carPart(new THREE.BoxGeometry(0.035, tireR * 1.2, 0.22), 'steel', 'car:wheel', x, tireR, z, () => spin.tire + k * 2 * Math.PI / 5);
  }
}

function buildCar() {
  carGroup = new THREE.Group();
  world.add(carGroup);
  const tireR = state.car.tire / 2;
  const y = CAR.driveY;

  // 地面のマス（1 m × 1 m の正方形、20 m 四方）と、車体
  carGround = new THREE.GridHelper(20, 20, 0x7d8b93, 0x7d8b93);
  carGroup.add(carGround);
  const body = carPart(bodyGeometry(tireR), 'body', 'car:body', 0, 0, 0);
  ghost(body, 0.12);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry, 25), new THREE.LineBasicMaterial({ color: palette().edge, transparent: true, opacity: 0.6 }));
  edges.raycast = () => {};
  carGroup.add(edges);

  // 座席2つとハンドル（日本の車なので右側）
  [-0.37, 0.37].forEach(z => {
    ghost(carPart(new THREE.BoxGeometry(0.5, 0.12, 0.48), 'seat', 'car:seat', 0.25, 0.26, z), 0.5);
    ghost(carPart(new THREE.BoxGeometry(0.12, 0.6, 0.48), 'seat', 'car:seat', 0.52, 0.6, z).rotateZ(-0.25), 0.5);
  });
  carPart(new THREE.TorusGeometry(0.18, 0.02, 8, 32).rotateY(Math.PI / 2).rotateZ(0.4), 'dark', 'car:seat', -0.25, 0.82, -0.37);

  // エンジン（縦置き、前輪より後ろ）とラジエーター。前のプーリーはエンジン回転数で回る
  carPart(new THREE.BoxGeometry(0.58, 0.45, 0.42), 'case', 'car:engine', -0.91, 0.45, 0);
  carPart(new THREE.BoxGeometry(0.58, 0.12, 0.36), 'dark', 'car:engine', -0.91, 0.735, 0);
  carPart(new THREE.BoxGeometry(0.5, 0.12, 0.32), 'dark', 'car:engine', -0.91, 0.17, 0);
  addMark(carPart(cylinderX(0.08, 0.04), 'steel', 'car:engine', -1.22, y, 0, () => spin.engine, 'x'), 0.08, 0.04);
  carPart(new THREE.BoxGeometry(0.05, 0.4, 0.6), 'dark', 'car:radiator', -1.85, 0.45, 0);

  // クラッチハウジング（エンジンとトランスミッションの間の、つり鐘形のケース）
  ghost(carPart(new THREE.CylinderGeometry(0.15, 0.22, 0.22, 24).rotateZ(Math.PI / 2), 'case', 'car:bell', -0.51, y, 0), 0.3);

  // トランスミッションケースと、後ろのエクステンション（中の図が見えるように半透明）
  const end = CAR.boxStart + (gearZ(Math.max(shownGears().length - 1, 0)) + 2 + 4.6) * CAR.boxScale;
  ghost(carPart(new THREE.BoxGeometry(end - CAR.boxStart, 0.32, 0.3), 'case', 'car:case', (CAR.boxStart + end) / 2, y - 0.02, 0), 0.18);
  ghost(carPart(cylinderX(0.06, 0.18), 'case', 'car:case', end + 0.09, y, 0), 0.3);

  // アウトプット軸からタイヤまで、1本につながった動力の通り道
  // アウトプット軸の延長 → 自在継手 → プロペラシャフト → 自在継手 → ピニオン → リングギヤ → ドライブシャフト → タイヤ
  const out = () => spin.output;       // アウトプット軸と同じ回転
  const wheel = () => spin.tire;       // タイヤと同じ回転（アウトプット軸 ÷ 最終減速比）
  const ringR = 0.11;                  // リングギヤの半径
  const ringZ = 0.05;                  // リングギヤの位置（左右）
  const pinionX = CAR.rearAxle - ringR * 0.8;    // ピニオンがリングギヤにかみ合う位置
  const pinionR = ringR * 0.8 / state.car.finalRatio;   // 半径の比 = 最終減速比 にして、回る速さを合わせる
  const jointA = end + 0.2;            // 前の自在継手（エクステンションの後ろ）
  const jointB = pinionX - 0.16;       // 後ろの自在継手（デフの前）

  addMark(carPart(cylinderX(0.025, jointA - end), 'steel', 'car:prop', (end + jointA) / 2, y, 0, out, 'x'), 0.025, jointA - end);
  [jointA, jointB].forEach(x => carPart(new THREE.BoxGeometry(0.05, 0.07, 0.07), 'dark', 'car:joint', x, (y + tireR) / 2, 0, out, 'x'));
  addMark(carPart(cylinderX(0.035, jointB - jointA), 'steel', 'car:prop', (jointA + jointB) / 2, (y + tireR) / 2, 0, out, 'x'), 0.035, jointB - jointA);
  carPart(cylinderX(0.02, pinionX - jointB), 'steel', 'car:pinion', (jointB + pinionX) / 2, tireR, 0, out, 'x');

  // デフ: ケースは半透明。中のピニオン（軸は前後）が、リングギヤ（軸は左右）の面を回す
  ghost(carPart(new THREE.SphereGeometry(0.17, 24, 16), 'case', 'car:diff', CAR.rearAxle, tireR, 0), 0.2);
  const pinion = carPart(gearGeometry(10, pinionR, 0.04).rotateY(Math.PI / 2), 'brass', 'car:pinion', pinionX, tireR, ringZ - 0.03 - pinionR, out, 'x');
  pinion.userData.part = 'car:pinion';
  carPart(gearGeometry(Math.round(10 * state.car.finalRatio), ringR, 0.03), 'brass', 'car:ring', CAR.rearAxle, tireR, ringZ, wheel);

  // ドライブシャフトとタイヤ（後輪はリングギヤと同じ回転。前輪は転がってついてくるので同じ回転）
  [-1, 1].forEach(side => {
    const length = CAR.track / 2 - 0.1;
    addMark(carPart(cylinder(0.025, length), 'steel', 'car:axle', CAR.rearAxle, tireR, side * length / 2, wheel), 0.025, length);
    addWheel(CAR.rearAxle, side * CAR.track / 2, tireR);
    addWheel(CAR.frontAxle, side * CAR.track / 2, tireR);
  });
}

// 車に載せるときは、トランスミッションの図を縮小して、エンジンの後ろに置く
function placeBox() {
  const scale = state.car3d ? CAR.boxScale : 1;
  box.scale.setScalar(scale);
  box.position.set(state.car3d ? CAR.boxStart + 4.6 * scale : 0, state.car3d ? CAR.driveY : 0, 0);
}
