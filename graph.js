// graph.js: アウトプット軸の回転数のグラフ（縦軸 rpm、横軸 秒）
// 表示するのは直近20秒だけ。20秒を超えると左へ流れ、見えなくなった点は捨てる（保存しない）

const GRAPH_SPAN = 20;   // 横軸に表示する秒数
const graph = { open: false, recording: false, time: 0, points: [] };   // points: [{ t, rpm }]

// 今のアウトプット軸の回転数。クラッチの段階からは半クラッチの計算の値、それより前は段から計算した値
const outputRpm = () => state.step >= STEP_CLUTCH ? sim.output : calc(state.gear).outRpm;

// 毎フレーム（scene.js から呼ぶ）: 計測中なら点を足し、20秒より古い点を捨てて描く
function stepGraph(dt) {
  if (graph.recording) {
    graph.time += dt;
    graph.points.push({ t: graph.time, rpm: outputRpm() });
    while (graph.points.length && graph.points[0].t < graph.time - GRAPH_SPAN) graph.points.shift();
  }
  if (graph.open) drawGraph();
}

// 目盛りの間隔: 最大値をおよそ4〜5本に分ける、きりのよい数（500, 1000, 2000 …）
function niceStep(max) {
  const raw = max / 4;
  const base = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map(k => k * base).find(step => step >= raw);
}

function drawGraph() {
  const canvas = el('graphCanvas');
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  // 表示の大きさが変わったら、描く面の大きさも合わせる（幅と高さの両方）
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const g = canvas.getContext('2d');
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, width, height);

  // 縦軸の範囲: 0 を必ず含め、見えている点がすべて入るようにする（リバースのマイナスも入る）
  const values = graph.points.map(p => p.rpm);
  const top = Math.max(1000, ...values);
  const bottom = Math.min(0, ...values);
  const step = niceStep(top - bottom);
  const max = Math.ceil(top / step) * step;
  const min = Math.floor(bottom / step) * step;
  const pad = { left: 46, right: 10, top: 10, bottom: 24 };
  const start = Math.max(0, graph.time - GRAPH_SPAN);   // 横軸の左端の時刻
  const x = t => pad.left + (t - start) / GRAPH_SPAN * (width - pad.left - pad.right);
  const y = rpm => pad.top + (max - rpm) / (max - min) * (height - pad.top - pad.bottom);

  // 目盛り線と数字
  g.font = '11px sans-serif';
  g.fillStyle = '#dfe6e9';
  g.strokeStyle = 'rgba(223, 230, 233, 0.25)';
  g.lineWidth = 1;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (let v = min; v <= max; v += step) {
    g.beginPath(); g.moveTo(pad.left, y(v)); g.lineTo(width - pad.right, y(v)); g.stroke();
    g.fillText(v, pad.left - 6, y(v));
  }
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let t = Math.ceil(start / 5) * 5; t <= start + GRAPH_SPAN; t += 5) {
    g.beginPath(); g.moveTo(x(t), pad.top); g.lineTo(x(t), height - pad.bottom); g.stroke();
    g.fillText(t + ' 秒', x(t), height - pad.bottom + 5);
  }

  // 線グラフ
  g.strokeStyle = '#f0a81c';
  g.lineWidth = 2;
  g.beginPath();
  graph.points.forEach((p, i) => (i ? g.lineTo(x(p.t), y(p.rpm)) : g.moveTo(x(p.t), y(p.rpm))));
  g.stroke();

  const last = graph.points[graph.points.length - 1];
  el('graphNow').textContent = `今 ${n0(outputRpm())} rpm` + (graph.recording ? '（計測中）' : last ? '（中止中）' : '');
}

function renderGraphButtons() {
  el('graphBox').hidden = !graph.open;
  el('graphStart').disabled = graph.recording;
  el('graphStop').disabled = !graph.recording;
}

el('graphBox').addEventListener('click', e => {
  const id = e.target.id;
  if (id === 'graphStart') graph.recording = true;    // 計測開始: 線を書く（中止したところから続ける）
  if (id === 'graphStop') graph.recording = false;    // 中止: 線を書くのをやめる（線は残す）
  if (id === 'graphReset') Object.assign(graph, { recording: false, time: 0, points: [] });   // リセット: 線を消す
  if (id === 'graphClose') graph.open = false;
  renderGraphButtons();
});
