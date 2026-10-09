// drum.js: シフトドラム。表面の溝が、フォークのピンを左右に動かす
// ドラムはフォークの奥にあり、ピンはドラムの手前の面に当たる。
// ドラムが回ると、手前に来る溝の位置が変わり、フォークが動く

const DRUM_Y = 3.3;         // ドラムの軸の高さ
const DRUM_R = 0.8;        // ドラムの半径
const PIN_ANGLE = Math.PI; // ドラムから見て、ピンがある向き（手前）
const DRUM_SPEED = 1.5;    // 1秒に回る段の数

let drumGroup = null;
let drumNow = 0;           // ドラムの今の位置（0 = N、1 = 1番目のギヤ…。回っている途中は小数）

const drumStep = () => 2 * Math.PI / (shownGears().length + 1);   // 1段ぶんの角度

// ドラムが位置 j（整数）のとき、k番のフォークがいる場所（-1 = 左、0 = 中立、1 = 右）
function forkAt(k, j) {
  if (j - 1 === k * 2) return -1;
  if (j - 1 === k * 2 + 1) return 1;
  return 0;
}

// 溝の形。位置 p（小数）でのフォークの場所。段と段の間は、なめらかな坂でつなぐ
function groovePos(k, p) {
  const j = Math.floor(p);
  const f = p - j;
  const slope = f * f * (3 - 2 * f);
  return forkAt(k, j) + (forkAt(k, j + 1) - forkAt(k, j)) * slope;
}

function buildDrum() {
  const last = shownGears().length;
  const from = sleeveZ(0) - 0.9;
  const to = sleeveZ(sleeveCount() - 1) + 0.9;
  drumGroup = new THREE.Group();
  drumGroup.position.set(DRUM_R + 0.1, DRUM_Y, 0);
  box.add(drumGroup);
  const body = put(cylinder(DRUM_R, to - from), 'steel', 'drum', false, 0, (from + to) / 2, null, drumGroup);
  addMark(body, DRUM_R, to - from);

  // フォーク1本につき、溝が1本。N から最後の段まで、ドラムの表面に沿って描く
  for (let k = 0; k < sleeveCount(); k++) {
    const points = [];
    for (let p = 0; p <= last; p += 0.05) {
      const a = PIN_ANGLE + p * drumStep();
      points.push(new THREE.Vector3(DRUM_R * Math.cos(a), DRUM_R * Math.sin(a), sleeveZ(k) + SLIDE * groovePos(k, p)));
    }
    const groove = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 2, 0.06, 6);
    put(groove, 'groove', 'drum', false, 0, 0, null, drumGroup);
  }
}

// 毎フレーム: 選んだ段へ向かって、ドラムを一定の速さで回す
function moveDrum(dt) {
  const target = Math.min(state.gear + 1, shownGears().length);
  const move = Math.max(-DRUM_SPEED * dt, Math.min(DRUM_SPEED * dt, target - drumNow));
  drumNow = Math.min(drumNow + move, shownGears().length);
  drumGroup.rotation.z = -drumNow * drumStep();
}
