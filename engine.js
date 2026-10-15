// engine.js: CAR STUDY LAB「エンジンの性能曲線と変速点」

const P = { rpm: 4000, shift: 6000, speed: 60 };   // スライダーで変える値
const gearText = g => GEARS[g][0];
const torqueLine = () => sample(REDLINE, rpm => torqueAt(rpm), 50).filter(([r]) => r >= IDLE);
const powerLine = () => sample(REDLINE, rpm => powerAt(rpm), 50).filter(([r]) => r >= IDLE);
const peak = f => { let best = [0, 0]; for (let r = IDLE; r <= REDLINE; r += 10) if (f(r) > best[1]) best = [r, f(r)]; return best; };

// 速く走るための変速点: g 段の駆動力が、g+1 段の駆動力を下回る車速（交わる所）。交わらなければレッドゾーン
function bestShift(g) {
  for (let v = speedAt(g + 1, IDLE); v <= speedAt(g, REDLINE); v += 0.2) {
    if (driveAt(g, v) <= driveAt(g + 1, v)) return { v, rpm: rpmAt(g, v), cross: true };
  }
  return { v: speedAt(g, REDLINE), rpm: REDLINE, cross: false };
}

// ---------- 段階5: 加速くらべ（変速する回転数だけが違う4台） ----------
const LAUNCH_RPM = 3000;   // 発進のとき、半クラッチで保つ回転数
const SHIFT_TIME = 0.3;    // 変速にかかる時間（この間は駆動力 0）
let racers = [];

function newRacers() {
  racers = [
    { name: '3,500 rpm で変速（早め）', short: '3,500', color: '#8fd694', shiftAt: () => 3500 },
    { name: `${P.shift} rpm で変速（スライダー）`, short: String(P.shift), color: '#f0a81c', shiftAt: () => P.shift },
    { name: '7,000 rpm で変速（レッドゾーンまで）', short: '7,000', color: '#e57373', shiftAt: () => REDLINE },
    { name: '交わる所で変速（最適）', short: '最適', color: '#7fc8f8', shiftAt: g => bestShift(g).rpm }
  ].map(r => Object.assign(r, { t: 0, x: 0, v: 0, g: 0, wait: 0, t100: null, points: [[0, 0]] }));
}

// 1台を dt 秒進める
function stepRacer(r, dt) {
  r.t += dt;
  let force = 0;
  if (r.wait > 0) r.wait -= dt;                                       // 変速中は駆動力 0
  else {
    const rpm = Math.max(rpmAt(r.g, r.v), LAUNCH_RPM);                // 発進中は半クラッチで 3,000 rpm を保つ
    force = torqueAt(rpm) * total(r.g) * CAR.eff / CAR.tire;
    if (rpmAt(r.g, r.v) >= Math.min(r.shiftAt(r.g), REDLINE) - 1 && r.g < GEARS.length - 1) { r.g += 1; r.wait = SHIFT_TIME; }
  }
  const a = (force - resistTotal(r.v)) / (CAR.mass * (1 + delta(r.g)));
  r.v = Math.max(0, Math.min(r.v + a * dt * 3.6, speedAt(r.g, REDLINE)));
  r.x += r.v / 3.6 * dt;   // 走った距離 (m)
  if (r.t100 === null && r.v >= 100) r.t100 = r.t;
  if (Math.round(r.t * 20) !== Math.round((r.t - dt) * 20)) r.points.push([r.t, r.v]);
}

const LESSONS_ENGINE = [
  {
    name: 'トルクカーブ', title: 'エンジンのトルクは、回転数で変わる',
    controls: [['エンジン回転数 (rpm)', 'rpm', 1000, 7000, 100]],
    text: [
      'エンジンが軸を回す力（トルク）は、いつも同じではありません。回転数ごとのトルクを線で描いたものを「トルクカーブ」（性能曲線）と言います。',
      '低い回転では、シリンダーに入る空気が少なく、トルクは小さめです。中くらいの回転（この例では 4,500 rpm）で一番大きくなり、高い回転では、空気が入りきらなくなって下がっていきます。',
      'この「一番トルクが出る回転数」を最大トルク回転数と言います。カタログの「最大トルク 200 N·m / 4,500 rpm」は、このグラフの山のてっぺんのことです。',
      'スライダーで回転数を動かして、トルクがどう変わるか見てください。この例は、2.0 L の自然吸気エンジンを想定した説明用の線です。'
    ],
    symbols: 'T: トルク (N·m)、n: エンジン回転数 (rpm)。',
    formula: () => {
      const [r, t] = peak(torqueAt);
      return [
        ['今の回転数のトルク', 'T（トルクカーブから読む）', `${P.rpm} rpm → ${n0(torqueAt(P.rpm))} N·m`],
        ['最大トルク', '山のてっぺん', `${n0(t)} N·m / ${r} rpm`],
        ['最大トルクとの比', `T / ${sub('T', 'max')}`, `${n0(torqueAt(P.rpm) / t * 100)}%`]
      ];
    },
    chart: () => ({
      xLabel: 'エンジン回転数 (rpm)', yLabel: 'トルク (N·m)', xMax: 7000, xStep: 1000, yMax: 250, yStep: 50,
      series: [{ name: 'トルク', color: '#f0a81c', points: torqueLine() }],
      vline: P.rpm,
      dots: [{ x: P.rpm, y: torqueAt(P.rpm), color: '#f0a81c', label: `${n0(torqueAt(P.rpm))} N·m` }]
    }),
    scene: 'engine',
    engine3d: () => ({ rpm: P.rpm, torque: torqueAt(P.rpm), text: `${P.rpm} rpm　トルク ${n0(torqueAt(P.rpm))} N·m` }),
    readout: () => `${P.rpm} rpm のトルク: ${n0(torqueAt(P.rpm))} N·m`
  },
  {
    name: '出力', title: '出力（パワー）は、トルク × 回転の速さ',
    controls: [['エンジン回転数 (rpm)', 'rpm', 1000, 7000, 100]],
    text: [
      '出力（パワー、仕事率）は、トルクと回転の速さを掛けた値です。単位はキロワット (kW) です。',
      'トルクが少し下がり始めても、回転数がそれ以上に上がれば、出力は増え続けます。そのため、最大出力は、最大トルクより高い回転数で出ます。この例では、トルクの山は 4,500 rpm、出力の山はそれより上です。',
      '車を速く走らせるのに大事なのは、トルクより出力です。同じ出力なら、ギヤで回転数とトルクを交換できるからです（ギヤを通しても、出力は変わりません。ギヤボックスLABの段階1）。',
      'グラフの橙色がトルク (N·m)、青が出力 (kW) です。単位は違いますが、同じ目盛りに描いています。'
    ],
    symbols: 'P: 出力 (kW)、T: トルク (N·m)、ω: 角速度 (rad/s)、n: 回転数 (rpm)。1 PS ≒ 0.735 kW。',
    formula: () => {
      const [pr, pp] = peak(powerAt), [tr] = peak(torqueAt);
      return [
        ['出力', 'P = T × ω = T × 2π × n / 60 / 1000', `${n0(torqueAt(P.rpm))} × 2π × ${P.rpm} / 60 / 1000 = ${n1(powerAt(P.rpm))} kW（${n0(powerAt(P.rpm) / 0.735)} PS）`],
        ['最大出力', '出力の山', `${n1(pp)} kW（${n0(pp / 0.735)} PS）/ ${pr} rpm`],
        ['最大トルクの回転数', 'トルクの山', `${tr} rpm（最大出力の回転数より低い）`]
      ];
    },
    chart: () => {
      const [pr, pp] = peak(powerAt);
      return {
        xLabel: 'エンジン回転数 (rpm)', yLabel: 'トルク (N·m)、出力 (kW)', xMax: 7000, xStep: 1000, yMax: 250, yStep: 50,
        series: [{ name: 'トルク (N·m)', color: '#f0a81c', points: torqueLine() }, { name: '出力 (kW)', color: '#7fc8f8', points: powerLine() }],
        vline: P.rpm,
        dots: [{ x: pr, y: pp, color: '#7fc8f8', label: `最大出力 ${n0(pp)} kW` }, { x: P.rpm, y: powerAt(P.rpm), color: '#7fc8f8' }]
      };
    },
    scene: 'engine',
    engine3d: () => ({ rpm: P.rpm, torque: torqueAt(P.rpm), text: `${P.rpm} rpm　出力 ${n1(powerAt(P.rpm))} kW` }),
    readout: () => `${P.rpm} rpm: トルク ${n0(torqueAt(P.rpm))} N·m、出力 ${n1(powerAt(P.rpm))} kW（${n0(powerAt(P.rpm) / 0.735)} PS）`
  },
  {
    name: '変速ののこぎり図', title: '変速すると、回転数はステップ比の分だけ下がる',
    controls: [['変速する回転数 (rpm)', 'shift', 3000, 7000, 100]],
    text: [
      '横軸を車速、縦軸をエンジン回転数にすると、各段は原点から伸びる直線になります。傾きが変速比です。',
      '決めた回転数で1段ずつ上げると、回転数は「上がる → 下がる」をくり返し、のこぎりの歯のような線（太い白線）になります。これを「変速線図」や「のこぎり図」と呼びます。',
      '変速した直後の回転数は、「変速する回転数 × 次の段の変速比 ÷ 今の段の変速比」です。比（ステップ比）が大きい1速→2速では大きく下がり、上の段ほど下がり幅が小さくなります。',
      'スライダーで変速する回転数を変えてみてください。下がった先の回転数が、トルクの山（4,500 rpm 前後）の近くにあると、変速後も力強く加速できます。'
    ],
    symbols: 'n: エンジン回転数、i<sub>n</sub>: n 段の変速比。',
    formula: () => [
      ['変速直後の回転数', `${sub('n', '後')} = ${sub('n', '変速')} × ${sub('i', 'n+1')} / ${sub('i', 'n')}`, GEARS.slice(0, -1).map((x, g) => `${x[0]}→${GEARS[g + 1][0]} ${n0(P.shift * GEARS[g + 1][1] / x[1])} rpm`).join('、')],
      ['ステップ比', `${sub('i', 'n')} / ${sub('i', 'n+1')}`, GEARS.slice(0, -1).map((x, g) => n2(x[1] / GEARS[g + 1][1])).join('、')],
      ['変速する車速', `v（${P.shift} rpm になる車速）`, GEARS.slice(0, -1).map((x, g) => `${x[0]} ${n0(speedAt(g, P.shift))} km/h`).join('、')]
    ],
    chart: () => {
      // のこぎり: 1速で 0 から変速の回転数まで → 次の段へ落ちる → … 6速はレッドゾーンまで
      const saw = [[0, IDLE]];
      GEARS.forEach((x, g) => {
        const end = g < GEARS.length - 1 ? speedAt(g, P.shift) : speedAt(g, REDLINE);
        const start = saw[saw.length - 1][0];
        saw.push([start, rpmAt(g, start) < IDLE && g === 0 ? IDLE : rpmAt(g, start)], [end, rpmAt(g, end)]);
      });
      return {
        xLabel: '車速 (km/h)', yLabel: 'エンジン回転数 (rpm)', xMax: 240, xStep: 40, yMax: 8000, yStep: 1000,
        series: GEARS.map((x, g) => ({ name: x[0], color: COLORS[g], points: sample(speedAt(g, REDLINE), v => rpmAt(g, v), 2), width: 1.5 }))
          .concat([{ name: '変速しながら加速', color: '#ffffff', points: saw.slice(1), width: 3.5 }, { name: '', color: 'rgba(229,115,115,0.8)', points: [[0, REDLINE], [240, REDLINE]], dash: [3, 3], width: 1 }])
      };
    },
    readout: () => `${P.shift} rpm で変速: 変速後 ` + GEARS.slice(0, -1).map((x, g) => `${GEARS[g + 1][0]} ${n0(P.shift * GEARS[g + 1][1] / x[1])} rpm`).join('、') + '（赤い点線はレッドゾーン 7,000 rpm）'
  },
  {
    name: '速く走る変速点', title: '一番速く加速する変速点は、駆動力の線が交わる所',
    text: [
      '速く加速したいなら、同じ車速で駆動力が大きい方の段を使えばよいはずです。今の段の駆動力の線が、次の段の線を下回ったら、そこが変速する所です。グラフの白い点が、その交わる所です。',
      '交わる所がなく、今の段の線が最後まで上にあるなら、レッドゾーンまで引っぱって変速するのが一番速くなります。',
      'このエンジンでは、交わる所は 6,600〜7,000 rpm です。最大出力の回転数（6,000 rpm）より少し上で、変速した後の回転数が、トルクの山（4,500 rpm）の近くに落ちるためです。',
      'では、なぜ「6,000 rpm で上げる」と言われるのか。①最大出力が出る回転数で、そこまで回せば力はほぼ出し切っている。②変速には時間がかかり、レッドゾーンぎりぎりだと、操作が遅れたときに回転が上がりすぎる（エンジンを守る仕組みで燃料が止まる）。③最適な点との差は小さい（Step5 の加速くらべで、0→100 km/h の差は 0.3 秒ほど）。この3つから、余裕を持った目安として使われます。',
      '最適な変速点は、トルクカーブの形と、となりの段との変速比の差で決まります。決まった数字が、どの車でも正しいわけではありません。'
    ],
    symbols: 'F<sub>n</sub>(v): n 段で車速 v のときの駆動力。',
    formula: () => GEARS.slice(0, -1).map((x, g) => {
      const s = bestShift(g);
      return [`${x[0]} → ${GEARS[g + 1][0]}`, `${sub('F', 'n')}(v) = ${sub('F', 'n+1')}(v) の車速`, s.cross ? `時速 ${n0(s.v)} km、${n0(s.rpm)} rpm で変速` : `交わらない → レッドゾーン ${REDLINE} rpm（時速 ${n0(s.v)} km）まで引っぱる`];
    }),
    chart: () => ({
      xLabel: '車速 (km/h)', yLabel: '駆動力 (N)', xMax: 240, xStep: 40, yMax: 10000, yStep: 2000,
      series: GEARS.map((x, g) => ({ name: x[0], color: COLORS[g], points: driveLine(g) })),
      dots: GEARS.slice(0, -1).map((x, g) => { const s = bestShift(g); return { x: s.v, y: driveAt(g, s.v), label: `${n0(s.rpm)} rpm` }; })
    }),
    readout: () => '最適な変速点: ' + GEARS.slice(0, -1).map((x, g) => `${x[0]}→${GEARS[g + 1][0]} ${n0(bestShift(g).rpm)} rpm`).join('、')
  },
  {
    name: '加速くらべ', title: '変速する回転数だけを変えて、0→100 km/h を比べる',
    controls: [['橙の車が変速する回転数 (rpm)', 'shift', 3000, 7000, 100]],
    runLabel: 'よーいドン（0 → 160 km/h）',
    reset: newRacers,
    start: newRacers,
    tick: dt => { racers.forEach(r => { for (let k = 0; k < 5; k++) if (r.v < 160 && r.t < 30) stepRacer(r, dt / 5); }); return racers.some(r => r.v < 160 && r.t < 30); },
    text: [
      '同じ車、同じエンジンで、変速する回転数だけを変えた4台を、同時に発進させます。「よーいドン」を押してください。グラフは、横軸が時間、縦軸が車速です。',
      '早めに変速する緑の車は、変速後の回転数が低く、トルクの小さい所を使うので遅れます。最適な点（青）で変速する車が一番速く、橙の車はスライダーで変速する回転数を変えられます。',
      '1速→2速は変速比の差が大きいので、変速点の違いが大きく効きます。上の段では、差は小さくなります。',
      '変速には 0.3 秒かかり、その間は加速しない、としています。発進は、半クラッチでエンジンを 3,000 rpm に保つ想定です。どちらも説明用の値です。'
    ],
    symbols: 'a = (F<sub>d</sub> − R) / (m × (1 + δ))（駆動力線図 Step4 と同じ式）。',
    formula: () => racers.map(r => [r.name, '0 → 100 km/h の時間', r.t100 !== null ? `${n2(r.t100)} 秒` : '（まだ着いていない）']),
    chart: () => ({
      xLabel: '時間 (秒)', yLabel: '車速 (km/h)', xMax: 25, xStep: 5, yMax: 180, yStep: 20,
      series: racers.map(r => ({ name: r.name, color: r.color, points: r.points.concat([[r.t, r.v]]) }))
        .concat([{ name: '', color: 'rgba(255,255,255,0.5)', points: [[0, 100], [25, 100]], dash: [4, 4], width: 1 }])
    }),
    scene: 'race',
    readout: () => racers.map(r => `${r.name}: ${n0(r.v)} km/h（${gearText(r.g)}）` + (r.t100 !== null ? `、0→100 km/h ${n2(r.t100)} 秒` : '')).join('<br>')
  },
  {
    name: '燃費と変速点', title: '燃費をよくするなら、トルクに余裕がある範囲で、低い回転（高い段）を使う',
    controls: [['一定で走る車速 (km/h)', 'speed', 20, 160, 5]],
    text: [
      '一定の速さで平らな道を走るときに必要な力は、走行抵抗と同じです。どの段で走っても、タイヤに必要な力と出力は同じです。',
      '違うのは、エンジンの回し方です。高い段ほど、低い回転数で、大きめのトルクを出して走ります。グラフの点が、各段で走るときの「回転数と、必要なトルク」です。',
      'エンジンは一般に、低い回転で、ある程度アクセルを踏んで（負荷をかけて）回すほど、燃料を無駄にしにくくなります。高い回転では、エンジンの中の摩擦が増え、アクセルを少ししか踏まないと、空気を吸い込む損失（ポンプ損失）が大きくなるからです。',
      'そのため、燃費をよくするには、必要なトルクがトルクカーブを超えない範囲で、なるべく高い段を使います。ただし、点がトルクカーブに近いと、加速する余裕（余裕トルク）がほとんどありません。燃費と加速の余裕は、引き換えです。'
    ],
    symbols: 'R: 走行抵抗、T<sub>必要</sub>: 一定で走るのに必要なエンジンのトルク。',
    formula: () => GEARS.map((x, g) => {
      const n = rpmAt(g, P.speed), need = resistTotal(P.speed) * CAR.tire / (total(g) * CAR.eff);
      const ok = n >= IDLE && n <= REDLINE;
      return [x[0], `${sub('T', '必要')} = R × r / (i × ${sub('i', 'f')} × η)`, ok ? `${n0(n)} rpm で ${n1(need)} N·m 必要（余裕 ${n0(torqueAt(n) - need)} N·m）` : 'この車速では回せない回転数'];
    }),
    chart: () => ({
      xLabel: 'エンジン回転数 (rpm)', yLabel: 'トルク (N·m)', xMax: 7000, xStep: 1000, yMax: 250, yStep: 50,
      series: [{ name: '出せる最大のトルク', color: '#f0a81c', points: torqueLine() }],
      dots: GEARS.map((x, g) => ({ g, n: rpmAt(g, P.speed) })).filter(d => d.n >= IDLE && d.n <= REDLINE)
        .map(d => ({ x: d.n, y: resistTotal(P.speed) * CAR.tire / (total(d.g) * CAR.eff), color: COLORS[d.g], label: gearText(d.g) }))
    }),
    readout: () => `時速 ${P.speed} km で一定に走るのに必要な出力: ${n1(resistTotal(P.speed) * P.speed / 3.6 / CAR.eff / 1000)} kW（どの段でも同じ）`
  }
];

startCourse(LESSONS_ENGINE);
