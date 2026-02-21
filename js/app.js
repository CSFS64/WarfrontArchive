'use strict';

/* =========================
   0) 前线同步
   ========================= */

const TEST2_OWNER = "CSFS64";
const TEST2_REPO  = "test2";
const TEST2_PATH  = "data";

// fetch 站点
function pagesUrlFor(pathInRepo){
  return `https://${TEST2_OWNER.toLowerCase()}.github.io/${TEST2_REPO}/${pathInRepo}`;
}

function parseDateFromFrontlineName(name){
  const m = name.match(/^frontline-(\d{4})-(\d{2})-(\d{2})\.json$/);
  if(!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  if(Number.isNaN(t)) return null;
  return t;
}

// 简单缓存
let _latestFrontlineCache = { url: null, ts: 0 };
const CACHE_MS = 10 * 60 * 1000; // 10 分钟缓存一次

async function getLatestFrontlineUrl(){
  const now = Date.now();
  if(_latestFrontlineCache.url && (now - _latestFrontlineCache.ts) < CACHE_MS){
    return _latestFrontlineCache.url;
  }

  const api = `https://api.github.com/repos/${TEST2_OWNER}/${TEST2_REPO}/contents/${TEST2_PATH}`;
  const res = await fetch(api, { cache: "no-store" });
  if(!res.ok) throw new Error("GitHub contents API failed: " + res.status);

  const items = await res.json(); // [{name, type, ...}, ...]
  const files = (Array.isArray(items) ? items : [])
    .filter(x => x && x.type === "file" && typeof x.name === "string");

  let best = null; // { t, name }
  for(const f of files){
    const t = parseDateFromFrontlineName(f.name);
    if(t == null) continue;
    if(!best || t > best.t) best = { t, name: f.name };
  }

  if(!best) throw new Error("No frontline-YYYY-MM-DD.json found in test2/data");

  const pathInRepo = `${TEST2_PATH}/${best.name}`;
  const url = pagesUrlFor(pathInRepo) + `?v=${now}`;
  _latestFrontlineCache = { url, ts: now };
  return url;
}

async function loadLatestFrontline(){
  const url = await getLatestFrontlineUrl();
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error("Frontline JSON load failed: " + res.status);
  return await res.json();
}

/* =========================
   1) DEMO DATA (以后换成 Excel 导入)
   ========================= */

// 你要的 7 个“州/州级方向”
const OBLASTS = [
  "Sumy", "Kharkiv", "Luhansk", "Donetsk",
  "Dnipropetrovsk", "Zaporizhzhia", "Kherson"
];

const OBLAST_COLOR = {
  "Sumy": "#ff00ff",
  "Kharkiv": "#ff0000",
  "Luhansk": "#ff7a00",
  "Donetsk": "#ffd200",
  "Dnipropetrovsk": "#0077ff",
  "Zaporizhzhia": "#00d084",
  "Kherson": "#666666"
};

function colorForOblast(oblast){
  return OBLAST_COLOR[oblast] || "#666";
}

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
  "2026-02-10","2026-02-11","2026-02-12","2026-02-13",
  "2026-02-14","2026-02-15","2026-02-16","2026-02-17",
  "2026-02-18","2026-02-19","2026-02-20","2026-02-21",
  "2026-02-22","2026-02-23"
];

// 稳定 hash
function hashStr(str){
  let h = 0;
  for(let i=0;i<str.length;i++){
    h = (h<<5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// 日期强度曲线（模拟前线波动）
function dateIntensity(dateStr){
  const idx = DEMO_DATES.indexOf(dateStr);
  if(idx < 0) return 0.5;

  // 模拟周期波动 + 局部峰值
  const wave = 0.6 + 0.4*Math.sin(idx * 0.8);
  const peak = (idx===8 || idx===9) ? 1.6 : 1.0; // 18–19 高峰
  const decay = idx > 10 ? 0.8 : 1.0;

  return wave * peak * decay;
}

// oblast 权重（不同战区强度不同）
const OBLAST_WEIGHT = {
  "Sumy": 0.3,
  "Kharkiv": 1.2,
  "Luhansk": 0.9,
  "Donetsk": 1.4,
  "Dnipropetrovsk": 0.5,
  "Zaporizhzhia": 1.1,
  "Kherson": 0.8
};

// direction 权重
const DIR_WEIGHT = {
  "Kupiansk": 1.2,
  "Vovchansk": 0.9,
  "Avdiivka": 1.4,
  "Bakhmut": 1.1,
  "Orikhiv": 1.0,
  "Dnipro Left Bank": 0.7
};

// settlement 权重
const SET_WEIGHT = {
  "Kupiansk": 1.2,
  "Dvorichna": 0.7,
  "Vovchansk": 0.8,
  "Lyptsi": 0.6,
  "Avdiivka": 1.3,
  "Orlivka": 0.7,
  "Chasiv Yar": 1.1,
  "Klishchiivka": 0.9,
  "Robotyne": 1.2,
  "Verbove": 0.8,
  "Krynky": 0.9
};

// 主 demo 数值生成
function demoValue(dateStr, key){
  const parts = key.split(":"); // settle:oblast:dir:set
  let oblast = parts[1] || "";
  let dir = parts[2] || "";
  let set = parts[3] || "";

  const base =
    (OBLAST_WEIGHT[oblast] || 0.4) *
    (DIR_WEIGHT[dir] || 0.7) *
    (SET_WEIGHT[set] || 0.8);

  const noise = (hashStr(dateStr + key) % 100) / 100;
  const intensity = dateIntensity(dateStr);

  const val = Math.floor(base * intensity * 12 + noise * 2);

  return Math.max(0, val);
}

/* =========================
   2) STATE
   ========================= */

const state = {
  metric: "repelled", // showMode
  selections: []
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
let frontlineLayer = null;
let frontlineMetaEl = null;

// Map layers
let layerSettle = null;

init();

/* =========================
   4) INIT
   ========================= */

function init(){
  initMap();
  initChart();
  bindUI();
  bootFrontline().finally(() => {
    renderAll();
  });
}

async function bootFrontline(){
  try{
    const gj = await loadLatestFrontline();
    drawFrontlineGeoJSON(gj);

    // 可选：每 10 分钟自动刷新一次最新前线（与 CACHE_MS 一致）
    setInterval(async () => {
      try{
        const gj2 = await loadLatestFrontline();
        drawFrontlineGeoJSON(gj2);
      }catch(e){
        console.warn("Frontline refresh failed:", e);
      }
    }, CACHE_MS);

  }catch(e){
    console.warn("Frontline boot failed:", e);
  }
}

function drawFrontlineGeoJSON(geojson){
  if(!map) return;

  if(frontlineLayer){
    map.removeLayer(frontlineLayer);
    frontlineLayer = null;
  }

  frontlineLayer = L.geoJSON(geojson, {
    currentLayer = L.geoJSON(data, {
     renderer: vecRenderer,
     style: (feature) => {
       const name = String(feature?.properties?.Name || "").trim().toLowerCase();
   
       // ✅ 完全按你原来的标准
       if (name === "dpr")       return { color: "purple",   fillColor: "purple",   fillOpacity: 0.25, weight: 2   };
       if (name === "red")       return { color: "#E60000",  fillColor: "#E60000",  fillOpacity: 0.20, weight: 1.5 };
       if (name === "lib")       return { color: "#00A2E8",  fillColor: "#00A2E8",  fillOpacity: 0.20, weight: 1.5 };
       if (name === "libed")     return { color: "#33CC00",  fillColor: "#33CC00",  fillOpacity: 0.20, weight: 1.5 };
       if (name === "contested") return { color: "white",    fillColor: "white",    fillOpacity: 0.25, weight: 0   };
   
       // 兜底
       return { color: "black", fillColor: "black", fillOpacity: 0.30, weight: 1 };
     }
   }).addTo(map);
}

function bindUI(){
  const btnSearch = document.getElementById("btnSearch");

  if(!elQuick || !elChips || !elShowMode){
    console.error("Missing required DOM elements. Check ids: dateChips, quickInput, showMode");
    return;
  }

  function applyInput(){
    const raw = (elQuick.value || "").trim();
    if(!raw) return;

    const parsed = parseDateInput(raw);
    if(!parsed){
      elQuick.focus();
      elQuick.select();
      return;
    }

    // ✅ 这里才是“筛选”发生的地方
    state.selections.push(parsed);

    elQuick.value = "";
    renderAll();
  }

  // ✅ Enter 触发
  elQuick.addEventListener('keydown', (e) => {
    if(e.key !== 'Enter') return;
    e.preventDefault();      // 防止提交/刷新/奇怪行为
    e.stopPropagation();
    applyInput();
  });

  // ✅ 按钮兜底触发
  if(btnSearch){
    btnSearch.addEventListener("click", (e) => {
      e.preventDefault();
      applyInput();
    });
  }

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

// --- helpers: compare ISO date strings safely ---
function cmpISO(a,b){ return a < b ? -1 : a > b ? 1 : 0; }

// --- normalize separators, trim, unify punctuation ---
function normalizeSep(s){
  return (s||"")
    .trim()
    .replace(/[，,]/g, " ")
    .replace(/[~～至到]/g, "~")
    .replace(/[－–—]/g, "-")
    .replace(/\s+/g, " ");
}

// 数据可用日期边界（基于 DEMO_DATES 或未来导入数据）
function getDataDateBounds(){
  const sorted = DEMO_DATES.slice().sort();
  return { min: sorted[0], max: sorted[sorted.length-1], set: new Set(sorted) };
}

// 裁剪一个范围到“数据存在的日期区间”
function clipRangeToData(startISO, endISO){
  const { min, max } = getDataDateBounds();

  let s = startISO;
  let e = endISO;

  if(cmpISO(s, min) < 0) s = min;
  if(cmpISO(e, max) > 0) e = max;

  // 若裁剪后反过来，说明完全不相交
  if(cmpISO(s, e) > 0) return null;

  return { start: s, end: e };
}

// 把各种可能的“单个日期/年月/年”输入解析成 {kind, y, m?, d?}
function extractYMDLoose(raw){
  const s = normalizeSep(raw);

  // 1) 中文：2026年2月18日 / 2026年2月 / 2026年
  let m = s.match(/^(\d{4})\s*年(?:\s*(\d{1,2})\s*月)?(?:\s*(\d{1,2})\s*日)?$/);
  if(m){
    const y = +m[1];
    const mo = m[2] ? +m[2] : null;
    const d = m[3] ? +m[3] : null;
    return { kind: d? "ymd" : mo? "ym" : "y", y, m: mo, d };
  }

  // 2) 纯年：2026
  m = s.match(/^(\d{4})$/);
  if(m) return { kind:"y", y:+m[1] };

  // 3) YYYY[-/.]MM[-/.]DD  / YYYY[-/.]MM
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})(?:[\/\-.](\d{1,2}))?$/);
  if(m){
    const y = +m[1], mo = +m[2], d = m[3] ? +m[3] : null;
    return { kind: d? "ymd" : "ym", y, m: mo, d };
  }

  // 4) DD[-/.]MM[-/.]YYYY  or  MM[-/.]DD[-/.]YYYY  (智能判断)
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if(m){
    const a = +m[1], b = +m[2], y = +m[3];

    // 若 a>12 且 b<=12 => DD-MM-YYYY
    if(a > 12 && b <= 12) return { kind:"ymd", y, m:b, d:a };

    // 若 b>12 且 a<=12 => MM-DD-YYYY
    if(b > 12 && a <= 12) return { kind:"ymd", y, m:a, d:b };

    // 两者都<=12：默认按 MM-DD-YYYY（美式）——如果你想默认欧式我也能改
    return { kind:"ymd", y, m:a, d:b };
  }

  // 5) 只输入 月/年：2/2026 或 02-2026 或 Feb 2026
  m = s.match(/^(\d{1,2})[\/\-.](\d{4})$/);
  if(m){
    return { kind:"ym", y:+m[2], m:+m[1] };
  }

  // 6) 英文月份：Feb 18 2026 / 18 Feb 2026 / February 2026
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/); // Feb 18 2026
  if(m){
    const mo = monthIndex(m[1]);
    if(!mo) return null;
    return { kind:"ymd", y:+m[3], m:mo, d:+m[2] };
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/); // 18 Feb 2026
  if(m){
    const mo = monthIndex(m[2]);
    if(!mo) return null;
    return { kind:"ymd", y:+m[3], m:mo, d:+m[1] };
  }
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/); // Feb 2026
  if(m){
    const mo = monthIndex(m[1]);
    if(!mo) return null;
    return { kind:"ym", y:+m[2], m:mo };
  }

  return null;
}

// 月份名映射
function monthIndex(name){
  const n = (name||"").toLowerCase();
  const map = {
    jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,
    may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,
    sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12
  };
  return map[n] || null;
}

function toISO(y,m,d){
  if(!Number.isFinite(y)) return null;
  if(m!=null && (m<1||m>12)) return null;
  if(d!=null && (d<1||d>31)) return null;

  const dt = new Date(Date.UTC(y, (m||1)-1, (d||1)));
  // 若给了 m/d 则严格校验
  if(m!=null && (dt.getUTCMonth()+1)!==m) return null;
  if(d!=null && dt.getUTCDate()!==d) return null;

  const mm = String(m||1).padStart(2,'0');
  const dd = String(d||1).padStart(2,'0');
  return `${y}-${mm}-${dd}`;
}

// ✅ 新版：解析输入 => selection（single / range）
// 并支持 “抽象输入(年/月)” => 自动裁剪到数据存在范围
function parseDateInput(raw){
  const s = normalizeSep(raw);

  // range: 支持 "~" 或 "to" 或 "-"（中间有空格）
  let rm = s.match(/(.+?)\s*(~|to)\s*(.+)/i);
  if(!rm){
    // 也允许 "a - b" 这种带空格的 range，避免把单日里的 "-" 当 range
    rm = s.match(/(.+?)\s+\-\s+(.+)/);
    if(rm) rm = [rm[0], rm[1], "~", rm[2]];
  }

  if(rm){
    const A = parseOneDate(rm[1].trim());
    const B = parseOneDate(rm[3].trim());
    if(!A || !B) return null;

    // A/B 可能是 single 或 range（比如输入“2026-02 ~ 2026-03”）
    const aStart = (A.type==="single") ? A.date : A.start;
    const aEnd   = (A.type==="single") ? A.date : A.end;
    const bStart = (B.type==="single") ? B.date : B.start;
    const bEnd   = (B.type==="single") ? B.date : B.end;

    const start = cmpISO(aStart, bStart) <= 0 ? aStart : bStart;
    const end   = cmpISO(aEnd, bEnd) <= 0 ? bEnd : aEnd;

    const clipped = clipRangeToData(start, end);
    if(!clipped) return null;

    if(clipped.start === clipped.end) return { type:"single", date: clipped.start };
    return { type:"range", start: clipped.start, end: clipped.end };
  }

  // single 或 abstract
  return parseOneDate(s);
}

// ✅ 新版：单个输入可以返回 single 或 range（当输入是“年/月”）
function parseOneDate(raw){
  const info = extractYMDLoose(raw);
  if(!info) return null;

  const { min, max } = getDataDateBounds();

  // 具体到日
  if(info.kind === "ymd"){
    const iso = toISO(info.y, info.m, info.d);
    if(!iso) return null;

    // 若输入日期不在数据范围内：裁剪到边界（你也可以改成直接拒绝）
    const clipped = clipRangeToData(iso, iso);
    if(!clipped) return null;
    return { type:"single", date: clipped.start };
  }

  // 只到月：转成该月的理论范围，再裁剪到数据存在范围
  if(info.kind === "ym"){
    const start = toISO(info.y, info.m, 1);
    if(!start) return null;
    // 计算月末：下个月1号-1天
    const dt = new Date(Date.UTC(info.y, info.m, 1));
    dt.setUTCDate(0); // 回到上个月最后一天 => 这里不对，改用下月
    const nextMonth = new Date(Date.UTC(info.y, info.m, 1)); // next month day 1
    nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
    nextMonth.setUTCDate(0);
    const end = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth()+1).padStart(2,'0')}-${String(nextMonth.getUTCDate()).padStart(2,'0')}`;

    const clipped = clipRangeToData(start, end);
    if(!clipped) return null;
    if(clipped.start === clipped.end) return { type:"single", date: clipped.start };
    return { type:"range", start: clipped.start, end: clipped.end };
  }

  // 只到年：转全年范围，再裁剪
  if(info.kind === "y"){
    const start = `${info.y}-01-01`;
    const end = `${info.y}-12-31`;
    const clipped = clipRangeToData(start, end);
    if(!clipped) return null;

    // ✅ 你要的效果：输入 2026，但数据只有 02-10~02-23，则 chip 显示该裁剪范围
    if(clipped.start === clipped.end) return { type:"single", date: clipped.start };
    return { type:"range", start: clipped.start, end: clipped.end };
  }

  return null;
}

// expandSelection 不变逻辑，但注意：现在 selection 可能来自裁剪后的范围
function expandSelection(sel){
  if(sel.type === "single") return [sel.date];
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

  if(state.selections.length === 0){
    const hint = document.createElement("span");
    hint.className = "muted";
    hint.textContent = "All dates";
    elChips.appendChild(hint);
    return;
  }

  state.selections.forEach((sel, idx) => {
    if(sel.type === "single"){
      elChips.appendChild(makeChip(sel.date, () => {
        state.selections.splice(idx, 1);
        renderAll();
      }));
      return;
    }

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
  // ✅ 默认：不过滤 = 全部日期
  if(state.selections.length === 0){
    return DEMO_DATES.slice();
  }

  const set = [];
  for(const sel of state.selections){
    for(const d of expandSelection(sel)) set.push(d);
  }
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

   L.tileLayer(
     'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
     {
       maxZoom: 19,
       attribution: 'Tiles © Esri'
     }
   ).addTo(map);

   L.tileLayer(
     'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
     {
       maxZoom: 19,
       opacity: 0.9,
       attribution: 'Labels © Esri'
     }
   ).addTo(map);

  map.setView([48.8, 31.2], 6);

  layerSettle = buildClusterLayer([]);
  map.addLayer(layerSettle);
}

function buildClusterLayer(markers){
  const group = L.markerClusterGroup({
    maxClusterRadius: 60,
    showCoverageOnHover: false,

    // ✅ 动画（聚合/分离）
    animate: true,
    animateAddingMarkers: true,
    chunkedLoading: true,     // 数据多时也不卡

    iconCreateFunction: function (cluster) {
      const ms = cluster.getAllChildMarkers();

      // 1) cluster 总和（显示数字）
      const sum = ms.reduce((acc, m) => acc + (m.options.__value || 0), 0);

      // 2) 找“主导州”（按 value 总和最大）
      const byOblast = {};
      for(const m of ms){
        const ob = m.options.__oblast || "Other";
        const v  = m.options.__value || 0;
        byOblast[ob] = (byOblast[ob] || 0) + v;
      }
      let dominant = "Other";
      let best = -1;
      for(const [ob, v] of Object.entries(byOblast)){
        if(v > best){
          best = v;
          dominant = ob;
        }
      }

      const color = colorForOblast(dominant);
      const size = sum >= 80 ? 'large' : sum >= 30 ? 'medium' : 'small';

      return L.divIcon({
        html: `<div style="background:${color}"><span>${sum}</span></div>`,
        className: `marker-cluster marker-cluster-${size}`,
        iconSize: L.point(40, 40)
      });
    }
  });

  if(markers?.length) group.addLayers(markers);
  return group;
}

function sumOverDates(dates, fn){
  let s = 0;
  for(const d of dates) s += fn(d);
  return s;
}

function settlementSum(dates, oblast, dir, settlementName){
  return sumOverDates(dates, (dateStr) =>
    demoValue(dateStr, `settle:${oblast}:${dir}:${settlementName}`)
  );
}

function makeValueIcon(value, color){
  const size = value >= 80 ? 'large' : value >= 30 ? 'medium' : 'small';
  return L.divIcon({
    html: `<div style="background:${color}"><span>${value}</span></div>`,
    className: `marker-cluster marker-cluster-${size} wa-point`,
    iconSize: L.point(40, 40)
  });
}

function markerWithValue(latlng, value, popupHtml, oblast){
  const color = colorForOblast(oblast);
  return L.marker(latlng, {
    icon: makeValueIcon(value, color),
    __value: value,
    __oblast: oblast
  }).bindPopup(popupHtml);
}

function renderMap(){
  const dates = flattenSelectedDates();
  if(dates.length === 0) return;

  // subtitle：显示筛选范围
  const rangeLabel = (dates.length === 1)
    ? dates[0]
    : `${dates[0]}~${dates[dates.length - 1]}`;
  elSubtitle.textContent = `Reports on ${rangeLabel}`;

  let total = 0;

  const mSet = [];

  for(const ob of OBLASTS){
    const geo = DEMO_GEO[ob];
    if(!geo) continue;

    for(const [dn, d] of Object.entries(geo.directions || {})){
      for(const st of (d.settlements || [])){
        const v = settlementSum(dates, ob, dn, st.name);
        if(v <= 0) continue;

        total += v;

        const mk = markerWithValue(
          [st.lat, st.lng],
          v,
          `<b>${st.name}</b><br/>${ob} / ${dn}<br/>Repelled (sum): ${v}`,
          ob
        );

        mSet.push(mk);
      }
    }
  }

  elRepelled.textContent = String(total);
  elAssaults.textContent = "0";
  elOther.textContent = "0";

  layerSettle.clearLayers();
  layerSettle.addLayers(mSet);
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
  renderChips();
  renderChart();
  renderMap();
}
