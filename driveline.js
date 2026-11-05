// driveline.js: CAR STUDY LAB「ドライブライン」
// 1. ドライブラインの構造 2. エンジンの回転変動 3. ねじり振動の基本 4. ドライブラインの共振（しゃくり） 5. キャンベル線図 6. ジャダー 7. ゆれを減らす対策
// 計算は dyn.js、3D は dline3d.js（と study3d.js の makeEngine）

const P = { torque: 120, gear: 1, rpm: 800, flyJ: 0.15, tamp: 150, k: 600, j1: 0.1, j2: 0.2, c: 0.4, rise: 0.02, kd: 1700, slope: -0.3, ctime: 1.6, dmf: 0 };
const sec = v => `${n2(Number(v))} 秒`, gearText = g => GEARS[g][0];
const SHOW = 3;   // ねじれは、見やすいように 3 倍に大きく見せる

// ---------- 再生 ----------
const PLAY = { t: -1, end: 0, slow: 1 };
const startPlay = (end, slow) => { PLAY.t = 0; PLAY.end = end; PLAY.slow = slow; };
const tickPlay = dt => { PLAY.t += dt / PLAY.slow; return PLAY.t < PLAY.end; };
const playing = () => PLAY.t >= 0;
function valueAt(series, t) { let v = series.length ? series[0][1] : 0; for (const [x, y] of series) { if (x > t) break; v = y; } return v; }
const cache = {};
const sim = o => { const key = JSON.stringify(o); if (!cache[key]) cache[key] = simDrive(o); return cache[key]; };
const ANG = { base: 0 };   // 3D の回転（表示用にゆっくり）

// ---------- 1. 構造: 各部のトルクと回転数 ----------
const STAGES = ['フライホイール', 'クラッチ', 'インプット軸', 'アウトプット軸', 'プロペラシャフト', 'デフの出口', 'ドライブシャフト', 'タイヤ'];
function stageValues() {
  const i = GEARS[P.gear - 1][1], f = CAR.final, T = P.torque, n = 2000, e = CAR.eff;
  return STAGES.map((s, k) => k < 3 ? [T, n] : k < 5 ? [T * i * e, n / i] : [T * i * f * e, n / i / f]);
}
// ---------- 2. エンジンの回転変動: 2次の燃焼トルクのとき、ω² = ω0² − (Tamp / J) cos 2θ ----------
const omegaAt = th => Math.sqrt(Math.max(1, (P.rpm * RPM) ** 2 - P.tamp / P.flyJ * Math.cos(2 * th)));
const fluct = () => { let lo = 1e9, hi = 0; for (let d = 0; d <= 360; d += 2) { const w = omegaAt(d / 180 * Math.PI); lo = Math.min(lo, w); hi = Math.max(hi, w); } return { lo: lo / RPM, hi: hi / RPM }; };
// ---------- 3. 2つの円板の自由振動 ----------
const twoHz = () => Math.sqrt(P.k * (1 / P.j1 + 1 / P.j2)) / (2 * Math.PI);
const twoZeta = () => P.c / (2 * Math.sqrt(P.k * P.j1 * P.j2 / (P.j1 + P.j2)));
const twoTwist = t => { const wn = twoHz() * 2 * Math.PI, z = Math.min(0.99, twoZeta()); return 0.3 * Math.exp(-z * wn * t) * Math.cos(wn * Math.sqrt(1 - z * z) * t); };
// ---------- 5. キャンベル線図: クラッチダンパーのねじり共振 ----------
const damperHz = () => Math.sqrt(P.kd / J_ENGINE) / (2 * Math.PI);
const orderHz = (order, rpm) => order * rpm / 60;
// ---------- 7. 伝達率: エンジンのゆれが、ばねの先にどれだけ伝わるか ----------
const FLY = { smf: { fn: 15, z: 0.15, name: '1枚のフライホイール（SMF）' }, dmf: { fn: 6, z: 0.1, name: 'デュアルマスフライホイール（DMF）' } };
const trans = (f, fn, z) => { const r = f / fn; return Math.sqrt((1 + (2 * z * r) ** 2) / ((1 - r * r) ** 2 + (2 * z * r) ** 2)); };

// 発進とアクセルの計算の条件
const tipOpt = () => ({ g: P.gear - 1, mass: CAR.mass, pedal: 0.6, rise: P.rise, k: DL.k, c: DL.c, v0: speedAt(P.gear - 1, 2000), T0: 20, time: 2 });
const judOpt = () => ({ g: 0, mass: CAR.mass, pedal: 0.6, rise: 0.15, cSlip: 10, slope: P.slope, clutch: true, clutchTime: P.ctime, time: 4 });

// ---------- 数式の考え方 ----------
const WHY = {
  torque: { text: '歯車は、回転を遅くした分だけトルクを大きくします（出力は変わらない）。変速機で i 倍、デフで i<sub>f</sub> 倍になるので、タイヤに近い部品ほど大きなトルクがかかり、太く丈夫に作られています。',
    mark: { glow: ['gears'], text: 'ギヤでトルクが大きくなる' } },
  twist: { text: '軸は、トルクをかけると少しねじれます。ねじれ角は、トルクをねじり剛性 k（ねじれにくさ）で割った値です。ドライブラインで一番ねじれるのは、細くて長く、一番大きなトルクがかかるドライブシャフトです。1速で強く加速すると、数度もねじれています。',
    mark: { glow: ['axle'], text: 'ねじれ角 = トルク ÷ k' } },
  order: { text: '4気筒エンジンは、2回転で4回燃えるので、1回転に2回、トルクが山になります。この「1回転に何回」を次数と言い、4気筒の燃焼は2次です。ゆれの振動数は、次数 × 回転数 ÷ 60 です。',
    mark: { glow: ['pistons'], text: '1回転に2回燃える（2次）' } },
  fluct: { text: 'トルクが平均より大きい間は回転が速くなり、小さい間は遅くなります。回転のエネルギー 1/2 × J × ω² の変わり方を考えると、回転のゆれ幅は、トルクのゆれ ÷ (J × ω) に比例します。フライホイールが重い（J が大きい）ほど、回転が高いほど、ゆれは小さくなります。',
    mark: { glow: ['flywheel'], text: 'J が大きいほど、ゆれにくい' } },
  natural: { text: '2つの円板がばねでつながっていると、片方が進むとばねが引き戻し、行き過ぎるとまた戻されます。このくり返しの速さが固有振動数です。ばねが硬いほど速く、円板が重いほど遅くゆれます（ばねにつるしたおもりと同じ考え方を、回る物に置きかえた式です）。',
    mark: { glow: ['shaft', 'd1', 'd2'], text: 'ばね（ねじれ）と慣性で、ゆれる速さが決まる' } },
  ratio: { text: '2つの円板は、いつも逆向きにゆれ、軽い方が大きく動きます（重心のような点は動かない）。だからエンジン側が軽く、車側が重いドライブラインでは、エンジン側が大きくゆれます。' },
  zeta: { text: 'ゆれは、摩擦や油の抵抗（減衰 c）で小さくなっていきます。減衰比 ζ が 1 より小さいと、ゆれながら小さくなります。ドライブラインは ζ が 0.05〜0.1 くらいと小さく、ゆれが残りやすい仕組みです。' },
  shuffle: { text: 'ドライブラインを「エンジン側」と「車」の2つの慣性と、ドライブシャフトのばねで考えると、3. と同じ式になります。エンジン側は、タイヤの軸から見るとギヤ比の2乗だけ重く見えるので、低い段ほど振動数が低くなります（1速で 3 Hz くらい）。アクセルを急に踏むと、このばねがねじれて戻り、しゃくりになります。',
    mark: { glow: ['axle', 'flywheel'], text: 'エンジン側 ↔ ドライブシャフトのばね ↔ 車' } },
  campbell: { text: 'キャンベル線図は、横軸に回転数、縦軸に振動数をとり、エンジンのゆれ（次数の線）と、部品の固有振動数（横の線）を重ねた図です。2本が交わる回転数で、ゆれが大きくなります（共振）。ふだん使う回転数で交わらないように、部品の硬さや重さを決めます。' },
  damperHz: { text: 'クラッチディスクの中のダンパースプリングと、エンジン側の慣性で、固有振動数ができます。これをアイドルの回転数での燃焼の振動数より十分低くすると、エンジンのゆれが変速機に伝わりにくくなります。共振する回転数が、アイドルより下になるように設計します。',
    mark: { glow: ['springs', 'flywheel'], text: 'ダンパースプリング ↔ エンジン側' } },
  judder: { text: 'クラッチの摩擦係数は、すべる速さで少し変わります。すべりが遅くなるほど摩擦が大きくなる（傾きがマイナス）と、ゆれで回転が速くなった瞬間にトルクが増え、さらにゆれを大きくします。減衰がマイナスになったのと同じで、ゆれが自分で大きくなります（自励振動）。これがクラッチジャダーです。',
    mark: { glow: ['clutch'], text: '摩擦の傾きがマイナス → 自分でゆれが大きくなる' } },
  ceq: { text: 'すべりの速さで摩擦トルクが変わる分は、ダンパーと同じ形の力になります。これを元の減衰 c に足したものが、本当の減衰です。マイナスになると、ゆれは止まらず大きくなります。対策は、摩擦材の材料を変えて傾きをプラスにすることです。' },
  trans: { text: 'ばねを通してゆれを伝えるとき、ゆれの振動数が、ばねの固有振動数の √2 倍より高いと、先に伝わるゆれが小さくなります（防振）。固有振動数を下げるほど、低い回転数から防振できます。DMF は、やわらかいアークスプリングで固有振動数を 5〜10 Hz まで下げ、アイドルからゆれを伝えにくくしています。',
    mark: { glow: ['primary', 'secondary'], text: 'ばねの先へ伝わるゆれを小さくする' } }
};

const LESSONS_DRIVELINE = [
  {
    name: 'ドライブラインの構造', title: 'ドライブライン: エンジンからタイヤまで、力を伝える部品のつながり',
    scene: 'custom', live: true, cam: [[-0.02, 0.55, 1.45], [-0.04, -0.02, -0.15]], hint3d: 'ドライブシャフトの白い線のらせんが、ねじれです（3 倍に大きく見せています）。',
    controls: [['エンジンのトルク (N·m)', 'torque', 0, 200, 10], ['段', 'gear', 1, 6, 1, v => GEARS[v - 1][0]]],
    tick: dt => { ANG.base += dt * 3; },
    build3d: world => buildChain(world),
    update3d: it => { const tw = P.torque * total(P.gear - 1) * CAR.eff / DL.k; updateChain(it, { eng: ANG.base, disc: ANG.base, input: ANG.base, twist: tw * SHOW }); },
    text: [
      '<b>ドライブライン</b>（パワートレイン、駆動系）は、エンジンの力をタイヤまで伝える部品のつながりです。今まで学んだエンジン、クラッチ、変速機の先に、プロペラシャフト、デフ、ドライブシャフト、タイヤが続きます。',
      '<b>構造</b>（FR 車の例）: クランク軸 → <b>フライホイール</b>（重い円板）→ <b>クラッチ</b>（カバーと、ダンパースプリングの入ったディスク）→ <b>インプット軸</b> → 変速機の<b>歯車</b> → アウトプット軸 → プロペラシャフト → デフ → ドライブシャフト → タイヤ。',
      '<b>ばねと重さのつながり</b>: どの部品も、少しねじれる「ばね」と、回しにくさを持つ「重さ（慣性）」です。だからドライブラインは、たくさんのばねと重さがつながった物と考えられ、ゆれ（ねじり振動）が起きます。次の項目から、このゆれを見ていきます。',
      '<b>見る所</b>: エンジンのトルクと段を変えると、グラフの各部のトルクと、3D のドライブシャフトのねじれが変わります。'
    ],
    symbols: `T: トルク、i: 変速比、${sub('i', 'f')}: 最終減速比 ${CAR.final}、η: 伝達効率、k: ドライブシャフトのねじり剛性（タイヤの軸で ${DL.k} N·m/rad）、φ: ねじれ角。`,
    formula: () => { const v = stageValues(), tw = P.torque * total(P.gear - 1) * CAR.eff / DL.k; return [
      ['各部のトルク', `${sub('T', 'タイヤ')} = ${sub('T', 'エンジン')} × i × ${sub('i', 'f')} × η`, `${P.torque} N·m → インプット軸 ${n0(v[2][0])}、アウトプット軸 ${n0(v[3][0])}、ドライブシャフト ${n0(v[6][0])} N·m（2,000 rpm で、タイヤは ${n0(v[7][1])} rpm）`, WHY.torque],
      ['ドライブシャフトのねじれ角', 'φ = T / k', `${n0(v[6][0])} ÷ ${DL.k} = ${n2(tw)} rad（${n1(tw / Math.PI * 180)}°）`, WHY.twist]
    ]; },
    chart: () => { const v = stageValues(); return { xLabel: 'エンジン側 → タイヤ側（点は部品）', yLabel: 'かかるトルク (N·m)', xMax: 7, xStep: 1, yMax: 3000, yStep: 500,
      series: [{ name: `${gearText(P.gear - 1)}、エンジン ${P.torque} N·m`, color: '#f0a81c', width: 3, points: v.flatMap(([T], k) => [[Math.max(0, k - 0.5), T], [Math.min(7, k + 0.5), T]]) }],
      dots: v.map(([T], k) => ({ x: k, y: T, label: STAGES[k] })) }; },
    readout: () => `${gearText(P.gear - 1)}、エンジン ${P.torque} N·m: ドライブシャフトには ${n0(stageValues()[6][0])} N·m がかかり、${n1(P.torque * total(P.gear - 1) * CAR.eff / DL.k / Math.PI * 180)}° ねじれる`
  },
  {
    name: 'エンジンの回転変動', title: 'エンジンの回転変動: 燃焼のたびに、回転が速くなったり遅くなったりする',
    scene: 'custom', live: true, cam: [[0.75, 0.5, 1.0], [0.1, 0.06, 0]], hint3d: '燃焼室が光ると、その瞬間に回転が少し速くなります。回転は 1/20 の速さ、ゆれは 20 倍に大きく見せています。',
    controls: [['平均の回転数 (rpm)', 'rpm', 700, 4000, 50], ['フライホイールの慣性 J (kg·m²)', 'flyJ', 0.06, 0.3, 0.01], ['燃焼のトルクのゆれ (N·m)', 'tamp', 50, 300, 10]],
    tick: () => {},
    build3d: world => { const eng = makeEngine(world, false); const tag = label(''); sizeLabel(tag, 0.05); tag.position.set(0.05, 0.36, 0); world.add(tag); return { eng, tag, pistons: eng.pistons, parts: { pistons: eng.pistons.map(x => x.piston), flywheel: [eng.fly] } }; },
    update3d: (it, dt) => {
      const w = omegaAt(it.eng.angle), mean = P.rpm * RPM;
      spinEngine(it.eng, (mean + (w - mean) * 20) / RPM, 20, dt, false, true, 0.6);
      setLabel(it.tag, `今 ${n0(w / RPM)} rpm（平均 ${P.rpm}）`);
    },
    text: [
      '<b>エンジンの回転変動</b>: エンジンのトルクは、いつも一定ではありません。燃焼でピストンが押される瞬間に大きく、空気を押し縮めている間は小さく（マイナス）なります。そのため、回転数も、1回転の間に速くなったり遅くなったりしています。',
      '<b>構造</b>: 4気筒エンジンは、2回転で4回燃えるので、1回転に2回、トルクの山が来ます（2次の加振）。フライホイールは、重さでこのゆれをならす部品です。',
      '<b>見る所</b>: グラフは、クランクの角度（2回転）に対する回転数です。回転数が低いほど、フライホイールが軽いほど、燃焼のトルクが大きいほど、ゆれが大きくなります。アイドルで車がブルブルするのは、このゆれが変速機や車体に伝わるからです。'
    ],
    symbols: `n: 回転数、ω: 角速度、J: エンジン側の慣性、${sub('T', 'amp')}: 燃焼のトルクのゆれの大きさ、θ: クランクの角度、f: 振動数。`,
    formula: () => { const f = fluct(); return [
      ['燃焼のゆれの振動数（2次）', 'f = 2 × n / 60', `${P.rpm} rpm で ${n1(orderHz(2, P.rpm))} Hz`, WHY.order],
      ['回転のゆれ幅', `Δω ≒ ${sub('T', 'amp')} / (J × ω)`, `${n0(f.lo)}〜${n0(f.hi)} rpm（ゆれ幅 ${n0(f.hi - f.lo)} rpm）`, WHY.fluct]
    ]; },
    chart: () => { const f = fluct(); return { xLabel: 'クランクの角度 (°)、2回転', yLabel: '回転数 (rpm)', xMax: 720, xStep: 90, yMin: Math.floor((P.rpm - 400) / 100) * 100, yMax: Math.ceil((P.rpm + 400) / 100) * 100, yStep: 100,
      series: [{ name: `J = ${P.flyJ} kg·m²`, color: '#f0a81c', width: 3, points: sample(720, d => omegaAt(d / 180 * Math.PI) / RPM, 4) }, { name: '平均', color: 'rgba(255,255,255,0.5)', width: 1, dash: [4, 4], points: [[0, P.rpm], [720, P.rpm]] }],
      dots: [0, 180, 360, 540].map((d, k) => ({ x: d, y: omegaAt(d / 180 * Math.PI) / RPM, label: `${[1, 3, 4, 2][k]}番が燃焼` })) }; },   // 燃えた直後は遅く、押し下げる間に速くなる
    readout: () => { const f = fluct(); return `${P.rpm} rpm: 回転は ${n0(f.lo)}〜${n0(f.hi)} rpm の間でゆれる（${n1(orderHz(2, P.rpm))} Hz）`; }
  },
  {
    name: 'ねじり振動の基本', title: 'ねじり振動の基本: 2つの重さと1本のばねで、ゆれる速さが決まる',
    scene: 'custom', live: true, cam: [[0.25, 0.4, 1.1], [0, 0, 0]], hint3d: '「ねじって離す」で、軸をねじってから離します。1/20 の速さで見せています。',
    controls: [['ばね k (N·m/rad)', 'k', 100, 2000, 50], ['慣性 J1 (kg·m²)', 'j1', 0.02, 0.5, 0.02], ['慣性 J2 (kg·m²)', 'j2', 0.02, 0.5, 0.02], ['減衰 c (N·m·s/rad)', 'c', 0, 3, 0.1]],
    runLabel: 'ねじって離す', start: () => startPlay(1, 20), tick: dt => tickPlay(dt), reset: () => { PLAY.t = -1; },
    build3d: world => buildTwoMass(world),
    update3d: it => {
      const tw = playing() ? twoTwist(Math.min(PLAY.t, PLAY.end)) : 0, s = P.j1 + P.j2;
      updateTwoMass(it, 0.08 + 0.25 * Math.sqrt(P.j1), 0.08 + 0.25 * Math.sqrt(P.j2), tw * P.j2 / s, -tw * P.j1 / s);
    },
    text: [
      '<b>ねじり振動</b>: 回る物どうしが、ねじれる軸（ばね）でつながっていると、ねじれが戻ろうとして、2つが逆向きに行ったり来たりゆれます。ドライブラインのゆれは、すべてこの考え方で説明できます。',
      '<b>構造</b>: 2つの円板（慣性 J1、J2）と、1本のねじれる軸（ねじり剛性 k）だけの、一番簡単な形で考えます。',
      '<b>見る所</b>: 「ねじって離す」を押すと、軸をねじってから離したときのゆれを見せます。ばねを硬くすると速く、円板を重くすると遅くゆれます。軽い方の円板が大きく動くことも確かめてください。減衰を上げると、早くおさまります。'
    ],
    symbols: 'k: ねじり剛性、J1, J2: 慣性、c: 減衰、ζ: 減衰比、f: 固有振動数。',
    formula: () => [
      ['固有振動数', 'f = (1 / 2π) × √(k × (1 / J1 + 1 / J2))', `${n1(twoHz())} Hz`, WHY.natural],
      ['動く大きさの比', 'θ1 : θ2 = J2 : J1（逆向き）', `J1 側 ${n0(P.j2 / (P.j1 + P.j2) * 100)}%、J2 側 ${n0(P.j1 / (P.j1 + P.j2) * 100)}%`, WHY.ratio],
      ['減衰比', 'ζ = c / (2 × √(k × J1 × J2 / (J1 + J2)))', `${n2(twoZeta())}`, WHY.zeta]
    ],
    chart: () => ({ xLabel: '時間 (秒)', yLabel: 'ねじれ角 (°)', xMax: 1, xStep: 0.1, yMin: -20, yMax: 20, yStep: 5,
      series: [{ name: `${n1(twoHz())} Hz`, color: '#f0a81c', width: 3, points: sample(1, t => twoTwist(t) / Math.PI * 180, 0.002) }], vline: playing() ? PLAY.t : undefined }),
    readout: () => `固有振動数 ${n1(twoHz())} Hz、減衰比 ${n2(twoZeta())}`
  },
  {
    name: 'ドライブラインの共振（しゃくり）', title: 'ドライブラインの共振: アクセルを踏むと、ドライブシャフトがねじれて戻る（しゃくり）',
    scene: 'custom', live: true, cam: [[-0.02, 0.55, 1.45], [-0.04, -0.02, -0.15]], hint3d: '「アクセルを踏む」で、ドライブシャフトのねじれが、行ったり来たりします（5 倍ゆっくり、ねじれは 3 倍）。',
    controls: [['段', 'gear', 1, 6, 1, v => GEARS[v - 1][0]], ['トルクの立ち上がりの時間', 'rise', 0.02, 0.4, 0.02, sec]],
    runLabel: 'アクセルを踏む', start: () => startPlay(2, 5), tick: dt => { ANG.base += dt * 2; if (playing()) return tickPlay(dt); return false; }, reset: () => { PLAY.t = -1; },
    build3d: world => buildChain(world),
    update3d: it => { const s = sim(tipOpt()), tw = playing() ? valueAt(s.twist, PLAY.t) : s.twist[0][1]; updateChain(it, { eng: ANG.base, disc: ANG.base, input: ANG.base, twist: tw * SHOW }); },
    text: [
      '<b>ドライブラインの共振</b>: 3. の2つの円板を、ドライブラインに当てはめます。エンジン側（エンジン、クラッチ、変速機）が J1、車そのものが J2、ばねは主にドライブシャフトです。アクセルを急に踏むと、ばねがねじれて戻り、車が前後にゆれます。これが<b>しゃくり</b>（shuffle、surge）です。',
      '<b>段で変わる</b>: エンジン側は、タイヤから見るとギヤ比の2乗だけ重く見えます。だから1速では J1 が大きく、ゆっくり（3 Hz くらい）大きくゆれ、上の段ほど速く小さくなります。',
      '<b>見る所</b>: 「アクセルを踏む」を押すと、グラフにドライブシャフトのねじれ角の変わり方が出て、3D の白い線のらせんがゆれます。トルクの立ち上がりをゆっくりにすると、ゆれが小さくなります（ECU の「トルクのなまし」）。テーマ「車両運動性能」の 1. と 7. で見る、発進のギクシャクの原因の一つです。'
    ],
    symbols: `${sub('J', '1')} = J × (i × ${sub('i', 'f')})²: エンジン側の慣性（タイヤの軸で見た値）、${sub('J', '2')} = m × r²: 車の慣性、k = ${DL.k} N·m/rad。`,
    formula: () => { const g = P.gear - 1; return [
      ['しゃくりの振動数', `f = (1 / 2π) × √(k × (1 / ${sub('J', '1')} + 1 / ${sub('J', '2')}))`, GEARS.map((x, k) => `${x[0]} ${n1(shuffleHz(k))}`).join('、') + ' Hz', WHY.shuffle],
      ['エンジン側の見かけの慣性', `${sub('J', '1')} = J × (i × ${sub('i', 'f')})²`, `${gearText(g)}: ${J_ENGINE + DL.Jin} × ${n1(total(g))}² = ${n1(J1(g, true))} kg·m²（車は ${n0(J2(CAR.mass))} kg·m²）`, WHY.ratio]
    ]; },
    chart: () => { const s = sim(tipOpt()); return { xLabel: '時間 (秒)', yLabel: 'ドライブシャフトのねじれ角 (°)', xMax: 2, xStep: 0.25, yMin: 0, yMax: 25, yStep: 5,
      series: [{ name: `${gearText(P.gear - 1)}（${n1(shuffleHz(P.gear - 1))} Hz）`, color: '#f0a81c', width: 3, points: s.twist.map(([t, a]) => [t, a / Math.PI * 180]) }], vline: playing() ? PLAY.t : undefined }; },
    readout: () => { const s = sim(tipOpt()), w = waveOf(s.points, 0.05); return `${gearText(P.gear - 1)}: しゃくり ${n1(shuffleHz(P.gear - 1))} Hz、車の前後のゆれ ${n2(w.osc)} G`; }
  },
  {
    name: 'キャンベル線図', title: 'キャンベル線図: エンジンのゆれと部品の固有振動数が重なる回転数で、共振する',
    scene: 'custom', live: true, cam: [[-0.02, 0.55, 1.45], [-0.04, -0.02, -0.15]], hint3d: 'エンジン回転数のスライダーで、共振に近づくと、クラッチのダンパースプリングが大きくゆれます（大きく見せています）。',
    controls: [['エンジン回転数 (rpm)', 'rpm', 300, 3000, 50], ['クラッチダンパーのばね (N·m/rad)', 'kd', 300, 4000, 100]],
    tick: dt => { ANG.base += dt * 3; ANG.t = (ANG.t || 0) + dt; },
    build3d: world => buildChain(world),
    update3d: it => {
      const amp = Math.min(3, trans(orderHz(2, P.rpm), damperHz(), 0.1)) * 0.08, wob = amp * Math.sin((ANG.t || 0) * 12);   // 共振に近いほど大きく（見せる速さはゆっくり）
      updateChain(it, { eng: ANG.base, disc: ANG.base + wob, input: ANG.base + wob, twist: 0 });
    },
    text: [
      '<b>キャンベル線図</b>: 横軸がエンジン回転数、縦軸が振動数です。斜めの線は、エンジンのゆれ（4気筒の2次、4次）の振動数で、回転数に比例して上がります。横の線は、部品の固有振動数です。斜めの線と横の線が交わる回転数で<b>共振</b>し、ゆれや音が大きくなります。',
      '<b>例: クラッチのダンパースプリング</b>: クラッチディスクの中のばねと、エンジン側の慣性で、固有振動数ができます。これがアイドル付近の燃焼の振動数と重なると、変速機の歯車がカタカタ鳴ったり（ギヤ打音、ラトル）、車内がこもった音（こもり音）になったりします。',
      '<b>見る所</b>: ばねをやわらかくすると、共振する回転数が下がり、アイドル（750 rpm）より下になります。エンジン回転数を動かして、共振に近づくと 3D のゆれが大きくなるのを見てください。'
    ],
    symbols: `k: 次数（1回転に何回ゆれるか）、n: 回転数、${sub('k', 'd')}: ダンパースプリングのねじり剛性、${sub('J', 'e')}: エンジン側の慣性 ${J_ENGINE} kg·m²。`,
    formula: () => [
      ['エンジンのゆれの振動数', 'f = 次数 × n / 60', `${P.rpm} rpm で 2次 ${n1(orderHz(2, P.rpm))} Hz、4次 ${n1(orderHz(4, P.rpm))} Hz`, WHY.campbell],
      ['クラッチダンパーの固有振動数', `${sub('f', 'd')} = (1 / 2π) × √(${sub('k', 'd')} / ${sub('J', 'e')})`, `${n1(damperHz())} Hz → 2次で共振する回転数 ${n0(damperHz() * 30)} rpm`, WHY.damperHz]
    ],
    chart: () => { const fd = damperHz(); return { xLabel: 'エンジン回転数 (rpm)', yLabel: '振動数 (Hz)', xMax: 3000, xStep: 500, yMax: 120, yStep: 20,
      series: [{ name: '2次（燃焼）', color: '#f0a81c', width: 3, points: [[0, 0], [3000, 100]] }, { name: '4次', color: 'rgba(240,168,28,0.5)', width: 1.5, points: [[0, 0], [1800, 120]] },
        { name: `クラッチダンパー ${n1(fd)} Hz`, color: '#7fc8f8', width: 3, points: [[0, fd], [3000, fd]] }, { name: 'アイドル 750 rpm', color: 'rgba(255,255,255,0.5)', width: 1, dash: [4, 4], points: [[750, 0], [750, 120]] }],
      vline: P.rpm, dots: [{ x: fd * 30, y: fd, label: `共振 ${n0(fd * 30)} rpm` }, { x: fd * 15, y: fd, color: 'rgba(240,168,28,0.7)', label: `4次 ${n0(fd * 15)} rpm` }] }; },
    readout: () => `ダンパーの固有振動数 ${n1(damperHz())} Hz: 2次で ${n0(damperHz() * 30)} rpm に共振` + (damperHz() * 30 < 750 ? '（アイドルより下 → ふだんは共振しない）' : '（アイドルより上 → 走っている回転数で共振する）')
  },
  {
    name: 'ジャダー', title: 'ジャダー: 半クラッチの間に、ブルブルとゆれが大きくなる',
    scene: 'custom', live: true, cam: [[-0.02, 0.55, 1.45], [-0.04, -0.02, -0.15]], hint3d: '「発進する」で、半クラッチから発進します。フライホイールとクラッチディスクの回転の差が「すべり」です（5 倍ゆっくり）。',
    controls: [['摩擦係数の傾き（1,000 rpm あたり）', 'slope', -0.35, 0.2, 0.05, v => n2(Number(v))], ['クラッチをつなぐ時間', 'ctime', 0.8, 2.5, 0.1, sec]],
    runLabel: '発進する', start: () => startPlay(4, 5), tick: dt => { if (playing()) return tickPlay(dt); return false; }, reset: () => { PLAY.t = -1; ANG.eng = 0; ANG.in = 0; },
    build3d: world => buildChain(world),
    update3d: (it, dt) => {
      const s = sim(judOpt()), t = playing() ? PLAY.t : 0, rin = valueAt(s.rpm, t), locked = s.lockAt && t >= s.lockAt;
      ANG.eng = (ANG.eng || 0) + (locked ? rin : 1500) * RPM / 100 * dt;   // エンジンは 1,500 rpm（1/100 の速さで見せる）
      ANG.in = locked ? ANG.eng : (ANG.in || 0) + rin * RPM / 100 * dt;
      updateChain(it, { eng: ANG.eng, disc: ANG.in, input: ANG.in, twist: valueAt(s.twist, t) * SHOW });
    },
    text: [
      '<b>ジャダー</b>（judder）は、半クラッチで発進するときに、車がブルブルと前後にゆれる現象です。クラッチの摩擦が原因の、自分でゆれが大きくなる振動（自励振動）です。ブレーキで起きるブレーキジャダーもあります。',
      '<b>構造</b>: 半クラッチの間は、エンジン側（フライホイール）とクラッチディスクが、ちがう速さで回りながらこすれ合っています。クラッチから先（インプット軸、変速機、ドライブシャフト、車）は、2. 3. で見たばねと重さです。',
      '<b>仕組み</b>: 摩擦材の摩擦係数は、すべる速さで少し変わります。すべりが遅くなるほど摩擦が大きくなる（傾きがマイナス）と、ゆれを止める力（減衰）がマイナスになったのと同じで、ゆれがどんどん大きくなります。摩擦材が熱くなったり、油がついたりすると、こうなりやすくなります。',
      '<b>見る所</b>: 傾きを 0 からマイナスにしていき、「発進する」を押してください。グラフの加速度のゆれが、半クラッチの間（クラッチがつながる前）に大きくなっていきます。振動数は、クラッチより先のばねと重さで決まります（1速で 8 Hz くらい）。つながった後に残るゆっくりしたゆれ（3 Hz）は、4. のしゃくりです。'
    ],
    symbols: `μ: 摩擦係数、Δω: すべりの速さ、${sub('F', 'p')}: 押し付ける力、${sub('R', 'm')}: 摩擦面の平均の半径、c: ドライブラインの減衰（ここでは半クラッチの間 10 N·m·s/rad）。`,
    formula: () => { const s = sim(judOpt()), w = waveOf(s.points.filter(([t]) => t > 0.3 && t < (s.lockAt || 4)), 0); return [
      ['摩擦係数とすべりの速さ', 'μ(Δω) = μ₀ × (1 + 傾き × Δn / 1000)', `傾き ${n2(P.slope)} → すべりが 1,000 rpm 遅くなると、μ が ${n0(-P.slope * 100)}% ${P.slope < 0 ? '大きくなる' : '小さくなる'}`, WHY.judder],
      ['本当の減衰', `${sub('c', 'eq')} = c + (dμ / dΔω) × ${sub('F', 'p')} × ${sub('R', 'm')} × 2 × (i × ${sub('i', 'f')})²`, w.osc > 0.05 ? `マイナス → ${n1(w.hz)} Hz のゆれが大きくなる（${n2(w.osc)} G）` : 'プラス → ゆれはおさまる', WHY.ceq]
    ]; },
    chart: () => { const s = sim(judOpt()); return { xLabel: '時間 (秒)', yLabel: '前後の加速度 (G)', xMax: 4, xStep: 0.5, yMin: -0.4, yMax: 0.6, yStep: 0.1,
      series: [{ name: `傾き ${n2(P.slope)}`, color: '#f0a81c', width: 3, points: s.points }], vline: playing() ? PLAY.t : undefined,
      dots: s.events.map(e => ({ x: e.x, y: valueAt(s.points, e.x), label: e.label })) }; },
    readout: () => { const s = sim(judOpt()), w = waveOf(s.points.filter(([t]) => t > 0.3 && t < (s.lockAt || 4)), 0); return (w.osc > 0.05 ? `ジャダーが出る: 半クラッチの間に ${n1(w.hz)} Hz、${n2(w.osc)} G のゆれ` : 'ジャダーは出ない') + (s.lockAt ? `、${n2(s.lockAt)} 秒でクラッチがつながる` : ''); }
  },
  {
    name: 'ゆれを減らす対策', title: 'ゆれを減らす対策: DMF、クラッチダンパー、エンジンの制御',
    scene: 'custom', live: true, cam: [[0.3, 0.3, 0.75], [0.05, 0, 0]], hint3d: 'エンジン側（プライマリー）のゆれと、変速機側（セカンダリー）のゆれを比べます（ゆれは大きく、回転はゆっくり見せています）。',
    controls: [['エンジン回転数 (rpm)', 'rpm', 500, 4000, 50]],
    actions: [['1枚のフライホイール（SMF）', () => { P.dmf = 0; redo3d(); }, () => !P.dmf], ['デュアルマスフライホイール（DMF）', () => { P.dmf = 1; redo3d(); }, () => !!P.dmf]],
    tick: dt => { ANG.base += dt * 2; ANG.t = (ANG.t || 0) + dt; },
    build3d: world => buildDmf(world, !!P.dmf),
    update3d: it => {
      const f = FLY[P.dmf ? 'dmf' : 'smf'], wob = Math.sin((ANG.t || 0) * 10) * 0.12 * 800 / P.rpm;   // エンジン側のゆれ（回転数が低いほど大きい）
      it.pri.rotation.x = ANG.base + wob;
      it.sec.rotation.x = ANG.base + wob * Math.min(2.5, trans(orderHz(2, P.rpm), f.fn, f.z));
    },
    text: [
      '<b>対策の考え方</b>: ゆれは、① 元のゆれを小さくする、② 伝わる途中で止める（防振）、③ 共振しないようにする、の3つで減らします。',
      '<b>デュアルマスフライホイール（DMF）</b>: フライホイールを、エンジン側（プライマリー）とクラッチ側（セカンダリー）の2つに分け、間にやわらかい円弧のばね（アークスプリング）を入れた物です。固有振動数を 5〜10 Hz まで下げ、アイドルから上の回転数で、エンジンの回転変動を変速機に伝えにくくします。ディーゼル車や、低い回転を多く使う車に多く使われます。',
      '<b>そのほかの対策</b>: クラッチディスクのダンパースプリング（5. の共振をアイドルより下にする）、遠心振り子ダンパー（回転数に合わせてゆれを打ち消す重り）、トルクコンバーターのロックアップダンパー、エンジンの制御（アクセルを踏んだときのトルクをなます、しゃくりと逆向きのトルクを出してゆれを消すアクティブダンピング）、ドライブシャフトの硬さや重さの見直し、などがあります。',
      '<b>見る所</b>: グラフは、エンジンのゆれ（2次）が変速機側にどれだけ伝わるか（伝達率）です。1 より小さいと、伝わるゆれが小さくなっています。SMF と DMF を切りかえて、3D のセカンダリーのゆれを比べてください。'
    ],
    symbols: `r = f / ${sub('f', 'n')}: ゆれの振動数と固有振動数の比、ζ: 減衰比、T: 伝達率。`,
    formula: () => { const f = FLY[P.dmf ? 'dmf' : 'smf'], fe = orderHz(2, P.rpm); return [
      ['伝達率', 'T = √((1 + (2ζr)²) / ((1 − r²)² + (2ζr)²))、r = f / f<sub>n</sub>', `${f.name}: ${P.rpm} rpm（${n1(fe)} Hz）で ${n2(trans(fe, f.fn, f.z))}（1 より小さいと防振）`, WHY.trans]
    ]; },
    chart: () => ({ xLabel: 'エンジン回転数 (rpm)', yLabel: '伝達率（変速機側へ伝わるゆれの割合）', xMax: 4000, xStep: 500, yMax: 3, yStep: 0.5,
      series: ['smf', 'dmf'].map(k => ({ name: `${FLY[k].name}（${FLY[k].fn} Hz）`, color: k === 'dmf' ? '#7fc8f8' : '#f0a81c', width: (P.dmf ? 'dmf' : 'smf') === k ? 4 : 1.5, points: sample(4000, n => Math.min(3, trans(orderHz(2, Math.max(1, n)), FLY[k].fn, FLY[k].z)), 20) }))
        .concat([{ name: '', color: 'rgba(255,255,255,0.5)', width: 1, dash: [4, 4], points: [[0, 1], [4000, 1]] }]), vline: P.rpm }),
    readout: () => { const fe = orderHz(2, P.rpm); return `${P.rpm} rpm（${n1(fe)} Hz）: SMF の伝達率 ${n2(trans(fe, 15, 0.15))}、DMF の伝達率 ${n2(trans(fe, 6, 0.1))}`; }
  }
];

view.want = '3d';
startCourse(LESSONS_DRIVELINE, 'ねじり剛性、慣性、減衰、摩擦係数、固有振動数などは、説明用の値です。車は 1,000 kg、タイヤの半径 0.315 m、最終減速比 4.1、1速〜6速の変速比はギヤボックスLABの初期値、エンジンは 2.0 L の自然吸気4気筒を想定しています。');
