// explain.js: 数式の行をクリックすると、その式ができる「考え方」を開く（CAR STUDY LAB の3ページで共通）
//
// 式の行: [名前, 式, 値, 考え方]
//   考え方 = { text: '式ができる考え方（文章）', mark: { … } }
//   mark は 3D の図に出す印（光らせる部品、矢印、短い札）。中身はページごとに違う（study3d.js / inertia.js）
//
// ページ側でやること
//   1. 式の表示に formulaHTML(rows, can3d) を使う（can3d: 「3Dで見る」ボタンを出すか）
//   2. why.onMark に、3D に印を出す関数を入れる（null なら印を消す）
//   3. Step を変えたら closeWhy() を呼ぶ

const why = { open: -1, mark: null, onMark: () => {}, on3d: () => {} };

function formulaHTML(rows, can3d) {
  return rows.map((r, k) => {
    const w = r[3];
    const head = `<b>${r[0]}</b><span class="math">${r[1]}</span><span class="num">${r[2]}</span>`;
    if (!w) return `<div class="formula">${head}</div>`;
    const open = k === why.open;
    const button = open && can3d && w.mark ? '<button type="button" data-show3d>3Dで見る</button>' : '';
    return `<div class="formula clickable${open ? ' open' : ''}" data-row="${k}" role="button" tabindex="0" aria-expanded="${open}">${head}`
      + `<span class="whyHint">${open ? '考え方を閉じる ▴' : 'この式の考え方 ▾'}</span>`
      + (open ? `<div class="why">${w.text}${button}</div>` : '') + '</div>';
  }).join('');
}

// 行をクリックしたとき: 開く / 閉じる。rows は今の式の行（印を探すため）
function toggleWhy(k, rows) {
  why.open = why.open === k ? -1 : k;
  why.mark = why.open >= 0 && rows[k][3] ? rows[k][3].mark || null : null;
  why.onMark(why.mark);
}

// 値だけを書きかえる（行を作り直さないので、クリックや開いた考え方がじゃまされない）
function refreshNums(box, rows) {
  box.querySelectorAll('.formula .num').forEach((span, k) => { if (rows[k]) span.innerHTML = rows[k][2]; });
}

function closeWhy() {
  why.open = -1;
  why.mark = null;
  why.onMark(null);
}

// 式を出している場所（#lessonOutput）のクリックとキー操作をつなぐ。getRows: 今の式の行を返す、redraw: 出し直す
function bindWhy(box, getRows, redraw) {
  const act = e => {
    if (e.target.closest('[data-show3d]')) { why.on3d(); return; }
    const row = e.target.closest('.formula.clickable');
    if (!row) return;
    toggleWhy(Number(row.dataset.row), getRows());
    redraw();
  };
  box.addEventListener('click', act);
  box.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
}
