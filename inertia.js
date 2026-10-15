// inertia.js: CAR STUDY LAB「回転体のイナーシャ」
// 段階ごとに、車の部品（ホイール、フライホイール、タイヤ、ブレーキ、ギヤ、シンクロ）を並べ、トルクをかけて回り方を比べる
//
// body（回る物）の中身
//   name: 名前（図の下に札で出す）、J: 慣性モーメント (kg·m²)、x: 左右の位置
//   build(group): 回る部分の形、decor(group): 回らない部分の形（キャリパー、メーターなど）
//   torque: かけるトルク（なければ p.torque）、goal: ここまで回したら止める回転数 (rpm)
//   update(b, dt): 段階ごとの動き（メーターの針、熱で光る、地面が流れる など）

const el = id => document.getElementById(id);
const n0 = v => Math.round(v);
const n1 = v => v.toFixed(1);
const n2 = v => v.toFixed(2);
const n3 = v => v.toFixed(3);
const sub = (letter, mark) => `${letter}<sub>${mark}</sub>`;
const RPM = 2 * Math.PI / 60;     // rpm → rad/s
const LEVELS = { jh: '中学生', hs: '高校生', pro: '社会人' };

// 入力できる値（段階ごとに使うものが違う）
const p = {
  torque: 5,        // 段階1〜3: かけるトルク (N·m)
  tire: 0.33,       // 段階3: タイヤの外径の半分 (m)
  throttle: 40,     // 段階4: エンジンのトルク (N·m)
  ratio: 3,         // 段階6: ギヤ比
  gear: 0,          // 段階7: 選んだ段
  syncJ: 0.012,     // 段階8: 回転を合わせる側の慣性モーメント
  syncDiff: 1500,   // 段階8: 回転差 (rpm)
  syncT: 15         // 段階8: シンクロの摩擦トルク
};

// ギヤボックスLABの初期値（1速〜6速の変速比、最終減速比、タイヤ半径）と、説明用の仮の値
const RATIOS = [['1速', 3.64], ['2速', 2.10], ['3速', 1.38], ['4速', 1.00], ['5速', 0.79], ['6速', 0.65]];
const CAR = { mass: 1000, tire: 0.315, final: 4.1 };
const PARTS = [['エンジン（クランク、ピストンなど）', 0.05], ['フライホイール', 0.10], ['クラッチ（エンジン側）', 0.02], ['クラッチディスク', 0.004], ['インプット軸、カウンタ軸、ギヤ', 0.008]];
const ENGINE_J = PARTS.reduce((s, x) => s + x[1], 0);
const vehicleJ = i => CAR.mass * CAR.tire ** 2 / (i * CAR.final) ** 2;   // 車をエンジンから見た慣性モーメント
const REDLINE = 6500;

// ---------- 形（1単位 = 1 m） ----------
const COLOR = { alu: 0xd7dde0, steel: 0x8e979c, dark: 0x3c454b, rubber: 0x1d1f22, brass: 0xc9a24a, red: 0xd40000, power: 0xf0a81c, body: 0x9fb8c8 };
const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, metalness: 0.45, roughness: 0.45 }, extra));
const cyl = (r, t, sides) => new THREE.CylinderGeometry(r, r, t, sides || 48).rotateX(Math.PI / 2);   // 軸は画面の手前向き（z）

function add(group, geometry, color, x, y, z, extra) {
  const mesh = new THREE.Mesh(geometry, mat(color, extra));
  mesh.position.set(x || 0, y || 0, z || 0);
  group.add(mesh);
  return mesh;
}
// 輪（外径、内径、厚さ）
function annulus(outer, inner, thick) {
  const shape = new THREE.Shape().absarc(0, 0, outer, 0, Math.PI * 2);
  shape.holes.push(new THREE.Path().absarc(0, 0, inner, 0, Math.PI * 2, true));
  return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 64 }).translate(0, 0, -thick / 2);
}
// 歯の付いた輪郭（歯車、スターター用のリングギヤ）
function teeth(radius, count, depth, thick, hole) {
  const pts = [];
  for (let k = 0; k < count * 2; k++) {
    const r = k % 2 ? radius : radius + depth;
    const a = k / (count * 2) * Math.PI * 2;
    pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a)));
  }
  const shape = new THREE.Shape(pts);
  if (hole) shape.holes.push(new THREE.Path().absarc(0, 0, hole, 0, Math.PI * 2, true));
  return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false }).translate(0, 0, -thick / 2);
}
// 回転が見えるように、0°の位置に赤い印
function mark(group, radius, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, radius * 0.35, 0.01), new THREE.MeshBasicMaterial({ color: COLOR.red }));
  m.position.set(0, radius * 0.78, z || 0.06);
  group.add(m);
}

// ホイール（リム、スポーク、ハブ）。tire を渡すとタイヤも付ける
function wheel(group, rim, color, spokes, tire) {
  add(group, annulus(rim, rim - 0.025, 0.2), color);
  for (let k = 0; k < spokes; k++) {
    const s = add(group, new THREE.BoxGeometry(0.035, rim - 0.06, 0.025), color, 0, 0, 0.06);
    s.geometry.translate(0, (rim - 0.06) / 2 + 0.04, 0);
    s.rotation.z = k * Math.PI * 2 / spokes;
  }
  add(group, cyl(0.07, 0.12), color, 0, 0, 0.03);
  if (tire) {
    add(group, annulus(tire, rim, 0.21), COLOR.rubber, 0, 0, 0, { metalness: 0, roughness: 0.9 });
    mark(group, tire, 0.11);
  } else mark(group, rim, 0.11);
}
// フライホイール。outer = true なら、重さを外周に集めた形（厚いリム）
function flywheel(group, heavyRim) {
  add(group, teeth(0.15, 60, 0.008, 0.02), COLOR.steel, 0, 0, -0.02);                      // スターター用のリングギヤ
  if (heavyRim) {
    add(group, annulus(0.15, 0.11, 0.06), COLOR.power);                                     // 重さを集めた外周（橙色）
    add(group, cyl(0.11, 0.012), COLOR.steel);
  } else {
    add(group, cyl(0.15, 0.008), COLOR.steel);
    add(group, cyl(0.07, 0.08), COLOR.power);                                               // 重さを集めた中心（橙色）
  }
  mark(group, 0.15, 0.04);
}

// ---------- 段階 ----------
const LESSONS = [
  {
    level: 'jh', name: '動かしにくさ', title: '重いホイールほど、回し始めにくく、止めにくい',
    race: true,
    bodies: () => [
      { name: '鍛造アルミホイール 6 kg', J: 0.5 * 6 * 0.2 ** 2, goal: 1000, tagY: -0.32, build: g => wheel(g, 0.22, COLOR.alu, 5) },
      { name: 'スチールホイール 12 kg', J: 0.5 * 12 * 0.2 ** 2, goal: 1000, tagY: -0.32, build: g => wheel(g, 0.22, COLOR.dark, 8) }
    ],
    text: [
      '止まっている物は止まったまま、動いている物は動いたままでいようとします。この性質を「慣性」と言います。重い物ほど、この性質が強くなります。',
      '図の2本は、同じ大きさの車のホイールです。左は軽い鍛造アルミ、右は重いスチール（鉄）です。「よーいドン」を押すと、同じトルクで回し始め、先に 1,000 rpm に着いた方が勝ちです。',
      '回る物の「回しにくさ」を、慣性モーメント（イナーシャ）と言います。記号は J、単位は kg·m² です。',
      'スポーツカーが軽いホイールを使うのは、タイヤを回し始めやすく、止めやすくするためです。加速とブレーキの両方がよくなります。'
    ],
    formula: b => [
      ['回しにくさ', 'J（慣性モーメント）', b.map(x => `${x.name}: ${n3(x.J)} kg·m²`).join('<br>')],
      ['比べ方', '同じトルクなら、J が2倍だと速くなる割合は半分', `スチールはアルミの ${n2(b[1].J / b[0].J)} 倍回しにくい`]
    ]
  },
  {
    level: 'jh', name: '形で変わる', title: '同じ重さでも、外側に重さがあるほど回しにくい',
    race: true,
    bodies: () => [
      { name: '中心に重さ（軽量フライホイール型）8 kg', J: 0.5 * 8 * 0.07 ** 2 + 0.002, goal: 3000, tagY: -0.25, build: g => flywheel(g, false) },
      { name: '外周に重さ（ノーマル型）8 kg', J: 8 * 0.13 ** 2, goal: 3000, tagY: -0.25, build: g => flywheel(g, true) }
    ],
    text: [
      'エンジンのフライホイールを2種類並べました。どちらも重さは 8 kg、外の大きさも同じです。違うのは、重さ（橙色の部分）がどこにあるかです。',
      '「よーいドン」を押すと、中心に重さを集めた左の方が、ずっと早く回ります。回る中心から遠い所の重さほど、回しにくさに強く効くからです。',
      'レース用の「軽量フライホイール」は、重さを減らすだけでなく、外周の肉を削ります。エンジンの吹け上がりが鋭くなる代わりに、回転のむらが出やすく、発進でエンストしやすくなります。',
      'フィギュアスケートの選手が、腕を縮めると速く回るのと同じ理由です。'
    ],
    formula: b => [
      ['中心に重さ（半径 0.07 m の円板とみなす）', 'J = 1/2 × m × r²', `1/2 × 8 × 0.07² ≒ ${n3(b[0].J)} kg·m²`],
      ['外周に重さ（半径 0.13 m の輪とみなす）', 'J = m × r²', `8 × 0.13² = ${n3(b[1].J)} kg·m²`],
      ['比べると', '外周型 ÷ 中心型', `${n1(b[1].J / b[0].J)} 倍回しにくい`]
    ]
  },
  {
    level: 'hs', name: '半径の2乗', title: 'タイヤを大きくすると、半径の2乗で回しにくくなる',
    race: true,
    inputs: [['右のタイヤの半径 (m)', 'tire', 0.28, 0.42, 0.01]],
    bodies: () => [
      { name: '標準のタイヤ（半径 0.30 m）', J: tireJ(0.30), goal: 800, torque: 20, x: -0.45, tagY: -0.5, build: g => wheel(g, 0.21, COLOR.alu, 5, 0.30) },
      { name: `大きいタイヤ（半径 ${n2(p.tire)} m）`, J: tireJ(p.tire), goal: 800, torque: 20, x: 0.45, tagY: -0.5, build: g => wheel(g, Math.min(p.tire - 0.08, 0.27), COLOR.alu, 5, p.tire) }
    ],
    text: [
      'タイヤの重さの多くは、外側のゴムの部分にあります。中心から距離 r の所にある質量 m は、J = m × r² だけ回しにくさを持ちます。r が2乗で効くので、半径が少し大きくなるだけで J は大きく増えます。',
      'スライダーで右のタイヤを大きくして、「よーいドン」（トルク 20 N·m）で比べてください。半径が 1.2 倍になると、ゴムの部分の J は 1.44 倍になります。',
      '大きいタイヤ（インチアップ）は見た目がよくなりますが、回しにくくなり、加速やブレーキが少し鈍くなります。ここでは、タイヤの重さ 9 kg がゴムの真ん中（半径の 0.9 倍）に集まっていると考えています。'
    ],
    formula: b => [
      ['点の慣性モーメント', 'J = m × r²', '質量 × 距離の2乗'],
      ['タイヤとホイール', `J = ${sub('J', 'ホイール')} + 9 × (0.9 r)²`, b.map(x => `${x.name}: ${n3(x.J)} kg·m²`).join('<br>')],
      ['比べると', `${sub('J', '大')} / ${sub('J', '標準')}`, `${n2(b[1].J / b[0].J)} 倍（半径の比 ${n2(p.tire / 0.30)}、その2乗 ${n2((p.tire / 0.30) ** 2)}）`],
      ['形ごとの J', '円板 1/2 m r²、輪 m r²、細い棒（中心で回す） 1/12 m L²', 'どれも、質量 × 長さの2乗の形']
    ]
  },
  {
    level: 'hs', name: 'トルクと角加速度', title: 'トルクが大きいほど、エンジンは速く吹け上がる',
    inputs: [['エンジンのトルク (N·m)', 'throttle', 10, 120, 5]],
    bodies: () => [{
      name: 'クランク + フライホイール', J: 0.15, torque: p.throttle, goal: REDLINE, x: -0.25, tagY: -0.25,
      build: g => { flywheel(g, true); add(g, cyl(0.05, 0.3), COLOR.steel, 0, 0, 0.12); },
      decor: g => tachometer(g),
      tags: [['タコメーター', 0.55, -0.3]],
      update: b => {
        b.decor.userData.needle.rotation.z = Math.PI * 0.75 - Math.min(1, b.omega / RPM / 8000) * Math.PI * 1.5;
        if (b.finished && state.pushing) banner(`レッドゾーン！ ${n2(b.time)} 秒で 6,500 rpm（トルク ${p.throttle} N·m）`);
      }
    }],
    text: [
      'まっすぐ動く物では「力 = 質量 × 加速度」（F = m a）でした。回る物では、力の代わりにトルク、質量の代わりに慣性モーメント、加速度の代わりに角加速度を使います。T = J × α です。',
      '図は、エンジンのクランク軸とフライホイールです。クラッチを切って空ぶかしすると、エンジンのトルクはこれらを回すことだけに使われます。',
      'スライダーでトルクを変えて「アクセルを踏む」を押し、右のタコメーターの針がレッドゾーン（6,500 rpm）に届くまでの時間を比べてください。トルクが2倍なら、時間は半分です。'
    ],
    formula: b => {
      const alpha = p.throttle / b[0].J;
      return [
        ['クランク + フライホイールの J', 'J（説明用の仮の値）', `${b[0].J} kg·m²`],
        ['角加速度', 'α = T / J', `${p.throttle} ÷ ${b[0].J} = ${n0(alpha)} rad/s²（1秒に ${n0(alpha / RPM)} rpm 上がる）`],
        ['レッドゾーンまでの時間', 't = ω / α = (6500 × 2π / 60) / α', `${n2(REDLINE * RPM / alpha)} 秒`]
      ];
    }
  },
  {
    level: 'hs', name: '回転のエネルギー', title: '回っているタイヤのエネルギーは、ブレーキで熱になる',
    bodies: () => [{
      name: 'タイヤ + ホイール + ブレーキディスク', J: 1.0, torque: 40, goal: 1000,
      build: g => {
        wheel(g, 0.21, COLOR.alu, 5, 0.315);
        const disc = add(g, annulus(0.17, 0.08, 0.025), COLOR.steel, 0, 0, -0.14);
        for (let k = 0; k < 12; k++) add(g, new THREE.BoxGeometry(0.008, 0.07, 0.03), COLOR.dark, 0.125 * Math.cos(k * Math.PI / 6), 0.125 * Math.sin(k * Math.PI / 6), -0.14).rotation.z = k * Math.PI / 6;
        g.userData.disc = disc;
      },
      decor: g => add(g, new THREE.BoxGeometry(0.12, 0.08, 0.07), 0xc0392b, 0.15, 0.06, -0.14),   // キャリパー
      tags: [['ブレーキディスク（奥）', -0.42, 0.05], ['キャリパー', 0.42, 0.2]], tagY: -0.42,
      update: (b, dt) => {
        if (b.braking) {
          const before = 0.5 * b.J * b.omega ** 2;
          b.omega = Math.max(0, b.omega - 70 * dt);
          b.heat += before - 0.5 * b.J * b.omega ** 2;
          if (b.omega === 0) b.braking = false;
        }
        b.heat = Math.max(0, b.heat - 1500 * dt);   // 少しずつ冷える
        b.group.userData.disc.material.emissive.setRGB(Math.min(1, b.heat / 4000), Math.min(0.35, b.heat / 16000), 0);
      }
    }],
    brake: true,
    text: [
      '回っている物は、回転のエネルギーを持っています。速く回るほど、また J が大きいほど、たくさんためています。回転数が2倍になると、エネルギーは4倍になります。',
      '図は、車のタイヤとホイール、その奥のブレーキディスクと赤いキャリパーです。「回す」で 1,000 rpm（時速約 118 km）まで回し、「ブレーキ」を押してください。',
      'ブレーキは、ディスクをはさんで摩擦で止めます。ためていた回転のエネルギーは熱になり、ディスクが赤く光ります（実物は数百℃になることがあります）。',
      'ただし、これはタイヤの回転の分だけです。車全体がまっすぐ進むエネルギー（1/2 × m × v²）は、それよりずっと大きく、ブレーキはその両方を熱にしています。'
    ],
    formula: b => {
      const w = b[0].omega || 0, v = w * CAR.tire;
      return [
        ['回転のエネルギー', 'E = 1/2 × J × ω²', `1/2 × ${b[0].J} × ${n1(w)}² = ${n0(0.5 * b[0].J * w * w)} J`],
        ['今の回転数と車速', 'v = ω × r', `${n0(w / RPM)} rpm → 時速 ${n0(v * 3.6)} km`],
        ['車が進むエネルギー（車 1,000 kg）', 'E = 1/2 × m × v²', `${n0(0.5 * CAR.mass * v * v)} J（タイヤ4本の回転の分は ${n0(4 * 0.5 * b[0].J * w * w)} J）`]
      ];
    }
  },
  {
    level: 'pro', name: 'ギヤ越しのイナーシャ', title: '減速ギヤの先のタイヤは、ギヤ比の2乗だけ軽く見える',
    race: true,
    inputs: [['ギヤ比 i（タイヤが i 倍遅く回る）', 'ratio', 1, 6, 0.5]],
    bodies: () => [
      { name: 'エンジンがタイヤを直接回す', J: 1.0, goal: 1500, torque: 20, x: -0.75, tags: [['回す側から見た重さ', -0.42, 0.05]], build: g => { add(g, cyl(0.03, 0.4), COLOR.steel, 0, 0, 0.15); wheel(g, 0.21, COLOR.alu, 5, 0.315); },
        decor: g => meter(g, 1.0) },
      { name: `ギヤ比 ${p.ratio} を通して回す（小さい歯車の回転数）`, J: 1.0 / p.ratio ** 2, goal: 1500, torque: 20, x: 0.15, tags: [['小さい歯車', 0, 0.12], ['大きい歯車 + タイヤ', 0.06 * (1 + p.ratio), 0.4], ['回す側から見た重さ', -0.42, 0.05]],
        build: g => { add(g, teeth(0.05, 12, 0.012, 0.04), COLOR.brass, 0, 0, 0.15); mark(g, 0.05, 0.18); },
        parts: [{ x: 0.06 * (1 + p.ratio), ratio: -1 / p.ratio, build: g => {
          add(g, teeth(0.05 * p.ratio, 12 * p.ratio, 0.012, 0.04), COLOR.brass, 0, 0, 0.15);
          g.scale.setScalar(1);
          const w = new THREE.Group(); w.position.z = -0.12; w.scale.setScalar(0.75); wheel(w, 0.21, COLOR.alu, 5, 0.315); g.add(w);
        } }],
        decor: g => meter(g, 1.0 / p.ratio ** 2) }
    ],
    text: [
      '左は、タイヤを直接回しています。右は、小さい歯車で大きい歯車を回し、大きい歯車にタイヤを付けています。タイヤはギヤ比の分だけゆっくり回ります。',
      '小さい歯車から見ると、タイヤは J / i² の回しにくさにしか見えません。各物の下の棒の高さが、回す側から見た「重さ」です。i = 3 なら 1/9 になります。',
      '「よーいドン」を押すと、右の小さい歯車が、左のタイヤよりずっと早く 1,500 rpm に着きます。エネルギーで考えると、タイヤの回転は入力の 1/i なので、ためるエネルギー 1/2 J ω² が 1/i² になるからです。',
      '車では、低い段ほどギヤ比が大きいので、エンジンから見た車の重さが軽くなり、エンジンの回転が速く上がります。'
    ],
    formula: b => [
      ['タイヤ + ホイールの J', 'J（説明用の仮の値）', `${b[0].J} kg·m²`],
      ['小さい歯車から見た J', `${sub('J', 'in')} = J / i²`, `${b[0].J} ÷ ${p.ratio}² = ${n3(b[1].J)} kg·m²`],
      ['同じトルクでの、回る側の速くなり方の比', `${sub('α', 'ギヤ')} / ${sub('α', '直接')} = i²`, `${n2(p.ratio ** 2)} 倍`]
    ]
  },
  {
    level: 'pro', name: 'ギヤボックスのイナーシャ', title: 'エンジンから見た車の重さは、段で変わる',
    inputs: [['段', 'gear', 0, 5, 1]],
    bodies: () => [carRig()],
    throttle: true,
    text: [
      'エンジンがアクセルで速く回ろうとするとき、回さないといけない物は2つあります。エンジン側の回る部品（フライホイールなど）と、段に入っていれば車そのものです。',
      '車は回転していませんが、タイヤを通してエンジンとつながっているので、エンジンから見ると「回しにくさ」を持ちます。換算した慣性モーメントは m × r² / (変速比 × 最終減速比)² です。',
      '図の車で、段を選んで「アクセルを踏む」を押してください（トルク 150 N·m）。1速ではエンジンが一気に吹け上がり、すぐレッドゾーンに着きます。高い段では車が重く見え、なかなか回転が上がりません。地面の流れと、車速の数字で比べてください。',
      '同じ理由で、クラッチを切るとエンジン側の J だけになり、空ぶかしするとすぐ回転が上がります。値はギヤボックスLABの初期値と、説明用の仮の値です。'
    ],
    formula: b => {
      const i = RATIOS[p.gear][1];
      return [
        ['エンジン側の J', 'エンジン + フライホイール + クラッチ', PARTS.map(x => `${x[0]} ${x[1]}`).join('、') + ` → 合計 ${n3(ENGINE_J)} kg·m²`],
        ['車をエンジンから見た J', `${sub('J', 'v')} = m × r² / (i × ${sub('i', 'f')})²`, `${CAR.mass} × ${CAR.tire}² ÷ (${i} × ${CAR.final})² = ${n3(vehicleJ(i))} kg·m²`],
        ['全段の比較', '段: 車の J（エンジンから見た値）', RATIOS.map(r => `${r[0]} ${n3(vehicleJ(r[1]))}`).join('、')],
        ['トルク 150 N·m での回転の上がり方', 'α = T / (J + Jv)', `${RATIOS[p.gear][0]}: 1秒に ${n0(150 / b[0].J / RPM)} rpm、クラッチを切ると 1秒に ${n0(150 / ENGINE_J / RPM)} rpm`]
      ];
    }
  },
  {
    level: 'pro', name: 'シンクロと同期時間', title: '回転を合わせる時間は、合わせる側の J で決まる',
    slowmo: 10,   // 実際は 0.1 秒ほどで終わるので、10倍ゆっくり見せる
    inputs: [['合わせる側の J (kg·m²)', 'syncJ', 0.004, 0.04, 0.002], ['回転差 Δn (rpm)', 'syncDiff', 200, 3000, 100], ['シンクロの摩擦トルク (N·m)', 'syncT', 5, 40, 1]],
    bodies: () => [syncRig()],
    text: [
      '変速するとき、シンクロは「回転を合わせる側」（クラッチディスク、インプット軸、カウンタ軸、ギヤ）の回転数を、摩擦で変えます。クラッチは切れているので、エンジン側は入りません。',
      '実際は 0.1 秒ほどで終わるので、図は10倍ゆっくり見せています。図の左は、つなぎたいギヤ（金色の円すい面＝コーン付き）です。右のスリーブとハブは、アウトプット軸と一緒に回っています。「シンクロで合わせる」を押すと、コーンの摩擦でギヤが速くなり、回転がそろった瞬間に、スリーブが左へ滑ってギヤにかみ合います。',
      '摩擦している間は、コーンが熱で赤く光ります。J が大きい、回転差が大きい、摩擦トルクが小さいと、合わせる時間が長くなります。',
      'クラッチディスクを軽くしたり、シンクロのコーンを2重、3重にして摩擦トルクを増やしたりするのは、この時間を短くして、変速を軽く速くするためです。'
    ],
    formula: () => [
      ['角速度の差', 'Δω = 2π × Δn / 60', `${n2(p.syncDiff * RPM)} rad/s`],
      ['合わせる時間', `t = J × Δω / ${sub('T', 's')}`, `${p.syncJ} × ${n2(p.syncDiff * RPM)} ÷ ${p.syncT} = ${n3(p.syncJ * p.syncDiff * RPM / p.syncT)} 秒`],
      ['コーンで出る熱', `E = 1/2 × J × Δω²`, `${n0(0.5 * p.syncJ * (p.syncDiff * RPM) ** 2)} J`]
    ]
  }
];

// タイヤ + ホイール: ホイール 0.15 kg·m² + タイヤ 9 kg がゴムの真ん中（半径の 0.9 倍）にあるとみなす
const tireJ = r => 0.15 + 9 * (0.9 * r) ** 2;

// ---------- 段階ごとの飾りと仕掛け ----------
// タコメーター（針は update で動かす）
function tachometer(g) {
  const face = new THREE.Group();
  face.position.set(0.55, 0.05, 0);
  g.add(face);
  add(face, cyl(0.22, 0.02), 0x111417);
  for (let k = 0; k <= 8; k++) {   // 0〜8,000 rpm の目盛り。7,000 から赤
    const a = Math.PI * 0.75 - k / 8 * Math.PI * 1.5;
    const tick = add(face, new THREE.BoxGeometry(0.01, 0.04, 0.01), k >= 7 ? COLOR.red : 0xeeeeee, 0.18 * Math.cos(a + Math.PI / 2), 0.18 * Math.sin(a + Math.PI / 2), 0.015);
    tick.rotation.z = a;
  }
  const needle = add(face, new THREE.BoxGeometry(0.012, 0.17, 0.01), COLOR.power, 0, 0, 0.02);
  needle.geometry.translate(0, 0.085, 0);
  add(face, cyl(0.02, 0.03), 0x666666, 0, 0, 0.02);
  g.userData.needle = needle;
}

// 回す側から見た「重さ」の棒（左側。高さ = J。1 kg·m² で 0.4 m）
function meter(g, J) {
  const h = Math.max(0.01, 0.4 * J);
  add(g, new THREE.BoxGeometry(0.08, h, 0.08), COLOR.power, -0.42, -0.3 + h / 2, 0);
  add(g, new THREE.BoxGeometry(0.1, 0.4, 0.002), 0x55656e, -0.42, -0.1, -0.05, { transparent: true, opacity: 0.4 });   // 1 kg·m² の目盛り
}

// 段階7: 横から見た車。前にエンジンとフライホイール、後ろにタイヤ。地面のしま模様が流れる
function carRig() {
  const i = RATIOS[p.gear][1];
  return {
    name: `エンジン側 + ${RATIOS[p.gear][0]}で見た車`, J: ENGINE_J + vehicleJ(i), torque: 150, goal: REDLINE, x: -0.6, tagY: 0.95,
    tags: [['エンジン', -0.3, -0.25], ['フライホイール', 0, 0.3], ['トランスミッション', 0.35, -0.2], ['プロペラシャフト', 1.0, -0.25], ['後輪', 1.75, 0.15]],
    build: g => { flywheel(g, true); },   // 回る本体 = フライホイール（エンジンの回転）
    parts: [-0.55, 1.75].map(dx => ({ x: dx, y: -0.25, z: 0.3, ratio: 1 / (i * CAR.final), build: w => { w.scale.setScalar(0.7); wheel(w, 0.21, COLOR.alu, 5, 0.315); } })),
    decor: g => {
      const body = add(g, new THREE.BoxGeometry(3.2, 0.55, 0.9), COLOR.body, 0.6, 0.15, 0, { transparent: true, opacity: 0.18, depthWrite: false });
      body.material.side = THREE.DoubleSide;
      add(g, new THREE.BoxGeometry(1.2, 0.35, 0.85), COLOR.body, 0.7, 0.55, 0, { transparent: true, opacity: 0.18, depthWrite: false });
      add(g, new THREE.BoxGeometry(0.35, 0.3, 0.3), COLOR.dark, -0.3, 0.05, 0);   // エンジン
      add(g, new THREE.BoxGeometry(0.6, 0.16, 0.16), COLOR.steel, 0.35, 0.02, 0); // トランスミッション
      add(g, cyl(0.025, 1.6).rotateY(Math.PI / 2), COLOR.steel, 1.0, -0.12, 0);   // プロペラシャフト
      const ground = new THREE.Group();
      ground.position.y = -0.52;
      for (let k = -6; k <= 6; k++) add(ground, new THREE.BoxGeometry(0.25, 0.01, 1.4), k % 2 ? 0x2b3e47 : 0x3d5560, 0.6 + k * 0.5, 0, 0);
      g.add(ground);
      g.userData.ground = ground;
    },
    update: (b, dt) => {
      b.distance = (b.distance || 0) + b.omega / (i * CAR.final) * CAR.tire * dt / 20;   // 1/20 の速さで見せる
      b.decor.userData.ground.position.x = (((b.distance % 1) + 1) % 1);   // しま模様は 1 m ごとに同じ
      b.speed = b.omega / (i * CAR.final) * CAR.tire * 3.6;
      if (b.omega >= REDLINE * RPM && state.pushing) banner(`レッドゾーン！ ${RATIOS[p.gear][0]}で時速 ${n0(b.speed)} km。次の段へシフトアップ`);
    }
  };
}

// 段階8: つなぎたいギヤ（コーン付き）と、一定の速さで回るスリーブとハブ
function syncRig() {
  return {
    name: '回転を合わせる側（ギヤとコーン）', J: p.syncJ, torque: p.syncT, goal: p.syncDiff, x: -0.25, tagY: -0.3,
    tags: [['コーン（金色）', 0, 0.24], ['スリーブとハブ（一定の速さ）', 0.5, 0.24]],
    build: g => {
      add(g, teeth(0.16, 40, 0.012, 0.05), COLOR.alu);
      g.userData.cone = add(g, new THREE.CylinderGeometry(0.08, 0.1, 0.07, 48).rotateX(Math.PI / 2), COLOR.brass, 0, 0, 0.06);
      mark(g, 0.16, 0.03);
    },
    decor: g => {
      const sleeve = new THREE.Group();
      sleeve.position.set(0.45, 0, 0);
      add(sleeve, annulus(0.15, 0.1, 0.09), COLOR.dark);
      add(sleeve, teeth(0.075, 20, 0.01, 0.09), COLOR.steel);
      mark(sleeve, 0.15, 0.05);
      g.add(sleeve);
      g.userData.sleeve = sleeve;
    },
    update: (b, dt) => {
      const sleeve = b.decor.userData.sleeve;
      b.sleeveAngle = (b.sleeveAngle || 0) + p.syncDiff * RPM * dt / 10 / 20;   // 10倍スロー、1/20 の速さ
      sleeve.rotation.z = -b.sleeveAngle;
      const done = b.omega >= p.syncDiff * RPM - 0.01;
      const slip = state.pushing && !done;
      b.heat = Math.max(0, (b.heat || 0) + (slip ? p.syncT * (p.syncDiff * RPM - b.omega) : 0) * dt - 300 * dt);
      b.group.userData.cone.material.emissive.setRGB(Math.min(1, b.heat / 200), Math.min(0.3, b.heat / 800), 0);
      // そろったら、スリーブが左へ滑ってギヤにかみ合う
      sleeve.position.x += ((done && state.pushing ? 0.27 : 0.45) - sleeve.position.x) * Math.min(1, dt * 8);
      if (done && state.pushing && !b.joined) {
        b.joined = true;
        banner(`ガチャッ！回転がそろってつながった（${n2(b.time)} 秒）`);
      }
    }
  };
}

// ---------- 3D ----------
const canvas = el('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const world = new THREE.Scene();
world.background = new THREE.Color(0x17303a);
world.add(new THREE.HemisphereLight(0xffffff, 0x1b2b33, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 0.7);
sun.position.set(2, 3, 5);
world.add(sun);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
const controls = new THREE.OrbitControls(camera, canvas);

const state = { step: 1, tab: 'structure', pushing: false };
let bodies = [];
let tags = [];   // 部品の名前の札: { text, x, y }

function newGroup(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y || 0, z || 0);
  g.userData.lesson = true;
  world.add(g);
  return g;
}

function build() {
  world.children.filter(o => o.userData.lesson).forEach(o => world.remove(o));
  bodies = LESSONS[state.step - 1].bodies();
  tags = [];
  const gap = 0.75;
  bodies.forEach((b, k) => {
    const x = b.x !== undefined ? b.x : (k - (bodies.length - 1) / 2) * gap;
    const makeDecor = b.decor;
    Object.assign(b, { omega: 0, angle: 0, time: 0, heat: 0, finished: false });
    b.group = newGroup(x);
    b.build(b.group);
    b.decor = newGroup(x);            // 回らない部分（メーター、キャリパー、車体など）
    if (makeDecor) makeDecor(b.decor);
    (b.parts || []).forEach(part => {
      part.group = newGroup(x + part.x, part.y, part.z);
      part.build(part.group);
    });
    // 札: 本体の名前と、中の部品の名前（tags の位置は本体からの相対位置）
    tags.push({ text: b.name, x, y: b.tagY !== undefined ? b.tagY : -0.45, main: true });
    (b.tags || []).forEach(t => tags.push({ text: t[0], x: x + t[1], y: t[2] }));
  });
  el('tags').innerHTML = tags.map(t => `<span class="tag ${t.main ? 'main' : ''}">${t.text}</span>`).join('');
  frameCamera();
  el('banner').hidden = true;
}

function frameCamera() {
  // 段階ごとの、見せたい幅 (m)
  const width = { 1: 1.4, 2: 1.3, 3: 1.9, 4: 1.5, 5: 1.1, 6: 2.4, 7: 3.6, 8: 1.0 }[state.step];
  const half = Math.tan(camera.fov * Math.PI / 360);
  const height = state.step === 8 ? 0.45 : 0.75;   // 縦に見せたい高さの半分 (m)
  const distance = Math.max(width / 2 / (half * camera.aspect), height / half) * 1.1;
  controls.target.set(state.step === 7 ? 0 : 0, 0, 0);
  camera.position.set(width * 0.08, distance * 0.18, distance);
}

// 画面上部の知らせ（ゴール、レッドゾーン、ガチャッ）
let bannerTimer = 0;
function banner(text) {
  el('banner').textContent = text;
  el('banner').hidden = false;
  bannerTimer = 2.5;
}

// 毎フレーム: 押している間は、各 body に T / J の角加速度。goal で止める
let last = performance.now();
let shownAt = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const lesson = LESSONS[state.step - 1];
  const dtp = dt / (lesson.slowmo || 1);   // 計算の時間（スローのときは短くする）
  bodies.forEach(b => {
    const goal = (b.goal || 3000) * RPM;
    if (state.pushing && b.omega < goal) {
      b.omega = Math.min(goal, b.omega + (b.torque || p.torque) / b.J * dtp);
      b.time += dtp;
      if (b.omega >= goal && !b.finished) finish(b);
    }
    if (b.update) b.update(b, dt);
    b.angle += b.omega * dtp / 20;     // 目で追えるように、1/20 の速さで見せる
    b.group.rotation.z = -b.angle;
    (b.parts || []).forEach(part => { part.group.rotation.z = -b.angle * part.ratio; });
  });
  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) el('banner').hidden = true;
  placeTags();
  shownAt += dt;
  if (shownAt > 0.15) { shownAt = 0; showReadout(); }
  controls.update();
  renderer.render(world, camera);
  requestAnimationFrame(frame);
}

// ゴールに着いた: 「よーいドン」の段階では、着いた順番を出す
function finish(b) {
  b.finished = true;
  b.place = bodies.filter(x => x.finished).length;
  if (LESSONS[state.step - 1].race) banner(`${b.place}着: ${b.name}（${n2(b.time)} 秒）`);
}

// 部品の名前の札: 3Dの位置を、画面の位置に直して置く
function placeTags() {
  const rect = canvas.getBoundingClientRect();
  tags.forEach((t, k) => {
    const tag = el('tags').children[k];
    if (!tag) return;
    const v = new THREE.Vector3(t.x, t.y, 0.1).project(camera);
    tag.style.left = `${(v.x + 1) / 2 * rect.width}px`;
    tag.style.top = `${(1 - v.y) / 2 * rect.height}px`;
  });
}

function showReadout() {
  el('readout').innerHTML = bodies.map(b => `${b.name}: ${n0(b.omega / RPM)} rpm（J = ${n3(b.J)} kg·m²、回転のエネルギー ${n0(0.5 * b.J * b.omega ** 2)} J${b.speed !== undefined ? `、車速 ${n0(b.speed)} km/h` : ''}）`).join('<br>')
    + `<br>回転は、目で追えるように 1/20 の速さで見せています。${LESSONS[state.step - 1].slowmo ? `時間も ${LESSONS[state.step - 1].slowmo} 倍ゆっくり進めています（表示の秒数は実際の時間）。` : ''}`;
  if (state.tab === 'formula' && state.step === 5) renderLesson();
}

new ResizeObserver(() => {
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  frameCamera();
}).observe(canvas);

// ---------- 画面 ----------
function renderSteps() {
  let group = '';
  el('steps').innerHTML = LESSONS.map((l, i) => {
    const head = l.level !== group ? `<span class="group">${LEVELS[l.level]}</span>` : '';
    group = l.level;
    return head + `<button type="button" data-step="${i + 1}" class="${i + 1 === state.step ? 'current' : ''}">${i + 1} ${l.name}</button>`;
  }).join('');
}

function renderControls() {
  const l = LESSONS[state.step - 1];
  el('controls').innerHTML = (l.inputs || []).map(([label, key, min, max, step]) =>
    `<label>${label} <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${p[key]}"> <span>${key === 'gear' ? RATIOS[p.gear][0] : p[key]}</span></label>`).join('');
  el('push').textContent = l.race ? 'よーいドン' : state.step === 8 ? 'シンクロで合わせる' : state.step === 4 || state.step === 7 ? 'アクセルを踏む' : '回す';
  el('stop').textContent = l.brake ? 'ブレーキ' : '止める';
}

function renderLesson() {
  const l = LESSONS[state.step - 1];
  el('lessonTitle').textContent = `${l.title}（${LEVELS[l.level]}）`;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('current', b.dataset.tab === state.tab));
  el('lessonOutput').innerHTML = state.tab === 'structure'
    ? l.text.map(t => `<p>${t}</p>`).join('')
    : l.formula(bodies).map(r => `<div class="formula"><b>${r[0]}</b><span class="math">${r[1]}</span><span class="num">${r[2]}</span></div>`).join('')
      + '<p class="note">J: 慣性モーメント (kg·m²)、m: 質量 (kg)、r: 半径 (m)、T: トルク (N·m)、ω: 角速度 (rad/s)、α: 角加速度 (rad/s²)、n: 回転数 (rpm)。部品の重さや J は、説明用の仮の値です。</p>';
  el('prev').disabled = state.step === 1;
  el('next').disabled = state.step === LESSONS.length;
}

function showStep(step) {
  state.step = Math.min(LESSONS.length, Math.max(1, step));
  state.pushing = false;
  build();
  renderSteps();
  renderControls();
  renderLesson();
}

el('steps').addEventListener('click', e => { if (e.target.dataset.step) showStep(Number(e.target.dataset.step)); });
el('prev').addEventListener('click', () => showStep(state.step - 1));
el('next').addEventListener('click', () => showStep(state.step + 1));
el('tabs').addEventListener('click', e => { if (e.target.dataset.tab) { state.tab = e.target.dataset.tab; renderLesson(); } });
el('push').addEventListener('click', () => {
  bodies.forEach(b => Object.assign(b, { omega: 0, time: 0, finished: false, joined: false, braking: false }));
  el('banner').hidden = true;
  state.pushing = true;
});
el('stop').addEventListener('click', () => {
  state.pushing = false;
  // 段階5はブレーキで少しずつ止める（熱が出る）。ほかはすぐ止める
  bodies.forEach(b => { if (LESSONS[state.step - 1].brake) b.braking = true; else b.omega = 0; });
});
el('controls').addEventListener('input', e => {
  const key = e.target.dataset.key;
  p[key] = Number(e.target.value);
  e.target.nextElementSibling.textContent = key === 'gear' ? RATIOS[p.gear][0] : p[key];
  state.pushing = false;
  build();
  renderLesson();
});

showStep(1);
requestAnimationFrame(frame);
