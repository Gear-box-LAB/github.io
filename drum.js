// drum.js: シフトドラム式（バイクやレース車に多い）
// 上から順に: シフトドラム → フォークのガイドピン → フォークシャフトの上を滑るフォークのボス → 爪 → スリーブ
// ドラムの左端: ドラムを各段で止める、星形のストッパープレートと、ばねで押したストッパーアーム
// ドラムの右端: ドラムを1段ずつ回す、シフトアームの爪と、ドラムの端面のピン
// （部品の名前と並びは、ホンダの特許 JP5869459B2、整備記事などで確認したもの。寸法は見やすさ優先）

const FORK_Y = 2.25;            // フォークシャフトの高さ。フォークはこの軸に通っていて、軸の上を滑る
const BOSS_R = 0.22;            // フォークのボス（フォークシャフトが通る筒）の半径
const DRUM_R = 0.8;             // ドラムの半径
const DRUM_Y = FORK_Y + BOSS_R + 0.25 + DRUM_R;   // ドラムの軸の高さ（ガイドピンの長さぶん、フォークシャフトより上）
const PIN_ANGLE = -Math.PI / 2; // ドラムから見て、ガイドピンとストッパーのローラーがある向き（真下）
const DRUM_SPEED = 1.5;         // 1秒に回る段の数
const STAR_R = 0.65;            // ストッパープレートの半径
const STAR_DEPTH = 0.14;        // ストッパープレートのくぼみの深さ（N は半分）
const ROLLER_R = 0.1;           // ストッパーアームのローラーの半径

let drumGroup = null;           // ドラムと一緒に回る部品のまとまり
let stopper = null;             // { arm, roller, spring, z }: ストッパーアームの部品
let pawl = null;                // シフトアーム（ドラムとは別に動く）
let drumNow = 0;                // ドラムの今の位置（drumOrder() の何番目か。回っている途中は小数）
let pawlBase = 0;               // シフトアームが押し始めた位置
let pawlSwing = 0;              // シフトアームの振れ（段の数。0 = 元の角度）

const drumStep = () => 2 * Math.PI / drumOrder().length;   // 1段ぶんの角度
const drumSpan = () => [sleeveZ(0) - 0.9, sleeveZ(sleeveCount() - 1) + 0.9];   // ドラムの左端と右端

// ドラムが位置 j（整数）のとき、k番のフォークがいる場所（-1 = 左、0 = 中立、1 = 右）
function forkAt(k, j) {
  const gear = drumOrder()[j];
  if (gear === k * 2) return -1;
  if (gear === k * 2 + 1) return 1;
  return 0;
}

// ドラムとシフトアームを、回さずに N の位置へ戻す（段階やギヤの並びが変わったとき）
function resetDrum() {
  drumNow = drumOrder().indexOf(NEUTRAL);
  pawlBase = drumNow;
  pawlSwing = 0;
}

// 溝の形。位置 p（小数）でのフォークの場所
// 段の前後では溝がまっすぐ（フォークが止まっている）、段と段の間だけ、なめらかな坂で曲がる
function groovePos(k, p) {
  const j = Math.floor(p);
  const f = p - j;
  const slope = f * f * (3 - 2 * f);
  return forkAt(k, j) + (forkAt(k, j + 1) - forkAt(k, j)) * slope;
}

// ストッパープレートの外周の半径。a = プレートの上の角度。各段の位置にくぼみがある
function starRadius(a) {
  const count = drumOrder().length;
  const rel = a - PIN_ANGLE;
  const j = ((Math.round(rel / drumStep()) % count) + count) % count;   // いちばん近いくぼみの番号
  const depth = drumOrder()[j] === NEUTRAL ? STAR_DEPTH / 2 : STAR_DEPTH;
  return STAR_R - depth * (1 + Math.cos(count * rel)) / 2;
}

// 長さ1の棒（y方向）を、点 a から点 b まで伸ばして置く（xy面の中）
function stretch(mesh, a, b) {
  mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, mesh.position.z);
  mesh.scale.y = Math.hypot(b.x - a.x, b.y - a.y);
  mesh.rotation.z = -Math.atan2(b.x - a.x, b.y - a.y);
}

function buildDrum() {
  const [from, to] = drumSpan();
  const count = drumOrder().length;
  drumGroup = new THREE.Group();
  drumGroup.position.y = DRUM_Y;
  box.add(drumGroup);

  // ドラム本体。中の溝とピンが見えるように半透明にする
  const body = put(cylinder(DRUM_R, to - from), 'steel', 'drum', false, 0, (from + to) / 2, null, drumGroup);
  body.material.transparent = true;
  body.material.opacity = 0.35;
  body.material.depthWrite = false;
  addMark(body, DRUM_R, to - from);

  // 溝（カム溝）。フォーク1本につき1本。最初の位置から最後の位置まで、ドラムの表面に沿って描く
  for (let k = 0; k < sleeveCount(); k++) {
    const points = [];
    for (let p = 0; p <= count - 1; p += 0.05) {
      const a = PIN_ANGLE + p * drumStep();
      points.push(new THREE.Vector3(DRUM_R * Math.cos(a), DRUM_R * Math.sin(a), sleeveZ(k) + SLIDE * groovePos(k, p)));
    }
    put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 2, 0.07, 6), 'groove', 'drum', false, 0, 0, null, drumGroup);
  }
  put(cylinder(0.12, to - from + 1.4), 'steel', 'drum', false, 0, (from + to) / 2, null, drumGroup);   // ドラムの支軸

  // 左端: ストッパープレート（星形）と、ストッパーアーム
  const outline = [];
  for (let n = 0; n < 240; n++) {
    const a = n / 240 * 2 * Math.PI;
    outline.push(new THREE.Vector2(starRadius(a) * Math.cos(a), starRadius(a) * Math.sin(a)));
  }
  put(extrude(outline, circle(0.13), 0.18), 'steel', 'stopper', false, 0, from - 0.3, null, drumGroup);
  const z = from - 0.3;
  stopper = {
    z,
    arm: put(new THREE.BoxGeometry(0.12, 1, 0.12), 'dark', 'stopper', false, 0, z),
    roller: put(cylinder(ROLLER_R, 0.22), 'brass', 'stopper', false, 0, z),
    spring: put(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), 'free', 'stopper', false, 0, z)
  };
  put(new THREE.SphereGeometry(0.09, 12, 8), 'dark', 'stopper', false, DRUM_Y - 1.05, z).position.x = -0.95;   // アームの支点

  // 右端: ドラムの端面のピン（位置の数だけ）と、ピンを押すシフトアーム
  for (let j = 0; j < count; j++) {
    const a = PIN_ANGLE + (j + 0.5) * drumStep();
    put(cylinder(0.05, 0.25), 'steel', 'pawl', false, 0.45 * Math.sin(a), to + 0.3, null, drumGroup).position.x = 0.45 * Math.cos(a);
  }
  pawl = new THREE.Group();
  pawl.position.set(0, DRUM_Y, to + 0.45);
  box.add(pawl);
  const arm = put(new THREE.BoxGeometry(0.14, 1.3, 0.1), 'dark', 'pawl', false, -0.55, 0, null, pawl);   // 下へ伸びる腕
  put(new THREE.BoxGeometry(0.22, 0.1, 0.12), 'key', 'pawl', false, -0.42, 0, null, pawl).position.x = 0.12;   // ピンにかかる爪
  arm.position.x = 0;
  moveDrum(0);
}

// 毎フレーム: 選んだ段へ向かってドラムを回し、ストッパーとシフトアームを動かす
function moveDrum(dt) {
  const before = drumNow;
  drumNow = approach(drumNow, drumOrder().indexOf(state.gear), DRUM_SPEED * dt);
  drumGroup.rotation.z = -drumNow * drumStep();

  // ストッパー: ローラーは、プレートの外周に押し付けられている。段の間では山を乗り越えるので、アームが下がる
  const plateAngle = PIN_ANGLE + drumNow * drumStep();   // ローラーの真上に来ている、プレートの上の角度
  const roller = { x: 0, y: DRUM_Y - starRadius(plateAngle) - ROLLER_R };
  const pivot = { x: -0.95, y: DRUM_Y - 1.05 };
  const anchor = { x: -0.3, y: DRUM_Y - 1.6 };            // ばねの下端（ケースに固定）
  stopper.roller.position.set(roller.x, roller.y, stopper.z);
  stretch(stopper.arm, pivot, roller);
  stretch(stopper.spring, { x: (pivot.x + roller.x) / 2, y: (pivot.y + roller.y) / 2 }, anchor);

  // シフトアーム: ドラムが回っている間は、ピンを押してドラムと一緒に振れる
  // 1段ぶん振れたら、次のピンに持ち替える。止まったら、リターンスプリングで元の角度へ戻る
  const moving = drumNow !== before;
  if (!moving) pawlBase = Math.round(drumNow);
  else if (Math.abs(drumNow - pawlBase) > 1) pawlBase += Math.sign(drumNow - pawlBase);
  pawlSwing = moving ? drumNow - pawlBase : approach(pawlSwing, 0, 3 * dt);
  pawl.rotation.z = -pawlSwing * drumStep();
}
