// synchro.js: 段階5の拡大図。シンクロまわりの部品だけを大きく描く
// 位置は軸方向 z。0 = ハブの中心で、マイナス側（画面の左）にギヤがある
// 見やすいように、コーンの角度は実物より大きく描いている

const SPLINES = 30;                            // スリーブ、ハブ、リング、ドグ歯で共通の歯数
const SLEEVE_AT = [0, -0.12, -0.45, -0.8];     // 段階ごとのスリーブの位置
const RING_PRESS = -0.06;                      // リングがコーンに当たるまでに動く量
const KEY_STOP = -0.12;                        // キーはリングに当たると、そこで止まる
const EXPLODE = { gear: -1.3, ring: -0.65, sleeve: 1.5 };   // 「分解して見る」でずらす量

let synchroParts = null;   // { gear, ring, hub, keys, sleeve }。それぞれ、一緒に動く部品のまとまり
const synchroNow = { sleeve: 0, ring: 0, index: 0, explode: 0, slip: 1 };   // なめらかに動かすための、今の値

function partGroup() {
  const group = new THREE.Group();
  box.add(group);
  return group;
}

// 円すい台（small = ハブ側の半径、large = ギヤ側の半径）
function coneGeometry(small, large, length) {
  return new THREE.CylinderGeometry(small, large, length, 48).rotateX(Math.PI / 2);
}

// リングの筒の部分。外側はまっすぐで、内側がギヤのコーンに合う円すい面
function ringBodyGeometry() {
  const profile = [[0.62, -0.12], [0.86, -0.12], [0.86, -0.5], [0.772, -0.5], [0.62, -0.12]];
  return new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), 48).rotateX(Math.PI / 2);
}

function buildSynchro() {
  const p = { gear: partGroup(), ring: partGroup(), hub: partGroup(), keys: partGroup(), sleeve: partGroup() };
  synchroParts = p;
  addMark(put(cylinder(0.3, 5.4), 'steel', 'shaft:output', false, 0, -0.5, null, p.hub), 0.3, 5.4);

  // ギヤ側: 空転ギヤ、ドグ歯、コーン（3つは一体で回る）
  put(gearGeometry(34, 1.7, 0.5), 'free', 'gear:0', false, 0, -1.64, null, p.gear);
  put(gearGeometry(SPLINES, 0.95, 0.25), 'free', 'dog', false, 0, -1.265, null, p.gear);
  put(coneGeometry(0.62, 0.78, 0.4), 'steel', 'cone', false, 0, -0.94, null, p.gear);

  // シンクロナイザリング: 外側の歯の板と、内側が円すいの筒
  put(extrude(toothOutline(SPLINES, 0.95), circle(0.62), 0.12), 'brass', 'synchro', false, 0, -0.62, null, p.ring);
  const body = put(ringBodyGeometry(), 'brass', 'synchro', false, 0, -0.56, null, p.ring);
  body.material.side = THREE.DoubleSide;   // 筒は内側も外側も見せる

  // ハブと、ハブの溝に入った3個のキー
  put(gearGeometry(SPLINES, 0.95, 0.8), 'steel', 'hub', false, 0, 0, null, p.hub);
  [0, 1, 2].forEach(k => {
    const a = k * 2 * Math.PI / 3;
    const key = put(new THREE.BoxGeometry(0.16, 0.2, 1), 'key', 'key', false, 0, 0, null, p.keys);
    key.position.set(0.98 * Math.cos(a), 0.98 * Math.sin(a), 0);
    key.rotation.z = a;
  });

  // スリーブ: 内側に、ハブ・リング・ドグ歯と同じ形の歯がある輪
  const sleeve = put(extrude(circle(1.3), toothOutline(SPLINES, 0.96), 1), 'dark', 'sleeve:0', false, 0, 0, null, p.sleeve);
  sleeve.material.transparent = state.clear;
  sleeve.material.opacity = state.clear ? 0.35 : 1;
  moveSynchro(0);
}

// 毎フレーム: 今の段階の位置へ、部品を少しずつ動かす
function moveSynchro(dt) {
  const p = synchroParts;
  const now = synchroNow;
  const pressed = state.phase >= 1;
  const target = {
    sleeve: SLEEVE_AT[state.phase],
    ring: pressed ? RING_PRESS : 0,
    index: state.phase === 1 ? 1 : 0,     // 回転差がある間は、リングが歯半分ずれて通り道をふさぐ
    explode: state.explode ? 1 : 0
  };
  Object.keys(target).forEach(key => { now[key] += (target[key] - now[key]) * Math.min(1, dt * 6); });

  // 回転差（1 = 差がある、0 = そろった）。押し付けている間、摩擦でゆっくり0になる
  const speed = state.phase === 1 ? 0.8 : 6;
  now.slip += ((pressed ? 0 : 1) - now.slip) * Math.min(1, dt * speed);
  spin.hub += 0.5 * dt;
  spin.dog += (0.5 + 1.2 * now.slip) * dt;

  p.gear.position.z = EXPLODE.gear * now.explode;
  p.gear.rotation.z = spin.dog;
  p.ring.position.z = now.ring + EXPLODE.ring * now.explode;
  p.ring.rotation.z = spin.hub + now.index * Math.PI / SPLINES;
  p.hub.rotation.z = spin.hub;
  p.keys.position.z = Math.max(now.sleeve, KEY_STOP);
  p.keys.rotation.z = spin.hub;
  p.sleeve.position.z = now.sleeve + EXPLODE.sleeve * now.explode;
  p.sleeve.rotation.z = spin.hub;
}
