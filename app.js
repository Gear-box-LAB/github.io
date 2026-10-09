// app.js: 説明の文章と、画面の操作

// ---------- 表示の部品（説明パネルと吹き出しで共通） ----------
const sub = (letter, mark) => `${letter}<sub>${mark}</sub>`;
const paragraphs = list => list.map(text => `<p>${text}</p>`).join('');
// rows: [[求めるもの, 式, 今の数値での計算]]
const formulaRows = rows => rows.map(r =>
  `<div class="formula"><b>${r[0]}</b><span class="math">${r[1]}</span><span class="num">${r[2]}</span></div>`).join('');
const table = (head, rows) => `<div class="scroll"><table>
  <thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

// 式に使う記号
const N_IN = sub('n', 'in'), N_C = sub('n', 'c'), N_G = sub('n', 'g'), N_OUT = sub('n', 'out');
const T_IN = sub('T', 'in'), T_OUT = sub('T', 'out'), T_S = sub('T', 's'), T_C = sub('T', 'c');
const I_RED = sub('i', 'red'), Z_C = sub('z', 'c'), Z_OUT = sub('z', 'out');

const gearName = gear => gear === NEUTRAL ? 'N' : safe(state.gears[gear].name);

// 説明で例に使う段（ニュートラルのときは1速）
const exampleGear = () => state.gear === NEUTRAL ? 0 : state.gear;

// 全段の一覧（段階6と7で使う）
function allGearsTable() {
  return table(['段', '歯数の和', 'ギヤ比', '変速比', 'アウトプット軸 (rpm)', 'トルク (N·m)'],
    state.gears.map((g, i) => {
      const c = calc(i);
      return [safe(g.name), g.out + g.counter, n2(c.ratio), n2(c.total), n0(c.outRpm), n0(c.outTorque)];
    }));
}

// ---------- シンクロの拡大図（段階5）で、スリーブを押し込んでいく順番 ----------
const PHASES = [
  { name: '中立', text: 'スリーブはハブの真ん中にあります。ギヤ（白）はスリーブやハブと違う速さで回っています。リング（金色）はコーンから少し離れていて、ハブと一緒に回ります。' },
  { name: '押し付ける', text: 'スリーブを押すと、キー（赤）が一緒に動いてリングを押し、リングの内側がギヤのコーンに当たります。摩擦でリングが歯半分だけ回され、リングの歯がスリーブの通り道をふさぎます。押している間、摩擦でギヤの回転がハブの回転に近づいていきます。' },
  { name: '通り抜ける', text: '回転がそろうと、リングを回していた摩擦の力がなくなります。スリーブの歯先の斜面がリングを元の位置へ押し戻し、スリーブはリングの歯の間を通り抜けます。' },
  { name: 'かみ合う', text: 'スリーブがギヤのドグ歯にかみ合いました。ギヤ、スリーブ、ハブ、アウトプット軸が一体で回り、力が伝わります。' }
];
const DETAIL_GUIDE = '色の見分け方: 金色 = シンクロナイザリング、赤 = キー、白 = ギヤとドグ歯、灰色の円すい = コーン、歯の付いた灰色 = ハブ、外側の輪 = スリーブ。部品をクリックすると説明が開きます。実物のコーンはもっと浅い角度で、見やすいように大きく描いています。';

// ---------- 段階ごとの説明 ----------
// structure = 構造の文章、symbols = 記号の説明、formula = 式の行、extra = 表など、inputs = [[ラベル, stateの場所, キー]]
const LESSONS = [
  {
    title: '歯車2枚で、回転とトルクが変わる',
    structure: () => [
      'ギヤボックスのいちばん小さい単位は、かみ合った歯車2枚です。図では、上のインプット軸の小さい歯車が、下のカウンタ軸の大きい歯車を回しています。',
      '歯は1枚ずつ相手を送ります。歯数の多い歯車は1周するのに時間がかかるので、遅く回ります。',
      '遅くなった分だけ、回す力（トルク）は大きくなります。回る向きは逆になります。'
    ],
    symbols: 'z: 歯数、n: 回転数、T: トルク、i: ギヤ比。添字の1は回す側、2は回される側です。摩擦の損失は入れていません。',
    inputs: [['回す側の歯数 z₁', 'red', 'drive'], ['回される側の歯数 z₂', 'red', 'driven']],
    formula: c => {
      const power = 2 * Math.PI * c.rpm * c.torque / 60 / 1000;
      return [
        ['ギヤ比', 'i = z₂ / z₁', `${c.z2} ÷ ${c.z1} = ${n2(c.red)}`],
        ['回転数', 'n₂ = n₁ / i', `${n0(c.rpm)} ÷ ${n2(c.red)} = ${n0(c.counterRpm)} rpm`],
        ['トルク', 'T₂ = T₁ × i', `${n0(c.torque)} × ${n2(c.red)} = ${n0(c.counterTorque)} N·m`],
        ['出力（仕事率）', 'P = 2π × n × T / 60', `入口も出口も ${n1(power)} kW で変わらない`]
      ];
    }
  },
  {
    title: '軸は3本。ギヤは回っても、力はまだ伝わらない',
    structure: () => [
      '軸は3本あります。エンジンにつながるインプット軸、下のカウンタ軸、タイヤ側へ出るアウトプット軸です。',
      'インプット軸とアウトプット軸は一直線に並んでいますが、つながっていない別の軸です。',
      'カウンタ軸の1速ギヤは、軸に固定されています。相手のアウトプット軸側の1速ギヤ（白）は、軸の上で空回りします。そのため、ギヤは回っているのにアウトプット軸は止まったままです。これがニュートラルです。'
    ],
    symbols: `${N_IN}: インプット軸、${N_C}: カウンタ軸、${N_G}: 空転ギヤの回転数。${Z_C} と ${Z_OUT} は、カウンタ軸側とアウトプット軸側の歯数です。`,
    formula: c => {
      const g = state.gears[0];
      return [
        ['カウンタ軸の回転数', `${N_C} = ${N_IN} / ${I_RED}`, `${n0(c.rpm)} ÷ ${n2(c.red)} = ${n0(c.counterRpm)} rpm`],
        ['1速のギヤ比', `i₁ = ${Z_OUT} / ${Z_C}`, `${g.out} ÷ ${g.counter} = ${n2(gearRatio(g))}`],
        ['空転ギヤの回転数', `${N_G} = ${N_C} / i₁`, `${n0(c.counterRpm)} ÷ ${n2(gearRatio(g))} = ${n0(freeRpm(0, c))} rpm`],
        ['アウトプット軸の回転数', `${N_OUT} = 0`, '空転ギヤとつながっていないので 0 rpm']
      ];
    }
  },
  {
    title: 'スリーブが、空転ギヤと軸をつなぐ',
    structure: () => [
      '空転ギヤとアウトプット軸をつなぐ部品がスリーブです。スリーブは、軸に固定されたハブの外側にはまり、軸と一緒に回りながら左右に滑ります。',
      'スリーブが空転ギヤの側面の小さい歯（ドグ歯）にかみ合うと、ギヤと軸が一体になり、力が伝わります。',
      'スリーブを押すのはシフトフォークです。フォークは回らず、シフトレバーの動きをスリーブに伝えます。図の下の「1速」を押すと、スリーブが動きます。'
    ],
    symbols: `${I_RED}: 減速ギヤのギヤ比、i₁: 1速のギヤ比。2組のギヤを通るので、比は掛け算になります。`,
    formula: () => {
      const c = calc(0);
      return [
        ['変速比', `i = ${I_RED} × i₁`, `${n2(c.red)} × ${n2(c.ratio)} = ${n2(c.total)}`],
        ['アウトプット軸の回転数', `${N_OUT} = ${N_IN} / i`, `${n0(c.rpm)} ÷ ${n2(c.total)} = ${n0(c.outRpm)} rpm`],
        ['アウトプット軸のトルク', `${T_OUT} = ${T_IN} × i`, `${n0(c.torque)} × ${n2(c.total)} = ${n0(c.outTorque)} N·m`]
      ];
    }
  },
  {
    title: '2速を足す。1個のスリーブが2つの段を受け持つ',
    structure: () => [
      'スリーブの反対側に、2速のギヤの組を足しました。1個のスリーブが、左の1速と右の2速を受け持ちます。',
      '1速と2速の空転ギヤは、どちらも常に回っていますが、速さが違います。スリーブは片方にしか動けないので、2つの段が同時につながること（二重かみ合い）は起きません。',
      '段を増やすとは、この「ギヤの組」と「スリーブ」を軸の上に並べていくことです。'
    ],
    symbols: `ステップ比は、となりの段との変速比の比です。シフトアップすると、エンジン回転数はこの比で下がります。Δn は、つなぐ前の空転ギヤとアウトプット軸の回転差です。`,
    formula: c => {
      const first = calc(0), second = calc(1);
      const stepRatio = first.total / second.total;
      return [
        ['各段の変速比', `i = ${I_RED} × ${Z_OUT} / ${Z_C}`, `1速 ${n2(first.total)}、2速 ${n2(second.total)}`],
        ['ステップ比', 'i₁ / i₂', `${n2(first.total)} ÷ ${n2(second.total)} = ${n2(stepRatio)}`],
        ['1速→2速の後のエンジン回転数', `${N_IN}′ = ${N_IN} / ステップ比`, `${n0(c.rpm)} ÷ ${n2(stepRatio)} = ${n0(c.rpm / stepRatio)} rpm`],
        ['回転差', `Δn = ${N_G} − ${N_OUT}`, '下の表（今の状態での値）']
      ];
    },
    extra: c => table(['段', '空転ギヤ (rpm)', 'アウトプット軸 (rpm)', '回転差 (rpm)'],
      shownGears().map((g, i) => [safe(g.name), n0(freeRpm(i, c)), n0(c.outRpm), n0(freeRpm(i, c) - c.outRpm)]))
  },
  {
    title: 'シンクロが、つなぐ前に回転を合わせる',
    structure: () => state.detail ? [`<b>${state.phase + 1}. ${PHASES[state.phase].name}</b>`, PHASES[state.phase].text, DETAIL_GUIDE] : [
      '図の下の「シンクロを拡大して見る」を押すと、スリーブの内側の部品と、押し込んでいく順番を見られます。',
      '回転差があるままスリーブを押し込むと、歯どうしがぶつかって入りません。先に回転を合わせる部品が、シンクロナイザリング（図の金色の輪）です。',
      'スリーブを押すと、リングがギヤ側の円すい面（コーン）に押し付けられ、摩擦でギヤの回転をアウトプット軸の回転に近づけます。',
      '回転差がある間は、リングの歯がスリーブの通り道をふさぎます。回転がそろうと道が開き、スリーブがドグ歯に入ります。'
    ],
    symbols: 'μ: 摩擦係数、F: スリーブを押す力、R: コーンの平均半径、α: コーン角、J: 回転を変える側（クラッチディスク、インプット軸、カウンタ軸、ギヤ）の慣性モーメントを、そのギヤの軸に換算した値。' + sub('R', 'b') + ': 歯先の斜面がある半径、β: 歯先の斜面の角度（軸の向きから測った値）。通り道をふさぐトルクの式は、斜面の摩擦を無視した簡略式です。数値は説明用の仮の値です。',
    inputs: [['押す力 F (N)', 'synchro', 'force'], ['摩擦係数 μ', 'synchro', 'mu'], ['コーン角 α (°)', 'synchro', 'angle'], ['慣性モーメント J (kg·m²)', 'synchro', 'inertia'], ['歯先の斜面の角度 β (°)', 'synchro', 'chamfer']],
    formula: c => {
      const s = state.synchro;
      return [
        ['コーンの摩擦トルク', `${T_S} = μ × F × R / sin α`, `${s.mu} × ${s.force} × ${s.radius} ÷ sin ${s.angle}° = ${n1(synchro(0, c).torque)} N·m`],
        ['リングを戻そうとするトルク', `${sub('T', 'i')} = F × ${sub('R', 'b')} / tan β`, `${s.force} × ${s.pitch} ÷ tan ${s.chamfer}° = ${n1(synchro(0, c).index)} N·m`],
        ['通り道をふさげる条件', `${T_S} > ${sub('T', 'i')}`, synchro(0, c).torque > synchro(0, c).index ? '成り立つ。回転がそろうまでスリーブは入らない' : '成り立たない。回転がそろう前にスリーブが入り、ギヤ鳴りが起きる'],
        ['回転差', `Δn = ${N_G} − ${N_OUT}`, '下の表'],
        ['合わせるのにかかる時間', `t = J × 2π × |Δn| / 60 / ${T_S}`, '下の表']
      ];
    },
    extra: c => table(['入れる段', '回転差 (rpm)', '時間 (秒)'],
      shownGears().map((g, i) => [safe(g.name), n0(synchro(i, c).diff), n2(synchro(i, c).time)]))
  },
  {
    title: 'シフトドラムが回り、溝がフォークを動かす',
    structure: () => [
      '3速と4速を足して、スリーブとフォークを2組にしました。フォークの奥にある、溝の彫られた筒がシフトドラムです。フォークの赤いピンが、溝にはまっています。',
      'ドラムが回ると、ピンの所に来る溝の位置が左右にずれます。ピンは溝から出られないので、フォークとスリーブが左右に動きます。ドラムの「回る動き」を、フォークの「まっすぐな動き」に変える仕組みです。',
      '溝は、フォーク1本につき1本あります。ある角度では1本の溝だけが左右に曲がり、ほかの溝はまっすぐです。そのため、同時に動くスリーブは必ず1個だけになります。',
      '図の下の段のボタンを押すと、ドラムが1段ずつ順に回ります。1速から4速へは、2速と3速を通らないと行けません（シーケンシャル式）。ドラムの赤い線で、回った角度がわかります。',
      'ドラム式は、バイクやレース車に多い方式です。H型のシフトレバーを持つ乗用車の多くは、レバーの左右の動きでフォークを選び、前後の動きでそのフォークを直接動かします。'
    ],
    symbols: `θ: 1段ぶんの角度、γ: 溝の傾き角、r: ドラムの半径、x: フォークが動く量、φ: その間にドラムが回る角度、${sub('T', 'd')}: ドラムを回すトルク、F: フォークを押す力。摩擦は入れていません。数値は説明用の仮の値です。`,
    inputs: [['ドラムの半径 r (m)', 'drum', 'radius'], ['フォークが動く量 x (m)', 'drum', 'stroke'], ['溝が曲がっている角度 φ (°)', 'drum', 'ramp'], ['ドラムを回すトルク (N·m)', 'drum', 'torque']],
    formula: () => {
      const d = state.drum, cam = drumCam();
      const positions = drumOrder().length;
      const now = drumOrder().indexOf(state.gear);
      return [
        ['1段ぶんの角度', 'θ = 360° / 位置の数', `360 ÷ ${positions} = ${n1(360 / positions)}°`],
        ['今のドラムの角度', '位置の番号 × θ', `${now} × ${n1(360 / positions)} = ${n1(now * 360 / positions)}°（番号は、下の表の上から0、1、2…）`],
        ['溝の傾き', 'tan γ = x / (r × φ)', `${d.stroke} ÷ (${d.radius} × ${d.ramp}° をラジアンにした値) = ${n2(cam.slope)}（γ = ${n1(cam.angle)}°）`],
        ['フォークを押す力', `F = ${sub('T', 'd')} / (r × tan γ)`, `${d.torque} ÷ (${d.radius} × ${n2(cam.slope)}) = ${n0(cam.force)} N`]
      ];
    },
    extra: () => {
      const names = { '-1': '左', '0': '中立', '1': '右' };
      const forks = [...Array(sleeveCount()).keys()];
      return table(['ドラムの位置'].concat(forks.map(k => `フォーク${k + 1}`)),
        drumOrder().map((gear, j) => [gearName(gear)].concat(forks.map(k => names[forkAt(k, j)]))));
    }
  },
  {
    title: '同じ仕組みを並べると6速になる',
    structure: () => [
      'ギヤの組が6つ、スリーブが3個に増えました。どの段でも、力の通り道は「インプット軸 → カウンタ軸 → 選んだギヤ → アウトプット軸」です。',
      'リバースは、2枚のギヤの間にアイドラギヤを1枚はさみます。歯車は1回かみ合うごとに向きが逆になるので、3枚だとアウトプット軸が逆に回ります。',
      'ドラムの並びは「R → N → 1速 → 2速 …」です。R は N の手前にあるので、前進の段を上げ下げしている間に R を通ることはありません。',
      '高い段ほど変速比は小さくなり、回転は速く、トルクは小さくなります。変速比が1より小さい段をオーバードライブと呼びます。',
      '実際の縦置き用ギヤボックスには、インプット軸とアウトプット軸を直接つなぐ「直結」の段（変速比1）を持つものが多くあります。このサイトではまだ扱っていません。'
    ],
    symbols: 'マイナスは逆回転です。アイドラは回転を次へ渡すだけなので、歯数は比に影響しません。',
    formula: () => [['リバースのギヤ比', `${sub('i', 'R')} = −${Z_OUT} / ${Z_C}`, '下の表の R の行']],
    extra: allGearsTable
  },
  {
    title: '歯数を変えて、自分のギヤボックスを組む',
    structure: () => [
      '歯数を変えると、図の歯車の大きさと、数式タブの値が変わります。ギヤは8組まで足せます。',
      '「リバース」に印を付けた段は、ドラムの並びで N の手前に入ります（R → N → 前進の段）。'
    ],
    symbols: 'a: 軸間距離、m: モジュール（歯の大きさ）。どの組も同じ2本の軸に並ぶので、軸間距離は同じです。モジュールが同じなら、歯数の和も同じになります。実際のギヤボックスは、組ごとにモジュールやねじれ角を変えて、軸間距離を合わせています。',
    formula: () => [['軸間距離', `a = m × (${Z_C} + ${Z_OUT}) / 2`, '歯数の和は下の表']],
    extra: allGearsTable
  },
  {
    title: 'クラッチは、摩擦で力をつなぎ、切る',
    structure: () => [
      'クラッチは、エンジンとインプット軸の間にあります。',
      'エンジンと一体のフライホイールとプレッシャープレートが、ばねの力でクラッチディスク（茶色）をはさみます。ディスクはインプット軸にはまっていて、摩擦でエンジンの回転が伝わります。',
      'ペダルを踏むとプレッシャープレートが離れ、ディスクが自由になります。インプット軸に力がかからなくなるので、シンクロが軽い力で回転を合わせられます。変速のたびにクラッチを切るのはこのためです。図の下の「クラッチを切る」を押してください。'
    ],
    symbols: `μ: 摩擦係数、F: ディスクをはさむ力、${sub('R', 'o')} と ${sub('R', 'i')}: 摩擦面の外側と内側の半径、${sub('T', 'e')}: エンジントルク。式の最後の2は、摩擦面がディスクの表と裏の2面あることを表します。数値は説明用の仮の値です。`,
    inputs: [['摩擦係数 μ', 'clutch', 'mu'], ['はさむ力 F (N)', 'clutch', 'force'], ['外側の半径 (m)', 'clutch', 'outer'], ['内側の半径 (m)', 'clutch', 'inner']],
    formula: () => {
      const k = state.clutch, r = clutch();
      return [
        ['摩擦面の平均半径', `${sub('R', 'm')} = 2/3 × (${sub('R', 'o')}³ − ${sub('R', 'i')}³) / (${sub('R', 'o')}² − ${sub('R', 'i')}²)`, `${r.radius.toFixed(4)} m`],
        ['伝えられる最大トルク', `${T_C} = μ × F × ${sub('R', 'm')} × 2`, `${k.mu} × ${k.force} × ${r.radius.toFixed(4)} × 2 = ${n0(r.capacity)} N·m`],
        ['余裕', `${T_C} / ${sub('T', 'e')}`, `${n0(r.capacity)} ÷ ${n0(state.torque)} = ${n2(r.margin)}（${r.margin < 1 ? '1より小さいので滑る' : '1以上なので滑らない'}）`]
      ];
    }
  },
  {
    title: 'タイヤの摩擦が、使える力の上限を決める',
    structure: () => [
      'アウトプット軸の回転は、最終減速ギヤ（デフ）でもう一度減速され、車軸からタイヤに伝わります。',
      'タイヤは地面を後ろに押し、その反力で車が進みます。押せる力の上限は、タイヤと路面の摩擦で決まります。',
      '低い段ではトルクが大きく、駆動力が摩擦の上限を超えることがあります。超えるとタイヤは空転します。数式タブの表で、段ごとに確かめられます。'
    ],
    symbols: `${sub('i', 'f')}: 最終減速比、r: タイヤの半径、μ: タイヤと路面の摩擦係数、W: 駆動輪にかかる質量、g: 重力加速度 (9.81 m/s²)。駆動力は、エンジンが今のトルクを出し切ったときの値です。`,
    inputs: [['最終減速比', 'car', 'finalRatio'], ['タイヤ直径 (m)', 'car', 'tire'], ['摩擦係数 μ', 'car', 'mu'], ['駆動輪にかかる質量 (kg)', 'car', 'load']],
    formula: () => {
      const c = calc(exampleGear()), car = state.car;
      return [
        ['総減速比', `i × ${sub('i', 'f')}`, `${n2(c.total)} × ${n2(c.final)} = ${n2(c.total * c.final)}（${safe(c.gear.name)}）`],
        ['駆動力', `${sub('F', 'd')} = ${sub('T', 'e')} × i × ${sub('i', 'f')} / r`, `${n0(c.tireTorque)} ÷ ${n2(c.radius)} = ${n0(c.force)} N`],
        ['車速', `v = 2π × r × ${sub('n', 'e')} / (i × ${sub('i', 'f')}) × 60 / 1000`, `${n1(c.speed)} km/h`],
        ['摩擦の上限', `${sub('F', 'max')} = μ × W × g`, `${car.mu} × ${car.load} × 9.81 = ${n0(gripLimit())} N`]
      ];
    },
    extra: () => table(['段', '総減速比', '車速 (km/h)', '駆動力 (N)', '上限との比較'],
      state.gears.map((g, i) => {
        const c = calc(i);
        return [safe(g.name), n2(c.total * c.final), n1(c.speed), n0(c.force), Math.abs(c.force) > gripLimit() ? '空転する' : '伝わる'];
      }))
  }
];

// ---------- クリックした部品の説明（吹き出し） ----------
// 戻り値: { title, text（構造）, rows（数式） }
function partInfo(part) {
  const c = calc(state.gear);
  const kind = part.split(':')[0];
  const i = Number(part.split(':')[1]);

  if (part === 'shaft:input') return {
    title: 'インプット軸',
    text: 'エンジンの回転が、クラッチを通って最初に入る軸です。先端の歯車でカウンタ軸を回します。',
    rows: [['回転数', `${N_IN} = エンジン回転数`, `${n0(c.rpm)} rpm`], ['トルク', `${T_IN} = エンジントルク`, `${n0(c.torque)} N·m`]]
  };
  if (part === 'red') return {
    title: '減速ギヤ（インプットリダクション）',
    text: 'インプット軸からカウンタ軸へ回転を渡す、常にかみ合った固定ギヤの組です。2枚とも軸と一体で回ります。',
    rows: [
      ['ギヤ比', `${I_RED} = z₂ / z₁`, `${c.z2} ÷ ${c.z1} = ${n2(c.red)}`],
      ['カウンタ軸の回転数', `${N_C} = ${N_IN} / ${I_RED}`, `${n0(c.rpm)} ÷ ${n2(c.red)} = ${n0(c.counterRpm)} rpm`]
    ]
  };
  if (part === 'shaft:counter') return {
    title: 'カウンタ軸',
    text: '減速ギヤで常に回されている軸です。各段の固定ギヤが並んでいて、ニュートラルでも回り続けます。',
    rows: [
      ['回転数', `${N_C} = ${N_IN} / ${I_RED}`, `${n0(c.counterRpm)} rpm`],
      ['トルク', `${sub('T', 'c')} = ${T_IN} × ${I_RED}`, `${n0(c.torque)} × ${n2(c.red)} = ${n0(c.counterTorque)} N·m`]
    ]
  };
  if (part === 'shaft:output') return {
    title: 'アウトプット軸',
    text: '変速が終わった回転を、ギヤボックスの外へ渡す軸です。ハブとスリーブはこの軸と一体で回ります。',
    rows: c.engaged ? [
      ['変速比', `i = ${I_RED} × ${Z_OUT} / ${Z_C}`, `${n2(c.red)} × ${n2(c.ratio)} = ${n2(c.total)}`],
      ['回転数', `${N_OUT} = ${N_IN} / i`, `${n0(c.rpm)} ÷ ${n2(c.total)} = ${n0(c.outRpm)} rpm`],
      ['トルク', `${T_OUT} = ${T_IN} × i`, `${n0(c.torque)} × ${n2(c.total)} = ${n0(c.outTorque)} N·m`]
    ] : [['回転数', `${N_OUT} = 0`, 'どのギヤともつながっていない']]
  };
  if (kind === 'gear') {
    const g = state.gears[i];
    const diff = freeRpm(i, c) - c.outRpm;
    return {
      title: safe(g.name) + ' のギヤの組',
      text: '下のカウンタ軸側は固定ギヤで、軸と一体で回ります。上のアウトプット軸側は空転ギヤ（白）で、軸の上で空回りします。スリーブがつながったときだけ、力が伝わります。',
      rows: [
        ['ギヤ比', `i = ${Z_OUT} / ${Z_C}`, `${g.out} ÷ ${g.counter} = ${n2(Math.abs(gearRatio(g)))}`],
        ['空転ギヤの回転数', `${N_G} = ${N_C} / i`, `${n0(freeRpm(i, c))} rpm`],
        ['軸との回転差', `Δn = ${N_G} − ${N_OUT}`, `${n0(diff)} rpm${i === state.gear ? '（つながっているので0）' : ''}`]
      ]
    };
  }
  if (part === 'idler') return {
    title: 'アイドラギヤ',
    text: 'リバースのときだけ使う、3枚目の歯車です。2枚のギヤの間に入り、回る向きを逆にします。',
    rows: [['リバースのギヤ比', `${sub('i', 'R')} = −${Z_OUT} / ${Z_C}`, 'アイドラの歯数は比に影響しない']]
  };
  if (kind === 'sleeve') return {
    title: 'ハブとスリーブ',
    text: 'ハブはアウトプット軸に固定されています。スリーブはハブの外側で、軸と一緒に回りながら左右に滑ります。となりの空転ギヤのドグ歯にかみ合うと、そのギヤと軸が一体になります。',
    rows: [['回転数', `スリーブ = ${N_OUT}`, `${n0(c.outRpm)} rpm`]]
  };
  if (part === 'drum') return {
    title: 'シフトドラム',
    text: '表面に溝が彫られた筒です。回すと、溝にはまったフォークのピンが左右に動き、どのスリーブをどちらへ動かすかが決まります。',
    rows: [
      ['1段ぶんの角度', 'θ = 360° / 位置の数', `${n1(360 / drumOrder().length)}°`],
      ['フォークを押す力', `F = ${sub('T', 'd')} / (r × tan γ)`, `${n0(drumCam().force)} N`]
    ]
  };
  if (kind === 'fork') return {
    title: 'シフトフォーク',
    text: 'スリーブの溝にはまっている二股の部品です。自分は回らず、棒の上を滑って、回っているスリーブを左右に押します。ドラムがある段階では、先の赤いピンがドラムの溝にはまっていて、溝に沿って動きます。',
    rows: [['動く量', '中立から左右へ', 'スリーブがドグ歯に届くぶんだけ']]
  };
  if (part === 'synchro') return {
    title: 'シンクロナイザリング',
    text: 'スリーブとギヤの間にある、円すい面を持つ輪です。押し付けられた摩擦で、ギヤと軸の回転差を0にします。',
    rows: [['コーンの摩擦トルク', `${T_S} = μ × F × R / sin α`, `${n1(synchro(0, c).torque)} N·m`]]
  };
  if (part === 'dog') return {
    title: 'ドグ歯',
    text: 'ギヤの側面にある小さい歯で、ギヤと一体です。スリーブの内側の歯がここにかみ合うと、ギヤと軸がつながります。歯先は、入りやすいようにとがっています。',
    rows: [['つながった後の回転数', `${N_G} = ${N_OUT}`, '回転差は0']]
  };
  if (part === 'cone') return {
    title: 'ギヤ側のコーン',
    text: 'ギヤと一体の円すい面です。シンクロナイザリングの内側がここに押し付けられ、摩擦でギヤの回転を変えます。',
    rows: [['コーンの摩擦トルク', `${T_S} = μ × F × R / sin α`, `${n1(synchro(0, c).torque)} N·m。α が小さいほど大きくなる`]]
  };
  if (part === 'key') return {
    title: 'キー（シンクロナイザキー）',
    text: 'ハブの溝に入った小さな部品で、ばねでスリーブの内側に押し付けられています。スリーブが動き始めると一緒に動き、リングをコーンへ押し付けます。リングに当たると止まり、スリーブだけが先へ進みます。',
    rows: [['役割', '最初にリングを押す', '回転差を0にする力は、この後スリーブの歯先がリングを押して出す']]
  };
  if (part === 'hub') return {
    title: 'ハブ',
    text: 'アウトプット軸に固定された部品です。外側の歯にスリーブがはまっていて、スリーブは軸と一緒に回りながら左右に滑れます。',
    rows: [['回転数', `ハブ = ${N_OUT}`, 'アウトプット軸と同じ']]
  };
  if (part === 'clutch') return {
    title: 'クラッチ',
    text: '歯の付いた円板がフライホイール、茶色がクラッチディスク、右の板がプレッシャープレートです。ディスクだけがインプット軸とつながっています。',
    rows: [['伝えられる最大トルク', `${T_C} = μ × F × ${sub('R', 'm')} × 2`, `${n0(clutch().capacity)} N·m`]]
  };
  return {
    title: '最終減速とタイヤ',
    text: '箱が最終減速ギヤ（デフ）です。アウトプット軸の回転をもう一度減速し、向きを90°変えて車軸とタイヤに伝えます。',
    rows: [
      ['タイヤの回転数', `${N_OUT} / ${sub('i', 'f')}`, `${n0(c.outRpm)} ÷ ${n2(c.final)} = ${n0(c.tireRpm)} rpm`],
      ['駆動力', `${sub('F', 'd')} = ${T_OUT} × ${sub('i', 'f')} / r`, `${n0(c.force)} N`]
    ]
  };
}

// ---------- 画面を作る ----------
function renderSteps() {
  el('steps').innerHTML = STEPS.map((s, i) =>
    (s.group ? `<span class="group">${s.group}</span>` : '') +
    `<button type="button" data-step="${i + 1}" class="${i + 1 === state.step ? 'current' : ''}">${i + 1} ${s.name}</button>`).join('');
}

function renderGearButtons() {
  // ドラムの並び順（リバース → N → 前進の段）でボタンを並べる
  const order = state.step >= STEP_SLEEVE && !state.detail ? drumOrder() : [];
  el('gearButtons').innerHTML = order.map(gear =>
    `<button type="button" data-gear="${gear}" class="${gear === state.gear ? 'current' : ''}">${gearName(gear)}</button>`).join('');
  el('clutchButton').hidden = state.step < STEP_CLUTCH;
  el('clutchButton').textContent = state.clutchOn ? 'クラッチを切る' : 'クラッチをつなぐ';
  el('engineInputs').hidden = state.detail;
}

// 段階5だけに出る、シンクロの拡大図のボタン
function renderDetailButtons() {
  const toggle = (key, name) => `<button type="button" data-toggle="${key}" class="${state[key] ? 'current' : ''}">${name}</button>`;
  let html = '';
  if (state.step === STEP_SYNCHRO && !state.detail) html = '<button type="button" data-toggle="detail">シンクロを拡大して見る</button>';
  if (state.detail) {
    html = PHASES.map((p, i) => `<button type="button" data-phase="${i}" class="${i === state.phase ? 'current' : ''}">${i + 1} ${p.name}</button>`).join('')
      + toggle('explode', '分解して見る') + toggle('clear', 'スリーブを透かす')
      + '<button type="button" data-toggle="detail">全体に戻る</button>';
  }
  el('detailButtons').innerHTML = html;
}

// 入力欄。打っている途中で消えないように、段階やタブが変わったときだけ作り直す
function renderInputs() {
  const lesson = LESSONS[state.step - 1];
  let html = '';
  if (state.tab === 'formula' && lesson.inputs) {
    html = '<div class="fields">' + lesson.inputs.map(f =>
      `<label>${f[0]}<input type="number" step="any" data-obj="${f[1]}" data-key="${f[2]}" value="${state[f[1]][f[2]]}"></label>`).join('') + '</div>';
  }
  if (state.tab === 'structure' && state.step === STEP_DESIGN) {
    html = table(['名前', 'アウトプット軸側', 'カウンタ軸側', 'リバース', ''], state.gears.map((g, i) => [
      `<input type="text" data-i="${i}" data-key="name" value="${safe(g.name)}" size="4" aria-label="名前">`,
      `<input type="number" data-i="${i}" data-key="out" value="${g.out}" aria-label="アウトプット軸側の歯数">`,
      `<input type="number" data-i="${i}" data-key="counter" value="${g.counter}" aria-label="カウンタ軸側の歯数">`,
      `<input type="checkbox" data-i="${i}" data-key="reverse" ${g.reverse ? 'checked' : ''} aria-label="リバースにする">`,
      `<button type="button" data-del="${i}">削除</button>`
    ])) + '<div class="buttons"><button type="button" id="addGear">ギヤを追加</button></div>';
  }
  el('lessonInputs').innerHTML = html;
}

function renderLesson() {
  const lesson = LESSONS[state.step - 1];
  const c = calc(state.gear);
  el('lessonTitle').textContent = lesson.title;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('current', b.dataset.tab === state.tab));
  el('lessonOutput').innerHTML = state.tab === 'structure'
    ? paragraphs(lesson.structure())
    : formulaRows(lesson.formula(c)) + (lesson.extra ? lesson.extra(c) : '') + `<p class="note">${lesson.symbols}</p>`;
  el('prev').disabled = state.step === 1;
  el('next').disabled = state.step === STEPS.length;
}

function renderBubble() {
  el('bubble').hidden = state.picked === null;
  if (state.picked === null) return;
  const info = partInfo(state.picked);
  el('bubbleTitle').textContent = info.title;
  el('bubbleBody').innerHTML = `<h4>構造</h4><p>${info.text}</p><h4>数式</h4>${formulaRows(info.rows)}`;
}

function update() {
  renderSteps();
  renderGearButtons();
  renderDetailButtons();
  renderLesson();
  renderBubble();
  buildScene();
}

// ---------- 操作 ----------
function showStep(step) {
  state.step = Math.min(STEPS.length, Math.max(1, step));
  state.gear = NEUTRAL;
  state.picked = null;
  state.clutchOn = true;
  state.detail = false;
  resetDrum();
  renderInputs();
  update();
  frameCamera();
}

// 図の部品をクリックしたとき（scene.js から呼ばれる）。x, y はクリックした位置
function pick(part, x, y) {
  state.picked = part || null;
  update();
  const stage = el('stageBox');
  el('bubble').style.left = Math.max(8, Math.min(x + 12, stage.clientWidth - el('bubble').offsetWidth - 8)) + 'px';
  el('bubble').style.top = Math.max(8, Math.min(y + 12, stage.clientHeight - el('bubble').offsetHeight - 8)) + 'px';
}

el('steps').addEventListener('click', e => {
  if (e.target.dataset.step) showStep(Number(e.target.dataset.step));
});
el('prev').addEventListener('click', () => showStep(state.step - 1));
el('next').addEventListener('click', () => showStep(state.step + 1));

el('tabs').addEventListener('click', e => {
  if (!e.target.dataset.tab) return;
  state.tab = e.target.dataset.tab;
  renderInputs();
  renderLesson();
});

el('gearButtons').addEventListener('click', e => {
  if (e.target.dataset.gear === undefined) return;
  state.gear = Number(e.target.dataset.gear);
  update();
});
el('clutchButton').addEventListener('click', () => {
  state.clutchOn = !state.clutchOn;
  update();
});
el('detailButtons').addEventListener('click', e => {
  const d = e.target.dataset;
  if (d.phase) state.phase = Number(d.phase);
  if (d.toggle) state[d.toggle] = !state[d.toggle];
  if (d.toggle === 'detail') {
    // 拡大図に入るときと出るときは、最初の状態に戻して、カメラを置き直す
    state.phase = 0;
    state.gear = NEUTRAL;
    state.picked = null;
    update();
    frameCamera();
    return;
  }
  update();
});
el('bubbleClose').addEventListener('click', () => pick(null));

el('rpm').addEventListener('input', e => { state.rpm = Math.max(0, Number(e.target.value) || 0); update(); });
el('torque').addEventListener('input', e => { state.torque = positive(e.target.value); update(); });

// 説明パネルの入力欄（数値の欄と、段階7のギヤの表）
el('lessonInputs').addEventListener('input', e => {
  const d = e.target.dataset;
  if (d.obj) state[d.obj][d.key] = d.obj === 'red' ? teeth(e.target.value) : positive(e.target.value);
  if (d.i) {
    const g = state.gears[Number(d.i)];
    if (d.key === 'name') g.name = e.target.value;
    if (d.key === 'reverse') {
      g.reverse = e.target.checked;
      state.gear = NEUTRAL;
      resetDrum();
    }
    if (d.key === 'out' || d.key === 'counter') g[d.key] = teeth(e.target.value);
  }
  update();
});
el('lessonInputs').addEventListener('click', e => {
  if (e.target.id === 'addGear' && state.gears.length < MAX_GEARS) {
    state.gears.push({ name: '追加' + (state.gears.length + 1), out: 20, counter: 30 });
  } else if (e.target.dataset.del !== undefined && state.gears.length > 1) {
    state.gears.splice(Number(e.target.dataset.del), 1);
  } else {
    return;
  }
  state.gear = NEUTRAL;
  resetDrum();
  renderInputs();
  update();
});

showStep(1);
