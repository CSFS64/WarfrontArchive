'use strict';

/* =========================
   1) DEMO DATA (以后换成 Excel 导入)
   ========================= */

// 你要的 7 个“州/州级方向”
const OBLASTS = [
  "Sumy", "Kharkiv", "Luhansk", "Donetsk",
  "Dnipropetrovsk", "Zaporizhzhia", "Kherson"
];

// Demo：方向、定居点（你以后会从表格来）
const DEMO_GEO = {
  // oblast -> directions -> settlements
  "Kharkiv": {
    center: [49.99, 36.23],
    directions: {
      "Kupiansk": {
        center: [49.71, 37.61],
        settlements: [
          { name: "Kupiansk", lat:49.71, lng:37.61 },
          { name: "Dvorichna", lat:49.85, lng:37.68 },
        ]
      },
      "Vovchansk": {
        center: [50.29, 36.94],
        settlements: [
          { name: "Vovchansk", lat:50.29, lng:36.94 },
          { name: "Lyptsi", lat:50.21, lng:36.46 },
        ]
      }
    }
  },
  "Donetsk": {
    center: [48.01, 37.80],
    directions: {
      "Avdiivka": {
        center: [48.14, 37.75],
        settlements: [
          { name: "Avdiivka", lat:48.14, lng:37.75 },
          { name: "Orlivka", lat:48.14, lng:37.58 },
        ]
      },
      "Bakhmut": {
        center: [48.59, 37.85],
        settlements: [
          { name: "Chasiv Yar", lat:48.59, lng:37.85 },
          { name: "Klishchiivka", lat:48.52, lng:37.98 },
        ]
      }
    }
  },
  "Zaporizhzhia": {
    center: [47.84, 35.14],
    directions: {
      "Orikhiv": {
        center: [47.57, 35.78],
        settlements: [
          { name: "Robotyne", lat:47.45, lng:35.84 },
          { name: "Verbove", lat:47.47, lng:36.01 },
        ]
      }
    }
  },
  "Kherson": {
    center: [46.64, 32.62],
    directions: {
      "Dnipro Left Bank": {
        center: [46.65, 33.00],
        settlements: [
          { name: "Krynky", lat:46.73, lng:33.07 }
        ]
      }
    }
  },
  "Sumy": { center:[50.90, 34.80], directions:{} },
  "Luhansk": { center:[48.57, 39.30], directions:{} },
  "Dnipropetrovsk": { center:[48.46, 35.05], directions:{} },
};

// Demo：按日期给“州/方向/定居点”一个击退次数
// 真实版你会从 Excel 来：date, oblast, direction, settlement, repelled_count ...
const DEMO_DATES = [
  "2026-02-16","2026-02-17","2026-02-18","2026-02-19","2026-02-20"
];

// 生成一些稳定随机数（demo 用）
function seeded(n){ return Math.abs(Math.sin(n)*10000)%1; }

function demoValue(dateStr, key){
  const d = DEMO_DATES.indexOf(dateStr) + 1;
  let h = 0;
  for(const ch of key) h = (h*31 + ch.charCodeAt(0)) >>> 0;
  const v = Math.floor( (seeded(h + d*999) * 12) );
  return v;
}

/* =========================
   2) STATE
   ========================= */

const state = {
  metric: "repelled", // showMode
  selections: [
    // 默认给一个单日示例
    { type:"single", date:"2026-02-18" }
  ]
};

/* =========================
   3) DOM
   ========================= */

const elChips = document.getElementById('dateChips');
const elQuick = document.getElementById('quickInput');
const elShowMode = document.getElementById('showMode');

const elSubtitle = document.getElementById('mapSubtitle');
const elRepelled = document.getElementById('statRepelled');
const elAssaults = document.getElementById('statAssaults');
const elOther = document.getElementById('statOther');

let map, chart;

// Map layers
let layerOblast = null;
let layerDir = null;
let layerSettle = null;

// Zoom thresholds
const Z_OBLAST = 6;     // <=6: oblast
const Z_DIR = 9;        // 7-9: direction
// >=10: settlement

init();

/* =========================
   4) INIT
   ========================= */

function init(){
  initMap();
  initChart();
  bindUI();
  renderAll();
}

function bindUI(){
  // 添加日期/区间：回车
  elQuick.addEventListener('keydown', (e) => {
    if(e.key !== 'Enter') return;
    const raw = (elQuick.value || "").trim();
    if(!raw) return;

    const parsed = parseDateInput(raw);
    if(!parsed){
      // 你想要更强提示我也可以加 toast
      elQuick.select();
      return;
    }

    state.selections.push(parsed);
    elQuick.value = "";
    renderAll();
  });

  // metric 切换
  elShowMode.addEventListener('change', () => {
    state.metric = elShowMode.value;
    renderAll();
  });

  // tabs（视觉保持）
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

/* =========================
   5) DATE INPUT PARSER
   ========================= */

function parseDateInput(raw){
  // range separators: ~, to, -, –
  const rangeMatch = raw.match(/(.+?)\s*(~|to|–|-)\s*(.+)/i);
  if(rangeMatch){
    const a = parseOneDate(rangeMatch[1].trim());
    const b = parseOneDate(rangeMatch[3].trim());
    if(!a || !b) return null;
    const start = a <= b ? a : b;
    const end = a <= b ? b : a;
    return { type:"range", start, end };
  }

  const d = parseOneDate(raw);
  if(!d) return null;
  return { type:"single", date:d };
}

function parseOneDate(s){
  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if(m){
    return toISO(+m[1], +m[2], +m[3]);
  }

  // MM/DD/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    return toISO(+m[3], +m[1], +m[2]);
  }

  // Month name formats: "Feb 18 2026", "February 18, 2026"
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,)?\s+(\d{4})$/);
  if(m){
    const mon = monthIndex(m[1]);
    if(!mon) return null;
    return toISO(+m[3], mon, +m[2]);
  }

  return null;
}

function monthIndex(name){
  const n = name.toLowerCase();
  const map = {
    jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,
    may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,
    sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12
  };
  return map[n] || null;
}

function toISO(y,m,d){
  if(m<1||m>12||d<1||d>31) return null;
  const dt = new Date(Date.UTC(y, m-1, d));
  // 验证没溢出
  if(dt.getUTCFullYear()!==y || (dt.getUTCMonth()+1)!==m || dt.getUTCDate()!==d) return null;
  const mm = String(m).padStart(2,'0');
  const dd = String(d).padStart(2,'0');
  return `${y}-${mm}-${dd}`;
}

function expandSelection(sel){
  if(sel.type === "single") return [sel.date];
  // range
  const out = [];
  const a = new Date(sel.start+"T00:00:00Z");
  const b = new Date(sel.end+"T00:00:00Z");
  for(let t = a.getTime(); t <= b.getTime(); t += 86400000){
    const dt = new Date(t);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth()+1).padStart(2,'0');
    const d = String(dt.getUTCDate()).padStart(2,'0');
    out.push(`${y}-${m}-${d}`);
  }
  return out;
}

/* =========================
   6) RENDER: CHIPS
   ========================= */

function renderChips(){
  elChips.innerHTML = "";

  state.selections.forEach((sel, idx) => {
    if(sel.type === "single"){
      elChips.appendChild(makeChip(sel.date, () => {
        state.selections.splice(idx, 1);
        renderAll();
      }));
      return;
    }

    // range: [start x] ~ [end x]   （任一 x 删除整段）
    elChips.appendChild(makeChip(sel.start, () => {
      state.selections.splice(idx, 1);
      renderAll();
    }));

    const sep = document.createElement('span');
    sep.className = "chip-sep";
    sep.textContent = "~";
    elChips.appendChild(sep);

    elChips.appendChild(makeChip(sel.end, () => {
      state.selections.splice(idx, 1);
      renderAll();
    }));
  });
}

function makeChip(text, onRemove){
  const chip = document.createElement('span');
  chip.className = "chip";
  chip.textContent = text + " ";

  const x = document.createElement('span');
  x.className = "x";
  x.textContent = "×";
  x.title = "Remove";
  x.addEventListener('click', (e) => {
    e.stopPropagation();
    onRemove();
  });

  chip.appendChild(x);
  return chip;
}

/* =========================
   7) RENDER: CHART (stacked by oblast)
   ========================= */

function renderChart(){
  const dates = flattenSelectedDates();
  const labels = dates;

  // datasets = 7 oblasts
  const colors = ["#ff00ff","#ff0000","#ff7a00","#ffd200","#0077ff","#00d084","#666"];
  const datasets = OBLASTS.map((ob, i) => {
    return {
      label: ob,
      data: labels.map(d => oblastTotalForDate(ob, d)),
      backgroundColor: colors[i % colors.length],
      borderColor: "#111",
      borderWidth: 1,
      barThickness: labels.length <= 7 ? 50 : undefined
    };
  });

  chart.data.labels = labels;
  chart.data.datasets = datasets;
  chart.update();
}

function flattenSelectedDates(){
  const set = [];
  for(const sel of state.selections){
    for(const d of expandSelection(sel)) set.push(d);
  }
  // 去重 + 排序
  const uniq = Array.from(new Set(set));
  uniq.sort();
  return uniq;
}

function oblastTotalForDate(oblast, dateStr){
  // demo：从方向/定居点合成
  const geo = DEMO_GEO[oblast];
  if(!geo) return 0;

  let sum = 0;
  const dirs = geo.directions || {};
  const dirNames = Object.keys(dirs);

  if(dirNames.length === 0){
    // 没方向的 oblast 给一个小值 demo
    return demoValue(dateStr, "oblast:"+oblast) % 4;
  }

  for(const dn of dirNames){
    const d = dirs[dn];
    for(const s of (d.settlements || [])){
      sum += demoValue(dateStr, `settle:${oblast}:${dn}:${s.name}`);
    }
  }
  return sum;
}

/* =========================
   8) MAP: hierarchical layers by zoom
   ========================= */

function initMap(){
  map = L.map('map', {
    zoomControl: false,
    preferCanvas: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: ''
  }).addTo(map);

  map.setView([48.8, 31.2], 6);

  map.on('zoomend', () => {
    updateMapLayer();
  });
}

function updateMapLayer(){
  const z = map.getZoom();
  const target =
    (z <= Z_OBLAST) ? "oblast" :
    (z <= Z_DIR) ? "dir" : "settle";

  setActiveLayer(target);
}

function setActiveLayer(which){
  if(layerOblast) map.removeLayer(layerOblast);
  if(layerDir) map.removeLayer(layerDir);
  if(layerSettle) map.removeLayer(layerSettle);

  if(which === "oblast") map.addLayer(layerOblast);
  else if(which === "dir") map.addLayer(layerDir);
  else map.addLayer(layerSettle);
}

function buildClusterLayer(markers){
  return L.markerClusterGroup({
    maxClusterRadius: 60,
    showCoverageOnHover: false,
    iconCreateFunction: function (c) {
      const ms = c.getAllChildMarkers();
      const sum = ms.reduce((acc, m) => acc + (m.options.__value || 0), 0);
      const size = sum >= 80 ? 'large' : sum >= 30 ? 'medium' : 'small';

      return new L.DivIcon({
        html: `<div><span>${sum}</span></div>`,
        className: `marker-cluster marker-cluster-${size}`,
        iconSize: new L.Point(40, 40)
      });
    }
  }).addLayers(markers);
}

function renderMap(){
  const dates = flattenSelectedDates();
  const activeDate = dates[dates.length - 1] || "—"; // 默认取最后一天
  elSubtitle.textContent = `Reports on ${activeDate}`;

  // 统计：demo 里我们只把 repelled 放 statRepelled；其他先留 0
  let total = 0;
  for(const ob of OBLASTS) total += oblastTotalForDate(ob, activeDate);
  elRepelled.textContent = String(total);
  elAssaults.textContent = "0";
  elOther.textContent = "0";

  // 1) oblast markers
  const mOb = [];
  for(const ob of OBLASTS){
    const geo = DEMO_GEO[ob];
    if(!geo) continue;
    const v = oblastTotalForDate(ob, activeDate);
    if(v <= 0) continue;

    const mk = L.circleMarker(geo.center, {
      radius: 10,
      color: "#111",
      weight: 1,
      fillColor: "#f39b00",
      fillOpacity: 0.85,
      __value: v
    }).bindPopup(`<b>${ob}</b><br/>Repelled: ${v}`);
    mOb.push(mk);
  }

  // 2) direction markers
  const mDir = [];
  for(const ob of OBLASTS){
    const geo = DEMO_GEO[ob];
    if(!geo) continue;
    for(const [dn, d] of Object.entries(geo.directions || {})){
      let v = 0;
      for(const s of (d.settlements || [])){
        v += demoValue(activeDate, `settle:${ob}:${dn}:${s.name}`);
      }
      if(v <= 0) continue;

      const mk = L.circleMarker(d.center, {
        radius: 9,
        color: "#111",
        weight: 1,
        fillColor: "#00d084",
        fillOpacity: 0.85,
        __value: v
      }).bindPopup(`<b>${ob} / ${dn}</b><br/>Repelled: ${v}`);
      mDir.push(mk);
    }
  }

  // 3) settlement markers
  const mSet = [];
  for(const ob of OBLASTS){
    const geo = DEMO_GEO[ob];
    if(!geo) continue;
    for(const [dn, d] of Object.entries(geo.directions || {})){
      for(const s of (d.settlements || [])){
        const v = demoValue(activeDate, `settle:${ob}:${dn}:${s.name}`);
        if(v <= 0) continue;

        const mk = L.circleMarker([s.lat, s.lng], {
          radius: 7,
          color: "#111",
          weight: 1,
          fillColor: "#ffd200",
          fillOpacity: 0.85,
          __value: v
        }).bindPopup(`<b>${s.name}</b><br/>${ob} / ${dn}<br/>Repelled: ${v}`);
        mSet.push(mk);
      }
    }
  }

  layerOblast = buildClusterLayer(mOb);
  layerDir = buildClusterLayer(mDir);
  layerSettle = buildClusterLayer(mSet);

  updateMapLayer();
}

/* =========================
   9) CHART INIT
   ========================= */

function initChart(){
  const ctx = document.getElementById('chart');

  chart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { stacked: true, grid: { color: '#9b9b9b', borderDash: [2,2] } },
        y: { stacked: true, beginAtZero: true, grid: { color: '#9b9b9b', borderDash: [2,2] } }
      }
    }
  });
}

/* =========================
   10) MAIN RENDER
   ========================= */

function renderAll(){
  // 没选任何日期：给一个默认
  if(state.selections.length === 0){
    state.selections.push({ type:"single", date:"2026-02-18" });
  }

  renderChips();
  renderChart();
  renderMap();
}
