// hshift.js: H型シフト。レバーの左右でシフトロッドを選び（セレクト）、前後でそのロッドを押す（シフト）
// フォークは1本ずつ別のロッドに固定されていて、ロッドと一緒に動く
// レバーの支点はロッドの下に置いた。ノブと、ロッドを押す点が同じ向きに動く、単純な形

const RAIL_Y = 3;              // シフトロッドの高さ
const RAIL_GAP = 0.35;         // ロッド同士の間隔
const GATE_Y = RAIL_Y + 0.17;  // ゲート（レバーがロッドを押す所）の高さ
const PIVOT_Y = 1.9;           // レバーの支点の高さ
const KNOB_Y = 5;              // ノブの高さ
const LEVER_SPEED = 3;         // レバーが動く速さ

let leverGroup = null;
const leverNow = { x: 0, s: 0, rail: 0 };   // x = 左右の位置、s = 前後の位置（-1〜1）、rail = 今いる列

const railX = k => (k - (sleeveCount() - 1) / 2) * RAIL_GAP;          // k番のロッドの左右の位置
const leverZ = () => (sleeveZ(0) + sleeveZ(sleeveCount() - 1)) / 2;   // レバーのある場所（軸方向）
const homeRail = () => Math.min(1, sleeveCount() - 1);                // N のとき、レバーが戻る列

// レバーを、動かさずに N の位置へ戻す（段階や方式が変わったとき）
function resetLever() {
  leverNow.rail = homeRail();
  leverNow.x = railX(homeRail());
  leverNow.s = 0;
}

// k番のフォークに、シフトロッドとゲートを付ける。group = スリーブと一緒に動くまとまり、forkX = フォークの左右の位置
function addRail(group, k, forkX) {
  const x = railX(k);
  const gateZ = leverZ() - sleeveZ(k);          // フォークから見た、ゲートの場所
  const from = Math.min(0, gateZ) - 0.7;
  const to = Math.max(0, gateZ) + 0.7;
  // フォークの上端からロッドまでの横のつなぎ
  put(new THREE.BoxGeometry(Math.abs(x - forkX) + 0.2, 0.16, 0.16), 'dark', 'fork:' + k, false, RAIL_Y, 0, null, group).position.x = (x + forkX) / 2;
  put(cylinder(0.08, to - from), 'steel', 'rail', false, RAIL_Y, (from + to) / 2, null, group).position.x = x;
  // ゲート: 前後2個の受けの間に、レバーが入る
  [-0.22, 0.22].forEach(offset => {
    put(new THREE.BoxGeometry(0.26, 0.3, 0.16), 'brass', 'gate', false, GATE_Y, gateZ + offset, null, group).position.x = x;
  });
}

// 支点の玉、レバーの棒、ノブ
function buildLever() {
  const length = KNOB_Y - PIVOT_Y;
  put(new THREE.SphereGeometry(0.2, 16, 12), 'steel', 'lever', false, PIVOT_Y, leverZ());
  leverGroup = new THREE.Group();
  leverGroup.position.set(0, PIVOT_Y, leverZ());
  box.add(leverGroup);
  put(new THREE.CylinderGeometry(0.07, 0.07, length), 'key', 'lever', false, length / 2, 0, null, leverGroup);
  put(new THREE.SphereGeometry(0.25, 16, 12), 'dark', 'lever', false, length, 0, null, leverGroup);
  moveLever(0);
}

// 毎フレーム: 選んだ段へ向かってレバーを動かす。列が違うときは「N に戻す → 横へ動く → 押す」の順
function moveLever(dt) {
  const now = leverNow;
  const rail = state.gear === NEUTRAL ? homeRail() : Math.floor(state.gear / 2);
  const step = LEVER_SPEED * dt;
  if (Math.abs(now.x - railX(rail)) > 0.001) {
    if (Math.abs(now.s) > 0.001) now.s = approach(now.s, 0, step);
    else now.x = approach(now.x, railX(rail), step * 0.5);
  } else {
    now.rail = rail;
    now.s = approach(now.s, sleevePos(rail), step);
  }
  // 支点を中心に傾けて、ゲートの高さでちょうど (x, s) の位置に来るようにする
  const height = GATE_Y - PIVOT_Y;
  leverGroup.rotation.set(Math.atan2(now.s * SLIDE, height), 0, -Math.atan2(now.x, height));
}
