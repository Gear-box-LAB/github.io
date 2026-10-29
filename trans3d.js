// trans3d.js: テーマ「トランスミッションの種類」の 3D（歯車、軸、プーリー、ディスク）
// study3d.js の box / rod / mat / label / sizeLabel と、partinfo.js の tagPart を使う
// どの build も、{ parts: { 印の名前: [物] }, ... } を返す（parts は数式の考え方の印で光らせる部品）

const STEEL = 0x8e979c, DARK = 0x3c454b, BRASS = 0xc9a24a, ALU = 0xd7dde0;
const GLOW = { power: 0xf0a81c, pre: 0x3b8fd6, brake: 0xd40000 };

// 歯車の形（軸は z）。r: 歯の真ん中の半径、teeth: 歯数、w: 幅
function gearShape(r, teeth) {
  const d = Math.min(0.008, Math.max(0.003, r * 0.1)), pts = [];
  for (let k = 0; k < teeth * 4; k++) {
    const a = k / (teeth * 4) * Math.PI * 2;
    const rr = k % 4 < 2 ? r + d / 2 : r - d / 2;   // 歯の山と谷
    pts.push(new THREE.Vector2(rr * Math.cos(a), rr * Math.sin(a)));
  }
  return new THREE.Shape(pts);
}
const extrude = (shape, w) => new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -w / 2);
// 歯車（axis: 'x' なら軸を左右に向ける）。回すときは、軸 x なら rotation.x、軸 z なら rotation.z
function gear(parent, r, w, color, x, y, z, axis, key) {
  const geo = extrude(gearShape(r, Math.max(10, Math.round(r / 0.0045))), w);
  if (axis === 'x') geo.rotateY(Math.PI / 2);
  const m = tagPart(new THREE.Mesh(geo, mat(color)), key || 'gear');
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
// 内歯車（リングギヤ）: 内側に歯がある輪。軸は z
function ringGear(parent, rIn, rOut, w, color, key) {
  const shape = new THREE.Shape().absarc(0, 0, rOut, 0, Math.PI * 2);
  const teeth = Math.round(rIn / 0.0045), d = 0.006, pts = [];
  for (let k = teeth * 4; k > 0; k--) {   // 穴は逆回りに点を並べる
    const a = k / (teeth * 4) * Math.PI * 2;
    const rr = k % 4 < 2 ? rIn - d / 2 : rIn + d / 2;
    pts.push(new THREE.Vector2(rr * Math.cos(a), rr * Math.sin(a)));
  }
  shape.holes.push(new THREE.Path(pts));
  const m = tagPart(new THREE.Mesh(extrude(shape, w), mat(color)), key);
  parent.add(m);
  return m;
}
// 輪（軸は x）。スリーブ、ハブ、クラッチの板などに使う
function ringX(parent, rIn, rOut, w, color, x, y, key, extra) {
  const shape = new THREE.Shape().absarc(0, 0, rOut, 0, Math.PI * 2);
  shape.holes.push(new THREE.Path().absarc(0, 0, rIn, 0, Math.PI * 2, true));
  const m = tagPart(new THREE.Mesh(extrude(shape, w).rotateY(Math.PI / 2), mat(color, extra)), key);
  m.position.set(x, y, 0);
  parent.add(m);
  return m;
}
// 軸が z 向きの丸棒
function rodZ(parent, r, len, color, x, y, z, key) {
  const m = tagPart(rod(parent, r, len, color, 0, 0, 0), key);
  m.geometry.rotateY(Math.PI / 2);
  m.position.set(x, y, z);
  return m;
}
// 3D の札（名前）
function nameTag(parent, text, x, y, z, color, h) {
  const t = label(text, color || '#ffd54f');
  sizeLabel(t, h || 0.03);
  t.position.set(x, y, z);
  parent.add(t);
  return t;
}
// 力が通っている部品を光らせる（color: 光の色、0 で消す）
function glow(list, color) {
  list.forEach(o => o.traverse(x => { if (x.material && x.material.emissive) x.material.emissive.setHex(color || 0).multiplyScalar(color ? 0.5 : 1); }));
}

// ---------- 平行軸歯車式（MT、AMT、ドグミッション） ----------
// 上の軸: インプット軸（左）とアウトプット軸（右、同じ線の上）。下の軸: カウンタ軸
// 1速〜6速の歯車の組。アウトプット軸の歯車は軸の上で空回りし、スリーブで軸につないだ段だけが力を伝える
const PAR = { D: 0.14, yMain: 0.07, inR: 0.06, cntR: 0.08, xs: [-0.18, -0.06, 0.06, 0.18, 0.30, 0.42], sleeves: [-0.12, 0.12, 0.36] };
function buildParallel(world, opt) {
  const y0 = PAR.yMain, y1 = PAR.yMain - PAR.D;
  const inShaft = new THREE.Group(), outShaft = new THREE.Group(), cnt = new THREE.Group();
  inShaft.position.y = outShaft.position.y = y0;
  cnt.position.y = y1;
  world.add(inShaft, outShaft, cnt);
  rod(inShaft, 0.012, 0.3, STEEL, -0.43, 0, 0).userData.part = 'inputShaft';
  rod(outShaft, 0.012, 0.8, STEEL, 0.14, 0, 0).userData.part = 'outputShaft';
  rod(cnt, 0.012, 0.86, STEEL, -0.01, 0, 0).userData.part = 'counterShaft';
  const parts = { input: [], counter: [], pairs: [], sleeves: [], clutch: [], actuators: [] };
  // クラッチの板（エンジンとのつなぎ目）
  parts.clutch.push(ringX(inShaft, 0.014, 0.1, 0.012, DARK, -0.56, 0, 'clutchDisc'));
  // 常時かみ合いの1組（インプット軸 → カウンタ軸）
  parts.input.push(gear(inShaft, PAR.inR, 0.03, STEEL, -0.35, 0, 0, 'x', 'constantGear'));
  parts.counter.push(gear(cnt, PAR.cntR, 0.03, STEEL, -0.35, 0, 0, 'x', 'constantGear'));
  // 1速〜6速の組: 変速比 i = (カウンタ ÷ インプット) × (アウトプット側 ÷ カウンタ側)
  const k0 = PAR.cntR / PAR.inR;
  const driven = GEARS.map((g, k) => {
    const q = g[1] / k0, rc = PAR.D / (1 + q), ro = PAR.D * q / (1 + q);
    gear(cnt, rc, 0.03, STEEL, PAR.xs[k], 0, 0, 'x', 'counterGear');
    const free = new THREE.Group();   // アウトプット軸の上で空回りする歯車と、そのドグ歯
    free.position.set(PAR.xs[k], y0, 0);
    world.add(free);
    gear(free, ro, 0.03, ALU, 0, 0, 0, 'x', 'drivenGear');
    const side = k % 2 ? -1 : 1;   // スリーブの側
    if (opt.dog) for (let j = 0; j < 4; j++) {   // ドグ（大きな爪が4つ）
      const a = j / 4 * Math.PI * 2;
      tagPart(box(free, 0.012, 0.012, 0.012, DARK, side * 0.021, 0.022 * Math.cos(a), 0.022 * Math.sin(a)), 'dogTeeth');
    } else {
      ringX(free, 0.013, 0.029, 0.012, DARK, side * 0.021, 0, 'dogTeeth');           // ドグ歯（スリーブの内側にかみ合う）
      ringX(free, 0.014, 0.027, 0.006, BRASS, side * 0.031, 0, 'syncRing');          // シンクロナイザリング
    }
    nameTag(world, g[0], PAR.xs[k], y0 + ro + 0.03, 0, '#dfe6e9', 0.025);
    const pair = { k, rc, ro, free, ratio: g[1] };
    parts.pairs.push(pair);
    return pair;
  });
  // ハブ（軸に固定）とスリーブ（左右に滑る）
  const sleeves = PAR.sleeves.map(x => {
    ringX(outShaft, 0.012, 0.03, 0.02, STEEL, x, 0, 'hub');
    const s = ringX(world, 0.03, 0.042, 0.025, opt.dog ? 0x55656e : DARK, x, y0, opt.dog ? 'dogRing' : 'sleeve');
    if (opt.dog) for (let j = 0; j < 4; j++) [-1, 1].forEach(side => {   // ドグリングの両側の爪
      const a = j / 4 * Math.PI * 2 + Math.PI / 4;
      box(s, 0.01, 0.01, 0.01, 0x55656e, side * 0.016, 0.036 * Math.cos(a), 0.036 * Math.sin(a));
    });
    return s;
  });
  parts.sleeves = sleeves;
  if (opt.amt) {   // AMT: クラッチと変速を動かすアクチュエーター
    parts.actuators.push(tagPart(box(world, 0.08, 0.05, 0.05, 0x2b2f33, -0.56, 0.22, 0), 'clutchActuator'));
    parts.actuators.push(tagPart(box(world, 0.5, 0.05, 0.05, 0x2b2f33, 0.12, 0.24, 0), 'shiftActuator'));
    PAR.sleeves.forEach(x => box(world, 0.008, 0.12, 0.008, STEEL, x, 0.16, 0));   // シフトフォークへの棒
    nameTag(world, 'クラッチアクチュエーター', -0.56, 0.28, 0);
    nameTag(world, '変速アクチュエーター', 0.12, 0.3, 0);
  }
  nameTag(world, 'インプット軸（エンジンから）', -0.38, y0 + 0.09, 0.03);
  nameTag(world, 'アウトプット軸（タイヤへ）', 0.4, y0 + 0.12, 0.03);
  nameTag(world, 'カウンタ軸', -0.2, y1 - 0.13, 0.03);
  return { inShaft, outShaft, cnt, driven, sleeves, parts: { constant: parts.input.concat(parts.counter), sleeve: sleeves, clutch: parts.clutch, actuator: parts.actuators }, angleIn: 0, angleOut: 0, sleevePos: [0, 0, 0] };
}
// 回す: wIn インプット軸の速さ、gear 今かみ合っている段（0 = N、1〜6）、sleeveTarget 各スリーブの行き先（−1 左、0 中、+1 右）
function updateParallel(it, dt, wIn, gearNow, sleeveTarget, clutchOn) {
  it.angleIn += wIn * dt;
  it.inShaft.rotation.x = it.angleIn;
  it.cnt.rotation.x = -it.angleIn * PAR.inR / PAR.cntR;
  it.driven.forEach(p => { p.free.rotation.x = it.angleIn / p.ratio; });   // 空回りの歯車は、それぞれの比の速さで回る
  if (gearNow) it.angleOut = it.driven[gearNow - 1].free.rotation.x;
  it.outShaft.rotation.x = it.angleOut;
  it.sleeves.forEach((s, j) => {
    it.sleevePos[j] += (sleeveTarget[j] * 0.025 - it.sleevePos[j]) * Math.min(1, dt * 10);
    s.position.x = PAR.sleeves[j] + it.sleevePos[j];
    s.rotation.x = it.angleOut;
  });
  // 力が通っている所を光らせる: 常時かみ合いの組 → その段の組 → スリーブ
  glow(it.parts.constant.concat(it.parts.clutch), clutchOn && gearNow ? GLOW.power : 0);
  it.driven.forEach(p => glow([p.free], p.k + 1 === gearNow ? GLOW.power : 0));
  glow(it.sleeves, 0);
  if (gearNow) glow([it.sleeves[Math.floor((gearNow - 1) / 2)]], GLOW.power);
}
// 段 → スリーブの行き先（1,3,5 は右のスリーブが左へ…ではなく、各組の歯車のある側へ）
function sleeveFor(g) {
  const t = [0, 0, 0];
  if (g) t[Math.floor((g - 1) / 2)] = (g - 1) % 2 ? 1 : -1;
  return t;
}

// ---------- デュアルクラッチ（DCT） ----------
// 内側の軸（奇数段 1・3、クラッチ K1）と、外側の中空の軸（偶数段 2・4、クラッチ K2）。下の軸がアウトプット
const DCT = { D: 0.14, x: { 2: -0.33, 4: -0.21, 1: 0.0, 3: 0.12 }, sleeves: { even: -0.27, odd: 0.06 } };
function buildDct(world) {
  const y0 = 0.07, y1 = y0 - DCT.D;
  const inner = new THREE.Group(), outer = new THREE.Group(), out = new THREE.Group();
  inner.position.y = outer.position.y = y0;
  out.position.y = y1;
  world.add(inner, outer, out);
  tagPart(rod(inner, 0.011, 0.78, STEEL, -0.16, 0, 0), 'innerShaft');
  tagPart(rod(outer, 0.02, 0.26, 0x6a737a, -0.33, 0, 0), 'outerShaft');
  tagPart(rod(out, 0.012, 0.86, STEEL, -0.06, 0, 0), 'outputShaft');
  const drum = ringX(world, 0.02, 0.13, 0.015, DARK, -0.6, y0, 'clutchDrum');
  const k1 = ringX(inner, 0.011, 0.11, 0.01, 0x7a5c2e, -0.56, 0, 'k1');
  const k2 = ringX(outer, 0.02, 0.11, 0.01, 0x2e5c7a, -0.52, 0, 'k2');
  const pairs = {};
  [1, 2, 3, 4].forEach(g => {
    const q = GEARS[g - 1][1], rd = DCT.D / (1 + q), ro = DCT.D * q / (1 + q);
    gear(g % 2 ? inner : outer, rd, 0.03, STEEL, DCT.x[g], 0, 0, 'x', g % 2 ? 'oddGear' : 'evenGear');
    const free = new THREE.Group();
    free.position.set(DCT.x[g], y1, 0);
    world.add(free);
    gear(free, ro, 0.03, ALU, 0, 0, 0, 'x', 'drivenGear');
    const side = (g === 2 || g === 1) ? 1 : -1;
    ringX(free, 0.013, 0.029, 0.012, DARK, side * 0.021, 0, 'dogTeeth');
    nameTag(world, `${g}速`, DCT.x[g], y1 - ro - 0.03, 0, '#dfe6e9', 0.025);
    pairs[g] = { g, ro, free };
  });
  [DCT.sleeves.even, DCT.sleeves.odd].forEach(x => ringX(out, 0.012, 0.03, 0.02, STEEL, x, 0, 'hub'));
  const sleeves = { even: ringX(world, 0.03, 0.042, 0.025, DARK, DCT.sleeves.even, y1, 'sleeve'), odd: ringX(world, 0.03, 0.042, 0.025, DARK, DCT.sleeves.odd, y1, 'sleeve') };
  nameTag(world, 'K1（奇数段のクラッチ）', -0.56, y0 + 0.15, 0.02, '#f0a81c');
  nameTag(world, 'K2（偶数段のクラッチ）', -0.5, y0 + 0.19, 0.02, '#7fc8f8');
  nameTag(world, '内側の軸: 1速・3速', 0.08, y0 + 0.13, 0.03);
  nameTag(world, '外側の中空の軸: 2速・4速', -0.28, y0 + 0.15, 0.03);
  nameTag(world, 'アウトプット軸（タイヤへ）', 0.3, y1 - 0.04, 0.03);
  return { inner, outer, out, drum, k1, k2, pairs, sleeves, sleevePos: { even: 0, odd: 0 }, angle: { inner: 0, outer: 0, out: 0 },
    parts: { k1: [k1], k2: [k2], inner: [inner], outer: [outer] } };
}

// ---------- 遊星歯車（AT、ハイブリッドの動力分割） ----------
// 正面から見る（軸は z）。サンギヤ（中心）、プラネタリギヤ 3つ（キャリアで支える）、リングギヤ（外側の内歯車）
const PLA = { Zs: 30, Zp: 21, Zr: 72, rs: 0.05, rp: 0.035, orbit: 0.085, rr: 0.12 };
function buildPlanetary(world, hybrid) {
  const sun = new THREE.Group(), carrier = new THREE.Group(), ring = new THREE.Group();
  world.add(sun, carrier, ring);
  gear(sun, PLA.rs, 0.03, BRASS, 0, 0, 0, 'z', 'sunGear');
  box(sun, 0.012, 0.03, 0.035, 0xd40000, 0, PLA.rs - 0.012, 0);   // 回り方が見える印
  rodZ(sun, 0.012, 0.22, STEEL, 0, 0, 0.11, 'sunGear');
  tagPart(rodZ(carrier, 0.1, 0.012, 0x6a737a, 0, 0, -0.03), 'carrier');   // キャリアの板（奥）
  rodZ(carrier, 0.016, 0.16, STEEL, 0, 0, -0.11, 'carrier');
  const planets = [0, 1, 2].map(j => {
    const a = j / 3 * Math.PI * 2, p = new THREE.Group();
    p.position.set(PLA.orbit * Math.cos(a), PLA.orbit * Math.sin(a), 0);
    carrier.add(p);
    gear(p, PLA.rp, 0.026, STEEL, 0, 0, 0, 'z', 'planetGear');
    box(p, 0.008, 0.02, 0.03, 0xd40000, 0, PLA.rp - 0.01, 0);
    rodZ(carrier, 0.006, 0.04, STEEL, p.position.x, p.position.y, -0.015, 'carrier');   // ピン
    return p;
  });
  ringGear(ring, PLA.rr, PLA.rr + 0.025, 0.03, DARK, 'plRing');
  box(ring, 0.012, 0.02, 0.035, 0xd40000, 0, PLA.rr + 0.015, 0);
  // 止める（ブレーキ）を表す赤いつかみ: それぞれの要素のそば
  const brakes = {
    ring: tagPart(box(world, 0.06, 0.03, 0.05, DARK, 0, PLA.rr + 0.045, 0), 'brake'),
    sun: tagPart(box(world, 0.03, 0.025, 0.03, DARK, 0, 0.026, 0.2), 'brake'),
    carrier: tagPart(box(world, 0.05, 0.03, 0.03, DARK, 0, 0.035, -0.15), 'brake')
  };
  const it = { sun, carrier, ring, planets, brakes, angle: { s: 0, c: 0, r: 0, p: 0 }, parts: { sun: [sun], carrier: [carrier], ring: [ring], planets } };
  it.tags = { s: nameTag(world, '', 0, -0.03, 0.05), c: nameTag(world, '', 0, PLA.rr + 0.09, 0.03), r: nameTag(world, '', 0, -PLA.rr - 0.06, 0.03) };
  if (hybrid) {
    tagPart(rodZ(world, 0.045, 0.06, DARK, 0, 0, 0.17), 'mg1').material.setValues({ transparent: true, opacity: 0.45, depthWrite: false });
    nameTag(world, 'MG1（発電機）', 0, 0.075, 0.17);
    const mg2 = new THREE.Group();
    mg2.position.set(PLA.rr + 0.025 + 0.04 + 0.004, 0, 0);
    world.add(mg2);
    gear(mg2, 0.04, 0.03, STEEL, 0, 0, 0, 'z', 'mg2');
    tagPart(rodZ(mg2, 0.05, 0.08, DARK, 0, 0, -0.07), 'mg2');
    const outG = new THREE.Group();
    outG.position.set(-(PLA.rr + 0.025 + 0.04 + 0.004), 0, 0);
    world.add(outG);
    gear(outG, 0.04, 0.03, ALU, 0, 0, 0, 'z', 'counterDrive');
    const outer = gearShape(PLA.rr + 0.025, 40);
    outer.holes.push(new THREE.Path().absarc(0, 0, PLA.rr + 0.005, 0, Math.PI * 2, true));
    const outerTeeth = tagPart(new THREE.Mesh(extrude(outer, 0.02), mat(DARK)), 'plRing');   // リングの外側の歯（MG2 と出力へ）
    outerTeeth.position.z = 0.026;
    ring.add(outerTeeth);
    Object.assign(it, { mg2, outG });
    nameTag(world, 'MG2（モーター）', mg2.position.x, -0.08, 0.05);
    nameTag(world, 'タイヤへ', outG.position.x, -0.08, 0.05);
  }
  return it;
}
// w: { s, c, r } 各要素の角速度（表示用）。プラネタリギヤの自転は、キャリアから見た関係で決まる
function updatePlanetary(it, dt, w) {
  it.angle.s += w.s * dt; it.angle.c += w.c * dt; it.angle.r += w.r * dt;
  it.angle.p += -(w.s - w.c) * PLA.Zs / PLA.Zp * dt;
  it.sun.rotation.z = it.angle.s;
  it.carrier.rotation.z = it.angle.c;
  it.ring.rotation.z = it.angle.r;
  it.planets.forEach(p => { p.rotation.z = it.angle.p; });
  if (it.mg2) { it.mg2.rotation.z = -it.angle.r * (PLA.rr + 0.025) / 0.04; it.outG.rotation.z = -it.angle.r * (PLA.rr + 0.025) / 0.04; }
}

// ---------- ベルト式 CVT ----------
// 正面から見る（軸は z）。左がプライマリー（エンジン側）、右がセカンダリー（タイヤ側）のプーリー
const CVT = { d: 0.36, R: 0.13, tip: 0.02, h: 0.06 };
const coneGap = r => (CVT.R - r) * CVT.h / (CVT.R - CVT.tip);   // ベルトが半径 r に来るときの、円すいの底から溝の真ん中までの距離
function buildCvt(world) {
  const pulleys = [-CVT.d / 2, CVT.d / 2].map((x, j) => {
    const g = new THREE.Group();
    g.position.x = x;
    world.add(g);
    const fixed = tagPart(new THREE.Mesh(new THREE.CylinderGeometry(CVT.tip, CVT.R, CVT.h, 48).rotateX(Math.PI / 2), mat(STEEL)), 'sheaveFixed');
    const move = tagPart(new THREE.Mesh(new THREE.CylinderGeometry(CVT.R, CVT.tip, CVT.h, 48).rotateX(Math.PI / 2), mat(ALU, { transparent: true, opacity: 0.55, depthWrite: false })), 'sheaveMove');
    g.add(fixed, move);
    box(fixed, 0.02, 0.03, 0.01, 0xd40000, 0, CVT.R - 0.02, -CVT.h / 2);   // 回り方の印
    rodZ(g, 0.012, 0.3, STEEL, 0, 0, 0, j ? 'secondaryShaft' : 'primaryShaft');
    return { g, fixed, move };
  });
  nameTag(world, 'プライマリープーリー（エンジンから）', -CVT.d / 2, CVT.R + 0.05, 0.05);
  nameTag(world, 'セカンダリープーリー（タイヤへ）', CVT.d / 2, CVT.R + 0.05, 0.05);
  return { pulleys, belt: null, beltKey: '', angle: [0, 0], parts: { primary: [pulleys[0].g], secondary: [pulleys[1].g] } };
}
// ベルトの通り道: 2つの円（半径 r1、r2、中心の距離 d）にかかる、外側の接線と円弧
function beltPath(r1, r2) {
  const d = CVT.d, b = Math.asin((r1 - r2) / d), pts = [];
  const arc = (cx, r, a0, a1) => { for (let k = 0; k <= 24; k++) { const a = a0 + (a1 - a0) * k / 24; pts.push(new THREE.Vector3(cx + r * Math.cos(a), r * Math.sin(a), 0)); } };
  arc(-d / 2, r1, Math.PI / 2 + b, 3 * Math.PI / 2 - b);
  arc(d / 2, r2, -Math.PI / 2 - b, Math.PI / 2 + b);
  return new THREE.CatmullRomCurve3(pts, true);
}
// ベルトの長さを一定に保つ半径（r1: プライマリー、変速比 i = r2 / r1）
function beltRadii(i) {
  const len = (r1, r2) => Math.PI * (r1 + r2) + 2 * CVT.d + (r1 - r2) ** 2 / CVT.d;
  const L = len(0.07, 0.07);
  let r1 = 0.07;
  for (let k = 0; k < 40; k++) r1 += (L - len(r1, r1 * i)) / (Math.PI * (1 + i) * 2);
  return [r1, r1 * i];
}
function updateCvt(it, dt, i, w1) {
  const [r1, r2] = beltRadii(i);
  const key = i.toFixed(3);
  if (key !== it.beltKey) {   // 比が変わったら、ベルトをつくり直す
    if (it.belt) { it.belt.parent.remove(it.belt); it.belt.geometry.dispose(); }
    it.belt = tagPart(new THREE.Mesh(new THREE.TubeGeometry(beltPath(r1, r2), 160, 0.009, 8, true), mat(0x6a737a)), 'belt');
    it.pulleys[0].g.parent.add(it.belt);
    it.beltKey = key;
  }
  [r1, r2].forEach((r, j) => {
    const p = it.pulleys[j], gap = coneGap(r);
    p.fixed.position.z = CVT.h / 2 - gap - 0.008;   // 円すいの面が、半径 r の所でベルトの両側に触れる位置
    p.move.position.z = gap - CVT.h / 2 + 0.008;
  });
  it.angle[0] += w1 * dt;
  it.angle[1] += w1 / i * dt;
  it.pulleys[0].g.rotation.z = -it.angle[0];
  it.pulleys[1].g.rotation.z = -it.angle[1];
  return [r1, r2];
}

// ---------- トロイダル CVT ----------
// 軸は x。左の入力ディスクと右の出力ディスクの、くぼんだ面の間に、パワーローラーが2つはさまる
const TOR = { c: 0.08, rho: 0.06 };
function torDiscGeo(side) {   // くぼんだ面（ドーナツの内側の形）を持つ円板。side = −1 左、+1 右
  // 面は、半径 c の所を中心とする半径 ρ の円（ドーナツの断面）の半分
  const pts = [new THREE.Vector2(0.012, side * (TOR.rho + 0.03))];
  for (let k = 0; k <= 20; k++) {
    const t = -1.25 + 2.5 * k / 20;
    pts.push(new THREE.Vector2(TOR.c + TOR.rho * Math.sin(t), side * TOR.rho * Math.cos(t)));
  }
  pts.push(new THREE.Vector2(TOR.c + TOR.rho * Math.sin(1.25) + 0.005, side * (TOR.rho + 0.03)));
  const g = new THREE.LatheGeometry(side < 0 ? pts : pts.slice().reverse(), 64);
  g.rotateZ(-Math.PI / 2);   // 回転の軸を x に
  return g;
}
function buildToroidal(world) {
  const discs = [-1, 1].map(side => {
    const g = new THREE.Group();
    world.add(g);
    const m = tagPart(new THREE.Mesh(torDiscGeo(side), mat(side < 0 ? STEEL : ALU, { side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false })), side < 0 ? 'torInput' : 'torOutput');
    g.add(m);
    box(g, 0.01, 0.02, 0.02, 0xd40000, side * (TOR.rho + 0.02), TOR.c + TOR.rho + 0.01, 0);
    rod(g, 0.012, 0.25, STEEL, side * 0.2, 0, 0);
    return g;
  });
  const rollers = [1, -1].map(s => {
    const tilt = new THREE.Group();
    tilt.position.y = s * TOR.c;
    world.add(tilt);
    const spin = new THREE.Group();
    tilt.add(spin);
    const m = tagPart(new THREE.Mesh(new THREE.CylinderGeometry(TOR.rho - 0.002, TOR.rho - 0.002, 0.02, 48), mat(BRASS)), 'powerRoller');
    spin.add(m);
    box(spin, 0.02, 0.022, 0.01, 0xd40000, TOR.rho - 0.012, 0, 0);
    return { tilt, spin, s };
  });
  nameTag(world, '入力ディスク（エンジンから）', -0.12, TOR.c + TOR.rho + 0.07, 0);
  nameTag(world, '出力ディスク（タイヤへ）', 0.12, TOR.c + TOR.rho + 0.07, 0);
  nameTag(world, 'パワーローラー', 0, -TOR.c - TOR.rho - 0.05, 0.05);
  return { discs, rollers, angle: [0, 0, 0], parts: { rollers: rollers.map(r => r.spin), input: [discs[0]], output: [discs[1]] } };
}
// 変速比 i = r_out / r_in から、ローラーの傾き φ を決める（r_in = c + ρ sinφ、r_out = c − ρ sinφ）
const torSin = i => TOR.c * (1 - i) / (TOR.rho * (1 + i));
function updateToroidal(it, dt, i, w1) {
  const s = Math.max(-0.9, Math.min(0.9, torSin(i))), phi = Math.asin(s);
  const rIn = TOR.c + TOR.rho * s, rOut = TOR.c - TOR.rho * s;
  it.angle[0] += w1 * dt;
  it.angle[1] -= w1 * rIn / rOut * dt;            // 出力ディスクは逆向きに回る
  it.angle[2] += w1 * rIn / TOR.rho * dt;         // ローラーの自転
  it.discs[0].rotation.x = it.angle[0];
  it.discs[1].rotation.x = it.angle[1];
  it.rollers.forEach(r => {
    r.tilt.rotation.z = -r.s * phi;   // 上と下のローラーは、逆向きに傾く
    r.spin.rotation.y = it.angle[2] * r.s;
  });
  return [rIn, rOut];
}

// ---------- 電気自動車の1段減速機 ----------
// モーター → 小さい歯車 → 中間軸の大きい歯車 → 中間軸の小さい歯車 → デフのリングギヤ（2回の減速）
const EV = { p1: 0.03, g1: 0.09, p2: 0.035, g2: 0.11 };
function buildEv(world) {
  const yM = 0.2, yI = yM - (EV.p1 + EV.g1), yF = yI - (EV.p2 + EV.g2);
  const motor = new THREE.Group(), mid = new THREE.Group(), fin = new THREE.Group();
  motor.position.y = yM; mid.position.y = yI; fin.position.y = yF;
  world.add(motor, mid, fin);
  tagPart(rod(world, 0.08, 0.26, DARK, 0.3, yM, 0), 'stator').material.setValues({ transparent: true, opacity: 0.3, depthWrite: false });
  tagPart(rod(motor, 0.06, 0.22, 0xb87333, 0.3, 0, 0), 'rotor');
  box(motor, 0.04, 0.02, 0.122, 0xd40000, 0.3, 0.05, 0);
  rod(motor, 0.01, 0.42, STEEL, 0.1, 0, 0);
  gear(motor, EV.p1, 0.03, STEEL, 0.1, 0, 0, 'x', 'evPinion');
  rod(mid, 0.012, 0.2, STEEL, 0.05, 0, 0);
  gear(mid, EV.g1, 0.03, ALU, 0.1, 0, 0, 'x', 'evIdler');
  gear(mid, EV.p2, 0.03, STEEL, 0.0, 0, 0, 'x', 'evIdler');
  gear(fin, EV.g2, 0.03, ALU, 0.0, 0, 0, 'x', 'finalGear');
  tagPart(rod(fin, 0.05, 0.08, DARK, -0.06, 0, 0), 'diff');
  [-1, 1].forEach(s => tagPart(rod(fin, 0.012, 0.3, STEEL, -0.06 + s * 0.19, 0, 0), 'driveShaft'));
  nameTag(world, 'モーター', 0.3, yM + 0.12, 0);
  nameTag(world, '中間軸', 0.05, yI + 0.12, 0.05);
  nameTag(world, 'デフ → 左右のタイヤ', -0.06, yF - 0.14, 0.05);
  return { motor, mid, fin, angle: 0, parts: { motor: [motor], gears: [motor, mid, fin] } };
}
function updateEv(it, dt, wMotor) {
  it.angle += wMotor * dt;
  it.motor.rotation.x = it.angle;
  it.mid.rotation.x = -it.angle * EV.p1 / EV.g1;
  it.fin.rotation.x = it.angle * EV.p1 / EV.g1 * EV.p2 / EV.g2;
}
