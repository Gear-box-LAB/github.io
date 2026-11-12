// launch.js: CAR STUDY LAB「ローンチ制御」
// 1. 摩擦円 2. スリップ率 3. ホイールスピン 4. クラッチの役割 5. ローンチ制御 6. 油圧でクラッチを動かす
// 計算はこのファイル、3D は launch3d.js（タイヤの接地面、車の中の力の流れ、湿式多板クラッチ）

const P = { mu: 1.0, load: 4.9, fx: 3, fy: 2, slip: 10, torque: 200, gear: 1, cap: 140, aim: 10, view: 0, plates: 8 };
const pct = v => `${v}%`, kN = v => `${n1(Number(v))} kN`, nm = v => `${v} N·m`;

// ---------- タイヤと車（後輪駆動。説明用の値） ----------
const TIRE = { B: 10, C: 1.9, floor: 1.0 };   // 摩擦の形（マジックフォーミュラの係数）。floor: 止まっている近くで、スリップ率の分母を 1 m/s より小さくしない
const BODY = { rear: 0.5, h: 0.5, L: 2.6, Jw: 2.0, Jin: 0.02 };   // 後輪にかかる重さの割合、重心の高さ (m)、ホイールベース (m)、後輪2本の慣性 (kg·m²)、クラッチディスク + インプット軸の慣性
// スリップ率 s のときの、摩擦係数（μ は路面の一番大きい摩擦係数）。s が約 11% で一番大きくなる
const muAt = (s, mu) => mu * Math.sin(TIRE.C * Math.atan(TIRE.B * s));
const PEAK = Math.tan(Math.PI / 2 / TIRE.C) / TIRE.B;   // 一番大きい摩擦になるスリップ率（約 0.11）
// 加速度 a (m/s²) のときの、後輪の荷重 (N)。加速すると、重さが後ろへ移る
const rearLoad = a => CAR.mass * G * BODY.rear + CAR.mass * a * BODY.h / BODY.L;
// 路面が受け持てる一番大きい駆動力 (N)。荷重移動も入れて、F = μ × W と a = F / m を同時に満たす値
const tractionMax = mu => mu * CAR.mass * G * BODY.rear / (1 - mu * BODY.h / BODY.L);
// エンジントルク T を、g 段でタイヤの力 (N) にしたもの
const wheelForce = (T, g) => T * total(g) * CAR.eff / CAR.tire;

// ---------- 発進の計算 ----------
// o: { mu 路面、cap クラッチで伝える一番大きいトルク (N·m)、ecu ローンチ制御を使うか、aim 目標のスリップ率、time 計算する時間 }
// 半クラッチの間、エンジンは 4,000 rpm に保つ（ローンチ制御の回転数を保つ働き。運転する人が保つときも同じとする）
// 戻り値: 0.01 秒ごとの { t, a 加速度 G, v 車速 km/h, s スリップ率, te エンジントルク, tc クラッチのトルク, lim 制御のトルク上限, rpm, wheel タイヤの回転 rad/s, lock }
const LAUNCH_RPM = 4000;
function launchSim(o) {
  const dt = 0.0002, N = total(0), r = CAR.tire, m = CAR.mass;
  const Jw = BODY.Jw + BODY.Jin * N * N;              // タイヤの側の慣性（タイヤ + クラッチから先を、タイヤの軸で見た値）
  let we = LAUNCH_RPM * RPM, ww = 0, v = 0, a = 0, t = 0, lock = false, lim = o.cap, err0 = 0;
  const out = [];
  for (let k = 0; t < o.time; k++) {
    t += dt;
    const s = Math.max(0, (ww * r - v) / Math.max(ww * r, TIRE.floor));
    const fx = muAt(s, o.mu) * rearLoad(a);            // 路面がタイヤを前に押す力
    // ローンチ制御: スリップ率が目標より大きければトルクの上限を下げ、小さければ上げる（PI 制御）
    if (o.ecu) { const err = o.aim - s; lim = Math.min(o.cap, Math.max(0, lim + 2500 * err * dt + 400 * (err - err0))); err0 = err; }
    const full = we / RPM >= REDLINE ? 0 : torqueAt(we / RPM);   // アクセル全開のエンジントルク（レッドゾーンで燃料を止める）
    let te, tc;
    if (!lock) {
      tc = Math.min(1, t / 0.15) * (o.ecu ? Math.min(o.cap, lim) : o.cap);   // クラッチは 0.15 秒でつなぐ
      te = Math.min(full, Math.max(0, tc + J_ENGINE * (LAUNCH_RPM * RPM - we) / 0.05));   // 回転数を保つトルク
      we += (te - tc) / J_ENGINE * dt;
      ww += (tc * N * CAR.eff - fx * r) / Jw * dt;
      if (we <= ww * N) { lock = true; ww = we / N; }
    } else {
      te = o.ecu ? Math.min(full, lim) : full;         // つながった後は、点火・燃料・スロットルでトルクを下げる
      tc = te;
      ww += (te * N * CAR.eff - fx * r) / (Jw + J_ENGINE * N * N) * dt;
      we = ww * N;
    }
    a = (fx - resistTotal(v * 3.6, 0, m)) / m;
    v = Math.max(0, v + a * dt);
    if (k % 50 === 0) out.push({ t, a: a / G, v: v * 3.6, s, te, tc, lim: o.ecu ? Math.min(o.cap, lim) : o.cap, rpm: we / RPM, wheel: ww, lock });
  }
  return out;
}
const cache = {};
const sim = o => { const key = JSON.stringify(o); return cache[key] || (cache[key] = launchSim(o)); };

// ---------- 再生（3D とグラフの縦の線を、計算の時間に合わせて動かす） ----------
const PLAY = { t: -1, slow: 1, end: 0 };
const startPlay = (end, slow) => { PLAY.t = 0; PLAY.end = end; PLAY.slow = slow; };
const tickPlay = dt => { if (PLAY.t < 0) return false; PLAY.t += dt / PLAY.slow; return PLAY.t < PLAY.end; };   // グラフの切り替えボタンでは、再生しない
const playing = () => PLAY.t >= 0;
const pointAt = (s, t) => s.find(p => p.t >= t) || s[s.length - 1];
// 再生していないときは、最後（または最初）の点を見せる
const nowPoint = (s, idle) => pointAt(s, playing() ? PLAY.t : idle);
// スライダーの位置と数字を、P の値に合わせる（ボタンで値を変えたとき）
function syncSlider(key) {
  const input = el('controls').querySelector(`[data-key="${key}"]`);
  if (input) { input.value = P[key]; input.nextElementSibling.textContent = valueText(key); }
}
// 時間を横軸にしたグラフ
const timeChart = (yLabel, yMin, yMax, yStep, series, end) => ({ xLabel: '時間 (秒)', yLabel, xMax: end, xStep: 0.5, yMin, yMax, yStep, series, vline: playing() ? PLAY.t : undefined });
// グラフの選び方（4. と 5.）: 0 加速度、1 スリップ率、2 トルク
const PICKS = [['加速度 (G)', p => p.a, 0, 0.7, 0.1], ['スリップ率 (%)', p => p.s * 100, 0, 100, 10], ['トルク (N·m)', p => p.te, 0, 300, 50]];
const pickActions = n => PICKS.slice(0, n).map(([name], k) => [`グラフ: ${name.split(' ')[0]}`, () => { P.view = k; renderLesson(); }, () => P.view === k]);
const line = (s, f, name, color, dash) => ({ name, color, dash, points: s.map(p => [p.t, f(p)]) });

// 各項目の条件
const capOpt = () => ({ mu: P.mu, cap: P.cap, ecu: false, aim: 0, time: 2 });
const onOpt = () => ({ mu: P.mu, cap: 250, ecu: true, aim: P.aim / 100, time: 2.5 });
const offOpt = () => ({ mu: P.mu, cap: 250, ecu: false, aim: 0, time: 2.5 });
// 3. の発進の力: エンジントルクを、変速機とデフでタイヤの力にしたもの。路面の限界より大きいときは、すべって回る
const slipFor = (f, mu, w) => { let lo = 0, hi = PEAK; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (muAt(m, mu) * w < f) lo = m; else hi = m; } return lo; };
// 湿式多板クラッチ: T = n × μc × (P × A − ばねの力) × Rm
const WET = { mu: 0.12, A: 0.004, Rm: 0.08, kiss: 0.1 };   // 摩擦係数、ピストンの面積 (m²)、摩擦面の平均半径 (m)、キスポイント (MPa)
const torqueOfP = (p, n) => n * WET.mu * Math.max(0, p - WET.kiss) * 1e6 * WET.A * WET.Rm;
const pOfTorque = (t, n) => WET.kiss + t / (n * WET.mu * 1e6 * WET.A * WET.Rm);
// 油圧の指令: 半クラッチの間はローンチ制御が決めたトルク。つながった後は、すべらないように 1.3 倍の余裕を持たせる
const pressureOf = (p, n) => pOfTorque(p.lock ? p.te * 1.3 : p.tc, n);

// ---------- 数式の考え方 ----------
const WHY = {
  muW: { text: 'タイヤが路面に伝えられる力には限界があり、荷重 W（タイヤを路面に押し付ける重さ）に摩擦係数 μ を掛けた値です。乾いたアスファルトで μ ≈ 1.0、ぬれた路面で 0.5〜0.7、雪で 0.2〜0.3 くらいです。エンジンをどれだけ強くしても、この値より大きな力は路面に伝わりません。',
    mark: { glow: ['load', 'tire'], text: 'F の限界 = μ × W' } },
  circle: { text: '前後の力（駆動・ブレーキ）と横の力（曲がる力）は、同じ摩擦の限界を分け合います。2つを合わせた力（ベクトルの長さ）が μW の円の中にあればつかんでいて、外に出るとすべります。この円を<b>摩擦円</b>といいます。曲がりながら強く加速すると、前に使える力が減るのはこのためです。',
    mark: { glow: ['circle', 'fx'], text: '合わせた力が円の中ならつかむ' } },
  transfer: { text: '加速すると、慣性の力が重心（高さ h）にかかり、前輪の荷重が減って後輪の荷重が増えます（荷重移動）。増える分は m × a × h / L です。後輪駆動は、加速するほど駆動輪の荷重が増えるので、発進に有利です。',
    mark: { glow: ['load'], text: '加速で後輪の荷重が増える' } },
  slip: { text: '<b>スリップ率</b>は、タイヤの周速（ω × r）が車速 v よりどれだけ速いかの割合です。0% は空転なし、100% は車が止まったままタイヤだけ回る状態です。駆動力を出しているタイヤは、ゴムがたわむので、少しだけ車より速く回っています。',
    mark: { glow: ['tire'], text: 's = (ω × r − v) / (ω × r)' } },
  muSlip: { text: 'タイヤの摩擦係数は、スリップ率で変わります。小さいスリップ率では、ゴムのたわみ（つかんでいる所）が増えるほど力が増え、約 10〜15% で一番大きくなります。それより大きいと、接地面の全部がすべり、力は減ります。ここでは、メーカーでも使う「マジックフォーミュラ」の形で描いています（係数は説明用）。',
    mark: { glow: ['patch'], text: '約 11% で一番大きい' } },
  brush: { text: '接地面のゴムを、短い毛（ブラシ）の並びと考えます（ブラシモデル）。前の端から入った毛は、路面をつかんだまま後ろへ送られる間に、スリップ率に比例してたわみます。たわみの力が、その場所の摩擦の限界（真ん中が大きい放物線）を超えると、すべります。3D の青い毛はつかんでいる所、赤い毛はすべっている所です。',
    mark: { glow: ['patch'], text: '青: つかむ　赤: すべる' } },
  force: { text: 'エンジントルクは、変速機（1速 3.64）とデフ（4.1）で約 15 倍になってタイヤの軸に伝わり、タイヤの半径で割ると、タイヤが地面を押す力になります。1速では、200 N·m のエンジンでも約 8,700 N になります。',
    mark: { glow: ['fx'], text: 'F = T × i × if × η / r' } },
  spin: { text: 'タイヤを回す力が路面の限界 μW より大きいと、タイヤは路面をつかみきれず、勢いよく回ります（ホイールスピン）。スリップ率が大きくなると摩擦係数が下がるので、加速はかえって弱くなり、タイヤも減ります。',
    mark: { glow: ['tire', 'patch'], text: '駆動力 > μW → ホイールスピン' } },
  tLimit: { text: '路面の限界の力を、逆にエンジントルクに直した値です。これより大きいトルクは、1速の発進では使い切れません。だから、強いエンジンほど、トルクを路面に合わせて減らす制御が要ります。',
    mark: { glow: ['tire'], text: '使えるトルク = μW × r / (i × if × η)' } },
  clutch: { text: '半クラッチの間、クラッチが伝えるトルクは、押し付ける力と摩擦係数で決まり、エンジンのトルクとは別に決められます。エンジンを高い回転に保ったまま、伝えるトルクだけを路面の限界に合わせられるのが、クラッチの大事な役目です。',
    mark: { glow: ['clutch'], text: '伝えるトルクはクラッチが決める' } },
  energy: { text: '半クラッチでは、エンジンとクラッチディスクの回転の差 × 伝えるトルクの分のエネルギーが、熱になります。発進を速くしようと高い回転でつなぐほど、クラッチは熱くなります。ローンチ制御の回数を制限する車があるのは、このためです。',
    mark: { glow: ['clutch'], text: '熱 = トルク × 回転の差 × 時間' } },
  pi: { text: 'ECU は、駆動輪と前輪（車速）の回転の差からスリップ率を求め、目標（約 10%）より大きければトルクの上限を下げ、小さければ上げます。差に比例して変える分（P）と、差を足し合わせて変える分（I）を組み合わせるので、PI 制御と呼びます。',
    mark: { glow: ['ecu'], text: 'スリップ率を目標に保つ' } },
  cut: { text: 'エンジントルクを下げる手段は3つです。<b>点火カット・点火時期の遅角</b>（一番速い、数ミリ秒）、<b>燃料カット</b>（気筒ごとに止める）、<b>スロットル</b>（空気を減らす、ゆっくり）。ローンチ制御では、速い点火と、ゆっくりのスロットルを組み合わせます。DCT や AT では、これに<b>クラッチの油圧</b>を加えて、協調して制御します。',
    mark: { glow: ['engine', 'ecu'], text: '点火・燃料・スロットル・クラッチ' } },
  wet: { text: '湿式多板クラッチは、油の中で、摩擦板と鋼板を交互に重ねたものです。ピストンの裏に油圧をかけると、板が押し付けられます。伝えるトルクは、摩擦面の数 n × 摩擦係数 μc × 押す力 × 平均半径 Rm です。押す力は、油圧 × ピストンの面積から、戻しばねの力を引いたものです。',
    mark: { glow: ['piston', 'plates'], text: 'T = n × μc × (P × A − ばね) × Rm' } },
  kiss: { text: '油圧が低い間は、ピストンが戻しばねに逆らって、板のすきまを詰めるだけで、トルクは伝わりません。板が触れ始める油圧を<b>キスポイント</b>といいます。ここを正確に知っていないと、発進の瞬間にトルクが遅れたり、急に出てショックになったりします。TCU は、走りながらキスポイントを学習しています。',
    mark: { glow: ['springs', 'piston'], text: 'キスポイントまでは、すきまを詰める' } },
  valve: { text: 'TCU（変速機のコンピューター）が電流でソレノイド弁を動かし、クラッチへ送る油の圧力を決めます。電流 → 油圧 → 押す力 → 伝えるトルク、の順に変わるので、ローンチ制御は「トルクの目標」を「油圧の目標」に直して指令します。',
    mark: { glow: ['valve'], text: '電流 → 油圧 → トルク' } }
};

const LESSONS_LAUNCH = [
  {
    name: 'タイヤの摩擦円', title: 'タイヤが受け持てる力は、摩擦係数 × 荷重（摩擦円）',
    scene: 'custom', cam: [[0.6, 0.75, 0.8], [0, 0.05, 0.05]], hint3d: '部品や矢印をタッチすると、説明が出ます。黄色い輪が摩擦円です（力 1 kN を 5 cm で描いています）。',
    controls: [['路面の摩擦係数 μ', 'mu', 0.2, 1.2, 0.05, n2], ['荷重 W', 'load', 2, 8, 0.1, kN], ['前後の力', 'fx', -8, 8, 0.1, kN], ['横の力', 'fy', -8, 8, 0.1, kN]],
    reset: () => { P.mu = 1.0; P.load = 4.9; P.fx = 3; P.fy = 2; },
    build3d: world => buildTire(world),
    update3d: (it, dt) => { const lim = P.mu * P.load * 1000, over = Math.hypot(P.fx, P.fy) * 1000 > lim; updateTire(it, dt, { s: over ? 0.5 : 0.05 * Math.hypot(P.fx, P.fy) * 1000 / lim, fx: P.fx * 1000, fy: P.fy * 1000, limit: lim, load: P.load * 1000, v: 0.3, circle: true, text: over ? '円の外: すべる' : '円の中: つかんでいる' }); },
    text: [
      '<b>ローンチ制御</b>は、ひとことでいうと「タイヤがすべる寸前の駆動力を保ちながら、一番速く加速する制御」です。学ぶ順番は、エンジン → クラッチ → 変速機 → ドライブシャフト → タイヤ → 路面 の、最後の<b>路面</b>からです。路面が受け持てる力が、すべての上限になるからです。',
      '<b>構造</b>: タイヤは、手のひらくらいの広さ（接地面）だけで路面に触れています。後輪駆動の車では、1,000 kg の車の約半分、約 4.9 kN が後輪2本にかかります。',
      '<b>仕組み</b>: 接地面で伝えられる力は、摩擦係数 μ × 荷重 W までです。前後の力（加速・ブレーキ）と横の力（曲がる）は、この限界を分け合います。2つを合わせた力が、半径 μW の円（<b>摩擦円</b>）の中ならつかみ、外ならすべります。',
      '<b>見る所</b>: 前後の力や横の力を大きくすると、白い矢印が黄色い輪の外に出て、赤くなります。μ を下げる（ぬれた路面、雪）と、輪が小さくなります。'
    ],
    symbols: 'F: 路面が受け持てる力、μ: 摩擦係数、W: 荷重（タイヤを路面に押し付ける力）、F<sub>x</sub>: 前後の力、F<sub>y</sub>: 横の力、m: 車の重さ、a: 加速度、h: 重心の高さ（0.5 m）、L: ホイールベース（2.6 m）。',
    formula: () => {
      const lim = P.mu * P.load, tot = Math.hypot(P.fx, P.fy);
      return [
        ['受け持てる力', 'F = μ × W', `${n2(P.mu)} × ${n1(P.load)} kN = ${n1(lim)} kN`, WHY.muW],
        ['摩擦円', `√(${sub('F', 'x')}² + ${sub('F', 'y')}²) ≤ μ × W`, `${n1(tot)} kN ${tot <= lim ? '≤' : '>'} ${n1(lim)} kN → ${tot <= lim ? 'つかんでいる' : 'すべる'}`, WHY.circle],
        ['加速したときの後輪の荷重', `${sub('W', 'r')} = m × g × 0.5 + m × a × h / L`, `0.5 G で ${n1(rearLoad(0.5 * G) / 1000)} kN（止まっていると ${n1(rearLoad(0) / 1000)} kN）`, WHY.transfer]
      ];
    },
    chart: () => {
      const lim = P.mu * P.load, circle = sample(Math.PI * 2, a => 0, 0.05).map(([a]) => [lim * Math.sin(a), lim * Math.cos(a)]);
      const over = Math.hypot(P.fx, P.fy) > lim;
      return { xLabel: '横の力 (kN)', yLabel: '前後の力 (kN、+ は加速)', xMin: -9, xMax: 9, xStep: 2, yMin: -9, yMax: 9, yStep: 2, square: true,
        series: [{ name: `摩擦円 μW = ${n1(lim)} kN`, color: '#ffd54f', points: circle.concat([circle[0]]) }, { name: '合わせた力', color: over ? '#e57373' : '#ffffff', points: [[0, 0], [P.fy, P.fx]] }],
        dots: [{ x: P.fy, y: P.fx, color: over ? '#e57373' : '#ffffff', label: over ? 'すべる' : 'つかむ' }] };
    },
    readout: () => { const lim = P.mu * P.load, tot = Math.hypot(P.fx, P.fy); return `合わせた力 ${n1(tot)} kN / 限界 ${n1(lim)} kN（${n0(tot / lim * 100)}% を使用）`; }
  },
  {
    name: 'スリップ率', title: 'スリップ率: タイヤは、少しすべっているときに一番大きな力を出す',
    scene: 'custom', cam: [[0.04, 0.16, 0.62], [0, 0.07, 0]], hint3d: '横から見ています。タイヤを透かして、接地面のゴムを毛の並びで見せています。青はつかんでいる所、赤はすべっている所です。毛は高く、たわみは4倍に大きく見せています。',
    controls: [['スリップ率', 'slip', 0, 40, 1, pct], ['路面の摩擦係数 μ', 'mu', 0.2, 1.2, 0.05, n2]],
    runLabel: '0 → 5 → 10 → 15 → 30% を順に見る',
    start: () => startPlay(7.5, 1),
    tick: dt => { const on = tickPlay(dt); P.slip = [0, 5, 10, 15, 30][Math.min(4, Math.floor(PLAY.t / 1.5))]; syncSlider('slip'); if (!on) PLAY.t = -1; return on; },
    reset: () => { P.slip = 10; P.mu = 1.0; PLAY.t = -1; },
    build3d: world => buildTire(world),
    update3d: (it, dt) => { const s = P.slip / 100, w = rearLoad(0); updateTire(it, dt, { s, fx: muAt(s, P.mu) * w, fy: 0, limit: P.mu * w, load: w, v: 0.15, text: `スリップ率 ${P.slip}%` }); },
    text: [
      '<b>スリップ率</b>は、タイヤの周速（ω × r）が、車速 v よりどれだけ速いかの割合です。ローンチ制御は、このスリップ率を、一番力が出る値に保つ技術です。',
      '<b>構造</b>: 接地面のゴム（トレッド）は、細かいブロックの集まりで、路面をつかむと、ばねのようにたわみます。',
      '<b>仕組み</b>: 駆動力を出しているタイヤは、ゴムがたわむぶん、車より少し速く回ります。スリップ率が増えると、つかんでいる所のたわみが増えて力が増えます。約 11% で接地面の全部がすべり始め、力は一番大きくなります。それより大きいと、すべる所ばかりになり、力は下がります。',
      '<b>見る所</b>: 「0 → 5 → 10 → 15 → 30% を順に見る」を押すと、接地面の毛が、青（つかむ）から赤（すべる）に変わっていく様子と、グラフの点の動きが見られます。'
    ],
    symbols: 's: スリップ率、ω: タイヤの角速度、r: タイヤの半径、v: 車速、μ(s): スリップ率 s のときの摩擦係数、B、C: 摩擦の形を決める係数（B = 10、C = 1.9、説明用）。',
    formula: () => {
      const s = P.slip / 100;
      return [
        ['スリップ率', 's = (ω × r − v) / (ω × r)', `${P.slip}%: タイヤは車速の ${n2(1 / (1 - s))} 倍で回る`, WHY.slip],
        ['摩擦係数とスリップ率', 'μ(s) = μ × sin(C × atan(B × s))', `μ(${P.slip}%) = ${n2(muAt(s, P.mu))}（一番大きいのは s = ${n0(PEAK * 100)}% で ${n2(P.mu)}）`, WHY.muSlip],
        ['つかむ所とすべる所', 'たわみ = s × ξ ≤ 摩擦の限界(ξ)', s >= PEAK ? '接地面の全部がすべっている' : `前から ${n0((1 - s / PEAK) * 100)}% がつかんでいる`, WHY.brush]
      ];
    },
    chart: () => ({ xLabel: 'スリップ率 (%)', yLabel: '摩擦係数 μ(s)', xMax: 100, xStep: 10, yMin: 0, yMax: 1.3, yStep: 0.1, vline: PEAK * 100,
      series: [{ name: `μ = ${n2(P.mu)}`, color: '#f0a81c', points: sample(100, x => muAt(x / 100, P.mu), 0.5) }, { name: 'ぬれた路面 μ = 0.6', color: '#7fc8f8', dash: [6, 4], points: sample(100, x => muAt(x / 100, 0.6), 0.5) }],
      dots: [{ x: P.slip, y: muAt(P.slip / 100, P.mu), label: `${P.slip}%` }, { x: PEAK * 100, y: P.mu, color: '#ffd54f', label: '一番大きい（約 11%）' }] }),
    readout: () => `スリップ率 ${P.slip}%: 摩擦係数 ${n2(muAt(P.slip / 100, P.mu))}、後輪の駆動力 ${n0(muAt(P.slip / 100, P.mu) * rearLoad(0))} N`
  },
  {
    name: 'ホイールスピン', title: 'ホイールスピンは、エンジンの力が路面の限界を超えたときに起きる',
    scene: 'custom', cam: [[0.2, 0.32, 0.95], [0, 0.17, 0]], hint3d: 'エンジントルクを大きくして、タイヤがすべって回る様子を見てください。',
    controls: [['エンジントルク', 'torque', 50, 400, 10, nm], ['段', 'gear', 1, 2, 1, v => GEARS[v - 1][0]], ['路面の摩擦係数 μ', 'mu', 0.2, 1.2, 0.05, n2]],
    reset: () => { P.torque = 200; P.gear = 1; P.mu = 1.0; },
    build3d: world => buildTire(world),
    update3d: (it, dt) => {
      const f = wheelForce(P.torque, P.gear - 1), lim = tractionMax(P.mu), w = lim / P.mu, spin = f > lim;
      updateTire(it, dt, { s: spin ? 0.6 : slipFor(f, P.mu, w), fx: spin ? muAt(0.6, P.mu) * w : f, fy: 0, limit: lim, load: w, v: 0.15, text: spin ? `ホイールスピン（タイヤを回す力 ${n1(f / 1000)} kN）` : 'つかんで加速している' });
    },
    text: [
      '<b>ホイールスピン</b>は、エンジンがタイヤを回そうとする力が、路面が受け持てる力 μW より大きいときに起きます。',
      '<b>構造</b>: エンジントルクは、変速機（1速 3.64）とデフ（4.1）で約 15 倍になってタイヤに伝わります。止まった所からでも、エンジンは 100、200、300、400 N·m と出せます。',
      '<b>仕組み</b>: 1速では、約 140 N·m で、もう路面の限界（約 6 kN）に届きます。それより大きいトルクは路面に伝わらず、タイヤを空転させるだけです。すべると摩擦係数が下がるので、加速はかえって弱くなります。だから ECU は、点火カット、燃料カット、スロットルでトルクを減らします。',
      '<b>見る所</b>: エンジントルクを上げて、グラフの駆動力の線が、路面の限界（黄色）を超える所を見てください。2速にすると、同じトルクでも力が小さく、すべりにくくなります。μ を下げると、限界が下がります。'
    ],
    symbols: 'F: タイヤが地面を押す力、T: エンジントルク、i: 変速比、i<sub>f</sub>: 最終減速比（4.1）、η: 伝達効率（0.92）、r: タイヤの半径（0.315 m）、μW: 路面の限界（加速による荷重移動も入れた値）。',
    formula: () => {
      const f = wheelForce(P.torque, P.gear - 1), lim = tractionMax(P.mu), tl = lim * CAR.tire / (total(P.gear - 1) * CAR.eff);
      return [
        ['タイヤを回す力', `F = T × i × ${sub('i', 'f')} × η / r`, `${P.torque} N·m × ${n1(total(P.gear - 1))} × 0.92 / 0.315 = ${n0(f)} N`, WHY.force],
        ['ホイールスピンする条件', 'F > μ × W', `${n0(f)} N ${f > lim ? '>' : '≤'} ${n0(lim)} N → ${f > lim ? 'ホイールスピン' : 'つかむ'}`, WHY.spin],
        ['使い切れるエンジントルク', `${sub('T', '限界')} = μ × W × r / (i × ${sub('i', 'f')} × η)`, `${GEARS[P.gear - 1][0]}で ${n0(tl)} N·m まで`, WHY.tLimit]
      ];
    },
    chart: () => {
      const lim = tractionMax(P.mu) / 1000;
      return { xLabel: 'エンジントルク (N·m)', yLabel: 'タイヤを回す力 (kN)', xMax: 400, xStep: 50, yMin: 0, yMax: 18, yStep: 2,
        series: [0, 1].map(g => ({ name: `${GEARS[g][0]}の駆動力`, color: COLORS[g], dash: g === P.gear - 1 ? [] : [6, 4], points: [[0, 0], [400, wheelForce(400, g) / 1000]] }))
          .concat([{ name: `路面の限界 μW（μ = ${n2(P.mu)}）`, color: '#ffd54f', points: [[0, lim], [400, lim]] }]),
        dots: [{ x: P.torque, y: wheelForce(P.torque, P.gear - 1) / 1000, color: wheelForce(P.torque, P.gear - 1) / 1000 > lim ? '#e57373' : '#ffffff', label: wheelForce(P.torque, P.gear - 1) / 1000 > lim ? 'ホイールスピン' : 'つかむ' }] };
    },
    readout: () => { const f = wheelForce(P.torque, P.gear - 1), lim = tractionMax(P.mu); return `タイヤを回す力 ${n1(f / 1000)} kN、路面の限界 ${n1(lim / 1000)} kN → ${f > lim ? `${n1((f - lim) / 1000)} kN 多すぎてホイールスピン` : 'つかんで加速'}`; }
  },
  {
    name: 'クラッチの役割', title: 'クラッチは、少しすべらせて、路面に合ったトルクだけを伝える',
    scene: 'custom', cam: [[1.6, 2.6, 6.8], [-0.2, 0.6, 0]], hint3d: '部品は、伝えているトルクの大きさで橙色に光ります。車体は透かしています。動きは 1/3 の速さです。',
    controls: [['クラッチで伝えるトルク', 'cap', 60, 250, 10, nm], ['路面の摩擦係数 μ', 'mu', 0.2, 1.2, 0.05, n2]],
    actions: pickActions(2),
    runLabel: '発進する', start: () => startPlay(2, 3), tick: tickPlay, reset: () => { PLAY.t = -1; P.cap = 140; P.mu = 1.0; P.view = 0; },
    build3d: world => buildFlow(world, false),
    update3d: (it, dt) => updateFlow(it, dt, nowPoint(sim(capOpt()), 0), 3, false),
    text: [
      '<b>クラッチ</b>は、エンジンと変速機の間で、すべりながらトルクを伝えます。発進では、つなぎ方で加速が大きく変わります。',
      '<b>構造</b>: エンジン → クラッチ → 変速機（1速）→ プロペラシャフト → デフ → ドライブシャフト → 後輪。ここでは、エンジンを 4,000 rpm に保ったまま、クラッチを 0.15 秒でつなぎます。',
      '<b>仕組み</b>: 半クラッチの間、タイヤに伝わるトルクは、エンジンではなく<b>クラッチの押し付け</b>で決まります。強くつなぎすぎる（全閉）と、伝えるトルクが路面の限界を超えてホイールスピンし、加速が悪くなります（すべらないタイヤなら、強いショックになります）。弱すぎると、力が足りず加速が悪くなります。路面の限界にちょうど合う<b>最適な半クラッチ</b>で、一番速く加速します。',
      '<b>見る所</b>: 伝えるトルクを 100、140、200 N·m と変えて「発進する」を押し、2 秒後の車速を比べてください。「グラフ: スリップ率」で、ホイールスピンが見られます。μ を下げると、最適なトルクも下がります。',
      'MT 車では、この半クラッチを人間が足で行います。ローンチ制御の難しい所は、ここです。'
    ],
    symbols: `${sub('T', 'c')}: クラッチが伝えるトルク、i × i<sub>f</sub>: 1速の変速比 × 最終減速比（14.9）、η: 伝達効率、r: タイヤの半径、Δω: エンジンとクラッチディスクの回転の差。`,
    formula: () => {
      const s = sim(capOpt()), end = s[s.length - 1], lim = tractionMax(P.mu) * CAR.tire / (total(0) * CAR.eff);
      const heatJ = s.reduce((sum, p) => sum + (p.lock ? 0 : p.tc * Math.max(0, LAUNCH_RPM * RPM - p.wheel * total(0)) * 0.01), 0);
      return [
        ['タイヤに伝わる力（半クラッチの間）', `F = ${sub('T', 'c')} × i × ${sub('i', 'f')} × η / r`, `${P.cap} N·m → ${n1(wheelForce(P.cap, 0) / 1000)} kN（路面の限界は ${n1(tractionMax(P.mu) / 1000)} kN、トルクで ${n0(lim)} N·m）`, WHY.clutch],
        ['2 秒後の車速', 'v = ∫ a dt', `${n1(end.v)} km/h${P.cap > lim + 5 ? '（ホイールスピンで遅い）' : P.cap < lim - 30 ? '（力が足りない）' : ''}`, WHY.spin],
        ['クラッチの熱', `Q = ∫ ${sub('T', 'c')} × Δω dt`, `${n1(heatJ / 1000)} kJ`, WHY.energy]
      ];
    },
    chart: () => { const [name, f, y0, y1, ys] = PICKS[P.view], s = sim(capOpt()); return timeChart(name, y0, y1, ys, [line(s, f, `クラッチ ${P.cap} N·m`, '#f0a81c'), line(sim({ ...capOpt(), cap: 140 }), f, '最適に近い 140 N·m', '#7fc8f8', [6, 4])], 2); },
    readout: () => { const s = sim(capOpt()), p = nowPoint(s, 2); return `${n2(p.t)} 秒: 車速 ${n1(p.v)} km/h、スリップ率 ${n0(p.s * 100)}%、${p.lock ? 'クラッチがつながった' : '半クラッチ'}`; }
  },
  {
    name: 'ローンチ制御', title: 'ローンチ制御: ECU が、エンジンとクラッチを協調させて、スリップ率を保つ',
    scene: 'custom', cam: [[1.6, 2.6, 6.8], [-0.2, 0.7, 0]], hint3d: '緑の箱が ECU です。トルクの上限を下げて、ホイールスピンを抑える様子を見てください。動きは 1/3 の速さです。',
    controls: [['目標のスリップ率', 'aim', 5, 30, 1, pct], ['路面の摩擦係数 μ', 'mu', 0.2, 1.2, 0.05, n2]],
    actions: pickActions(3),
    runLabel: '発進する（ローンチ制御）', start: () => startPlay(2.5, 3), tick: tickPlay, reset: () => { PLAY.t = -1; P.aim = 10; P.mu = 1.0; P.view = 2; },
    build3d: world => buildFlow(world, true),
    update3d: (it, dt) => updateFlow(it, dt, nowPoint(sim(onOpt()), 0), 3, true),
    text: [
      '<b>ローンチ制御</b>は、ECU が、エンジン、クラッチ、ブレーキ、トラクション制御を協調させて、スリップ率を一番力が出る値（約 10%）に保ちながら発進する制御です。本質は機構ではなく、「路面が許すぎりぎりの駆動力を保つこと」です。',
      '<b>構造</b>: ECU は、駆動輪と前輪の回転センサーからスリップ率を求めます。エンジンには点火・燃料・スロットル、DCT・AT にはクラッチの油圧で指令を出します。発進の前は、ブレーキで車を止めたまま、エンジンを決まった回転数（ここでは 4,000 rpm）に保ちます。',
      '<b>仕組み</b>: ブレーキを離すと、クラッチをつなぎます。スリップ率が目標より大きくなると、ECU はトルクの上限を下げます（ここでは 250 N·m から、一度下げすぎてから、約 150 N·m に落ち着きます）。スリップ率が目標より小さければ、上限を上げます。クラッチがつながった後は、点火カットなどでエンジントルクそのものを下げます。',
      '<b>見る所</b>: 「グラフ: トルク」で、ECU がトルクの上限を下げていく様子を、「グラフ: スリップ率」で、制御なし（クラッチをいきなりつなぐ）との違いを見てください。目標のスリップ率を 5% や 25% にすると、加速が遅くなります。'
    ],
    symbols: `s: スリップ率、${sub('s', '目標')}: 目標のスリップ率、${sub('T', '上限')}: ECU が決めるトルクの上限、${sub('K', 'P')}、${sub('K', 'I')}: 比例と積分の強さ（説明用の値）。`,
    formula: () => {
      const on = sim(onOpt()), off = sim(offOpt()), at = t => pointAt(on, t), minLim = Math.min(...on.filter(p => !p.lock).map(p => p.lim));
      return [
        ['スリップ率を保つ制御（PI 制御）', `${sub('T', '上限')} = ${sub('K', 'P')} × e + ${sub('K', 'I')} × ∫ e dt、e = ${sub('s', '目標')} − s`, `上限 250 N·m → すべり始めて一番低く ${n0(minLim)} N·m → 落ち着いて ${n0(at(0.8).lim)} N·m`, WHY.pi],
        ['トルクを下げる手段', 'T = min(全開のトルク, ' + sub('T', '上限') + ')', `つながった後のエンジントルク ${n0(on.find(p => p.lock) ? on.find(p => p.lock).te : 0)} N·m`, WHY.cut],
        ['2.5 秒後の車速', 'v = ∫ a dt', `ローンチ制御 ${n1(on[on.length - 1].v)} km/h、制御なし ${n1(off[off.length - 1].v)} km/h`, WHY.spin]
      ];
    },
    chart: () => {
      const on = sim(onOpt()), off = sim(offOpt());
      if (P.view === 2) return timeChart('トルク (N·m)', 0, 300, 50, [line(on, p => p.lim, 'ECU のトルクの上限', '#8fd694'), line(on, p => p.tc, 'クラッチが伝えるトルク', '#f0a81c'), line(on, p => p.te, 'エンジントルク', '#7fc8f8', [6, 4])], 2.5);
      const [name, f, y0, y1, ys] = PICKS[P.view];
      return timeChart(name, y0, y1, ys, [line(on, f, 'ローンチ制御', '#8fd694'), line(off, f, '制御なし（いきなりつなぐ）', '#e57373', [6, 4])], 2.5);
    },
    readout: () => { const p = nowPoint(sim(onOpt()), 2.5); return `${n2(p.t)} 秒: 車速 ${n1(p.v)} km/h、スリップ率 ${n0(p.s * 100)}%、トルクの上限 ${n0(p.lim)} N·m`; }
  },
  {
    name: '油圧でクラッチを動かす', title: 'DCT・AT では、油圧がローンチ制御の実現手段になる',
    scene: 'custom', cam: [[0.1, 0.24, 0.7], [-0.05, 0.07, 0]], hint3d: '湿式多板クラッチの断面ではなく、外側を透かした姿です。板のすきまは4倍に大きく見せています。',
    controls: [['摩擦面の数 n', 'plates', 4, 12, 2]],
    runLabel: '発進する（油圧の動き）', start: () => startPlay(2.5, 4), tick: tickPlay, reset: () => { PLAY.t = -1; P.plates = 8; P.aim = 10; P.mu = 1.0; },
    build3d: world => buildPack(world),
    update3d: (it) => { const p = nowPoint(sim(onOpt()), 0), mpa = playing() ? pressureOf(p, P.plates) : 0; updatePack(it, mpa, WET.kiss, torqueOfP(mpa, P.plates)); },
    text: [
      '<b>油圧制御はローンチ制御と関係ある？</b> 答えは「半分正解」です。ローンチ制御 = 油圧制御ではありませんが、DCT や AT では、油圧制御が<b>実現手段</b>です。',
      '<b>MT</b>: クラッチは人間の足で操作します（油圧はペダルの力を伝えるだけ）。ECU が助けられるのは、エンジンの回転数を保つこととトルクを下げることだけで、半クラッチは運転する人しだいです。',
      '<b>DCT</b>: ECU（TCU）→ 油圧ユニット（ソレノイド弁）→ クラッチ圧 → 伝達トルク の順に、クラッチを機械が制御します。前の項目の「クラッチが伝えるトルク」を、油圧で正確に作ります。<b>AT</b> はさらに、クラッチ、ブレーキ（バンド）、トルコンのロックアップまで、油圧で制御します。',
      '<b>構造</b>: 湿式多板クラッチは、油の中で摩擦板（茶色、内側で変速機側のハブにかみ合う）と鋼板（銀色、外側でエンジン側のドラムにかみ合う）を交互に重ね、ピストン（青）で押し付けます。',
      '<b>見る所</b>: 「発進する（油圧の動き）」を押すと、前の項目のローンチ制御が決めたトルクを作るための油圧が、グラフと 3D で動きます。はじめは、すきまを詰めるだけ（キスポイントまで）です。摩擦面の数を増やすと、同じトルクを低い油圧で作れます。'
    ],
    symbols: `T: 伝えるトルク、n: 摩擦面の数、${sub('μ', 'c')}: 油の中の摩擦係数（0.12）、P: クラッチ圧、A: ピストンの面積（40 cm²）、${sub('P', 'kiss')}: キスポイントの油圧（0.1 MPa = 戻しばねの力 ÷ A）、${sub('R', 'm')}: 摩擦面の平均半径（8 cm）。油圧の単位は MPa（メガパスカル）: 1 MPa = 100 万 Pa = 1 mm² あたり 1 N の力。`,
    formula: () => {
      const s = sim(onOpt()), peak = Math.max(...s.filter(p => !p.lock).map(p => pressureOf(p, P.plates)));
      return [
        ['湿式多板クラッチのトルク', `T = n × ${sub('μ', 'c')} × (P − ${sub('P', 'kiss')}) × A × ${sub('R', 'm')}`, `0.1 MPa あたり ${n0(torqueOfP(WET.kiss + 0.1, P.plates))} N·m（n = ${P.plates}）`, WHY.wet],
        ['キスポイント', `P ≤ ${sub('P', 'kiss')} → T = 0`, `${n2(WET.kiss)} MPa まではすきまを詰めるだけ`, WHY.kiss],
        ['ローンチ制御の油圧の指令', `P = ${sub('P', 'kiss')} + ${sub('T', '目標')} / (n × ${sub('μ', 'c')} × A × ${sub('R', 'm')})`, `半クラッチの間 最大 ${n2(peak)} MPa`, WHY.valve]
      ];
    },
    chart: () => { const s = sim(onOpt()); return timeChart('クラッチ圧 (MPa)', 0, 1.6, 0.2, [line(s, p => pressureOf(p, P.plates), `油圧の指令（n = ${P.plates}）`, '#7fc8f8'), { name: 'キスポイント', color: '#d40000', dash: [6, 4], points: [[0, WET.kiss], [2.5, WET.kiss]] }], 2.5); },
    readout: () => { const p = nowPoint(sim(onOpt()), 0), mpa = playing() ? pressureOf(p, P.plates) : 0; return `${n2(p.t)} 秒: クラッチ圧 ${n2(mpa)} MPa → 伝えるトルク ${n0(torqueOfP(mpa, P.plates))} N·m${p.lock ? '（つながった後は 1.3 倍の余裕）' : ''}`; }
  }
];

startCourse(LESSONS_LAUNCH, 'タイヤの摩擦の形、重心の高さ、ローンチ制御の強さ、湿式クラッチの寸法は説明用の値です。車は 1,000 kg の後輪駆動（後輪に半分の重さ）、タイヤの半径 0.315 m、最終減速比 4.1、1速 3.64・2速 2.10、エンジンは 2.0 L の自然吸気（最大 200 N·m）を想定しています。');
