// trans.js: CAR STUDY LAB「トランスミッションの種類」
// 1. MT  2. AMT  3. DCT  4. トルコン AT（遊星歯車）  5. ベルト式 CVT  6. トロイダル CVT  7. ハイブリッドの動力分割  8. 電気自動車の減速機  9. ドグミッション
// 3D は trans3d.js、エンジンと車の値は study.js（ほかのテーマと同じ車）

const P = { cvt: 1.5, tor: 1.0, eng: 2000, kmh: 60, evKmh: 60 };   // スライダーで変える値
const W_IN = 2;            // 3D のインプット軸の速さ（表示用、rad/s）
const ENGINE_RPM = 3000;   // 数式の例に使うエンジン回転数
const fmtI = v => n2(Number(v));

// ---------- 変速の途中を時間で進める（AMT、DCT、ドグ） ----------
// steps: [[かかる時間, 名前]]。shift.k: 今の段階、shift.t: その段階に入ってからの時間
function newShift(steps, from, to) { return { steps, k: 0, t: 0, from, to, total: 0 }; }
function tickShift(s, dt) {
  if (!s) return null;
  s.t += dt;
  s.total += dt;
  while (s.k < s.steps.length && s.t >= s.steps[s.k][0]) { s.t -= s.steps[s.k][0]; s.k += 1; }
  return s.k >= s.steps.length ? null : s;
}
const shiftStep = s => (s ? s.steps[s.k][1] : '');

// ---------- 変速の間の駆動力（説明用の目安、1速 → 2速） ----------
const SHIFT_CURVES = [
  ['MT', '#dfe6e9', [[0, 6], [0.3, 6], [0.35, 0], [0.85, 0], [1.1, 3.5], [2, 3.5]]],
  ['AMT', '#e57373', [[0, 6], [0.3, 6], [0.4, 0], [1.15, 0], [1.5, 3.5], [2, 3.5]]],
  ['DCT', '#7fc8f8', [[0, 6], [0.3, 6], [0.45, 3.5], [2, 3.5]]],
  ['トルコン AT', '#8fd694', [[0, 6], [0.3, 6], [0.45, 4.2], [0.6, 3.0], [0.8, 3.5], [2, 3.5]]],
  ['ドグ', '#f0a81c', [[0, 6], [0.3, 6], [0.32, 0], [0.37, 0], [0.42, 3.5], [2, 3.5]]],
  ['IST', '#b39ddb', [[0, 6], [0.3, 6], [0.33, 5.0], [0.38, 3.2], [0.45, 3.5], [2, 3.5]]]
];
function shiftChart(name) {
  return {
    xLabel: '時間 (秒)、0.3 秒で変速を始める', yLabel: 'タイヤの駆動力 (kN)', xMax: 2, xStep: 0.25, yMax: 7, yStep: 1,
    series: SHIFT_CURVES.map(([n, c, pts]) => ({ name: n, color: n === name ? c : 'rgba(223,230,233,0.25)', points: pts, width: n === name ? 4 : 1.5 }))
  };
}
// 車速とエンジン回転数の線（段ごとに1本）。ratios: 変速比の一覧、now: 今の比（太くする）
function ratioChart(ratios, now, names) {
  return {
    xLabel: '車速 (km/h)', yLabel: 'エンジン回転数 (rpm)', xMax: 240, xStep: 40, yMax: 8000, yStep: 1000,
    series: ratios.map((i, k) => ({ name: names ? names[k] : '', color: Math.abs(i - now) < 1e-6 ? '#f0a81c' : 'rgba(223,230,233,0.35)',
      points: sample(240, v => v / 3.6 / CAR.tire * i * CAR.final / RPM, 2).filter(([, n]) => n <= 8000), width: Math.abs(i - now) < 1e-6 ? 4 : 1.5 }))
      .concat([{ name: '', color: 'rgba(229,115,115,0.8)', points: [[0, REDLINE], [240, REDLINE]], dash: [3, 3], width: 1 }])
  };
}

// ---------- 1. MT ----------
const MT = { g: 1, clutchOff: 0 };
// ---------- 2. AMT ----------
const AMT_STEPS = [[0.5, 'クラッチを切る'], [0.5, '今の段を抜く'], [0.5, '次の段に入れる'], [0.7, 'クラッチをつなぐ']];
const AM = { g: 1, shift: null };
function amtShift(d) {
  if (AM.shift || AM.g + d < 1 || AM.g + d > 6) return;
  AM.shift = newShift(AMT_STEPS, AM.g, AM.g + d);
}
// ---------- 3. DCT ----------
const DC = { g: 1, pre: 2, shift: null, x: 0 };   // x: K1 → K2 の受け渡しの進み（0〜1）
function dctShift(d) {
  const to = DC.g + d;
  if (DC.shift || to < 1 || to > 4) return;
  if (DC.pre !== to) DC.pre = to;   // 先に入れていない段なら、ここで入れる
  DC.shift = newShift([[0.4, '次の段は、もう入っている（プリセレクト）'], [0.8, 'K1 を離しながら K2 をつなぐ（力がとぎれない）'], [0.6, 'その次の段を、空いた軸に先に入れておく']], DC.g, to);
}
// ---------- 4. AT ----------
const AT_MODES = [
  { name: '1速', in: 's', fix: 'r', out: 'c', i: 1 + PLA.Zr / PLA.Zs, text: 'サンから入れて、リングを止め、キャリアから出す' },
  { name: '2速', in: 'r', fix: 's', out: 'c', i: 1 + PLA.Zs / PLA.Zr, text: 'リングから入れて、サンを止め、キャリアから出す' },
  { name: '3速（直結）', in: 's', fix: '', out: 'c', i: 1, text: 'クラッチで2つの要素をつなぎ、全体が一緒に回る' },
  { name: 'OD（増速）', in: 'c', fix: 's', out: 'r', i: PLA.Zr / (PLA.Zr + PLA.Zs), text: 'キャリアから入れて、サンを止め、リングから出す（出力が速い）' },
  { name: 'R（後退）', in: 's', fix: 'c', out: 'r', i: -PLA.Zr / PLA.Zs, text: 'サンから入れて、キャリアを止め、リングから出す（逆に回る）' }
];
const AT = { mode: 0 };
// 入れる要素の速さ w と、止める要素から、3つの要素の速さを決める（ウィリスの式: (s − c) / (r − c) = −Zr / Zs）
function planetSpeeds(m, w) {
  const k = -PLA.Zr / PLA.Zs;
  if (!m.fix) return { s: w, c: w, r: w };
  if (m.fix === 'r') return { s: w, r: 0, c: w / (1 - k) };          // s − c = k (0 − c) → c = s / (1 − k)
  if (m.fix === 's') return m.in === 'r' ? { r: w, s: 0, c: w * k / (k - 1) } : { c: w, s: 0, r: w * (k - 1) / k };
  return { s: w, c: 0, r: w / k };                                     // キャリアを止める: s = k r
}
const elName = { s: 'サンギヤ', c: 'キャリア', r: 'リングギヤ' };
// ---------- 7. ハイブリッド ----------
const RING_PER_KMH = 40;   // 車速 1 km/h あたりのリングギヤの回転数 (rpm)（説明用）
const mg1Rpm = () => ((PLA.Zs + PLA.Zr) * P.eng - PLA.Zr * P.kmh * RING_PER_KMH) / PLA.Zs;
// ---------- 8. 電気自動車 ----------
const EV_RATIO = (EV.g1 / EV.p1) * (EV.g2 / EV.p2);
const MOTOR = { tmax: 300, pmax: 150, nmax: 16000 };   // 最大トルク N·m、最大出力 kW、最高回転数 rpm（説明用）
const motorRpm = v => v / 3.6 / CAR.tire * EV_RATIO / RPM;
const motorTorque = n => Math.min(MOTOR.tmax, MOTOR.pmax * 1000 / Math.max(1, n * RPM));
const evForce = v => (motorRpm(v) > MOTOR.nmax ? 0 : motorTorque(motorRpm(v)) * EV_RATIO * 0.95 / CAR.tire);
// ---------- 9. ドグ ----------
const DOG_STEPS = [[0.25, '点火を一瞬止めて、ドグの力を抜く'], [0.25, 'ドグが外れて、次のドグにかみ合う'], [0.25, '点火をもどす']];
const DG = { g: 1, shift: null };
function dogShift(d) {
  if (DG.shift || DG.g + d < 1 || DG.g + d > 6) return;
  DG.shift = newShift(DOG_STEPS, DG.g, DG.g + d);
}

// ---------- 10. シームレス（IST） ----------
// 4速 → 5速を、「次へ」で1つずつ動かす。インプット軸の速さは一定にして、歯車と軸の回り方の差を見せる
// a4・a5: 4速・5速のクラッチ・リングの、中立から歯車へ向かう移動。リングの角度 = 軸の角度 + カム溝のずれ camPsi(a)
const IST_STAGES = [
  ['4速で走る', '4速に入れた所です。4速のクラッチ・リングは「コースト噛合い位置」（一番深い所）にあり、カム突起（赤）はカム溝の平坦部にあります。5速の歯車は、軸より速く空回りしています。'],
  ['駆動斜面 F で押しもどされる', '駆動トルクで、4速の歯車の歯の角が、リングの歯の根元の駆動斜面 F に乗り上げ、リングを「離脱待機位置」まで押しもどします。'],
  ['離脱待機位置', '離脱待機位置です。カム突起が、カム溝の V形状部の入口に来ました。駆動トルクのままなら、V形状部の斜面がリングを押し込む向きなので、ここで止まります。'],
  ['5速のリングを入れる', 'シフトドラムが5速のリングを動かします。カム突起がカム溝に沿うので、リングは少し回りながら進みます。歯のすき間がそろった所で、5速の歯に入ります。'],
  ['5速がかみ合った', '軸より速く回る5速の歯車の歯が、リングの歯に後ろから追いつき、駆動の面どうしが当たりました。4速と5速が、同時にかみ合っています。'],
  ['軸が速くなる', '5速の歯車が軸を引っぱり、軸は5速の速さまで速くなります。4速の歯車はそのままなので、4速のリングの歯は、駆動の面から離れ、歯と歯のすき間を前へ渡っていきます。'],
  ['コーストの面に当たった', '4速のリングの歯が、4速の歯車の歯の後ろの面に当たりました。4速には、逆向き（コースト）のトルクがかかります。'],
  ['カムで押し出される', 'コーストのトルクで、カム突起が V形状部の斜面に押され、リングは回りながら中立の向きへ滑ります。だれも引き抜かなくても、機構だけで外れていきます。'],
  ['4速が外れた', 'リングの歯が、4速の歯車の歯から抜けました。'],
  ['中立へ', 'チェック・ボールの力で、4速のリングは中立にもどります（カム突起は V形状部の頂点へ）。'],
  ['5速で走る', '5速だけで走っています。4速の歯車は、また空回りしています。「次へ」で、はじめ（4速）にもどります。']
];
const IS = { stage: 0, run: true, ang: 0, shaft: 0, off5: 0, a4: PIST.aCe, a5: 0, step: 0 };
const istMoving = () => IS.run && IS.stage % 2 === 1;   // 奇数の段階は動き、終わると止まって「次へ」を待つ
const ringE = a => a - PIST.g0;                            // 歯の重なり
function istReset() {
  Object.assign(IS, { stage: 0, run: true, a4: PIST.aCe, a5: 0, step: 0 });
  IS.shaft = IS.ang / GEARS[3][1] + dDrive(PIST.h);         // 4速の歯の駆動の面で回されている
}
function istNext() {
  if (istMoving()) return;   // 動いている間は待つ
  if (IS.stage === IST_STAGES.length - 1) { istReset(); return; }
  IS.stage += 1;
  IS.step = 0;
  IS.run = true;
}
const modP = x => ((x % PIST.pitch) + PIST.pitch) % PIST.pitch;
// 毎フレーム: インプット軸を回し、段階に合わせて、軸の角度とリングの位置を進める
function istStep(dt) {
  if (!IS.run) return;
  if (IS.stage === 7) dt *= 0.15;   // カムで押し出される所は、とても短い時間なので、さらにゆっくり見せる
  const r4 = GEARS[3][1], r5 = GEARS[4][1];
  IS.ang += W_IN * dt;
  const g4 = IS.ang / r4, g5 = IS.ang / r5, st = IS.stage;
  IS.step += dt;
  const stop = () => { IS.stage += 1; IS.run = false; };
  if (st <= 4) IS.shaft = g4 + dDrive(ringE(IS.a4));      // 4速の歯車が、駆動の面でリング（と軸）を回す
  else IS.shaft = g5 + IS.off5;                            // 5速の歯車が軸を回す（軸が速くなる）
  if (st === 1) { IS.a4 = Math.max(PIST.aSb, PIST.aCe - PIST.f * IS.step / 0.8); if (IS.a4 === PIST.aSb) stop(); }
  if (st === 3) {
    const e5 = ringE(IS.a5), d5 = modP(IS.shaft + camPsi(IS.a5) - g5);   // 5速の、リングと歯車の角度の差（歯車が追いつくほど小さくなる）
    if (e5 < 0) IS.a5 = Math.min(PIST.g0, IS.a5 + PIST.g0 * dt / 0.7);   // 歯の先の手前まで進む
    else if (e5 === 0 && !(d5 > dDrive(0) + 0.25 && d5 < dCoastIst(PIST.h) - 0.12)) { /* 歯のすき間がそろうのを待つ */ }
    else if (IS.a5 < PIST.aSb) IS.a5 = Math.min(PIST.aSb, IS.a5 + (PIST.aSb - PIST.g0) * dt / 0.3);   // すき間に入る
    else if (d5 <= dDrive(ringE(PIST.aSb)) + 0.01) { IS.off5 = IS.shaft - g5; stop(); }   // 追いついて、駆動の面どうしが当たった
  }
  if (st === 5 && IS.shaft - g4 >= dCoastIst(ringE(IS.a4))) stop();   // 4速のリングの歯が、コーストの面に当たった
  if (st === 7) {
    // コーストの面が触れたまま、軸が4速の歯車より速く回る分だけ、カム溝の V形状部に沿ってリングが滑る
    IS.a4 = Math.min(PIST.aSb, camA(g4 + dCoastIst(ringE(IS.a4)) - IS.shaft));
    if (ringE(IS.a4) <= 0) stop();
  }
  if (st === 9) { IS.a4 = Math.max(0, IS.a4 - PIST.g0 * dt / 0.6); if (IS.a4 === 0) stop(); }
}
// 3D に反映する。リングの位置 = ハブの真ん中 + 歯車の向き × a、リングの角度 = 軸 + カム溝のずれ
function istUpdate(it) {
  const st = IS.stage;
  it.inShaft.rotation.x = IS.ang;
  it.cnt.rotation.x = -IS.ang * PAR.inR / PAR.cntR;
  it.driven.forEach(p => { p.free.rotation.x = IS.ang / p.ratio; });
  it.outShaft.rotation.x = IS.shaft;
  const place = (j, toward, a) => { it.sleeves[j].position.x = PAR.sleeves[j] + toward * a; it.sleeves[j].rotation.x = IS.shaft + camPsi(a); };
  place(0, 1, 0);
  place(1, 1, IS.a4);    // 4速の歯車は右（+x）
  place(2, -1, IS.a5);   // 5速の歯車は左（−x）
  // 光: 駆動トルクを伝えている組は橙、逆向きのトルクを受けている4速は青
  glow(it.parts.constant.concat(it.parts.clutch), GLOW.power);
  it.driven.forEach(p => glow([p.free], 0));
  glow(it.sleeves, 0);
  if (st <= 4) glow([it.driven[3].free, it.sleeves[1]], GLOW.power);
  if (st >= 4) glow([it.driven[4].free, it.sleeves[2]], GLOW.power);
  if (st >= 6 && st <= 7) glow([it.driven[3].free, it.sleeves[1]], GLOW.pre);
}

// ---------- 数式の考え方 ----------
const WHY = {
  ratio: { text: '1組の歯車では、かみ合う所の歯は同じ速さで動きます。歯の数が多い（大きい）歯車ほどゆっくり回るので、回転は歯数の比で遅くなります。MT ではインプット軸 → カウンタ軸（常時かみ合いの1組）→ アウトプット軸（選んだ段の1組）と2回かみ合うので、2つの比を掛けたものが変速比です。',
    mark: { glow: ['constant'], text: '2組の歯車の比を掛ける' } },
  trade: { text: '歯車は、力の大きさ × 回る速さ（出力）をほぼそのまま伝えます。だから回転が i 倍遅くなると、トルクは i 倍に大きくなります（η は歯車の摩擦で減る割合で、0.95 くらい）。' },
  gap: { text: '1つのクラッチと1組のスリーブで変速するので、「クラッチを切る → 段を抜く → 次の段に入れる → クラッチをつなぐ」を順番にするしかなく、その間はタイヤに力が届きません。人が操作する MT も同じですが、AMT はクラッチを傷めないように、ていねいにつなぐ分だけ時間がかかりやすくなります。',
    mark: { glow: ['actuator', 'clutch'], text: 'クラッチと変速を、機械が順番に動かす' } },
  speedLoss: { text: '力がとぎれている間は、走行抵抗だけがかかって、車は少し遅くなります。減る速さは「走行抵抗 ÷ 重さ × 時間」です。乗っている人は、体が前後にゆれる感じ（首振り）として感じます。' },
  handover: { text: 'エンジンのトルクを、K1 と K2 の2つのクラッチで分け合いながら受け渡します。K1 を少しずつ離すのと同時に K2 を少しずつつなぐので、合計はいつもエンジンのトルクと同じになり、タイヤへの力がとぎれません。',
    mark: { glow: ['k1', 'k2'], text: 'K1 + K2 = エンジンのトルク' } },
  preselect: { text: '奇数段（1・3）は内側の軸、偶数段（2・4）は外側の中空の軸と、軸を分けています。今使っていない方の軸で、次の段を先に入れておけるので、変速はクラッチの受け渡しだけで終わります。',
    mark: { glow: ['inner', 'outer'], text: '奇数段と偶数段で、軸を分ける' } },
  willis: { text: 'キャリア（プラネタリギヤの枠）に乗って見ると、キャリアは止まって見え、サン → プラネタリ → リングは、ふつうの歯車の列になります。サンとリングは逆向きに回り、速さの比は歯数の比 Zr / Zs です。これを、地面から見た速さで書いたのがこの式です（ウィリスの式）。',
    mark: { glow: ['sun', 'carrier', 'ring'], text: 'キャリアから見ると、ふつうの歯車の列' } },
  atRatio: { text: '3つの要素のうち1つをブレーキで止め（速さ 0）、1つに入力すると、残りの1つの速さがウィリスの式で決まります。どれを止めて、どこから入れて、どこから出すかで、減速・直結・増速・逆転が作れます。実際の AT は、2〜4組の遊星歯車と、いくつものクラッチとブレーキを組み合わせて、6〜10段にしています。',
    mark: { glow: ['carrier'], text: '止める要素を変えると、比が変わる' } },
  belt: { text: '金属ベルトは2つのプーリーの溝にはさまれて回ります。ベルトの速さはどこでも同じなので、半径 r の所の速さ（半径 × 角速度）が両方で等しくなります。だから回転の比は、半径の比の逆 r2 / r1 です。',
    mark: { glow: ['primary', 'secondary'], text: 'ベルトの速さは同じ → 比は半径の比' } },
  beltLen: { text: 'ベルトの長さは変わらないので、プライマリーの溝をせまくしてベルトを外へ押し出す（半径を大きくする）と、セカンダリーではベルトが内へ入り（半径が小さくなり）ます。溝の幅は、可動シーブを油圧で動かして変えます。' },
  coverage: { text: '一番低い比と一番高い比の比を、レシオカバレッジ（変速比幅）と言います。大きいほど、発進は力強く、高速では回転を低くできます。ベルト式 CVT は 6〜7 くらいです。' },
  toroidal: { text: 'ローラーは、入力ディスクと出力ディスクに、それぞれ半径 r_in と r_out の所で触れています。触れている所の速さは同じなので、回転の比は半径の比になります。ローラーを傾けると、触れる所の半径が片方は大きく、もう片方は小さくなり、比が連続で変わります。',
    mark: { glow: ['rollers'], text: 'ローラーを傾けて、触れる半径を変える' } },
  traction: { text: '金属どうしは直接こすれず、間の特別な油（トラクションオイル）の膜が、強く押し付けられると固くなって力を伝えます。伝えられる力は、押し付ける力 N × トラクション係数 μ（0.1 くらい）です。' },
  hybrid: { text: 'エンジンはキャリア、MG1 はサンギヤ、タイヤ（と MG2）はリングギヤにつながっています。3つの速さはウィリスの式でいつも1本の直線（共線図）の上にあるので、車速（リング）とエンジンの回転数（キャリア）を決めると、MG1 の回転数が決まります。MG1 の回り方を変えることで、エンジンの回転数を車速と切りはなして選べます。',
    mark: { glow: ['sun', 'carrier', 'ring'], text: 'エンジン = キャリア、MG1 = サン、タイヤ = リング' } },
  split: { text: 'エンジンの力は、キャリアからリング（タイヤ）へ直接行く分と、サンを通って MG1 で発電される分に分かれます（動力分割）。発電した電気で MG2 を回してタイヤを助けたり、電池にためたりします。' },
  evRatio: { text: 'モーターの小さい歯車 → 中間軸の大きい歯車で1回、中間軸の小さい歯車 → デフのリングギヤでもう1回減速します。2回の比を掛けたものが減速比です。',
    mark: { glow: ['gears'], text: '2回の減速を掛ける' } },
  evRpm: { text: 'モーターは、0 rpm から 1万 rpm 以上まで、広い回転数で力を出せます。そのため、1つの比で、発進から最高速まで足ります。変速がないので、加速がとぎれず、なめらかです。',
    mark: { glow: ['motor'], text: '広い回転数で力が出る' } },
  evForce: { text: 'モーターは、低い回転では一定のトルク、高い回転では一定の出力を出します。この形が、理想の駆動力（出力 ÷ 車速）にほぼ沿うので、変速機がいりません。' },
  dog: { text: 'ドグは大きな爪で、回転がそろっていなくても、すき間に入るとすぐにかみ合います。シンクロで回転を合わせる時間がないので、変速がとても速くなります。そのかわり、ショックと音が大きく、爪がすり減りやすくなります。',
    mark: { glow: ['sleeve'], text: 'シンクロなし、大きな爪でかみ合う' } },
  istLoop: { text: '4速と5速が同時にかみ合うと、インプット軸は「4速の比で回れ」と「5速の比で回れ」の両方を言われます。軸は1本なので、変速機の中でトルクがぶつかり合い（内部循環トルク）、エンジンとインプット軸の回転は5速の回転まで一気に下げられます。このとき、下がる回転の分のエネルギーも、タイヤを押す力になります。',
    mark: { glow: ['g4', 'g5'], text: '2つの段が同時にかみ合う' } },
  istCam: { text: 'リングのトルクは、カム突起 → カム溝 → カム・リング → 軸 と伝わります。平坦部では、溝の壁が軸の向きなので、どちらの向きのトルクでもリングは動きません。V形状部では、溝の壁が斜め（角度 β）なので、突起が溝を押す回る向きの力 F<sub>t</sub> の一部が、軸の向きの力 F<sub>a</sub> = F<sub>t</sub> × tan β になります。V は、コーストのトルクで中立へ、駆動のトルクで奥へ押す向きに付いているので、4速は外れ、5速はかみ込みます。',
    mark: { glow: ['sleeve'], text: 'V形状部の斜面が、回る力を軸の向きの力に変える' } },
  istControl: { text: '特許の制御の例では、変速の直前から直後まで、発進クラッチを完全には切らずに少しすべらせ、伝えるトルクを下げます。同時に、点火カットや燃料カットで、エンジントルクを一瞬だけ下げます。リングを動かす所には、ばねで「待つ」仕組みがあり、爪のすき間がそろった瞬間に、ばねの力でぱっと入ります。こうして、ショックを小さくしています。',
    mark: { glow: ['rings'], text: 'クラッチを少しすべらせ、点火を一瞬止める' } },
  sequential: { text: 'シーケンシャル（順番の）ミッションは、ドラムを回して1段ずつ上げ下げします。1速 → 3速 のような飛ばしはできませんが、操作が「押す・引く」だけで、まちがえにくく、速く変速できます。' }
};

// ---------- 項目 ----------
const MT_NAMES = GEARS.map(g => g[0]);
const MT_RATIOS = GEARS.map(g => g[1]);
const LESSONS_TRANS = [
  {
    name: 'MT', title: 'MT（平行軸歯車式）: スリーブで、かみ合っている歯車の1組を選ぶ',
    scene: 'custom', live: true, cam: [[0.08, 0.32, 1.15], [-0.02, 0.0, 0]],
    hint3d: '光っている所が、力が通っている歯車です。エンジン（インプット軸）の速さは一定で見せています。',
    actions: [['N', () => { MT.g = 0; MT.clutchOff = 0.4; }, () => MT.g === 0]].concat(GEARS.map((g, k) => [g[0], () => { MT.g = k + 1; MT.clutchOff = 0.4; }, () => MT.g === k + 1])),
    tick: dt => { MT.clutchOff = Math.max(0, MT.clutchOff - dt); },
    build3d: world => buildParallel(world, {}),
    update3d: (it, dt) => updateParallel(it, dt, W_IN, MT.g, sleeveFor(MT.g), MT.clutchOff === 0),
    text: [
      '<b>ほかの呼び方</b>: マニュアルトランスミッション、手動変速機、常時かみ合い式（コンスタントメッシュ式）、カウンタシャフト式、シンクロメッシュ式。日本では「ミッション」とも呼びます。ギヤボックスLAB で組んだのが、この方式です。',
      '<b>構造</b>: インプット軸（エンジンから）、カウンタ軸、アウトプット軸（タイヤへ）の3本の軸が平行に並びます。1速〜6速の歯車はいつもかみ合っていて、アウトプット軸の上で空回りしています。',
      '<b>仕組み</b>: シフトレバーでスリーブを動かし、選んだ段の歯車を軸につなぎます（シンクロが回転を合わせてから）。つながった1組だけが力を伝えます。上の 3D の N・1速〜6速 を押して、光る歯車の組とスリーブの動きを見てください。',
      'FF 車では、カウンタ軸がアウトプット軸をかねる「2軸式」が多く、FR 車ではこの3軸式が多く使われます。昔は、歯車そのものを滑らせてかみ合わせる「選択摺動式」もありました。',
      '<b>長所と短所</b>: 構造が簡単で軽く、効率が高い（95% 以上）。運転する人がクラッチと変速を操作する必要があり、変速の間は力がとぎれます。'
    ],
    symbols: 'Z: 歯数、i: 変速比、n: 回転数、T: トルク、η: 伝達効率。',
    formula: () => {
      const i = MT.g ? GEARS[MT.g - 1][1] : 0;
      return [
        ['変速比', `i = (${sub('Z', 'カウンタ')} / ${sub('Z', 'インプット')}) × (${sub('Z', 'アウトプット側')} / ${sub('Z', 'カウンタ側')})`, MT.g ? `${GEARS[MT.g - 1][0]}: ${n2(PAR.cntR / PAR.inR)} × ${n2(i / (PAR.cntR / PAR.inR))} = ${i}` : 'N: どの段もつながっていない', WHY.ratio],
        ['出力の回転数とトルク', `${sub('n', '出力')} = ${sub('n', '入力')} / i、${sub('T', '出力')} = ${sub('T', '入力')} × i × η`, MT.g ? `${ENGINE_RPM} rpm → ${n0(ENGINE_RPM / i)} rpm、トルクは ${n2(i * 0.95)} 倍` : '−', WHY.trade]
      ];
    },
    chart: () => ratioChart(MT_RATIOS, MT.g ? MT_RATIOS[MT.g - 1] : -1, MT_NAMES),
    readout: () => (MT.g ? `${GEARS[MT.g - 1][0]}（変速比 ${GEARS[MT.g - 1][1]}）: エンジン ${ENGINE_RPM} rpm のとき、アウトプット軸は ${n0(ENGINE_RPM / GEARS[MT.g - 1][1])} rpm` : 'N（ニュートラル）: アウトプット軸に力は伝わりません') + '。グラフは、各段の車速とエンジン回転数の関係です。'
  },
  {
    name: 'AMT', title: 'AMT（自動MT）: MT の歯車を使い、クラッチと変速を機械が動かす',
    scene: 'custom', live: true, cam: [[0.08, 0.36, 1.2], [-0.02, 0.03, 0]],
    hint3d: '「シフトアップ」で、アクチュエーターが順番に動く様子を、ゆっくり見せます。',
    actions: [['シフトアップ', () => amtShift(1)], ['シフトダウン', () => amtShift(-1)]],
    tick: dt => {
      const s = AM.shift;
      AM.shift = tickShift(AM.shift, dt);
      if (s && !AM.shift) AM.g = s.to;
    },
    build3d: world => buildParallel(world, { amt: true }),
    update3d: (it, dt) => {
      // k: 変速の段階（−1 変速していない、0 クラッチを切る、1 抜く、2 入れる、3 つなぐ）
      const s = AM.shift, k = s ? s.k : -1;
      const g = k < 0 ? AM.g : k <= 1 ? s.from : s.to;
      updateParallel(it, dt, W_IN, k === 1 ? 0 : g, sleeveFor(k === 1 ? 0 : g), k < 0 || k === 3);
      glow(it.parts.actuator.slice(0, 1), k === 0 || k === 3 ? GLOW.power : 0);
      glow(it.parts.actuator.slice(1), k === 1 || k === 2 ? GLOW.power : 0);
    },
    text: [
      '<b>ほかの呼び方</b>: 自動MT、AMT（Automated Manual Transmission）、セミオートマ、2ペダルMT、シングルクラッチ式、ロボタイズドMT。スズキの AGS、いすゞのスムーサーなどがこの方式です。',
      '<b>構造</b>: 中身の歯車とシンクロは MT と同じです。そこに、クラッチを切ったりつないだりするアクチュエーターと、スリーブを動かす変速アクチュエーター（電気モーターや油圧）を足し、ECU が動かします。クラッチペダルはありません。',
      '<b>仕組み</b>: 「シフトアップ」を押すと、① クラッチを切る → ② 今の段を抜く → ③ 次の段に入れる → ④ クラッチをつなぐ、を機械が順番に行います（3D で光るアクチュエーターを見てください）。',
      '<b>長所と短所</b>: MT と同じで軽く、効率が高く、安くできます。変速の間は力がとぎれ、つなぎを丁寧にする分だけ時間がかかるので、加速中に体が前後にゆれる感じ（首振り）が出やすくなります。グラフで、ほかの方式と比べてください。'
    ],
    symbols: 't: 時間、R: 走行抵抗、m: 車の重さ、Δv: 減る車速。',
    formula: () => [
      ['駆動力がとぎれる時間', `${sub('t', 'とぎれ')} = 切る + 抜く + 入れる + つなぐ`, '約 0.8〜1 秒（グラフの目安）', WHY.gap],
      ['その間に減る車速', 'Δv = R / m × t', `時速 100 km、0.8 秒で 約 ${n1(resistTotal(100) / CAR.mass * 0.8 * 3.6)} km/h 減る`, WHY.speedLoss]
    ],
    chart: () => shiftChart('AMT'),
    readout: () => `${GEARS[AM.g - 1][0]}` + (AM.shift ? `　変速中: ${AM.shift.k + 1}. ${shiftStep(AM.shift)}` : '　（「シフトアップ」を押すと、順番に変速します。3D はゆっくり見せています）')
  },
  {
    name: 'DCT', title: 'DCT（デュアルクラッチ）: 次の段を先に入れておき、2つのクラッチを持ちかえる',
    scene: 'custom', live: true, cam: [[0.05, 0.3, 1.0], [-0.15, 0.0, 0]],
    hint3d: '橙が力の通っている道、青が先に入れてある次の段です。下のアウトプット軸（車速）の速さは一定で見せています。',
    actions: [['シフトアップ', () => dctShift(1)], ['シフトダウン', () => dctShift(-1)]],
    tick: dt => {
      const s = DC.shift;
      DC.shift = tickShift(DC.shift, dt);
      // x: K1 → K2 の受け渡しの進み（段階 1 の間に 0 → 1）
      DC.x = s && DC.shift && s.k >= 1 ? (s.k === 1 ? Math.min(1, s.t / s.steps[1][0]) : 1) : 0;
      // 受け渡しが終わったら、今の段を新しい段にし、空いた軸に「その次の段」を先に入れる
      if (s && (s.k >= 2 || !DC.shift) && DC.g !== s.to) {
        const d = s.to > s.from ? 1 : -1;
        DC.g = s.to;
        DC.pre = Math.min(4, Math.max(1, DC.g + d));
        if (DC.pre === DC.g) DC.pre = DC.g - d;
      }
    },
    build3d: world => buildDct(world),
    update3d: (it, dt) => {
      const wOut = 0.6, odd = DC.g % 2 ? DC.g : DC.pre, even = DC.g % 2 ? DC.pre : DC.g;
      it.angle.out += wOut * dt;
      it.angle.inner += wOut * GEARS[odd - 1][1] * dt;
      it.angle.outer += wOut * GEARS[even - 1][1] * dt;
      it.out.rotation.x = -it.angle.out;
      it.inner.rotation.x = it.angle.inner;
      it.outer.rotation.x = it.angle.outer;
      Object.values(it.pairs).forEach(p => { p.free.rotation.x = -(p.g % 2 ? it.angle.inner : it.angle.outer) / GEARS[p.g - 1][1]; });
      // スリーブ: 奇数側は odd の段へ、偶数側は even の段へ（どちらも入っている）
      [['odd', odd, odd === 1 ? -1 : 1], ['even', even, even === 2 ? -1 : 1]].forEach(([key, g, dir]) => {
        it.sleevePos[key] += (dir * 0.025 - it.sleevePos[key]) * Math.min(1, dt * 10);
        it.sleeves[key].position.x = DCT.sleeves[key] + it.sleevePos[key];
        it.sleeves[key].rotation.x = -it.angle.out;
      });
      // 光: 受け渡しの進み x に合わせて、今の段（橙）と次の段（青）
      const from = DC.shift ? DC.shift.from : DC.g, to = DC.shift ? DC.shift.to : DC.pre, x = DC.x;
      Object.values(it.pairs).forEach(p => glow([p.free], p.g === from ? (x < 0.5 ? GLOW.power : GLOW.pre) : p.g === to ? (x >= 0.5 ? GLOW.power : GLOW.pre) : 0));
      const k1on = (from % 2 && x < 0.5) || (to % 2 && x >= 0.5);
      glow([it.k1], k1on ? GLOW.power : 0);
      glow([it.k2], k1on ? 0 : GLOW.power);
    },
    text: [
      '<b>ほかの呼び方</b>: デュアルクラッチトランスミッション、ツインクラッチ。フォルクスワーゲンの DSG、ポルシェの PDK、三菱の Twin Clutch SST などがこの方式です。クラッチの板が油の中にある湿式と、ない乾式があります。',
      '<b>構造</b>: MT の歯車を、奇数段（1・3・5…）と偶数段（2・4・6…）の2つに分け、それぞれに軸とクラッチ（K1、K2）を付けます。偶数段の軸は中空で、奇数段の軸の外側に重なっています。',
      '<b>仕組み</b>: 走っている段と反対側の軸で、次の段をスリーブで先に入れておきます（プリセレクト）。変速は、K1 を離しながら K2 をつなぐ「持ちかえ」だけなので、力がとぎれず、0.1 秒ほどで終わります。3D で「シフトアップ」を押して、2本の入力の軸が、ちがう速さで回っているのを見てください。',
      '<b>長所と短所</b>: 変速が速く、力がとぎれず、MT に近い効率です。部品が多く高価で、低い速さでの発進や渋滞では、クラッチの半クラッチの制御が難しく、ぎくしゃくしやすくなります。'
    ],
    symbols: `${sub('T', 'K1')}, ${sub('T', 'K2')}: それぞれのクラッチが伝えるトルク、${sub('T', 'e')}: エンジンのトルク。`,
    formula: () => [
      ['トルクの受け渡し', `${sub('T', 'K1')} + ${sub('T', 'K2')} = ${sub('T', 'e')}`, DC.shift ? `今 K1 ${n0((1 - DC.x) * 100)}%、K2 ${n0(DC.x * 100)}%` : '変速の間も合計は一定 → 力がとぎれない', WHY.handover],
      ['次の段を先に入れる', '奇数段の軸 ⟂ 偶数段の軸（別のクラッチ）', `今 ${DC.g}速、先に入れてある段 ${DC.pre}速`, WHY.preselect]
    ],
    chart: () => shiftChart('DCT'),
    readout: () => `${DC.g}速（先に入れてある段: ${DC.pre}速）` + (DC.shift ? `　変速中: ${shiftStep(DC.shift)}` : '　（3D はゆっくり見せています。実際は 0.1 秒ほど）')
  },
  {
    name: 'トルコン AT', title: 'トルコン AT: 遊星歯車の、どこを止めてどこから入れるかで段を作る',
    scene: 'custom', live: true, cam: [[0.12, 0.12, 0.55], [0, 0, 0]],
    hint3d: '正面から見た遊星歯車です。赤いブロックが光っている所が、ブレーキで止めている要素です。',
    actions: AT_MODES.map((m, k) => [m.name, () => { AT.mode = k; }, () => AT.mode === k]),
    tick: () => {},
    build3d: world => buildPlanetary(world, false),
    update3d: (it, dt) => {
      const m = AT_MODES[AT.mode], w = planetSpeeds(m, 1.2);
      updatePlanetary(it, dt, w);
      Object.entries(it.brakes).forEach(([k, b]) => glow([b], (m.fix === { ring: 'r', sun: 's', carrier: 'c' }[k]) ? GLOW.brake : 0));
      ['s', 'c', 'r'].forEach(e => setLabel(it.tags[e], `${elName[e]}: ${m.in === e ? '入力' : m.out === e ? '出力' : m.fix === e ? '固定（ブレーキ）' : !m.fix ? '一緒に回る' : ''}`));
    },
    text: [
      '<b>ほかの呼び方</b>: オートマ、トルコン AT（トルクコンバーター式 AT）、ステップ AT、有段 AT、遊星歯車式自動変速機。',
      '<b>構造</b>: エンジンのすぐ後ろのトルクコンバーター（油の流れで力を伝え、トルクを増やす）と、何組かの遊星歯車、それらを止めたりつないだりする油圧のクラッチとブレーキからできています。',
      '<b>遊星歯車</b>: 中心のサンギヤ、そのまわりを回る3つのプラネタリギヤと、それを支えるキャリア、外側の内歯のリングギヤの3つの要素が、同じ軸の上にあります。1つを止めて1つに入力すると、残りの1つの速さが決まります。上のボタンで切りかえて、3D で回り方を見てください。',
      '<b>長所と短所</b>: 変速がなめらかで、止まっていてもエンストせず、大きなトルクにも強い。トルクコンバーターのすべりで効率が下がるので、今は走り出したらトルクコンバーターを直結（ロックアップ）します。段数を増やすほど（8〜10段）燃費がよくなります。'
    ],
    symbols: `${sub('n', 's')}, ${sub('n', 'c')}, ${sub('n', 'r')}: サン、キャリア、リングの回転数、${sub('Z', 's')} = ${PLA.Zs}、${sub('Z', 'r')} = ${PLA.Zr}: サンとリングの歯数。`,
    formula: () => {
      const m = AT_MODES[AT.mode];
      return [
        ['3つの要素の関係（ウィリスの式）', `(${sub('n', 's')} − ${sub('n', 'c')}) / (${sub('n', 'r')} − ${sub('n', 'c')}) = −${sub('Z', 'r')} / ${sub('Z', 's')}`, `−${PLA.Zr} / ${PLA.Zs} = −${n2(PLA.Zr / PLA.Zs)}`, WHY.willis],
        ['今の段の変速比', m.fix === 'r' ? `i = 1 + ${sub('Z', 'r')} / ${sub('Z', 's')}` : m.fix === 's' && m.in === 'r' ? `i = 1 + ${sub('Z', 's')} / ${sub('Z', 'r')}` : m.fix === 's' ? `i = ${sub('Z', 'r')} / (${sub('Z', 'r')} + ${sub('Z', 's')})` : m.fix === 'c' ? `i = −${sub('Z', 'r')} / ${sub('Z', 's')}` : 'i = 1',
          `${m.name}: ${m.text} → i = ${n2(m.i)}`, WHY.atRatio]
      ];
    },
    chart: () => ratioChart(AT_MODES.slice(0, 4).map(m => m.i), AT_MODES[AT.mode].i, AT_MODES.slice(0, 4).map(m => m.name)),
    readout: () => `${AT_MODES[AT.mode].name}: ${AT_MODES[AT.mode].text}（変速比 ${n2(AT_MODES[AT.mode].i)}）。グラフは、最終減速比 4.1 のときの車速とエンジン回転数です。`
  },
  {
    name: 'ベルト式 CVT', title: 'ベルト式 CVT: プーリーの溝の幅を変えて、ベルトのかかる半径を連続で変える',
    scene: 'custom', live: true, cam: [[0.1, 0.25, 0.85], [0, 0, 0]],
    hint3d: 'スライダーで変速比を変えると、溝の幅とベルトのかかる半径が変わります。「発進から加速」で、低い比から高い比へ自動で動かします。',
    controls: [['変速比 i', 'cvt', 0.45, 2.5, 0.05, fmtI]],
    actions: [['発進から加速', () => { P.cvt = 2.5; CV.sweep = true; }]],
    tick: dt => { if (CV.sweep) { P.cvt = Math.max(0.45, P.cvt - dt * 0.35); const s = el('controls').querySelector('[data-key="cvt"]'); if (s) { s.value = P.cvt; s.nextElementSibling.textContent = fmtI(P.cvt); } if (P.cvt <= 0.45) CV.sweep = false; } },
    build3d: world => buildCvt(world),
    update3d: (it, dt) => { CV.r = updateCvt(it, dt, P.cvt, 1.5); },
    text: [
      '<b>ほかの呼び方</b>: 無段変速機、CVT（Continuously Variable Transmission）、ベルト式 CVT、金属ベルト式（プッシュベルト式）。ベルトの代わりに金属のチェーンを使う、チェーン式 CVT もあります。日本の小型車に多い方式です。',
      '<b>構造</b>: エンジン側のプライマリープーリーと、タイヤ側のセカンダリープーリーに、金属ベルトがかかっています。プーリーは V 字の溝を作る2枚の円すい（シーブ）で、片方（可動シーブ）を油圧で動かして、溝の幅を変えます。',
      '<b>仕組み</b>: 溝をせまくすると、ベルトは外へ押し出されて、かかる半径が大きくなります。ベルトの長さは変わらないので、反対のプーリーでは半径が小さくなります。比が段なしで連続して変わるので、エンジンを一番効率のよい回転数に保ったまま加速できます。',
      '<b>長所と短所</b>: 変速のショックがなく、燃費がよい。大きなトルクには弱く、ベルトをはさむ油圧の損失があります。エンジンの回転だけ先に上がって、加速が後からついてくる感じ（ラバーバンドフィール）が出ることがあります。'
    ],
    symbols: `${sub('r', '1')}: プライマリーでベルトがかかる半径、${sub('r', '2')}: セカンダリーの半径。`,
    formula: () => {
      const [r1, r2] = beltRadii(P.cvt);
      return [
        ['変速比', `i = ${sub('r', '2')} / ${sub('r', '1')}`, `${n1(r2 * 1000)} mm ÷ ${n1(r1 * 1000)} mm = ${n2(P.cvt)}（3D の大きさ）`, WHY.belt],
        ['ベルトの長さは一定', `L ≒ π (${sub('r', '1')} + ${sub('r', '2')}) + 2d + (${sub('r', '1')} − ${sub('r', '2')})² / d`, '片方が大きくなると、もう片方が小さくなる', WHY.beltLen],
        ['レシオカバレッジ', `${sub('i', '最大')} / ${sub('i', '最小')}`, `2.5 ÷ 0.45 ≒ ${n1(2.5 / 0.45)}`, WHY.coverage]
      ];
    },
    chart: () => cvtChart(P.cvt),
    readout: () => `変速比 ${n2(P.cvt)}: エンジン ${ENGINE_RPM} rpm のとき、セカンダリーは ${n0(ENGINE_RPM / P.cvt)} rpm。グラフの帯（2本の線の間）のどこでも選べます。`
  },
  {
    name: 'トロイダル CVT', title: 'トロイダル CVT: 2枚のディスクにはさんだローラーを傾けて、比を変える',
    scene: 'custom', live: true, cam: [[0.12, 0.15, 0.75], [0, 0.02, 0]],
    hint3d: 'スライダーで変速比を変えると、パワーローラーが傾き、ディスクに触れる半径が変わります。',
    controls: [['変速比 i', 'tor', 0.45, 2.2, 0.05, fmtI]],
    tick: () => {},
    build3d: world => buildToroidal(world),
    update3d: (it, dt) => { TR.r = updateToroidal(it, dt, P.tor, 1.5); },
    text: [
      '<b>ほかの呼び方</b>: トロイダル CVT、トラクションドライブ式 CVT、ハーフトロイダル CVT。日産のエクストロイド CVT（1999年〜、セドリック・グロリアなど）がこの方式でした。',
      '<b>構造</b>: ドーナツの内側の形にくぼんだ、入力ディスクと出力ディスクが向かい合い、その間にパワーローラーがはさまっています。',
      '<b>仕組み</b>: ローラーを傾けると、入力ディスクには外側（半径が大きい所）、出力ディスクには内側（半径が小さい所）で触れるようになり、出力が速く回ります。逆に傾けると遅く回ります。力は、金属の間の特別な油の膜（トラクションオイル）で伝えます。',
      '<b>長所と短所</b>: ベルト式より大きなトルクに強く、変速の反応が速い。ディスクを強く押し付ける仕組みや、特別な油が必要で、高価で重くなります。今の乗用車ではほとんど使われていません。'
    ],
    symbols: `${sub('r', 'in')}: 入力ディスクにローラーが触れる半径、${sub('r', 'out')}: 出力ディスクの半径、c: くぼみの中心の半径、ρ: ローラーの半径、φ: ローラーの傾き。`,
    formula: () => {
      const s = torSin(P.tor), rIn = TOR.c + TOR.rho * s, rOut = TOR.c - TOR.rho * s;
      return [
        ['変速比', `i = ${sub('r', 'out')} / ${sub('r', 'in')}、${sub('r', 'in')} = c + ρ sinφ、${sub('r', 'out')} = c − ρ sinφ`, `傾き ${n0(Math.asin(Math.max(-1, Math.min(1, s))) / Math.PI * 180)}°: ${n1(rOut * 1000)} ÷ ${n1(rIn * 1000)} = ${n2(P.tor)}`, WHY.toroidal],
        ['伝えられる力', 'F = μ × N', 'μ: トラクション係数（0.1 くらい）、N: 押し付ける力', WHY.traction]
      ];
    },
    chart: () => cvtChart(P.tor),
    readout: () => `変速比 ${n2(P.tor)}: 入力 ${ENGINE_RPM} rpm のとき、出力ディスクは ${n0(ENGINE_RPM / P.tor)} rpm（入力と逆向き）`
  },
  {
    name: 'ハイブリッドの動力分割', title: 'ハイブリッドの動力分割: 遊星歯車で、エンジンの回転数を車速と切りはなす',
    scene: 'custom', live: true, cam: [[0.14, 0.14, 0.62], [0, 0, 0]],
    hint3d: 'エンジン = キャリア、MG1（発電機）= サンギヤ、タイヤと MG2 = リングギヤ です。回転は 1/1000 の速さで見せています。',
    controls: [['エンジン回転数 (rpm)', 'eng', 0, 5000, 100], ['車速 (km/h)', 'kmh', 0, 180, 5]],
    tick: () => {},
    build3d: world => buildPlanetary(world, true),
    update3d: (it, dt) => {
      const w = { s: mg1Rpm() / 1000, c: P.eng / 1000, r: P.kmh * RING_PER_KMH / 1000 };
      updatePlanetary(it, dt, w);
      setLabel(it.tags.s, `サン = MG1: ${n0(mg1Rpm())} rpm`);
      setLabel(it.tags.c, `キャリア = エンジン: ${P.eng} rpm`);
      setLabel(it.tags.r, `リング = タイヤ: ${n0(P.kmh * RING_PER_KMH)} rpm`);
      Object.values(it.brakes).forEach(b => { b.visible = false; });
    },
    text: [
      '<b>ほかの呼び方</b>: 動力分割機構、パワースプリットデバイス、電気式無段変速機（e-CVT）、シリーズ・パラレル式ハイブリッド。トヨタの THS（トヨタハイブリッドシステム）がこの方式です。',
      '<b>構造</b>: 1組の遊星歯車に、エンジン（キャリア）、発電機 MG1（サンギヤ）、タイヤと走行用モーター MG2（リングギヤ）の3つがつながっています。クラッチも変速の歯車もありません。',
      '<b>仕組み</b>: 3つの回転数は、いつも共線図（グラフ）の1本の直線の上に並びます。車速（リング）が決まっていても、MG1 の回り方を変えると、エンジンの回転数を自由に選べます。だから、エンジンをいつも効率のよい回転数で回せます。スライダーで、エンジン回転数と車速を変えてみてください。',
      '<b>エンジンを止めて走るとき</b>（エンジン 0 rpm）は、MG1 が逆に回ります。発進や低速では、MG2 だけで走れます。',
      '<b>長所と短所</b>: 燃費がとてもよく、変速のショックがありません。強く加速すると、エンジンの回転だけ先に上がる感じがあり、構造（モーター2つ、電池、制御）が高価です。'
    ],
    symbols: `${sub('n', 'MG1')}: MG1（サン）の回転数、${sub('n', 'e')}: エンジン（キャリア）、${sub('n', 'r')}: リング（タイヤ側）。`,
    formula: () => [
      ['3つの回転数の関係', `${sub('n', 'MG1')} = ((${sub('Z', 's')} + ${sub('Z', 'r')}) × ${sub('n', 'e')} − ${sub('Z', 'r')} × ${sub('n', 'r')}) / ${sub('Z', 's')}`, `((${PLA.Zs} + ${PLA.Zr}) × ${P.eng} − ${PLA.Zr} × ${n0(P.kmh * RING_PER_KMH)}) ÷ ${PLA.Zs} = ${n0(mg1Rpm())} rpm`, WHY.hybrid],
      ['エンジンの力の分かれ方', `リングへ ${sub('Z', 'r')} / (${sub('Z', 's')} + ${sub('Z', 'r')})、サンへ ${sub('Z', 's')} / (${sub('Z', 's')} + ${sub('Z', 'r')})（トルクの割合）`, `リング（タイヤ）へ ${n0(PLA.Zr / (PLA.Zs + PLA.Zr) * 100)}%、サン（MG1）へ ${n0(PLA.Zs / (PLA.Zs + PLA.Zr) * 100)}%`, WHY.split]
    ],
    chart: () => {
      const xc = PLA.Zr / (PLA.Zs + PLA.Zr), nr = P.kmh * RING_PER_KMH, ns = mg1Rpm();
      return {
        xLabel: '共線図（左から サン = MG1、キャリア = エンジン、リング = タイヤ。間の長さは歯数の比）', yLabel: '回転数 (rpm)', xMax: 1, xStep: 0.25, yMin: -8000, yMax: 10000, yStep: 2000,
        series: [0, xc, 1].map(x => ({ name: '', color: 'rgba(223,230,233,0.4)', points: [[x, -8000], [x, 10000]], width: 1 }))
          .concat([{ name: '3つの回転数は1本の直線の上', color: '#f0a81c', points: [[0, ns], [1, nr]], width: 3 }, { name: '', color: 'rgba(255,255,255,0.5)', points: [[0, 0], [1, 0]], width: 1 }]),
        dots: [{ x: 0, y: ns, label: `MG1 ${n0(ns)}` }, { x: xc, y: P.eng, label: `エンジン ${P.eng}` }, { x: 1, y: nr, label: `タイヤ側 ${n0(nr)}`, color: '#7fc8f8' }]
      };
    },
    readout: () => `エンジン ${P.eng} rpm、車速 ${P.kmh} km/h → MG1 は ${n0(mg1Rpm())} rpm` + (mg1Rpm() < 0 ? '（逆に回っている）' : '')
  },
  {
    name: '電気自動車の減速機', title: '電気自動車: 変速せず、1つの比で減速するだけ',
    scene: 'custom', live: true, cam: [[0.2, 0.25, 0.98], [0.08, 0.04, 0]],
    hint3d: 'モーターの回転を、2回の歯車で減速して、デフから左右のタイヤへ伝えます。スライダーの車速に合わせて回ります（1/1000 の速さ）。',
    controls: [['車速 (km/h)', 'evKmh', 0, 200, 5]],
    tick: () => {},
    build3d: world => buildEv(world),
    update3d: (it, dt) => updateEv(it, dt, motorRpm(P.evKmh) / 1000),
    text: [
      '<b>ほかの呼び方</b>: 減速機、リダクションギヤ、1段減速機。モーター・インバーター・減速機を1つにまとめた物を、e-Axle（イーアクスル）と呼びます。',
      '<b>構造</b>: モーターの軸の小さい歯車 → 中間軸の大きい歯車、中間軸の小さい歯車 → デフのリングギヤ、と2回減速します（合わせて 約 9〜10）。変速の仕組みはありません。後退は、モーターを逆に回すだけです。',
      '<b>仕組み</b>: モーターは 0 rpm から 1万 rpm 以上まで回せて、低い回転では大きなトルク、高い回転では一定の出力を出します。この形が、理想の駆動力（出力 ÷ 車速）にほぼ沿うので、1つの比で発進から最高速まで足ります。グラフで、エンジン車の各段の線と比べてください。',
      '<b>長所と短所</b>: 部品が少なく、軽く、加速がとぎれずなめらかです。とても速い速度ではモーターの効率が下がるので、高性能車の一部は2段の変速機を積んでいます。'
    ],
    symbols: `${sub('i', '減速')}: 減速比、${sub('T', 'm')}: モーターのトルク、${sub('n', 'm')}: モーターの回転数。`,
    formula: () => {
      const n = motorRpm(P.evKmh);
      return [
        ['減速比', `${sub('i', '減速')} = (${sub('Z', '中間大')} / ${sub('Z', 'モーター')}) × (${sub('Z', 'デフ')} / ${sub('Z', '中間小')})`, `${n1(EV.g1 / EV.p1)} × ${n2(EV.g2 / EV.p2)} = ${n1(EV_RATIO)}`, WHY.evRatio],
        ['モーターの回転数', `${sub('n', 'm')} = v / r × ${sub('i', '減速')}（単位を直して）`, `時速 ${P.evKmh} km で ${n0(n)} rpm（最高 ${MOTOR.nmax} rpm で 時速 ${n0(MOTOR.nmax * RPM / EV_RATIO * CAR.tire * 3.6)} km）`, WHY.evRpm],
        ['駆動力', `F = ${sub('T', 'm')} × ${sub('i', '減速')} × η / r`, `時速 ${P.evKmh} km で ${n0(evForce(P.evKmh))} N（モーター ${n0(motorTorque(n))} N·m）`, WHY.evForce]
      ];
    },
    chart: () => ({
      xLabel: '車速 (km/h)', yLabel: '駆動力 (N)', xMax: 240, xStep: 40, yMax: 10000, yStep: 2000,
      series: GEARS.map((g, k) => ({ name: k ? '' : 'エンジン車 1〜6速', color: 'rgba(223,230,233,0.3)', points: driveLine(k), width: 1.5 }))
        .concat([{ name: `電気自動車（1段、減速比 ${n1(EV_RATIO)}）`, color: '#7fc8f8', points: sample(240, evForce, 2).filter(([v]) => motorRpm(v) <= MOTOR.nmax), width: 4 },
          { name: '走行抵抗', color: '#ffffff', points: sample(240, v => resistTotal(v), 4), width: 2 }]),
      vline: P.evKmh
    }),
    readout: () => `時速 ${P.evKmh} km: モーター ${n0(motorRpm(P.evKmh))} rpm、駆動力 ${n0(evForce(P.evKmh))} N（モーターは最大 ${MOTOR.tmax} N·m、${MOTOR.pmax} kW の想定）`
  },
  {
    name: 'ドグミッション', title: 'ドグミッション（シーケンシャル）: シンクロなしの大きな爪で、すばやくかみ合わせる',
    scene: 'custom', live: true, cam: [[0.08, 0.32, 1.15], [-0.02, 0.0, 0]],
    hint3d: 'スリーブの代わりに、大きな爪（ドグ）の付いたドグリングがかみ合います。シーケンシャルなので、1段ずつしか上げ下げできません。',
    actions: [['シフトアップ', () => dogShift(1)], ['シフトダウン', () => dogShift(-1)]],
    tick: dt => {
      const s = DG.shift;
      DG.shift = tickShift(DG.shift, dt);
      if (s && !DG.shift) DG.g = s.to;
    },
    build3d: world => buildParallel(world, { dog: true }),
    update3d: (it, dt) => {
      const s = DG.shift, g = !s ? DG.g : s.k === 0 ? s.from : s.to;
      updateParallel(it, dt, W_IN, s && s.k === 0 ? 0 : g, sleeveFor(g), !s || s.k === 2);
    },
    text: [
      '<b>ほかの呼び方</b>: ドグミッション、ドグボックス、ノンシンクロミッション、シーケンシャルミッション（順番にしか変速できない方式）。レース車と、ほとんどのバイクがこの方式です。',
      '<b>構造</b>: MT と同じ平行軸ですが、シンクロがなく、スリーブの代わりに、大きな爪（ドグ）が数個付いたドグリングで歯車を軸につなぎます。シフトドラム（溝の付いた筒）を回して、ドグリングを1段ずつ動かします（ギヤボックスLAB のシーケンシャル式と同じ）。',
      '<b>仕組み</b>: 爪の数が少なくすき間が大きいので、回転がそろっていなくても、すき間に入ればすぐにかみ合います。変速の一瞬だけ点火を止めて爪の力を抜けば、クラッチを切らずに 0.05 秒ほどで変速できます。「シフトアップ」で、3D をゆっくり見せます。',
      '<b>長所と短所</b>: 変速がとても速く、丈夫です。かみ合うときのショックと音が大きく、爪がすり減るので、乗用車にはほとんど使われません。'
    ],
    symbols: 't: 変速にかかる時間。',
    formula: () => [
      ['駆動力がとぎれる時間', `${sub('t', 'とぎれ')} ≒ 点火を止める時間`, '約 0.05 秒（MT は 0.5 秒くらい）', WHY.dog],
      ['シーケンシャル', 'n 速 → n ± 1 速 だけ', `今 ${GEARS[DG.g - 1][0]}`, WHY.sequential]
    ],
    chart: () => shiftChart('ドグ'),
    readout: () => `${GEARS[DG.g - 1][0]}` + (DG.shift ? `　変速中: ${shiftStep(DG.shift)}` : '　（3D はゆっくり見せています。実際は 0.05 秒ほど）')
  },
  {
    name: 'シームレス（IST）', title: 'シームレス（イケヤフォーミュラの IST）: 2つの段を一瞬同時にかみ合わせ、カムで古い段を外す',
    scene: 'custom', live: true, cam: [[0.24, 0.3, 0.3], [0.24, 0.04, 0]],
    hint3d: '黄色が歯車のドグ歯、水色がクラッチ・リングの歯、赤がカム突起、軸の上の暗い線がカム溝です。中が見えるように、歯車とリングを透かしています。「次へ」で1つずつ進みます。インプット軸の速さは一定で、とてもゆっくり見せています。',
    actions: [['次へ', istNext], ['はじめから', istReset]],
    reset: istReset,
    build3d: world => buildParallel(world, { ist: true }),
    tick: istStep,   // 動きは毎フレーム進める（3D を見ていないときも）
    update3d: istUpdate,
    text: [
      '<b>ほかの呼び方</b>: シームレストランスミッション、シームレスシフト、IST（Ikeya Seamless Transmission）。',
      '<b>構造</b>: ふつうの MT と同じ平行軸で、発進クラッチも1枚だけです。ちがうのは、歯車を軸につなぐ「噛合いクラッチ」の作りです。特許の実施例では、次の部品でできています。',
      '① <b>クラッチ・カム・リング</b>: 軸に固定された輪です（ふつうの MT のハブの所）。外周に、真ん中が「への字」の <b>V形状部</b>、その両側がまっすぐの <b>平坦部</b> のカム溝が、等間隔に並んでいます（3D の暗い線）。',
      '② <b>クラッチ・リング</b>: カム・リングの上を、シフトフォークで軸の向きに動かされる輪です（スリーブの所）。内周の <b>カム突起</b>（赤）がカム溝に入っています。平坦部では軸と同じ角度のまま滑り、V形状部では、滑ると少し回ります。',
      '③ <b>ドグ歯</b>: リングの両側の歯（水色）と、歯車の歯（黄）。周方向の <b>噛合い面は、根元が少し細くなる向きに傾いて</b> いて、トルクがかかると抜けにくくなっています。歯と歯の間は、歯の幅より広くあいています。',
      '④ <b>駆動斜面 F</b>: リングの歯の、駆動トルクを受ける面の根元にある小さな斜面です。',
      '<b>リングの位置</b>: 一番深い「コースト噛合い位置」（突起は平坦部）、少し浅い「離脱待機位置」（突起は V形状部の入口）、「中立」（突起は V形状部の頂点）の3つです。コースト噛合い位置と中立は、チェック・ボールが山形のくぼみで保ちます。',
      '<b>仕組み</b>（4速 → 5速）: ① 駆動トルクで、歯車の歯が F に乗り上げ、4速のリングを離脱待機位置へ押しもどします。② 5速のリングを入れると、4速と5速が同時にかみ合います。③ 変速機の中でトルクがぶつかり（内部循環トルク）、4速には逆向き（コースト）のトルクがかかります。④ その力で、カム突起が V形状部の斜面に押され、4速のリングは中立の向きへ滑って外れます。5速は駆動トルクなので、より深くかみ込みます。この間、タイヤへの力はほとんどとぎれません。',
      '<b>見る所</b>: 「次へ」を押すたびに1つずつ進みます。4速のリングの赤い突起が、カム溝の平坦部から V形状部の斜面へ移り、斜面に沿って回りながら戻っていく所が要点です。',
      '<b>見せ方</b>: インプット軸（エンジン）の速さを一定にして、軸が速くなるように見せています。実際の車では、車速はほとんど変わらず、エンジンの回転が下がります。どちらでも、歯車と軸の回り方の差は同じです。',
      '<b>長所と短所</b>: DCT と同じくらい駆動力がとぎれないのに、構造は MT とほぼ同じで、軽く、安くできます。シフトダウンは、減速中は力がとぎれても困らないので、上の段をいったん中立にしてから下の段に入れます。',
      '<b>注意</b>: 部品の名前と働きは、イケヤフォーミュラの特許（WO2012066740、2010 年出願）の実施例1にそろえました。特許には、歯の角度、溝の角度、寸法の数字は書かれていないので、それらは説明用の値です（根元の細さは約 6°、V形状部の斜面は軸から約 28°）。今の製品の細部は、ちがう場合があります。'
    ],
    symbols: `${sub('F', 't')}: カム突起が溝を押す、回る向きの力、${sub('F', 'a')}: リングを軸の向きに押す力、β: V形状部の溝が軸の向きとなす角度、T: リングが伝えるトルク、${sub('r', 'g')}: カム溝の半径、${sub('i', '4')}、${sub('i', '5')}: 4速・5速の変速比、${sub('n', 'out')}: アウトプット軸の回転数。`,
    formula: () => {
      const nOut = 100 / 3.6 / CAR.tire * CAR.final / RPM, ft = 50 / PIST.rg, tanB = PIST.c / PIST.aSb;
      return [
        ['同時にかみ合うとき', `エンジン: ${sub('n', 'out')} × ${sub('i', '4')} → ${sub('n', 'out')} × ${sub('i', '5')}`, `時速 100 km で ${n0(nOut * GEARS[3][1])} rpm → ${n0(nOut * GEARS[4][1])} rpm に一気に下がる`, WHY.istLoop],
        ['V形状部がリングを押し出す力', `${sub('F', 'a')} = ${sub('F', 't')} × tan β、${sub('F', 't')} = T / ${sub('r', 'g')}`, `逆向きのトルク 50 N·m なら ${n0(ft)} N × ${n2(tanB)} = ${n0(ft * tanB)} N で中立へ押す（摩擦は除く）`, WHY.istCam],
        ['駆動力がとぎれる時間', `${sub('t', 'とぎれ')} ≒ 0`, 'MT は 0.5 秒くらい、ドグミッションは 0.05 秒くらい', WHY.istControl]
      ];
    },
    chart: () => shiftChart('IST'),
    readout: () => `${IS.stage + 1} / ${IST_STAGES.length}　${IST_STAGES[IS.stage][0]}: ${IST_STAGES[IS.stage][1]}${istMoving() || IS.stage === IST_STAGES.length - 1 ? '' : '　→「次へ」'}`
  }
];
const CV = { sweep: false, r: [0, 0] }, TR = { r: [0, 0] };

// ---------- 車に載せる（ギヤボックスLAB と同じように、車の中での向きとつながりを見る） ----------
// layout: FR（エンジン縦置き、後輪駆動）、FF（エンジン横置き、前輪駆動）、EV（後ろの車軸にモーター）
// coupler: エンジンと変速機の間のつなぎの部品、mechScale / mechRot: 変速機の 3D の大きさと向き、out: 変速機の出力の速さ（表示用）
let TR_CAR = false;
const CAR_CAM = [[2.4, 2.1, 3.6], [0.3, 0.45, 0]];
const ON_CAR = {
  'MT': { layout: 'FR', coupler: 'クラッチ', couplerKey: 'clutchDisc', mechScale: 0.5, mechRot: Math.PI, out: () => (MT.g ? W_IN / GEARS[MT.g - 1][1] : 0),
    carText: 'FR 車の例です。エンジンを縦（クランク軸が前後の向き）に置き、すぐ後ろにクラッチと MT が一直線に並びます。MT の出力はプロペラシャフトで後ろのデフへ行き、デフで向きを 90° 変えて、ドライブシャフトで左右の後輪を回します。FF 車の MT は、エンジンを横に置き、変速機とデフを1つのケースにまとめた「トランスアクスル」（2軸式）になります。' },
  'AMT': { layout: 'FF', coupler: 'クラッチ', couplerKey: 'clutchDisc', mechScale: 0.5, mechRot: -Math.PI / 2, out: () => W_IN / GEARS[AM.g - 1][1],
    carText: '軽自動車などの FF 車の例です。エンジンを横（クランク軸が左右の向き）に置き、そのとなりにクラッチと AMT が並びます。デフは変速機と同じケースの中（トランスアクスル）にあり、長さのちがう左右のドライブシャフトで前輪を回します。' },
  'DCT': { layout: 'FF', coupler: 'デュアルクラッチ', couplerKey: 'dualClutch', mechScale: 0.5, mechRot: -Math.PI / 2, out: () => 0.6,
    carText: 'FF 車の例です（フォルクスワーゲンの DSG など）。横置きエンジンのとなりに、2つのクラッチと DCT が並びます。デフは変速機と一体で、ドライブシャフトで前輪を回します。スポーツカーでは、縦置きで後ろの車軸のそばに置く物（トランスアクスル）もあります。' },
  'トルコン AT': { layout: 'FR', coupler: 'トルクコンバーター', couplerKey: 'torqueConverter', mechScale: 1.3, mechRot: Math.PI / 2, out: () => planetSpeeds(AT_MODES[AT.mode], 1.2)[AT_MODES[AT.mode].out],
    carText: 'FR 車の例です。縦置きエンジンの後ろに、トルクコンバーター、遊星歯車の変速機が一直線に並び、プロペラシャフトで後ろのデフへつながります。FF 車の AT は、横置きでデフと一体（トランスアクスル）です。' },
  'ベルト式 CVT': { layout: 'FF', coupler: 'トルクコンバーター', couplerKey: 'torqueConverter', mechScale: 0.7, mechRot: 0, out: () => 1.5 / P.cvt,
    carText: '日本の小型車に多い FF の例です。横置きエンジン → トルクコンバーター → 前進と後退を切りかえる遊星歯車 → プライマリープーリー → ベルト → セカンダリープーリー → 減速の歯車 → デフ → ドライブシャフト → 前輪 の順に伝わります。2つのプーリーは、車の前後に並びます。' },
  'トロイダル CVT': { layout: 'FR', coupler: 'トルクコンバーター', couplerKey: 'torqueConverter', mechScale: 1.1, mechRot: Math.PI, out: () => 1.5 / P.tor,
    carText: '大きなトルクの FR 車に使われた例です（日産のエクストロイド CVT）。縦置きエンジンの後ろに、トルクコンバーターとトロイダル CVT が一直線に並び、プロペラシャフトで後輪へつながります。' },
  'ハイブリッドの動力分割': { layout: 'FF', coupler: 'ダンパー', couplerKey: 'damper', mechScale: 1.0, mechRot: 0, out: () => P.kmh * RING_PER_KMH / 1000,
    carText: 'プリウスなどの FF の例です。横置きエンジンのとなりに、クラッチの代わりに振動をやわらげるダンパーがあり、その先に遊星歯車（動力分割）、MG1、MG2 が同じケースに入っています。リングギヤから減速の歯車とデフを通して、前輪を回します。' },
  '電気自動車の減速機': { layout: 'EV', coupler: '', couplerKey: '', mechScale: 0.7, mechRot: -Math.PI / 2, out: () => motorRpm(P.evKmh) / 1000 / EV_RATIO, final: 1,
    carText: '後輪駆動の電気自動車の例です。後ろの車軸の間に、モーター、減速機、デフをまとめた e-Axle を横向きに置き、短いドライブシャフトで後輪を回します。電池は床下に平らに並べ、インバーターが電池の直流をモーター用の交流に変えます。前にも置くと4輪駆動になります。' },
  'ドグミッション': { layout: 'FR', coupler: 'クラッチ', couplerKey: 'clutchDisc', mechScale: 0.5, mechRot: Math.PI, out: () => W_IN / GEARS[DG.g - 1][1],
    carText: 'FR のレース車の例です。縦置きエンジンの後ろにクラッチとドグミッションが並び、プロペラシャフトで後輪へつながります。重さの配分のため、変速機を後ろの車軸のそばに置く（トランスアクスル）レース車も多くあります。' }
};
LESSONS_TRANS.forEach(l => {
  const c = ON_CAR[l.name], build = l.build3d, update = l.update3d, cam = l.cam;
  if (!c) return;   // 車に載せないもの（シームレスは、変速機の中の動きを見る）
  Object.assign(l, c);
  l.build3d = world => (TR_CAR ? buildOnCar(world, l, build) : build(world));
  l.update3d = (it, dt) => { update(it, dt); if (it.onCar) updateOnCar(it, dt, c.out(), c.final || CAR.final); };
  l.cam = () => (TR_CAR ? CAR_CAM : typeof cam === 'function' ? cam() : cam);
  l.actions = (l.actions || []).concat([['車に載せる', () => { TR_CAR = !TR_CAR; redo3d(); }, () => TR_CAR]]);
  l.text = l.text.concat([`<b>車への載せ方</b>（「車に載せる」で 3D に出ます）: ${c.carText}`]);
});
// CVT の比の帯: 一番低い比と一番高い比の線と、今の比の線
function cvtChart(now) {
  const line = (i, color, width, name) => ({ name, color, width, points: sample(240, v => v / 3.6 / CAR.tire * i * CAR.final / RPM, 2).filter(([, n]) => n <= 8000) });
  return {
    xLabel: '車速 (km/h)', yLabel: 'エンジン回転数 (rpm)', xMax: 240, xStep: 40, yMax: 8000, yStep: 1000,
    series: [line(2.5, 'rgba(223,230,233,0.5)', 1.5, '一番低い比 2.5'), line(0.45, 'rgba(223,230,233,0.5)', 1.5, '一番高い比 0.45'), line(now, '#f0a81c', 4, `今の比 ${n2(now)}`)]
  };
}

view.want = '3d';   // このテーマは、3D から見る
startCourse(LESSONS_TRANS, '歯数、変速比、時間、モーターの値などは、説明用の仮の値です。車は 1,000 kg、タイヤの半径 0.315 m、最終減速比 4.1、1速〜6速の変速比はギヤボックスLABの初期値です。グラフ「変速の間の駆動力」は、方式ごとのちがいを見せるための目安です。');
