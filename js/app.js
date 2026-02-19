'use strict';

/**
 * 你后续的真实数据建议结构：
 * settlements: [{ id, name, lat, lng, totals: {repelled, assaults, other}, byDay: { "YYYY-MM-DD": {repelled, assaults, other, dirCounts:{...}} } }]
 * timeseries: { labels:["YYYY-MM-DD"...], series:[{key:"Kupiansk", values:[...]}...] }
 *
 * 目前这里先用内置 demo 数据，保证页面一运行就像样。
 */

// ===== Demo data =====
const DEMO_SETTLEMENTS = [
  { id:"pokrovsk", name:"Pokrovsk", lat:48.282, lng:37.175,
    totals:{ repelled: 22, assaults: 31, other: 7 } },
  { id:"kupiansk", name:"Kupiansk", lat:49.711, lng:37.614,
    totals:{ repelled: 14, assaults: 18, other: 2 } },
  { id:"chasyar", name:"Chasiv Yar", lat:48.593, lng:37.857,
    totals:{ repelled: 9, assaults: 12, other: 1 } },
  { id:"robotyne", name:"Robotyne", lat:47.448, lng:35.836,
    totals:{ repelled: 6, assaults: 8, other: 0 } },
  { id:"kherson", name:"Kherson", lat:46.635, lng:32.616,
    totals:{ repelled: 4, assaults: 6, other: 3 } }
];

const DEMO_TIMESERIES = {
  labels: ["2026-02-12","2026-02-13","2026-02-14","2026-02-15","2026-02-16","2026-02-17","2026-02-18"],
  series: [
    { key:"Kupiansk", values:[4,3,5,2,3,4,3] },
    { key:"Lyman", values:[6,7,4,5,8,7,6] },
    { key:"Bakhmut", values:[3,2,4,6,4,3,4] },
    { key:"Avdiivka", values:[8,9,7,10,9,8,9] },
    { key:"Zaporizhzhia", values:[2,1,2,3,2,2,1] },
    { key:"Kherson", values:[1,1,0,1,2,1,1] },
    { key:"Other", values:[0,1,1,0,1,0,1] },
  ]
};

// ===== DOM =====
const elSubtitle = document.getElementById('mapSubtitle');
const elPill = document.getElementById('selectedDatePill');
const elQuick = document.getElementById('quickInput');
const elShowMode = document.getElementById('showMode');

const elRepelled = document.getElementById('statRepelled');
const elAssaults = document.getElementById('statAssaults');
const elOther = document.getElementById('statOther');

const elBtnSurprise = document.getElementById('btnSurprise');
const elBtnFullscreen = document.getElementById('btnFullscreen');

let map, cluster, chart;

// ===== Colors (match legend swatches) =====
const SERIES_COLORS = ["#ff00ff","#ff0000","#ff7a00","#ffd200","#0077ff","#00d084","#666"];

// ===== init =====
init();

function init(){
  // subtitle + date pill default
  const today = DEMO_TIMESERIES.labels[DEMO_TIMESERIES.labels.length - 1];
  setSelectedDate(today);

  initMap();
  renderMarkers(DEMO_SETTLEMENTS);

  initChart();
  renderChartForRange(DEMO_TIMESERIES, today);

  // events
  elBtnSurprise.addEventListener('click', () => {
    const d = pickRandom(DEMO_TIMESERIES.labels);
    setSelectedDate(d);
    renderChartForRange(DEMO_TIMESERIES, d);
  });

  elQuick.addEventListener('keydown', (e) => {
    if(e.key !== 'Enter') return;
    const v = (elQuick.value || "").trim();
    const hit = DEMO_TIMESERIES.labels.find(x => x === v);
    if(hit){
      setSelectedDate(hit);
      renderChartForRange(DEMO_TIMESERIES, hit);
    }
  });

  // tabs (视觉一致即可，先不做内容切换)
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // “fullscreen”新开页：简单用同页带 hash 参数
  elBtnFullscreen.href = location.href.split('#')[0] + '#fullscreen';
}

// ===== map =====
function initMap(){
  map = L.map('map', {
    zoomControl: true,
    preferCanvas: true
  });

  // 这里先用 OSM 占位，之后你换成 Kalyna Battle Map 的 tile/layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: ''
  }).addTo(map);

  map.setView([48.8, 31.2], 6);

  // 自定义 cluster icon：显示“总次数(Repelled)”而不是“点数量”
  cluster = L.markerClusterGroup({
    maxClusterRadius: 60,
    showCoverageOnHover: false,
    iconCreateFunction: function (c) {
      const markers = c.getAllChildMarkers();
      const sum = markers.reduce((acc, m) => acc + (m.options.__value || 0), 0);

      const size =
        sum >= 50 ? 'large' :
        sum >= 20 ? 'medium' : 'small';

      return new L.DivIcon({
        html: `<div><span>${sum}</span></div>`,
        className: `marker-cluster marker-cluster-${size}`,
        iconSize: new L.Point(40, 40)
      });
    }
  });

  map.addLayer(cluster);
}

function renderMarkers(items){
  cluster.clearLayers();

  let sumR = 0, sumA = 0, sumO = 0;

  for(const s of items){
    const v = Number(s.totals?.repelled || 0);
    if(v <= 0) continue;

    sumR += v;
    sumA += Number(s.totals?.assaults || 0);
    sumO += Number(s.totals?.other || 0);

    const marker = L.circleMarker([s.lat, s.lng], {
      radius: radiusFromValue(v),
      color: "#111",
      weight: 1,
      fillColor: "#f39b00",
      fillOpacity: 0.85,
      __value: v // 给 cluster 求和用
    });

    marker.bindPopup(popupHtml(s), { maxWidth: 320 });

    cluster.addLayer(marker);
  }

  elRepelled.textContent = String(sumR);
  elAssaults.textContent = String(sumA);
  elOther.textContent = String(sumO);
}

function popupHtml(s){
  return `
    <div style="font-weight:700;font-size:14px;margin-bottom:6px;">${escapeHtml(s.name)}</div>
    <div style="font-size:13px;line-height:1.5;">
      <div><b>Repelled:</b> ${Number(s.totals?.repelled || 0)}</div>
      <div><b>Assaults:</b> ${Number(s.totals?.assaults || 0)}</div>
      <div><b>Other:</b> ${Number(s.totals?.other || 0)}</div>
    </div>
  `;
}

function radiusFromValue(v){
  if(v <= 3) return 6;
  if(v <= 8) return 8;
  if(v <= 15) return 10;
  if(v <= 30) return 12;
  return 14;
}

// ===== chart =====
function initChart(){
  const ctx = document.getElementById('chart');

  chart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          stacked: true,
          grid: { color: '#9b9b9b', borderDash: [2,2] },
          ticks: { color: '#111' }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: '#9b9b9b', borderDash: [2,2] },
          ticks: { color: '#111' }
        }
      }
    }
  });
}

function renderChartForRange(ts, selectedDate){
  // 先做：默认显示 selectedDate 当天（和截图“只看某一天/某时间段”一致）
  // 你以后扩展 showMode=all/hourly/none 时，再切换不同粒度即可。

  elSubtitle.textContent = `Reports on ${selectedDate}`;
  elPill.textContent = selectedDate;

  // 这里简单处理：如果 show=none 就清空
  if(elShowMode.value === 'none'){
    chart.data.labels = [];
    chart.data.datasets = [];
    chart.update();
    return;
  }

  // x 轴：固定一组“小时格子”来营造 TornadoArchive 那种刻度（可选）
  // 但你说自变量是“时间”，更像按天/周。这里先按“当天”做 1 根堆叠柱。
  const labels = [selectedDate];

  const datasets = ts.series.map((s, i) => {
    // 找到该日期 index
    const idx = ts.labels.indexOf(selectedDate);
    const val = idx >= 0 ? Number(s.values[idx] || 0) : 0;

    return {
      label: s.key,
      data: [val],
      backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
      borderColor: "#111",
      borderWidth: 1,
      barThickness: 60
    };
  });

  chart.data.labels = labels;
  chart.data.datasets = datasets;
  chart.update();
}

function setSelectedDate(d){
  elSubtitle.textContent = `Reports on ${d}`;
  elPill.textContent = d;
}

// ===== utils =====
function pickRandom(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}
