// inertia.js: CAR STUDY LAB「回転体のイナーシャ」
// 段階ごとに「回る物（body）」を左から並べ、同じトルクをかけて回り方を比べる
// body: { name, J（慣性モーメント kg·m²）, build(group)（形を作る）, gears（一緒に回る別の物と回転比） }

const el = id => document.getElementById(id);
const n0 = v => Math.round(v);
const n2 = v => v.toFixed(2);
const n3 = v => v.toFixed(3);
const sub = (letter, mark) => `${letter}<sub>${mark}</sub>`;
const RPM = 2 * Math.PI / 60;     // rpm → rad/s
const MAX_RPM = 3000;             // 回すのは、この回転数まで
const STEEL = 7850;               // 鋼の密度 (kg/m³)

// 入力できる値（段階ごとに使うものが違う）
const p = {
  torque: 5,        // かけるトルク (N·m)
  mass: 4,          // おもり1個の質量 (kg)
  radius: 0.15,     // おもりの半径 (m)
  ratio: 3,         // ギヤ比
  gear: 0,          // 段階7: 選んだ段
  syncJ: 0.012,     // 段階8: 回転を合わせる側の慣性モーメント
  syncDiff: 1500,   // 段階8: 回転差 (rpm)
  syncT: 15         // 段階8: シンクロの摩擦トルク
};
const LEVELS = { jh: '中学生', hs: '高校生', pro: '社会人' };

// ---------- 形（1単位 = 1 m。小さい部品は見やすく拡大している） ----------
const COLOR = { steel: 0x9fb0b8, light: 0xd7dde0, heavy: 0x55656e, brass: 0xc9a24a, red: 0xd40000, power: 0xf0a81c };
const mat = color => new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.55 });
const faceCam = g => g.rotateX(Math.PI / 2);   // 円柱の軸を、画面の手前向き（z）にする

function disc(group, radius, thick, color) {
  group.add(new THREE.Mesh(faceCam(new THREE.CylinderGeometry(radius, radius, thick, 48)), mat(color)));
  mark(group, radius, thick);
}
function ring(group, outer, inner, thick, color) {
  const shape = new THREE.Shape().absarc(0, 0, outer, 0, Math.PI * 2);
  shape.holes.push(new THREE.Path().absarc(0, 0, inner, 0, Math.PI * 2, true));
  group.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 48 }).translate(0, 0, -thick / 2), mat(color)));
  [-1, 1].forEach(s => group.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, inner * 2, 0.02).rotateZ(s * Math.PI / 4), mat(COLOR.steel))));   // スポーク
  mark(group, outer, thick);
}
// 回転が見えるように、外周の0°の位置に赤い印を付ける
function mark(group, radius, thick) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, radius * 0.5, thick + 0.01), new THREE.MeshBasicMaterial({ color: COLOR.red }));
  m.position.y = radius * 0.72;
  group.add(m);
}
// 棒の両端におもり2個
function dumbbell(group, radius) {
  group.add(new THREE.Mesh(new THREE.BoxGeometry(radius * 2 + 0.06, 0.03, 0.03), mat(COLOR.steel)));
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 16), mat(s > 0 ? COLOR.red : COLOR.heavy));
    w.position.x = s * radius;
    group.add(w);
  });
}
// 歯車の奥に付ける物（歯車が隠れないように、少し奥へずらす）
function behind(group, build) {
  const back = new THREE.Group();
  back.position.z = -0.06;
  build(back);
  group.add(back);
}

// 歯車（見た目だけ。歯数 = 半径に比例）
function gear(group, radius, color) {
  const count = Math.max(10, Math.round(radius * 120));
  const pts = [];
  for (let k = 0; k < count * 2; k++) {
    const r = k % 2 ? radius : radius * 1.06;
    const a = k / (count * 2) * Math.PI * 2;
    pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a)));
  }
  group.add(new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.03, bevelEnabled: false }).translate(0, 0, -0.015), mat(color)));
  mark(group, radius, 0.03);
}

// 円板の慣性モーメント: J = 1/2 × m × r²、鋼の円板の質量: m = 密度 × π r² × 厚さ
const discJ = (m, r) => 0.5 * m * r * r;
const steelMass = (r, t) => STEEL * Math.PI * r * r * t;

// ギヤボックスLABの初期値（1速〜6速の変速比、最終減速比、タイヤ半径）
const RATIOS = [['1速', 3.64], ['2速', 2.10], ['3速', 1.38], ['4速', 1.00], ['5速', 0.79], ['6速', 0.65]];
const CAR = { mass: 1000, tire: 0.315, final: 4.1 };
// ギヤボックスのまわりの、説明用の仮の慣性モーメント (kg·m²)
const PARTS = [['エンジン（クランク、ピストンなど）', 0.05], ['フライホイール', 0.10], ['クラッチ（エンジン側）', 0.02], ['クラッチディスク', 0.004], ['インプット軸、カウンタ軸、ギヤ', 0.008]];
const vehicleJ = i => CAR.mass * CAR.tire ** 2 / (i * CAR.final) ** 2;   // 車をエンジンから見た慣性モーメント

// ---------- 段階 ----------
const LESSONS = [
  {
    level: 'jh', name: '動かしにくさ', title: '重い物ほど、回し始めにくく、止めにくい',
    bodies: () => [
      { name: '軽い円板（アルミ 2 kg）', J: discJ(2, 0.2), build: g => disc(g, 0.2, 0.03, COLOR.light) },
      { name: '重い円板（鋼 6 kg）', J: discJ(6, 0.2), build: g => disc(g, 0.2, 0.03, COLOR.heavy) }
    ],
    text: [
      '止まっている物は止まったまま、動いている物は動いたままでいようとします。この性質を「慣性」と言います。重い物ほど、この性質が強くなります。',
      '回る物でも同じです。図の2枚は同じ大きさで、重さだけが違います。「同じトルクで回す」を押すと、軽い円板は早く回り出し、重い円板はゆっくりしか速くなりません。',
      '回る物の「回しにくさ」を、慣性モーメント（イナーシャ）と言います。記号は J、単位は kg·m² です。',
      '自転車の車輪を手で回すとき、重い車輪は回し始めが重く、一度回るとなかなか止まりません。これが慣性モーメントです。'
    ],
    formula: b => [
      ['回しにくさ', 'J（慣性モーメント）', b.map(x => `${x.name}: ${n3(x.J)} kg·m²`).join('<br>')],
      ['比べ方', '同じトルクなら、J が大きいほど遅く速くなる', `重い方は軽い方の ${n2(b[1].J / b[0].J)} 倍回しにくい`]
    ]
  },
  {
    level: 'jh', name: '形で変わる', title: '同じ重さでも、外側に重さがあるほど回しにくい',
    bodies: () => [
      { name: '円板（4 kg）', J: discJ(4, 0.2), build: g => disc(g, 0.2, 0.03, COLOR.steel) },
      { name: '輪（4 kg、重さが外周に集まる）', J: 4 * 0.2 ** 2, build: g => ring(g, 0.2, 0.17, 0.05, COLOR.steel) }
    ],
    text: [
      '2つとも重さは4 kg、大きさも同じです。違うのは、重さがどこにあるかです。',
      '円板は重さが中心から外まで均等に広がっています。輪は重さがほとんど外周にあります。',
      '「同じトルクで回す」を押すと、輪の方がゆっくり速くなります。回る中心から遠い所の重さほど、回しにくさに強く効くからです。',
      'フィギュアスケートの選手は、腕を広げるとゆっくり、腕を縮めると速く回ります。重さを中心に寄せると、回しやすくなるからです。'
    ],
    formula: b => [
      ['円板', 'J = 1/2 × m × r²', `1/2 × 4 × 0.2² = ${n3(b[0].J)} kg·m²`],
      ['輪（重さがすべて外周にあるとき）', 'J = m × r²', `4 × 0.2² = ${n3(b[1].J)} kg·m²`],
      ['比べると', '輪 ÷ 円板', `${n2(b[1].J / b[0].J)} 倍`]
    ]
  },
  {
    level: 'hs', name: '半径の2乗', title: '半径が2倍になると、回しにくさは4倍',
    inputs: [['おもりの半径 r (m)', 'radius', 0.05, 0.3, 0.01]],
    bodies: () => [
      { name: `おもりが半径 ${n2(p.radius / 2)} m`, J: 2 * 1 * (p.radius / 2) ** 2, build: g => dumbbell(g, p.radius / 2) },
      { name: `おもりが半径 ${n2(p.radius)} m`, J: 2 * 1 * p.radius ** 2, build: g => dumbbell(g, p.radius) }
    ],
    text: [
      '棒の両端に、1 kg のおもりを1個ずつ付けました。左はおもりが内側、右はその2倍外側にあります。',
      '中心から距離 r の所にある質量 m の点は、J = m × r² だけ回しにくさを持ちます。r が2乗で効くので、半径が2倍になると J は4倍になります。',
      '下のスライダーでおもりの位置を変えて、回り方の違いを確かめてください。棒の重さは小さいので省いています。'
    ],
    formula: b => [
      ['点の慣性モーメント', 'J = m × r²（おもり2個なので2倍）', b.map(x => `${x.name}: ${n3(x.J)} kg·m²`).join('<br>')],
      ['半径2倍の効果', `${sub('J', '2')} / ${sub('J', '1')} = (2r)² / r²`, `${n2(b[1].J / b[0].J)} 倍`],
      ['形のちがう物の J', '円板 1/2 m r²、輪 m r²、細い棒（中心で回す） 1/12 m L²', '全部、質量 × 長さの2乗の形']
    ]
  },
  {
    level: 'hs', name: 'トルクと角加速度', title: 'トルクを大きくすると、速く回り出す',
    inputs: [['かけるトルク T (N·m)', 'torque', 1, 30, 1]],
    bodies: () => [{ name: '鋼の円板（半径 0.2 m、厚さ 30 mm）', J: discJ(steelMass(0.2, 0.03), 0.2), build: g => disc(g, 0.2, 0.03, COLOR.steel) }],
    text: [
      'まっすぐ動く物では「力 = 質量 × 加速度」（F = m a）でした。回る物では、力の代わりにトルク、質量の代わりに慣性モーメント、加速度の代わりに角加速度を使います。',
      'T = J × α。同じ円板でも、トルクを2倍にすると、2倍の速さで回転が上がります。',
      'スライダーでトルクを変えて「同じトルクで回す」を押し、3,000 rpm に届くまでの時間を比べてください。'
    ],
    formula: b => {
      const J = b[0].J, alpha = p.torque / J;
      return [
        ['円板の質量', 'm = 密度 × π r² × 厚さ', `7850 × π × 0.2² × 0.03 = ${n2(steelMass(0.2, 0.03))} kg`],
        ['慣性モーメント', 'J = 1/2 × m × r²', `${n3(J)} kg·m²`],
        ['角加速度', 'α = T / J', `${p.torque} ÷ ${n3(J)} = ${n2(alpha)} rad/s²`],
        ['3,000 rpm までの時間', 't = ω / α = (3000 × 2π / 60) / α', `${n2(MAX_RPM * RPM / alpha)} 秒`]
      ];
    }
  },
  {
    level: 'hs', name: '回転のエネルギー', title: '回っている物は、エネルギーをためている',
    bodies: () => [{ name: 'フライホイール（鋼、半径 0.15 m、厚さ 40 mm）', J: discJ(steelMass(0.15, 0.04), 0.15), build: g => disc(g, 0.15, 0.04, COLOR.heavy) }],
    text: [
      '回っている物は、回転のエネルギーを持っています。速く回るほど、また J が大きいほど、たくさんためています。',
      'エンジンのフライホイールは、このエネルギーで、爆発と爆発の間も回転を保ちます。回転のむらをならす「はずみ車」です。',
      '回転数が2倍になると、エネルギーは4倍になります。図の下に、今のエネルギーを出しています。「止める」はブレーキに当たり、ためていたエネルギーは熱になります。'
    ],
    formula: b => {
      const w = b[0].omega || 0;
      return [
        ['回転のエネルギー', 'E = 1/2 × J × ω²', `1/2 × ${n3(b[0].J)} × ${n2(w)}² = ${n0(0.5 * b[0].J * w * w)} J`],
        ['ω（角速度）', 'ω = 2π × n / 60', `${n0(w / RPM)} rpm → ${n2(w)} rad/s`],
        ['くらべると', 'まっすぐ動く物の E = 1/2 × m × v²', 'm が J に、v が ω に入れ替わった形']
      ];
    }
  },
  {
    level: 'pro', name: 'ギヤ越しのイナーシャ', title: '減速ギヤの先の物は、ギヤ比の2乗だけ軽く見える',
    inputs: [['ギヤ比 i（出力が i 倍遅い）', 'ratio', 1, 6, 0.5]],
    bodies: () => {
      const J = discJ(steelMass(0.2, 0.03), 0.2);
      return [
        { name: '円板を直接回す', J, build: g => disc(g, 0.2, 0.03, COLOR.steel) },
        { name: `ギヤ比 ${p.ratio} を通して回す`, J: J / p.ratio ** 2, build: g => gear(g, 0.06, COLOR.brass),
          gears: [{ x: 0.06 + 0.06 * p.ratio, ratio: -1 / p.ratio, build: g => { gear(g, 0.06 * p.ratio, COLOR.brass); behind(g, d => disc(d, 0.2, 0.03, COLOR.steel)); } }] }
      ];
    }
  },
  {
    level: 'pro', name: 'ギヤボックスのイナーシャ', title: 'エンジンから見た車の重さは、段で変わる',
    inputs: [['段', 'gear', 0, 5, 1]],
    bodies: () => {
      const engine = PARTS.reduce((s, x) => s + x[1], 0);
      return [
        { name: 'エンジン側（クラッチまで）', J: engine, build: g => disc(g, 0.15, 0.04, COLOR.heavy) },
        { name: `エンジン側 + ${RATIOS[p.gear][0]}で見た車`, J: engine + vehicleJ(RATIOS[p.gear][1]), build: g => disc(g, 0.15, 0.04, COLOR.heavy),
          gears: [{ x: 0.5, ratio: 1 / (RATIOS[p.gear][1] * CAR.final), build: g => { ring(g, 0.3, 0.2, 0.12, 0x222428); } }] }
      ];
    }
  },
  {
    level: 'pro', name: 'シンクロと同期時間', title: '回転を合わせる時間は、合わせる側の J で決まる',
    inputs: [['合わせる側の J (kg·m²)', 'syncJ', 0.004, 0.04, 0.002], ['回転差 Δn (rpm)', 'syncDiff', 200, 3000, 100], ['シンクロの摩擦トルク (N·m)', 'syncT', 5, 40, 1]],
    bodies: () => [{ name: '回転を合わせる側（クラッチディスク、インプット軸、カウンタ軸、ギヤ）', J: p.syncJ, build: g => disc(g, 0.12, 0.03, COLOR.brass), torque: p.syncT, limit: p.syncDiff }]
  }
];

// 段階6〜8の説明と式（bodies を使うので、ここで足す）
Object.assign(LESSONS[5], {
  text: [
    '図の右は、小さい歯車で大きい歯車を回し、大きい歯車に円板を付けています。円板はギヤ比の分だけゆっくり回ります。',
    '入力側（小さい歯車）から見ると、円板は J / i² の回しにくさにしか見えません。i = 3 なら 1/9 です。「同じトルクで回す」を押すと、右の小さい歯車は左の円板より速く回り出します。',
    'エネルギーで考えるとわかります。円板の回転は入力の 1/i なので、同じ入力回転でためるエネルギー 1/2 J ω² は 1/i² になります。',
    '車では、低い段ほどギヤ比が大きいので、エンジンから見た車の重さが軽くなり、エンジンの回転が速く上がります。'
  ],
  formula: b => [
    ['円板の J', 'J = 1/2 × m × r²', `${n3(b[0].J)} kg·m²`],
    ['入力から見た J', `${sub('J', 'in')} = J / i²`, `${n3(b[0].J)} ÷ ${p.ratio}² = ${n3(b[1].J)} kg·m²`],
    ['同じトルクでの入力の角加速度の比', `${sub('α', 'ギヤ')} / ${sub('α', '直接')} = i²`, `${n2(p.ratio ** 2)} 倍`]
  ]
});
Object.assign(LESSONS[6], {
  text: [
    'エンジンがアクセルで速く回ろうとするとき、回さないといけない物は2つあります。エンジン側の回る部品（フライホイールなど）と、段に入っていれば車そのものです。',
    '車は回転していませんが、タイヤを通してエンジンとつながっているので、エンジンから見ると「回しにくさ」を持ちます。換算した慣性モーメントは m × r² / (変速比 × 最終減速比)² です。',
    '低い段（1速）では車がとても軽く見えるので、エンジンの回転はすぐ上がります。高い段では車が重く見え、なかなか上がりません。スライダーで段を変えて、右側の回り方を比べてください。右側の大きい輪はタイヤで、エンジンよりずっとゆっくり回ります。',
    '同じ理由で、クラッチを切るとエンジン側の J だけになり、空ぶかしするとすぐ回転が上がります。値はギヤボックスLABの初期値と、説明用の仮の値です。'
  ],
  formula: b => {
    const i = RATIOS[p.gear][1];
    return [
      ['エンジン側の J', 'エンジン + フライホイール + クラッチ', PARTS.map(x => `${x[0]} ${x[1]}`).join('、') + ` → 合計 ${n3(b[0].J)} kg·m²`],
      ['車をエンジンから見た J', `${sub('J', 'v')} = m × r² / (i × ${sub('i', 'f')})²`, `${CAR.mass} × ${CAR.tire}² ÷ (${i} × ${CAR.final})² = ${n3(vehicleJ(i))} kg·m²`],
      ['全段の比較', '段: 車の J（エンジンから見た値）', RATIOS.map(r => `${r[0]} ${n3(vehicleJ(r[1]))}`).join('、')],
      ['同じトルク 100 N·m での回転の上がり方', 'α = T / (J + Jv)', `${RATIOS[p.gear][0]}: ${n0(100 / b[1].J / RPM)} rpm/秒、クラッチを切ると ${n0(100 / b[0].J / RPM)} rpm/秒`]
    ];
  }
});
Object.assign(LESSONS[7], {
  text: [
    '変速するとき、シンクロは「回転を合わせる側」の回転数を、摩擦で変えます。合わせる側は、クラッチディスク、インプット軸、カウンタ軸、ギヤです（クラッチは切れているので、エンジン側は入りません）。',
    '「同じトルクで回す」を押すと、シンクロの摩擦トルクで、回転差の分だけ回転を変える様子を見られます。合わせる時間は、J が大きいほど、回転差が大きいほど長くなります。',
    'クラッチディスクを軽くしたり、シンクロのコーンを2重、3重にして摩擦トルクを増やしたりするのは、この時間を短くして、変速を軽く速くするためです。'
  ],
  formula: () => [
    ['角速度の差', 'Δω = 2π × Δn / 60', `${n2(p.syncDiff * RPM)} rad/s`],
    ['合わせる時間', `t = J × Δω / ${sub('T', 's')}`, `${p.syncJ} × ${n2(p.syncDiff * RPM)} ÷ ${p.syncT} = ${n3(p.syncJ * p.syncDiff * RPM / p.syncT)} 秒`],
    ['シンクロで出る熱', `E = 1/2 × J × Δω²（片方を止める場合の目安）`, `${n0(0.5 * p.syncJ * (p.syncDiff * RPM) ** 2)} J`]
  ]
});

// ---------- 3D ----------
const canvas = el('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const world = new THREE.Scene();
world.background = new THREE.Color(0x17303a);
world.add(new THREE.HemisphereLight(0xffffff, 0x1b2b33, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.position.set(2, 3, 5);
world.add(sun);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
const controls = new THREE.OrbitControls(camera, canvas);

const state = { step: 1, tab: 'structure', pushing: false };
let bodies = [];

function build() {
  world.children.filter(o => o.userData.body).forEach(o => world.remove(o));
  bodies = LESSONS[state.step - 1].bodies();
  const gap = 0.7;
  bodies.forEach((b, k) => {
    b.omega = 0;
    b.angle = 0;
    b.group = new THREE.Group();
    b.group.userData.body = true;
    b.group.position.x = (k - (bodies.length - 1) / 2) * gap - (b.gears ? b.gears[0].x / 2 : 0);
    b.build(b.group);
    world.add(b.group);
    (b.gears || []).forEach(gr => {
      gr.group = new THREE.Group();
      gr.group.userData.body = true;
      gr.group.position.x = b.group.position.x + gr.x;
      gr.build(gr.group);
      world.add(gr.group);
    });
  });
  const width = bodies.length * gap + 0.4;
  camera.position.set(0.15, 0.35, width / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect) * 0.6 + 0.4);
  controls.target.set(0, 0, 0);
}

// 毎フレーム: 押している間は、各 body に T / J の角加速度。3,000 rpm で止める（それ以上は回さない）
let last = performance.now();
let shownAt = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  bodies.forEach(b => {
    // limit: そこまでで止める回転数（シンクロでは回転差の分だけ変えたら、回転がそろって終わる）
    if (state.pushing) b.omega = Math.min((b.limit || MAX_RPM) * RPM, b.omega + (b.torque || p.torque) / b.J * dt);
    b.angle += b.omega * dt / 20;     // 目で追えるように、1/20 の速さで見せる
    b.group.rotation.z = -b.angle;
    (b.gears || []).forEach(gr => { gr.group.rotation.z = -b.angle * gr.ratio; });
  });
  shownAt += dt;
  if (shownAt > 0.15) { shownAt = 0; showReadout(); }
  controls.update();
  renderer.render(world, camera);
  requestAnimationFrame(frame);
}

function showReadout() {
  el('readout').innerHTML = bodies.map(b => `${b.name}: ${n0(b.omega / RPM)} rpm（J = ${n3(b.J)} kg·m²、回転のエネルギー ${n0(0.5 * b.J * b.omega ** 2)} J）`).join('<br>')
    + '<br>回転は、目で追えるように 1/20 の速さで見せています。';
  if (state.tab === 'formula' && state.step === 5) renderLesson();
}

new ResizeObserver(() => {
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
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
  el('push').textContent = state.step === 8 ? 'シンクロで回転を合わせる' : '同じトルクで回す';
}

function renderLesson() {
  const l = LESSONS[state.step - 1];
  el('lessonTitle').textContent = `${l.title}（${LEVELS[l.level]}）`;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('current', b.dataset.tab === state.tab));
  el('lessonOutput').innerHTML = state.tab === 'structure'
    ? l.text.map(t => `<p>${t}</p>`).join('')
    : l.formula(bodies).map(r => `<div class="formula"><b>${r[0]}</b><span class="math">${r[1]}</span><span class="num">${r[2]}</span></div>`).join('')
      + `<p class="note">J: 慣性モーメント (kg·m²)、m: 質量 (kg)、r: 半径 (m)、T: トルク (N·m)、ω: 角速度 (rad/s)、α: 角加速度 (rad/s²)、n: 回転数 (rpm)。今かけているトルクは ${state.step === 8 ? p.syncT : p.torque} N·m です。</p>`;
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
el('push').addEventListener('click', () => { bodies.forEach(b => { b.omega = 0; }); state.pushing = true; });
el('stop').addEventListener('click', () => { state.pushing = false; bodies.forEach(b => { b.omega = 0; }); });
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
