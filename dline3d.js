// dline3d.js: テーマ「ドライブライン」の 3D
// study3d.js の box / rod / mat / label / sizeLabel / makeEngine、trans3d.js の gear / ringX / rodZ / nameTag / glow、partinfo.js の tagPart を使う

// ---------- ドライブラインの並び（FR）: フライホイール → クラッチ → インプット軸 → 変速機の歯車 → プロペラシャフト → デフ → ドライブシャフト → タイヤ ----------
// 軸は x（左がエンジン側）。デフで向きを 90° 変えて、ドライブシャフトは z の向き
const CH = { diffX: 0.56, axleLen: 0.42, segs: 10 };
function buildChain(world) {
  const fly = new THREE.Group(), disc = new THREE.Group(), input = new THREE.Group(), cnt = new THREE.Group(), out = new THREE.Group(), ring = new THREE.Group();
  cnt.position.y = -0.12;
  ring.position.set(CH.diffX, 0, 0);
  world.add(fly, disc, input, cnt, out, ring);
  // フライホイール（エンジンのクランク軸の後ろ）とクラッチカバー
  tagPart(rod(fly, 0.14, 0.03, 0x8e979c, -0.64, 0, 0), 'flywheel');
  box(fly, 0.03, 0.03, 0.035, 0xd40000, -0.64, 0.12, 0);
  tagPart(rod(fly, 0.025, 0.12, 0x6a737a, -0.72, 0, 0), 'crank');
  tagPart(ringX(fly, 0.03, 0.13, 0.04, 0x55656e, -0.585, 0, 'clutchCover', { transparent: true, opacity: 0.25, depthWrite: false }), 'clutchCover');
  // クラッチディスク: 外側の摩擦材と、中のダンパースプリング（ねじれのばね）、中心のハブ
  tagPart(ringX(disc, 0.055, 0.115, 0.012, 0x7a5c2e, -0.6, 0, 'clutchDisc'), 'clutchDisc');
  box(disc, 0.014, 0.03, 0.02, 0xd40000, -0.6, 0.1, 0);
  const springs = [];
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2, s = tagPart(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.035, 10), mat(0xd40000)), 'damperSpring');
    s.position.set(-0.6, 0.045 * Math.cos(a), 0.045 * Math.sin(a));
    s.rotation.x = a;   // 円の向きに沿わせる
    disc.add(s);
    springs.push(s);
  }
  // インプット軸（ハブ）、変速機の歯車（インプット → カウンタ → アウトプット、2回の減速）
  tagPart(ringX(input, 0.015, 0.035, 0.016, 0x8e979c, -0.6, 0, 'hub'), 'hub');
  tagPart(rod(input, 0.015, 0.3, 0x8e979c, -0.45, 0, 0), 'inputShaft');
  gear(input, 0.04, 0.03, 0x8e979c, -0.32, 0, 0, 'x', 'constantGear');
  box(input, 0.012, 0.012, 0.035, 0xd40000, -0.32, 0.04, 0);
  gear(cnt, 0.08, 0.03, 0x8e979c, -0.32, 0, 0, 'x', 'counterGear');
  gear(cnt, 0.04, 0.03, 0x8e979c, -0.2, 0, 0, 'x', 'counterGear');
  tagPart(rod(cnt, 0.012, 0.2, 0x8e979c, -0.26, 0, 0), 'counterShaft');
  gear(out, 0.08, 0.03, 0xd7dde0, -0.2, 0, 0, 'x', 'drivenGear');
  tagPart(rod(out, 0.015, 0.2, 0x8e979c, -0.1, 0, 0), 'outputShaft');
  tagPart(box(world, 0.3, 0.3, 0.22, 0xb0b8bd, -0.26, -0.05, 0, { transparent: true, opacity: 0.12, depthWrite: false }), { name: '変速機（ケース）', text: '中が見えるように透かしています。ここでは、2回の減速で 4 倍にしています（説明用）。' });
  // プロペラシャフト（自在継手の印）と、デフのピニオン → リングギヤ（向きを 90° 変える）
  tagPart(rod(out, 0.018, 0.48, 0x8e979c, 0.24, 0, 0), 'propShaft');
  box(out, 0.04, 0.012, 0.04, 0xd40000, 0.24, 0.018, 0);
  gear(out, 0.03, 0.03, 0x8e979c, CH.diffX - 0.1 - 0.01, 0, 0, 'x', 'diffPinion');
  gear(ring, 0.1, 0.025, 0xd7dde0, 0, 0, 0, 'z', 'finalGear');
  tagPart(rodZ(ring, 0.04, 0.06, 0x3c454b, 0, 0, -0.02), 'diff');
  // ドライブシャフト: 短い区切りに分けて、ねじれ（区切りごとの回り方の差）を見せる
  const segs = [];
  for (let k = 0; k < CH.segs; k++) {
    const g = new THREE.Group();
    g.position.set(CH.diffX, 0, -0.06 - (k + 0.5) * CH.axleLen / CH.segs);
    world.add(g);
    tagPart(rodZ(g, 0.016, CH.axleLen / CH.segs, 0x8e979c, 0, 0, 0), 'driveShaft');
    box(g, 0.006, 0.012, CH.axleLen / CH.segs, 0xffffff, 0, 0.018, 0);   // 白い線: ねじれると、らせんになる
    segs.push(g);
  }
  const tire = new THREE.Group();
  tire.position.set(CH.diffX, 0, -0.06 - CH.axleLen - 0.06);
  world.add(tire);
  const tm = tagPart(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 40).rotateX(Math.PI / 2), mat(0x1d1f22)), 'tire');
  tire.add(tm);
  box(tire, 0.04, 0.06, 0.11, 0xd40000, 0, 0.17, 0);
  [['フライホイール', -0.66, 0.2], ['クラッチ', -0.58, -0.2], ['変速機', -0.26, 0.17], ['プロペラシャフト', 0.24, 0.08], ['デフ', CH.diffX, 0.15], ['ドライブシャフト', CH.diffX, 0.08, -0.3], ['タイヤ', CH.diffX, 0.26, -0.6]].forEach(([s, x, y, z]) => nameTag(world, s, x, y, z || 0.12, '#ffd54f', 0.035));
  return { fly, disc, input, cnt, out, ring, segs, tire, springs, parts: { flywheel: [fly], clutch: [disc], springs, input: [input], axle: segs, tire: [tire], gears: [input, cnt, out] } };
}
// a: { eng エンジン（フライホイール）の角度、disc クラッチディスクの角度、input インプット軸の角度、twist ドライブシャフトのねじれ角（表示用に大きくした値） }
function updateChain(it, a) {
  it.fly.rotation.x = a.eng;
  it.disc.rotation.x = a.disc;
  it.input.rotation.x = a.input;
  it.cnt.rotation.x = -a.input / 2;
  it.out.rotation.x = a.input / 4;                       // 変速機で 4 分の 1 の速さ（説明用）
  const ringA = -a.input / 4 * 0.03 / 0.1;               // デフで、さらに減速
  it.ring.rotation.z = ringA;
  it.segs.forEach((g, k) => { g.rotation.z = ringA - a.twist * (k + 1) / CH.segs; });   // 先へ行くほど、ねじれが大きい
  it.tire.rotation.z = ringA - a.twist;
  // ダンパースプリングは、フライホイールとハブのねじれで縮んだように見せる
  it.springs.forEach(s => { s.scale.y = 1 - Math.max(-0.4, Math.min(0.4, (a.disc - a.input) * 2)); });
}

// ---------- 2つの円板と、ねじれる軸（ねじり振動の基本） ----------
function buildTwoMass(world) {
  const d1 = new THREE.Group(), d2 = new THREE.Group();
  world.add(d1, d2);
  tagPart(rod(d1, 1, 0.04, 0x8e979c, -0.32, 0, 0), 'inertia1');
  box(d1, 0.03, 0.05, 0.06, 0xd40000, -0.32, 0.12, 0);
  tagPart(rod(d2, 1, 0.04, 0xd7dde0, 0.32, 0, 0), 'inertia2');
  box(d2, 0.03, 0.05, 0.06, 0xd40000, 0.32, 0.12, 0);
  const segs = [];
  for (let k = 0; k < 12; k++) {
    const g = new THREE.Group();
    g.position.x = -0.3 + (k + 0.5) * 0.6 / 12;
    world.add(g);
    tagPart(rod(g, 0.02, 0.6 / 12, 0x6a737a, 0, 0, 0), 'torsionShaft');
    box(g, 0.6 / 12, 0.006, 0.012, 0xffffff, 0, 0, 0.021);
    segs.push(g);
  }
  nameTag(world, '慣性 J1', -0.32, 0.25, 0, '#ffd54f', 0.04);
  nameTag(world, '慣性 J2', 0.32, 0.25, 0, '#ffd54f', 0.04);
  nameTag(world, 'ねじれる軸（ばね k）', 0, 0.1, 0.05, '#ffd54f', 0.035);
  return { d1, d2, segs, parts: { d1: [d1], d2: [d2], shaft: segs } };
}
// r1, r2: 円板の半径（慣性の大きさで変える）、a1, a2: 角度
function updateTwoMass(it, r1, r2, a1, a2) {
  it.d1.children[0].scale.set(1, r1, r1);
  it.d2.children[0].scale.set(1, r2, r2);
  it.d1.children[1].position.y = r1 - 0.03;
  it.d2.children[1].position.y = r2 - 0.03;
  it.d1.rotation.x = a1;
  it.d2.rotation.x = a2;
  it.segs.forEach((g, k) => { g.rotation.x = a1 + (a2 - a1) * (k + 0.5) / it.segs.length; });
}

// ---------- デュアルマスフライホイール（DMF） ----------
// エンジン側のプライマリーと、クラッチ側のセカンダリーの間に、円弧の長いばね（アークスプリング）が入っている
function buildDmf(world, dmf) {
  const pri = new THREE.Group(), sec = new THREE.Group();
  world.add(pri, sec);
  tagPart(rod(pri, 0.15, 0.025, 0x8e979c, -0.05, 0, 0), dmf ? 'dmfPrimary' : 'flywheel');
  box(pri, 0.02, 0.03, 0.03, 0xd40000, -0.05, 0.13, 0);
  tagPart(rod(pri, 0.025, 0.2, 0x6a737a, -0.18, 0, 0), 'crank');
  if (dmf) {
    tagPart(rod(sec, 0.12, 0.022, 0xd7dde0, 0.06, 0, 0), 'dmfSecondary');
    box(sec, 0.02, 0.03, 0.03, 0x3b8fd6, 0.06, 0.1, 0);
    [0, Math.PI].forEach(a0 => {   // アークスプリング 2本
      const pts = [];
      for (let k = 0; k <= 60; k++) { const a = a0 + 0.3 + k / 60 * 2.4, b = k / 60 * Math.PI * 2 * 9; pts.push(new THREE.Vector3(0.005 + 0.008 * Math.sin(b), (0.115 + 0.008 * Math.cos(b)) * Math.cos(a), (0.115 + 0.008 * Math.cos(b)) * Math.sin(a))); }
      const s = tagPart(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, 0.003, 5), mat(0xd40000)), 'arcSpring');
      pri.add(s);
    });
  } else tagPart(rod(sec, 0.11, 0.012, 0x7a5c2e, 0.04, 0, 0), 'clutchDisc');
  tagPart(rod(sec, 0.015, 0.25, 0x8e979c, 0.2, 0, 0), 'inputShaft');
  nameTag(world, dmf ? 'プライマリー（エンジン側）' : 'フライホイール（1枚）', -0.1, 0.22, 0.05, '#ffd54f', 0.03);
  nameTag(world, dmf ? 'セカンダリー（クラッチ・変速機側）' : 'クラッチ・変速機側', 0.16, 0.18, 0.05, '#7fc8f8', 0.03);
  return { pri, sec, parts: { primary: [pri], secondary: [sec] } };
}
