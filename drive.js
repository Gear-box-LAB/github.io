// drive.js: CAR STUDY LAB「駆動力線図と走行抵抗」

const P = { gear: 0, speed: 60, grade: 0, mass: 1000, cda: 0.65 };   // スライダーで変える値
const gearText = g => GEARS[g][0];
const resistLine = (grade, mass, cda) => sample(240, v => resistTotal(v, grade, mass, cda), 2);

// 最高速: 駆動力が走行抵抗を上回っている、いちばん速い車速（どの段でも）
function topSpeed(grade, mass, cda) {
  let best = { v: 0, g: 0 };
  GEARS.forEach((x, g) => {
    for (let v = speedAt(g, REDLINE); v >= speedAt(g, IDLE); v -= 0.5) {
      if (driveAt(g, v) >= resistTotal(v, grade, mass, cda)) { if (v > best.v) best = { v, g }; break; }
    }
  });
  return best;
}
// 余裕駆動力から求める加速度 (m/s²)。回転部分も加速させるので、質量を (1 + δ) 倍にする
const accelAt = (g, v, grade, mass, cda) => (driveAt(g, v) - resistTotal(v, grade, mass, cda)) / ((mass || CAR.mass) * (1 + delta(g, mass)));

const LESSONS_DRIVE = [
  {
    level: 'hs', name: '駆動力', title: 'タイヤが地面を押す力は、エンジンのトルク × ギヤ比で決まる',
    controls: [['段', 'gear', 0, 5, 1, gearText], ['車速 (km/h)', 'speed', 0, 220, 1]],
    text: [
      '車を前に進めるのは、タイヤが地面を後ろへ押す力です。これを「駆動力」と言います。',
      'エンジンのトルクは、変速機と最終減速ギヤで何倍にもなって、タイヤに届きます。タイヤの半径で割ると、地面を押す力になります。',
      'グラフは、選んだ段の駆動力です。横軸は車速、縦軸は力 (N) です。線が途中で終わるのは、その段でエンジンが回せる回転数（1,000〜7,000 rpm）の範囲だけだからです。',
      '低い段ほど力は大きいのですが、回転数の上限ですぐに頭打ちになり、速い車速は出せません。白い点線の車速での値を、下に出しています。'
    ],
    symbols: 'T: エンジンのトルク、i: 変速比、i<sub>f</sub>: 最終減速比、η: 伝達効率、r: タイヤの半径、n: エンジン回転数。',
    formula: () => {
      const g = P.gear, n = rpmAt(g, P.speed);
      return [
        ['エンジン回転数', `n = v / r × i × ${sub('i', 'f')}（単位を直して）`, `${n0(n)} rpm` + (n > REDLINE || n < IDLE ? '（この段では回せない範囲）' : '')],
        ['エンジンのトルク', 'T = トルクカーブから読む', `${n0(torqueAt(n))} N·m`],
        ['駆動力', `${sub('F', 'd')} = T × i × ${sub('i', 'f')} × η / r`, `${n0(torqueAt(n))} × ${GEARS[g][1]} × ${CAR.final} × ${CAR.eff} ÷ ${CAR.tire} = ${n0(driveAt(g, P.speed))} N`]
      ];
    },
    chart: () => ({
      xLabel: '車速 (km/h)', yLabel: '駆動力 (N)', xMax: 240, xStep: 40, yMax: 10000, yStep: 2000,
      series: [{ name: `${gearText(P.gear)}の駆動力`, color: COLORS[P.gear], points: driveLine(P.gear) }],
      vline: P.speed,
      dots: rpmAt(P.gear, P.speed) <= REDLINE && rpmAt(P.gear, P.speed) >= IDLE ? [{ x: P.speed, y: driveAt(P.gear, P.speed), color: COLORS[P.gear], label: `${n0(driveAt(P.gear, P.speed))} N` }] : []
    }),
    readout: () => `${gearText(P.gear)}、時速 ${P.speed} km: エンジン ${n0(rpmAt(P.gear, P.speed))} rpm、駆動力 ${n0(driveAt(P.gear, P.speed))} N（${gearText(P.gear)}で出せる車速 ${n0(speedAt(P.gear, IDLE))}〜${n0(speedAt(P.gear, REDLINE))} km/h）`
  },
  {
    level: 'hs', name: '走行抵抗', title: '車を止めようとする力は、転がり、空気、坂道の3つ',
    controls: [['坂道の勾配 (%)', 'grade', 0, 20, 1], ['車の重さ (kg)', 'mass', 800, 2000, 50], ['Cd × 前面投影面積 (m²)', 'cda', 0.4, 1.2, 0.05], ['車速 (km/h)', 'speed', 0, 220, 1]],
    text: [
      '走っている車には、止めようとする力がいつもかかります。これを「走行抵抗」と言います。',
      '<b>転がり抵抗</b>: タイヤがつぶれながら転がる損失です。重さに比例し、車速にはほとんど関係しません。',
      '<b>空気抵抗</b>: 空気を押しのける力です。車速の2乗に比例するので、速くなるほど急に大きくなります。時速100 km を超えると、走行抵抗のほとんどが空気抵抗になります。',
      '<b>勾配抵抗</b>: 坂道で、重さの一部が後ろへ引っぱる力です。重さと勾配で決まり、車速には関係しません。',
      'スライダーで、勾配、重さ、空気抵抗の大きさを変えて、線がどう変わるか確かめてください。'
    ],
    symbols: 'μ<sub>r</sub>: 転がり抵抗係数 0.012、m: 車の重さ、g: 重力加速度 9.81 m/s²、ρ: 空気の密度 1.2 kg/m³、Cd·A: 空気抵抗係数 × 前面投影面積、v: 車速 (m/s)、θ: 坂の角度（勾配 % = tan θ × 100）。',
    formula: () => {
      const r = resist(P.speed, P.grade, P.mass, P.cda);
      return [
        ['転がり抵抗', `${sub('R', 'r')} = ${sub('μ', 'r')} × m × g × cos θ`, `${n0(r.roll)} N`],
        ['空気抵抗', `${sub('R', 'a')} = 1/2 × ρ × Cd·A × v²`, `1/2 × 1.2 × ${P.cda} × ${n1(P.speed / 3.6)}² = ${n0(r.air)} N`],
        ['勾配抵抗', `${sub('R', 'g')} = m × g × sin θ`, `${n0(r.grade)} N`],
        ['走行抵抗の合計', `R = ${sub('R', 'r')} + ${sub('R', 'a')} + ${sub('R', 'g')}`, `${n0(r.roll + r.air + r.grade)} N（時速 ${P.speed} km）`]
      ];
    },
    chart: () => ({
      xLabel: '車速 (km/h)', yLabel: '走行抵抗 (N)', xMax: 240, xStep: 40, yMax: 5000, yStep: 1000,
      series: [
        { name: '転がり', color: '#8fd694', points: sample(240, v => resist(v, P.grade, P.mass, P.cda).roll, 4), dash: [6, 4] },
        { name: '空気', color: '#7fc8f8', points: sample(240, v => resist(v, P.grade, P.mass, P.cda).air, 4), dash: [6, 4] },
        { name: '勾配', color: '#e57373', points: sample(240, v => resist(v, P.grade, P.mass, P.cda).grade, 4), dash: [6, 4] },
        { name: '合計', color: '#ffffff', points: resistLine(P.grade, P.mass, P.cda), width: 3 }
      ],
      vline: P.speed,
      dots: [{ x: P.speed, y: resistTotal(P.speed, P.grade, P.mass, P.cda), label: `${n0(resistTotal(P.speed, P.grade, P.mass, P.cda))} N` }]
    }),
    readout: () => { const r = resist(P.speed, P.grade, P.mass, P.cda), t = r.roll + r.air + r.grade; return `時速 ${P.speed} km: 転がり ${n0(r.roll)} N、空気 ${n0(r.air)} N、勾配 ${n0(r.grade)} N、合計 ${n0(t)} N（空気の割合 ${t ? n0(r.air / t * 100) : 0}%）`; }
  },
  {
    level: 'pro', name: '駆動力線図', title: '駆動力と走行抵抗を重ねると、車の性能が1枚でわかる',
    controls: [['車速 (km/h)', 'speed', 0, 240, 1]],
    text: [
      '全段の駆動力と、平らな道の走行抵抗（白い線）を1枚に重ねた図を「駆動力線図」（走行性能曲線）と言います。車の開発で、性能を話すときの基本の図です。',
      '<b>余裕駆動力</b>: 同じ車速で、駆動力の線と走行抵抗の線の間の高さです。この分が加速に使われます。差が大きいほど速く加速します。',
      '<b>最高速</b>: 駆動力の線と走行抵抗の線が交わる所です。そこから先は、走行抵抗の方が大きいので速くなれません（または、レッドゾーンで頭打ちになります）。',
      '<b>段と段のすき間</b>: となりの段の線の間に谷があると、変速した直後に力が落ちて、加速が鈍く感じます。ステップ比を小さくする（クロスレシオ）と、谷が浅くなります。',
      '白い点線を動かして、その車速で各段の駆動力がいくらか、下で確かめてください。'
    ],
    symbols: 'F<sub>d</sub>: 駆動力、R: 走行抵抗。',
    formula: () => {
      const top = topSpeed(0);
      return [
        ['余裕駆動力', `${sub('F', 'd')} − R`, GEARS.map((x, g) => rpmAt(g, P.speed) <= REDLINE && rpmAt(g, P.speed) >= IDLE ? `${x[0]} ${n0(driveAt(g, P.speed) - resistTotal(P.speed))} N` : null).filter(Boolean).join('、') || 'この車速を出せる段がない'],
        ['最高速', `${sub('F', 'd')} = R になる車速（またはレッドゾーン）`, `時速 約 ${n0(top.v)} km（${gearText(top.g)}）`],
        ['各段の最高車速（レッドゾーン）', 'v = n × 2π / 60 / (i × ' + sub('i', 'f') + ') × r', GEARS.map((x, g) => `${x[0]} ${n0(speedAt(g, REDLINE))}`).join('、') + ' km/h']
      ];
    },
    chart: () => {
      const top = topSpeed(0);
      return {
        xLabel: '車速 (km/h)', yLabel: '力 (N)', xMax: 240, xStep: 40, yMax: 10000, yStep: 2000,
        series: GEARS.map((x, g) => ({ name: x[0], color: COLORS[g], points: driveLine(g) }))
          .concat([{ name: '走行抵抗（平地）', color: '#ffffff', points: resistLine(0), width: 3 }]),
        vline: P.speed,
        dots: [{ x: top.v, y: resistTotal(top.v), label: `最高速 ${n0(top.v)} km/h` }]
      };
    },
    readout: () => `時速 ${P.speed} km の駆動力: ` + GEARS.map((x, g) => rpmAt(g, P.speed) <= REDLINE && rpmAt(g, P.speed) >= IDLE ? `${x[0]} ${n0(driveAt(g, P.speed))} N` : `${x[0]} −`).join('、') + ` ／ 走行抵抗 ${n0(resistTotal(P.speed))} N`
  },
  {
    level: 'pro', name: '余裕駆動力と加速', title: '余裕駆動力 ÷ 重さ が加速度。回る部品の分だけ重く見える',
    controls: [['車速 (km/h)', 'speed', 0, 240, 1], ['車の重さ (kg)', 'mass', 800, 2000, 50]],
    text: [
      '余裕駆動力（駆動力 − 走行抵抗）で車を加速させます。加速度は、余裕駆動力を重さで割った値です。',
      'ただし、車が速くなるときは、エンジン、変速機、タイヤの回転も速くしないといけません。その分、車は実際より重く見えます。これを「回転部分相当質量」と言い、重さを (1 + δ) 倍にして計算します。',
      'δ は、CAR STUDY の「イナーシャ」で見た「エンジンから見た車の重さ」の逆です。低い段ほどエンジンが速く回るので δ が大きくなります（1速では車が2割近く重く見えます）。',
      'グラフは、各段の加速度 (G) です。1 G は重力と同じ強さ（約 9.8 m/s²）です。同じ車速なら、上の線の段を使うと速く加速できます。重さを変えて、加速がどう変わるか確かめてください。'
    ],
    symbols: 'a: 加速度、m: 車の重さ、δ: 回転部分の重さの割合、J<sub>e</sub>: エンジン側の慣性モーメント 0.18 kg·m²、J<sub>w</sub>: タイヤ4本の慣性モーメント 4 kg·m²。',
    formula: () => [
      ['回転部分の重さの割合', `δ = (${sub('J', 'e')} × (i × ${sub('i', 'f')})² + ${sub('J', 'w')}) / (m × r²)`, GEARS.map((x, g) => `${x[0]} ${n2(delta(g, P.mass))}`).join('、')],
      ['加速度', `a = (${sub('F', 'd')} − R) / (m × (1 + δ))`, GEARS.map((x, g) => rpmAt(g, P.speed) <= REDLINE && rpmAt(g, P.speed) >= IDLE ? `${x[0]} ${n2(accelAt(g, P.speed, 0, P.mass) / G)} G` : null).filter(Boolean).join('、') || 'この車速を出せる段がない'],
      ['G に直す', 'a ÷ 9.81', '0.3 G で、1秒に時速約 10.6 km 速くなる']
    ],
    chart: () => ({
      xLabel: '車速 (km/h)', yLabel: '加速度 (G)', xMax: 240, xStep: 40, yMax: 0.8, yStep: 0.2,
      series: GEARS.map((x, g) => ({ name: x[0], color: COLORS[g], points: driveLine(g).map(([v]) => [v, accelAt(g, v, 0, P.mass) / G]) })),
      vline: P.speed
    }),
    readout: () => `時速 ${P.speed} km、${P.mass} kg の加速度: ` + GEARS.map((x, g) => rpmAt(g, P.speed) <= REDLINE && rpmAt(g, P.speed) >= IDLE ? `${x[0]} ${n2(accelAt(g, P.speed, 0, P.mass) / G)} G` : `${x[0]} −`).join('、')
  },
  {
    level: 'pro', name: '坂道', title: '坂道では走行抵抗の線が上がり、最高速が下がり、使える段が減る',
    controls: [['坂道の勾配 (%)', 'grade', 0, 30, 1], ['車の重さ (kg)', 'mass', 800, 2000, 50]],
    text: [
      '坂道では、勾配抵抗の分だけ走行抵抗の線が上に平行移動します。駆動力の線は変わりません。',
      'その結果、交わる所（最高速）が左へずれます。上の段の線は、走行抵抗の線より下になり、使えなくなります。坂道でシフトダウンするのは、このためです。',
      '勾配を上げていくと、いずれ1速でも走行抵抗に勝てなくなります。そのときの勾配が「登坂能力」です。人を乗せたり、荷物を積んだりして重くなると、登坂能力は下がります。',
      '勾配 10% は、100 m 進むと 10 m 上がる坂です。山道の急な坂でも、多くは 10〜15% 程度です（数値は一般的な目安です）。'
    ],
    symbols: 'θ: 坂の角度、勾配 (%) = tan θ × 100。',
    formula: () => {
      const top = topSpeed(P.grade, P.mass);
      // 各段の登坂能力: その段の最大駆動力で、転がり抵抗と空気抵抗（その車速）に勝てる、いちばん急な勾配
      const climb = GEARS.map((x, g) => {
        let best = 0;
        driveLine(g).forEach(([v, f]) => { const rest = f - CAR.roll * P.mass * G - resist(v).air; best = Math.max(best, Math.tan(Math.asin(Math.min(1, Math.max(0, rest / (P.mass * G))))) * 100); });
        return `${x[0]} ${n0(best)}%`;
      });
      return [
        ['勾配抵抗', 'R<sub>g</sub> = m × g × sin θ', `${n0(resist(0, P.grade, P.mass).grade)} N（${P.grade}%、${P.mass} kg）`],
        ['この坂での最高速', `${sub('F', 'd')} = R になる車速`, top.v > 0 ? `時速 約 ${n0(top.v)} km（${gearText(top.g)}）` : 'どの段でも登れない'],
        ['各段の登坂能力', '最大の駆動力で勝てる、いちばん急な勾配', climb.join('、')]
      ];
    },
    chart: () => {
      const top = topSpeed(P.grade, P.mass);
      return {
        xLabel: '車速 (km/h)', yLabel: '力 (N)', xMax: 240, xStep: 40, yMax: 10000, yStep: 2000,
        series: GEARS.map((x, g) => ({ name: x[0], color: COLORS[g], points: driveLine(g) }))
          .concat([{ name: '走行抵抗（平地）', color: 'rgba(255,255,255,0.4)', points: resistLine(0, P.mass), dash: [6, 4] },
                   { name: `走行抵抗（${P.grade}%）`, color: '#ffffff', points: resistLine(P.grade, P.mass), width: 3 }]),
        dots: top.v > 0 ? [{ x: top.v, y: resistTotal(top.v, P.grade, P.mass), label: `最高速 ${n0(top.v)} km/h` }] : []
      };
    },
    readout: () => { const top = topSpeed(P.grade, P.mass); return `勾配 ${P.grade}%、${P.mass} kg: ` + (top.v > 0 ? `最高速 約 ${n0(top.v)} km/h（${gearText(top.g)}）` : 'どの段でも、この坂は登れません'); }
  }
];

startCourse(LESSONS_DRIVE);
