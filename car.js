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

  // 地面の目盛り（0.5 m ごと）と、車体
  carGroup.add(new THREE.GridHelper(8, 16, 0x7d8b93, 0x55656e));
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

  // プロペラシャフト（アウトプット軸と同じ回転数）、デフ、ドライブシャフト、タイヤ
  const diffFront = CAR.rearAxle - 0.14;
  const propLength = Math.hypot(diffFront - end - 0.18, y - tireR);
  const prop = carPart(cylinderX(0.035, propLength), 'steel', 'car:prop', (end + 0.18 + diffFront) / 2, (y + tireR) / 2, 0, () => spin.output, 'x');
  prop.rotation.order = 'ZYX';
  addMark(prop, 0.035, propLength);
  carPart(new THREE.SphereGeometry(0.13, 20, 14), 'case', 'car:diff', CAR.rearAxle, tireR, 0);
  [-1, 1].forEach(side => {
    addMark(carPart(cylinder(0.025, CAR.track / 2 - 0.2), 'steel', 'car:axle', CAR.rearAxle, tireR, side * (CAR.track / 4 + 0.05), () => spin.tire), 0.025, CAR.track / 2 - 0.2);
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
