// dyn.js: 車両運動性能とドライブラインのテーマで共通に使う計算（study.js の車とエンジンの値を使う）
//
// ドライブラインを「2つの慣性と1本のばね」で考える（タイヤの軸で見た値）
//   J1: エンジン側（エンジン、フライホイール、クラッチ、変速機）を、タイヤの軸で見た慣性 = J × (i × if)²
//   k、c: ドライブラインのねじれやすさ（ばね）と、ゆれを止める力（ダンパー）。ほとんどがドライブシャフトのねじれ
//   J2: 車（重さ m をタイヤの半径 r の所に置いた m × r²）とタイヤ

const DL = { k: 12000, c: 80, Jin: 0.02 };   // ねじり剛性 (N·m/rad)、減衰 (N·m·s/rad)、クラッチディスク + インプット軸の慣性 (kg·m²)（説明用の値）
const FRICTION_TORQUE = n => 10 + 0.004 * Math.abs(n) + 3e-7 * n * n;   // エンジンの中の摩擦トルク (N·m)（テーマ「エンジンの始動から停止まで」と同じ）
const J2 = mass => mass * CAR.tire ** 2 + J_WHEELS;
const J1 = (g, withEngine) => (withEngine ? J_ENGINE + DL.Jin : DL.Jin) * total(g) ** 2;
// しゃくり（ドライブラインの1次のねじり共振）の振動数 (Hz)
const shuffleHz = (g, k, mass, withEngine) => Math.sqrt((k || DL.k) * (1 / J1(g, withEngine !== false) + 1 / J2(mass || CAR.mass))) / (2 * Math.PI);
// 坂道と走行抵抗をタイヤの軸のトルクにしたもの (N·m)。v: m/s（向きを見る）
const roadTorque = (v, mass, grade) => (Math.sign(v) * resistTotal(Math.abs(v) * 3.6, 0, mass) + mass * G * Math.sin(Math.atan(grade / 100))) * CAR.tire;

// 発進とアクセルを踏んだときの計算（タイヤの軸で見た 2 慣性 + ばね）
// o: { g 段、mass、grade 勾配%、k、c、pedal アクセル 0〜1、rise トルクの立ち上がりの時間 (秒)、
//      clutch: true なら止まった所から半クラッチで発進（clutchTime クラッチをつなぐ時間、launchRpm、slope 摩擦係数の傾き）、
//      v0 最初の車速 km/h、T0 最初のエンジントルク、time 計算する時間 }
// 戻り値: { points: [[t, 加速度 G]], speed: [[t, km/h]], jerk: [[t, G/s]], twist: [[t, ねじれ角 rad]], lockAt, events }
function simDrive(o) {
  const dt = 0.0005, N = total(o.g), m = o.mass, r = CAR.tire;
  const Jv = J2(m), k = o.k || DL.k, c = o.c === undefined ? DL.c : o.c;
  let w2 = (o.v0 || 0) / 3.6 / r, w1 = w2, tw = 0;   // タイヤの角速度、エンジン側の角速度（タイヤの軸で見た値）、ねじれ角
  let locked = !o.clutch, t = 0, Te = o.T0 || 0, aPrev = 0, rolled = false;
  if (locked) tw = (Te * N * CAR.eff) / k;              // 最初は、トルク T0 でねじれたまま走っている
  const out = { points: [], speed: [], jerk: [], twist: [], force: [], rpm: [], lockAt: null, events: [] };
  const wEng = (o.launchRpm || 1500) * RPM;              // 発進のときにエンジンを保つ回転数
  for (let s = 0; t < (o.time || 3); s++) {
    t += dt;
    // エンジンのトルク: アクセルの踏み込みに、ECU の「なまし」（一次遅れ）で追いつく
    // 半クラッチの間は、アクセルを半分くらいに保ち、つながったら踏み増す（多くの運転の仕方）
    const target = (locked ? o.pedal : o.pedal * 0.5) * torqueAt(Math.max(IDLE, w1 * N / RPM));
    Te += (target - Te) * Math.min(1, dt / Math.max(0.005, o.rise || 0.05));
    const cNow = !locked && o.cSlip !== undefined ? o.cSlip : c;   // 半クラッチの間だけ、減衰を変えられる（ジャダーを見るとき）
    const spring = k * tw + cNow * (w1 - w2);           // ばね（ねじれ）と減衰が伝えるトルク
    const load = roadTorque(w2 === 0 ? 1e-6 : w2, m, o.grade || 0);
    let T1;
    if (locked) T1 = Te * N * CAR.eff;
    else {
      // 半クラッチ: クラッチの押し付けを、clutchTime 秒かけて強くする。摩擦係数は、すべりの速さで少し変わる（ジャダーの原因）
      const slip = wEng - w1 * N;                         // エンジンとインプット軸の回転の差 (rad/s)
      const mu = 1 + (o.slope || 0) * (slip / RPM / 1000);   // すべりが 1000 rpm 変わるごとに、slope の割合だけ変わる
      const capMax = o.clutchMax || o.pedal * 0.5 * torqueAt(o.launchRpm || 1500) * 1.1;   // 運転する人は、エンジンのトルクに合わせてクラッチをつなぐ
      const cap = Math.min(1, t / (o.clutchTime || 1)) * capMax * Math.max(0.2, mu);
      T1 = Math.sign(slip) * cap * N * CAR.eff;
      if (slip <= 0 && t > 0.05) { locked = true; out.lockAt = t; out.events.push({ x: t, label: 'クラッチがつながる' }); }
    }
    const J1now = J1(o.g, locked);
    w1 += (T1 - spring) / J1now * dt;
    let a2 = (spring - load) / Jv;
    if (w2 <= 0 && a2 < 0 && !(o.grade > 0)) a2 = 0;     // 平らな道で止まっているときは、下がらない
    w2 += a2 * dt;
    if (w2 < 0 && !rolled) { rolled = true; out.events.push({ x: t, label: '後ろに下がる' }); }
    tw += (w1 - w2) * dt;
    if (s % 20 === 0) {                                  // 0.01 秒ごとに記録
      const a = a2 * r / G;
      out.points.push([t, a]);
      out.speed.push([t, w2 * r * 3.6]);
      out.jerk.push([t, (a - aPrev) / 0.01]);
      out.twist.push([t, tw]);
      out.force.push([t, spring / r]);   // タイヤが地面を押す力 (N)
      out.rpm.push([t, w1 * N / RPM]);    // インプット軸（クラッチディスク）の回転数 (rpm)
      aPrev = a;
    }
  }
  return out;
}

// グラフの線から、ゆれの大きさ（最大と最小の差）と振動数（極大の間隔）を読む
function waveOf(points, from) {
  const p = points.filter(([t]) => t >= (from || 0));
  if (p.length < 5) return { pp: 0, osc: 0, hz: 0 };
  const ys = p.map(q => q[1]), peaks = [];
  for (let i = 1; i < p.length - 1; i++) if (ys[i] > ys[i - 1] && ys[i] >= ys[i + 1]) peaks.push(p[i][0]);
  const hz = peaks.length > 2 ? (peaks.length - 1) / (peaks[peaks.length - 1] - peaks[0]) : 0;
  const top = ys.indexOf(Math.max(...ys));
  // osc: ゆれの大きさ（一番大きい所と、その後の一番小さい所の差）
  return { pp: Math.max(...ys) - Math.min(...ys), osc: ys[top] - Math.min(...ys.slice(top)), hz };
}
