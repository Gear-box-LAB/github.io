// resize.js: 右の説明の左のふちをドラッグして、説明の幅を変える（広い画面だけ）
// 幅は、次に開いたときのために、このブラウザに覚えておく
(() => {
  const bench = document.querySelector('.bench'), panel = document.querySelector('.panel');
  const grip = document.createElement('div');
  grip.className = 'grip';
  grip.title = 'ドラッグで説明の幅を変える';
  panel.prepend(grip);
  const setWidth = w => {
    const width = Math.max(300, Math.min(window.innerWidth - 320, w));   // 図が 320 px は残るようにする
    bench.style.gridTemplateColumns = `1fr ${width}px`;
    return width;
  };
  try { const saved = Number(localStorage.getItem('panelWidth')); if (saved) setWidth(saved); } catch (e) { /* 覚えられないときは、はじめの幅のまま */ }
  grip.addEventListener('pointerdown', e => {
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('dragging');
  });
  grip.addEventListener('pointermove', e => {
    if (grip.classList.contains('dragging')) setWidth(window.innerWidth - e.clientX);
  });
  grip.addEventListener('pointerup', () => {
    grip.classList.remove('dragging');
    try { localStorage.setItem('panelWidth', panel.offsetWidth); } catch (e) { /* 覚えられなくても動く */ }
  });
})();
