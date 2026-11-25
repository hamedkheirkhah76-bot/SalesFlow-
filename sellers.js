/* =========================================================
   SalesFlow — گزارش فروشندگان (sellers.js)
   بعد از app.js بارگذاری می‌شود و از توابع/حالت سراسری آن استفاده می‌کند
   (state، getSetting/setSetting، normalizeStr، toPersianSafeNumber، …).
   ========================================================= */

const SELLERS_COLUMN_KEYS = ["supervisor", "seller", "monthlyTarget", "dailyTarget", "sales", "pct", "coverage"];
const SELLERS_NUMERIC_KEYS = ["monthlyTarget", "dailyTarget", "sales", "pct", "coverage"];

const DEFAULT_SELLERS_STYLE = {
  imageWidth: 980,
  titleTemplate: "گزارش فروش فروشندگان شعبه گیلان - {line}",
  dateTemplate: "تاریخ: {date}",
  dateCellSpan: 2,
  titleFontFamily: "Vazirmatn", headerFontFamily: "Vazirmatn", bodyFontFamily: "Vazirmatn",
  titleSize: 18, headerSize: 14, bodySize: 14,
  titleBold: true, headerBold: true, supervisorBold: true,
  titleCellBg: "#1f3a5f", titleCellText: "#ffffff", dateCellBg: "#1f3a5f", dateCellText: "#ffffff",
  headerRowBg: "#ffffff", headerRowText: "#111111",
  dataRowBg: "#ffffff", dataRowText: "#111111", dataNumberText: "#7f6000",
  supervisorRowBg: "#b4c7e7", supervisorRowText: "#1f3864",
  totalRowBg: "#1f3a5f", totalRowText: "#ffffff",
  borderColor: "#7f7f7f", borderWidth: 1,
  rowHeights: { title: 46, header: 38, data: 34, supervisor: 34, total: 38 },
  columnOrder: [...SELLERS_COLUMN_KEYS],
  columnWeights: { supervisor: 24, seller: 32, monthlyTarget: 14, dailyTarget: 13, sales: 14, pct: 17, coverage: 18 },
  columnLabels: { supervisor: "نام سرپرست", seller: "نام فروشنده", monthlyTarget: "هدف ماهانه", dailyTarget: "هدف روزانه", sales: "فروش روزانه", pct: "درصد تحقق روزانه", coverage: "پوشش مشتری روزانه" },
  columnAlign: { supervisor: "right", seller: "right", monthlyTarget: "center", dailyTarget: "center", sales: "center", pct: "center", coverage: "center" },
  columnBold: { supervisor: false, seller: false, monthlyTarget: false, dailyTarget: false, sales: false, pct: false, coverage: false },
  sortKey: "",            // "" = به ترتیب سرپرست؛ وگرنه کلید یکی از ستون‌ها
  sortDir: "asc",         // asc = کوچک به بزرگ
  supervisorRowPosition: "bottom", // سطر جمع سرپرست: زیر یا بالای فروشنده‌هایش
};

/* ---------------- state ---------------- */
let sellersCfg = { line1: { supervisors: [], sellers: [] }, line2: { supervisors: [], sellers: [] } };
let sellerTargets = { line1: {}, line2: {} };   // sellerId -> هدف ماهانه (عدد)
let sellersStyle = null;
let sellersColumnLetter = "";
let lastSellersContext = null;                  // {dateStr, results:{line1,line2}} — برای بازرسم بعد از تغییر ظاهر

function getSellerColumn() { return sellersColumnLetter; }
async function setSellerColumn(letter) {
  sellersColumnLetter = letter || "";
  await setSetting("sellerColumn", sellersColumnLetter);
}

function sellersUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/** Persian/Arabic digits → ASCII digits. */
function sellersNormalizeDigits(s) {
  return String(s == null ? "" : s)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** "299_میثم رمضانی_R" → "299". Leading digits win; otherwise the first run of
 * digits anywhere in the text. Leading zeros are dropped so "0299" == "299". */
function extractSellerCode(cell) {
  const s = sellersNormalizeDigits(normalizeStr(cell));
  const m = s.match(/^\s*(\d+)/) || s.match(/(\d+)/);
  return m ? m[1].replace(/^0+(?=\d)/, "") : null;
}
/** A code typed by the user in the definition screens (digits only). */
function normalizeTypedSellerCode(v) {
  const s = sellersNormalizeDigits(normalizeStr(v));
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : null;
}

/* ---------------- config / style sanitizing ---------------- */
function sanitizeSellersCfg(raw) {
  const out = { line1: { supervisors: [], sellers: [] }, line2: { supervisors: [], sellers: [] } };
  for (const lineKey of ["line1", "line2"]) {
    const src = raw && raw[lineKey] ? raw[lineKey] : {};
    const sups = Array.isArray(src.supervisors) ? src.supervisors : [];
    out[lineKey].supervisors = sups
      .filter((s) => s && s.id && normalizeStr(s.name))
      .map((s) => ({ id: String(s.id), name: normalizeStr(s.name), ownCode: normalizeTypedSellerCode(s.ownCode) || "" }));
    const ids = new Set(out[lineKey].supervisors.map((s) => s.id));
    const sellers = Array.isArray(src.sellers) ? src.sellers : [];
    out[lineKey].sellers = sellers
      .filter((s) => s && s.id && ids.has(String(s.supervisorId)) && normalizeTypedSellerCode(s.code))
      .map((s) => ({ id: String(s.id), code: normalizeTypedSellerCode(s.code), name: normalizeStr(s.name), supervisorId: String(s.supervisorId) }));
  }
  return out;
}

function sanitizeSellersStyle(raw) {
  raw = raw && typeof raw === "object" ? raw : {};
  const D = DEFAULT_SELLERS_STYLE;
  const s = JSON.parse(JSON.stringify(D));
  const hex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  const clamp = (v, lo, hi, dflt) => { const n = Number(v); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  ["titleTemplate", "dateTemplate"].forEach((k) => { if (typeof raw[k] === "string" && raw[k].trim()) s[k] = raw[k]; });
  ["titleFontFamily", "headerFontFamily", "bodyFontFamily"].forEach((k) => {
    if (FONT_FAMILY_OPTIONS.some(([v]) => v === raw[k])) s[k] = raw[k];
  });
  s.imageWidth = Math.round(clamp(raw.imageWidth, 400, 2400, D.imageWidth));
  s.titleSize = clamp(raw.titleSize, 8, 60, D.titleSize);
  s.headerSize = clamp(raw.headerSize, 8, 60, D.headerSize);
  s.bodySize = clamp(raw.bodySize, 8, 60, D.bodySize);
  s.borderWidth = clamp(raw.borderWidth, 0, 6, D.borderWidth);
  s.dateCellSpan = Math.round(clamp(raw.dateCellSpan, 1, 5, D.dateCellSpan));
  ["titleBold", "headerBold", "supervisorBold"].forEach((k) => { if (typeof raw[k] === "boolean") s[k] = raw[k]; });
  ["titleCellBg", "titleCellText", "dateCellBg", "dateCellText", "headerRowBg", "headerRowText", "dataRowBg", "dataRowText",
    "dataNumberText", "supervisorRowBg", "supervisorRowText", "totalRowBg", "totalRowText", "borderColor"].forEach((k) => {
    if (hex(raw[k])) s[k] = raw[k].toLowerCase();
  });
  Object.keys(D.rowHeights).forEach((k) => { s.rowHeights[k] = Math.round(clamp(raw.rowHeights && raw.rowHeights[k], 20, 120, D.rowHeights[k])); });
  const isPerm = (arr) => Array.isArray(arr) && arr.length === SELLERS_COLUMN_KEYS.length && SELLERS_COLUMN_KEYS.every((k) => arr.includes(k));
  if (isPerm(raw.columnOrder)) s.columnOrder = [...raw.columnOrder];
  SELLERS_COLUMN_KEYS.forEach((k) => {
    s.columnWeights[k] = clamp(raw.columnWeights && raw.columnWeights[k], 5, 100, D.columnWeights[k]);
    const label = raw.columnLabels && raw.columnLabels[k];
    if (typeof label === "string" && label.trim()) s.columnLabels[k] = label.trim().slice(0, 40);
    const al = raw.columnAlign && raw.columnAlign[k];
    if (["right", "center", "left"].includes(al)) s.columnAlign[k] = al;
    if (raw.columnBold && typeof raw.columnBold[k] === "boolean") s.columnBold[k] = raw.columnBold[k];
  });
  s.sortKey = SELLERS_COLUMN_KEYS.includes(raw.sortKey) ? raw.sortKey : "";
  s.sortDir = raw.sortDir === "desc" ? "desc" : "asc";
  s.supervisorRowPosition = raw.supervisorRowPosition === "top" ? "top" : "bottom";
  return s;
}

async function hydrateSellersState() {
  sellersCfg = sanitizeSellersCfg(await getSetting("sellersCfg", null));
  const t = await getSetting("sellerTargets", null);
  sellerTargets = { line1: {}, line2: {} };
  for (const lineKey of ["line1", "line2"]) {
    const src = t && t[lineKey] ? t[lineKey] : {};
    const validIds = new Set(sellersCfg[lineKey].sellers.map((s) => s.id));
    for (const [id, v] of Object.entries(src)) {
      if (validIds.has(id) && typeof v === "number" && isFinite(v) && v >= 0) sellerTargets[lineKey][id] = v;
    }
  }
  sellersStyle = sanitizeSellersStyle(await getSetting("sellersStyle", null));
  sellersColumnLetter = await getSetting("sellerColumn", "");
}
const persistSellersCfg = () => setSetting("sellersCfg", sellersCfg);
const persistSellerTargets = () => setSetting("sellerTargets", sellerTargets);
const persistSellersStyle = () => setSetting("sellersStyle", sellersStyle);

function sellersBackupPayload() {
  return { cfg: sellersCfg, targets: sellerTargets, style: sellersStyle, column: sellersColumnLetter };
}
async function restoreSellersFromBackup(p) {
  if (!p || typeof p !== "object") return;
  if (p.cfg) await setSetting("sellersCfg", p.cfg);
  if (p.targets) await setSetting("sellerTargets", p.targets);
  if (p.style) await setSetting("sellersStyle", p.style);
  if (typeof p.column === "string") await setSetting("sellerColumn", p.column);
  await hydrateSellersState();
}

/* =========================================================
   محاسبه
   ========================================================= */

const sellersDailyOf = (monthly, days) => (monthly != null && days > 0 ? Math.round(monthly / days) : null);
const sellersPctOf = (salesExact, monthly, days) =>
  monthly != null && monthly > 0 && days > 0 ? (salesExact / (monthly / days)) * 100 : null;

/** Pure function (no DOM) — walks the sales rows once per line and builds, for
 * every supervisor, its sellers' rows plus the supervisor's own summary row.
 * Row filtering is exactly the one گزارش کلی uses: پیش‌فاکتور = 0 is skipped,
 * only the two configured lines count, «غیرقابل فروش» groups never count.
 * Sales = carton-equivalent of all sellable products; coverage = unique
 * customers; a supervisor's coverage/sales are the SUM of his sellers' (plus
 * his own seller code, if he has one). */
function computeSellersReport({ rows, columnMap, sellerColumn, lines, productMap, groupsById, cfg, targets, workingDays }) {
  const days = workingDays > 0 ? workingDays : 0;
  const result = {};
  const ctx = {};
  for (const lineKey of ["line1", "line2"]) {
    const c = cfg[lineKey];
    const sellerByCode = new Map(c.sellers.map((s) => [s.code, s]));
    const supByOwnCode = new Map(c.supervisors.filter((s) => s.ownCode).map((s) => [s.ownCode, s]));
    ctx[lineKey] = {
      sellerByCode, supByOwnCode,
      sellerBuckets: new Map(c.sellers.map((s) => [s.id, { sales: 0, customers: new Set() }])),
      ownBuckets: new Map(c.supervisors.map((s) => [s.id, { sales: 0, customers: new Set() }])),
      undefinedSellers: new Map(),
      noCodeRows: 0,
    };
  }

  for (const row of rows) {
    const invoiceNum = toPersianSafeNumber(row[columnMap.invoice]);
    if (invoiceNum === 0) continue;
    const lineVal = normalizeStr(row[columnMap.line]);
    let lineKey = null;
    if (lineVal === lines.line1.excelValue) lineKey = "line1";
    else if (lineVal === lines.line2.excelValue) lineKey = "line2";
    if (!lineKey) continue;

    const code = normalizeStr(row[columnMap.code]);
    const product = productMap.get(code);
    if (product && groupsById.get(product.group)?.nonSellable) continue;

    // carton-equivalent of this row (0 when the product / carton size is unknown)
    let cartonEq = 0;
    if (product) {
      const qty = toPersianSafeNumber(row[columnMap.qty]);
      const cartonFromFile = toPersianSafeNumber(row[columnMap.carton]);
      let cartonQty = 0;
      if (!isNaN(cartonFromFile) && cartonFromFile > 0) cartonQty = cartonFromFile;
      else if (product.cartonQty > 0) cartonQty = product.cartonQty;
      cartonEq = cartonQty > 0 && !isNaN(qty) ? qty / cartonQty : 0;
    }

    const L = ctx[lineKey];
    const cellText = normalizeStr(row[sellerColumn]);
    const sCode = extractSellerCode(row[sellerColumn]);
    if (sCode == null) { L.noCodeRows++; continue; }

    const seller = L.sellerByCode.get(sCode);
    const ownSup = seller ? null : L.supByOwnCode.get(sCode);
    if (!seller && !ownSup) {
      const u = L.undefinedSellers.get(sCode) || { code: sCode, text: cellText, rows: 0, sales: 0 };
      u.rows++; u.sales += cartonEq;
      L.undefinedSellers.set(sCode, u);
      continue;
    }
    const bucket = seller ? L.sellerBuckets.get(seller.id) : L.ownBuckets.get(ownSup.id);
    bucket.sales += cartonEq;
    const customerVal = normalizeStr(row[columnMap.customer]);
    if (customerVal) bucket.customers.add(customerVal);
  }

  for (const lineKey of ["line1", "line2"]) {
    const c = cfg[lineKey];
    const L = ctx[lineKey];
    const groups = [];
    for (const sup of c.supervisors) {
      const sellers = c.sellers.filter((s) => s.supervisorId === sup.id);
      const own = L.ownBuckets.get(sup.id);
      if (!sellers.length && !sup.ownCode) continue; // a supervisor with nobody under him is not shown
      const sellerRows = sellers.map((s) => {
        const b = L.sellerBuckets.get(s.id);
        const monthly = targets[lineKey][s.id] != null ? targets[lineKey][s.id] : null;
        const pct = sellersPctOf(b.sales, monthly, days);
        return {
          kind: "seller", supervisorName: sup.name, name: s.name || s.code, code: s.code,
          monthlyTarget: monthly, dailyTarget: sellersDailyOf(monthly, days),
          salesExact: b.sales, sales: Math.round(b.sales),
          pctExact: pct, pct: pct == null ? null : Math.round(pct), coverage: b.customers.size,
        };
      });
      const targetVals = sellerRows.map((r) => r.monthlyTarget).filter((v) => v != null);
      const monthly = targetVals.length ? targetVals.reduce((a, b) => a + b, 0) : null;
      const salesExact = sellerRows.reduce((a, r) => a + r.salesExact, 0) + own.sales;
      const coverage = sellerRows.reduce((a, r) => a + r.coverage, 0) + own.customers.size;
      const pct = sellersPctOf(salesExact, monthly, days);
      groups.push({
        supervisor: {
          kind: "supervisor", supervisorName: sup.name, name: sup.name,
          monthlyTarget: monthly, dailyTarget: sellersDailyOf(monthly, days),
          salesExact, sales: Math.round(salesExact),
          pctExact: pct, pct: pct == null ? null : Math.round(pct), coverage,
        },
        sellers: sellerRows,
      });
    }
    const tVals = groups.map((g) => g.supervisor.monthlyTarget).filter((v) => v != null);
    const tMonthly = tVals.length ? tVals.reduce((a, b) => a + b, 0) : null;
    const tSales = groups.reduce((a, g) => a + g.supervisor.salesExact, 0);
    const tPct = sellersPctOf(tSales, tMonthly, days);
    result[lineKey] = {
      groups,
      total: {
        monthlyTarget: tMonthly, dailyTarget: sellersDailyOf(tMonthly, days),
        salesExact: tSales, sales: Math.round(tSales),
        pctExact: tPct, pct: tPct == null ? null : Math.round(tPct),
        coverage: groups.reduce((a, g) => a + g.supervisor.coverage, 0),
      },
      warnings: { undefinedSellers: [...L.undefinedSellers.values()], noCodeRows: L.noCodeRows },
    };
  }
  return result;
}

/** Turns supervisor groups into the final flat row list: default = per
 * supervisor (his sellers, then his summary row — or the summary first, per
 * style). With a sort column selected ALL rows (sellers and supervisor rows)
 * are sorted together, like the sample report. */
function assembleSellersRows(groups, S) {
  let rows = [];
  groups.forEach((g) => {
    if (S.supervisorRowPosition === "top") rows.push(g.supervisor, ...g.sellers);
    else rows.push(...g.sellers, g.supervisor);
  });
  return S.sortKey ? sortSellerRows(rows, S.sortKey, S.sortDir) : rows;
}
function sortSellerRows(rows, key, dir) {
  const val = (r) => {
    switch (key) {
      case "supervisor": return r.supervisorName;
      case "seller": return r.name;
      case "monthlyTarget": return r.monthlyTarget;
      case "dailyTarget": return r.dailyTarget;
      case "sales": return r.salesExact;
      case "pct": return r.pctExact;
      case "coverage": return r.coverage;
      default: return null;
    }
  };
  const mult = dir === "desc" ? -1 : 1;
  return rows
    .map((r, i) => ({ r, i, v: val(r) }))
    .sort((a, b) => {
      const an = a.v == null, bn = b.v == null;
      if (an || bn) return an && bn ? a.i - b.i : an ? 1 : -1; // empty values always last
      const c = typeof a.v === "string" ? a.v.localeCompare(b.v, "fa") : a.v - b.v;
      return c !== 0 ? c * mult : a.i - b.i;
    })
    .map((x) => x.r);
}

/* =========================================================
   رسم تصویر (Canvas)
   ========================================================= */

async function drawSellersReportCanvas(data, S) {
  const scale = 2;
  const widthCss = S.imageWidth;
  const rh = S.rowHeights;
  const sellerCount = data.rows.filter((r) => r.kind === "seller").length;
  const supCount = data.rows.length - sellerCount;
  const heightCss = rh.title + rh.header + sellerCount * rh.data + supCount * rh.supervisor + rh.total;

  await ensureReportFontsLoaded([S.titleSize, S.headerSize, S.bodySize, Math.round(S.titleSize * 0.7)]);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(widthCss * scale);
  canvas.height = Math.round(heightCss * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.direction = "rtl";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthCss, heightCss);

  const n = S.columnOrder.length;
  const bounds = computeColumnBoundsRTL(S.columnOrder.map((k) => S.columnWeights[k]), widthCss);
  const colB = {};
  S.columnOrder.forEach((k, i) => (colB[k] = bounds[i]));
  const fmt = (v) => (v == null ? "—" : toPersianDigits(formatNumber(v)));

  function cell(x0, x1, y0, y1, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (S.borderWidth > 0) {
      ctx.strokeStyle = S.borderColor;
      ctx.lineWidth = S.borderWidth;
      const half = S.borderWidth / 2;
      ctx.strokeRect(x0 + half, y0 + half, x1 - x0 - half * 2, y1 - y0 - half * 2);
    }
  }
  function text(str, b, y, size, color, bold, family, align, numeric) {
    const pad = 8;
    ctx.fillStyle = color;
    ctx.font = `${bold ? "700" : "400"} ${size}px ${family}, Tahoma, sans-serif`;
    ctx.direction = numeric ? "ltr" : "rtl";
    ctx.textAlign = align === "right" ? "right" : align === "left" ? "left" : "center";
    const x = align === "right" ? b.x1 - pad : align === "left" ? b.x0 + pad : (b.x0 + b.x1) / 2;
    ctx.fillText(String(str), x, y, Math.max(1, b.w - pad * 2));
    ctx.direction = "rtl";
  }
  /** supervisor + seller name columns, merged when they sit next to each other. */
  function nameSpan() {
    const bs = colB.supervisor, bl = colB.seller;
    const adjacent = Math.abs(S.columnOrder.indexOf("supervisor") - S.columnOrder.indexOf("seller")) === 1;
    if (!adjacent) return null;
    const x0 = Math.min(bs.x0, bl.x0), x1 = Math.max(bs.x1, bl.x1);
    return { x0, x1, w: x1 - x0 };
  }
  const merged = nameSpan();
  const valueOf = (key, r) => {
    switch (key) {
      case "monthlyTarget": return fmt(r.monthlyTarget);
      case "dailyTarget": return fmt(r.dailyTarget);
      case "sales": return fmt(r.sales);
      case "pct": return r.pct == null ? "—" : `${toPersianDigits(r.pct)}٪`;
      case "coverage": return fmt(r.coverage);
      default: return "";
    }
  };
  /** A supervisor-style row (supervisor summary or the line total). */
  function summaryRow(y, h, r, bg, color, bold, label) {
    S.columnOrder.forEach((key) => {
      if (merged && (key === "supervisor" || key === "seller")) return;
      const b = colB[key];
      cell(b.x0, b.x1, y, y + h, bg);
      if (SELLERS_NUMERIC_KEYS.includes(key)) text(valueOf(key, r), b, y + h / 2, S.bodySize, color, bold, S.bodyFontFamily, S.columnAlign[key], true);
      else if (key === "supervisor") text(label, b, y + h / 2, S.bodySize, color, bold, S.bodyFontFamily, S.columnAlign[key], false);
    });
    if (merged) {
      cell(merged.x0, merged.x1, y, y + h, bg);
      text(label, merged, y + h / 2, S.bodySize, color, bold, S.bodyFontFamily, "center", false);
    }
  }

  let y = 0;
  const span = Math.min(Math.max(S.dateCellSpan, 1), n - 1);
  const titleB = { x0: bounds[n - 1 - span].x0, x1: bounds[0].x1, w: bounds[0].x1 - bounds[n - 1 - span].x0 };
  const dateB = { x0: bounds[n - 1].x0, x1: bounds[n - span].x1, w: bounds[n - span].x1 - bounds[n - 1].x0 };
  cell(titleB.x0, titleB.x1, y, y + rh.title, S.titleCellBg);
  cell(dateB.x0, dateB.x1, y, y + rh.title, S.dateCellBg);
  text(S.titleTemplate.replace("{line}", data.lineLabel), titleB, y + rh.title / 2, S.titleSize, S.titleCellText, S.titleBold, S.titleFontFamily, "center", false);
  text(S.dateTemplate.replace("{date}", toPersianDigits(data.dateStr)), dateB, y + rh.title / 2, Math.round(S.titleSize * 0.7), S.dateCellText, S.titleBold, S.titleFontFamily, "center", false);
  y += rh.title;

  S.columnOrder.forEach((key) => {
    const b = colB[key];
    cell(b.x0, b.x1, y, y + rh.header, S.headerRowBg);
    text(S.columnLabels[key], b, y + rh.header / 2, S.headerSize, S.headerRowText, S.headerBold, S.headerFontFamily, S.columnAlign[key], false);
  });
  y += rh.header;

  for (const r of data.rows) {
    if (r.kind === "supervisor") {
      summaryRow(y, rh.supervisor, r, S.supervisorRowBg, S.supervisorRowText, S.supervisorBold, r.supervisorName);
      y += rh.supervisor;
      continue;
    }
    S.columnOrder.forEach((key) => {
      const b = colB[key];
      cell(b.x0, b.x1, y, y + rh.data, S.dataRowBg);
      if (key === "supervisor") text(r.supervisorName, b, y + rh.data / 2, S.bodySize, S.dataRowText, S.columnBold[key], S.bodyFontFamily, S.columnAlign[key], false);
      else if (key === "seller") text(r.name, b, y + rh.data / 2, S.bodySize, S.dataRowText, S.columnBold[key], S.bodyFontFamily, S.columnAlign[key], false);
      else text(valueOf(key, r), b, y + rh.data / 2, S.bodySize, S.dataNumberText, S.columnBold[key], S.bodyFontFamily, S.columnAlign[key], true);
    });
    y += rh.data;
  }

  summaryRow(y, rh.total, data.total, S.totalRowBg, S.totalRowText, true, "مجموع لاین");
  return canvas;
}

/* =========================================================
   مدیریت > تعریف فروشندگان
   ========================================================= */

const SELLER_LINE_LABEL = { line1: "لاین یک", line2: "لاین دو" };

function sellerCodeTaken(lineKey, code, exceptId) {
  const c = sellersCfg[lineKey];
  return c.sellers.some((s) => s.id !== exceptId && s.code === code) || c.supervisors.some((s) => s.id !== exceptId && s.ownCode === code);
}

function renderSellerDefinitions() {
  for (const lineKey of ["line1", "line2"]) {
    const slot = $(`#sellers-def-${lineKey}-slot`);
    if (!slot) continue;
    const c = sellersCfg[lineKey];
    const supOptions = (sel) => c.supervisors.map((s) => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");

    const supHtml = c.supervisors.length
      ? c.supervisors.map((s, i) => `
        <div class="order-item" style="gap:var(--space-2); flex-wrap:wrap">
          <span class="badge badge-neutral">${toPersianDigits(i + 1)}</span>
          <input type="text" value="${escapeHtml(s.name)}" placeholder="نام سرپرست" style="width:150px" data-sd-line="${lineKey}" data-sd-kind="sup" data-sd-id="${s.id}" data-sd-field="name" />
          <input type="text" inputmode="numeric" value="${escapeHtml(s.ownCode)}" placeholder="کد فروشندگی خودش (اختیاری)" style="width:190px" data-sd-line="${lineKey}" data-sd-kind="sup" data-sd-id="${s.id}" data-sd-field="ownCode" />
          <div class="move-btns">
            <button class="btn btn-icon btn-sm btn-secondary" data-sd-action="sup-up" data-sd-line="${lineKey}" data-sd-id="${s.id}" ${i === 0 ? "disabled" : ""}>${icon("chevron-up")}</button>
            <button class="btn btn-icon btn-sm btn-secondary" data-sd-action="sup-down" data-sd-line="${lineKey}" data-sd-id="${s.id}" ${i === c.supervisors.length - 1 ? "disabled" : ""}>${icon("chevron-down")}</button>
            <button class="btn btn-icon btn-sm btn-secondary" data-sd-action="sup-del" data-sd-line="${lineKey}" data-sd-id="${s.id}" title="حذف">${icon("trash")}</button>
          </div>
        </div>`).join("")
      : `<div class="field-hint">هنوز سرپرستی تعریف نشده است</div>`;

    const sellersHtml = c.supervisors.map((sup) => {
      const list = c.sellers.filter((s) => s.supervisorId === sup.id);
      if (!list.length) return "";
      return `<div class="card-section-label" style="margin-top:var(--space-3)">${escapeHtml(sup.name)}</div>` + list.map((s, i) => `
        <div class="order-item" style="gap:var(--space-2); flex-wrap:wrap">
          <input type="text" inputmode="numeric" value="${escapeHtml(s.code)}" placeholder="کد" style="width:90px" data-sd-line="${lineKey}" data-sd-kind="seller" data-sd-id="${s.id}" data-sd-field="code" />
          <input type="text" value="${escapeHtml(s.name)}" placeholder="نام فروشنده" style="width:170px" data-sd-line="${lineKey}" data-sd-kind="seller" data-sd-id="${s.id}" data-sd-field="name" />
          <select style="width:150px" data-sd-line="${lineKey}" data-sd-kind="seller" data-sd-id="${s.id}" data-sd-field="supervisorId">${supOptions(s.supervisorId)}</select>
          <div class="move-btns">
            <button class="btn btn-icon btn-sm btn-secondary" data-sd-action="seller-up" data-sd-line="${lineKey}" data-sd-id="${s.id}" ${i === 0 ? "disabled" : ""}>${icon("chevron-up")}</button>
            <button class="btn btn-icon btn-sm btn-secondary" data-sd-action="seller-down" data-sd-line="${lineKey}" data-sd-id="${s.id}" ${i === list.length - 1 ? "disabled" : ""}>${icon("chevron-down")}</button>
            <button class="btn btn-icon btn-sm btn-secondary" data-sd-action="seller-del" data-sd-line="${lineKey}" data-sd-id="${s.id}" title="حذف">${icon("trash")}</button>
          </div>
        </div>`).join("");
    }).join("");

    slot.innerHTML = `
      <div class="card-section-label">سرپرست‌ها</div>
      ${supHtml}
      <div class="row" style="margin-top:var(--space-3); flex-wrap:wrap; gap:var(--space-2)">
        <input type="text" id="sd-new-sup-name-${lineKey}" placeholder="نام سرپرست جدید" style="width:160px" />
        <input type="text" inputmode="numeric" id="sd-new-sup-code-${lineKey}" placeholder="کد فروشندگی خودش (اختیاری)" style="width:200px" />
        <button class="btn btn-secondary btn-sm" data-sd-action="sup-add" data-sd-line="${lineKey}">${icon("plus")} افزودن سرپرست</button>
      </div>

      <div class="card-section-label" style="margin-top:var(--space-5)">فروشنده‌ها</div>
      ${c.supervisors.length ? `
      <div class="row" style="flex-wrap:wrap; gap:var(--space-2)">
        <input type="text" inputmode="numeric" id="sd-new-seller-code-${lineKey}" placeholder="کد فروشنده" style="width:110px" />
        <input type="text" id="sd-new-seller-name-${lineKey}" placeholder="نام فروشنده" style="width:170px" />
        <select id="sd-new-seller-sup-${lineKey}" style="width:150px">${supOptions("")}</select>
        <button class="btn btn-primary btn-sm" data-sd-action="seller-add" data-sd-line="${lineKey}">${icon("plus")} افزودن فروشنده</button>
      </div>
      ${sellersHtml || `<div class="field-hint" style="margin-top:var(--space-3)">هنوز فروشنده‌ای تعریف نشده است</div>`}`
      : `<div class="field-hint">برای تعریف فروشنده، اول حداقل یک سرپرست بسازید</div>`}`;
  }
}

async function handleSellerDefAction(action, lineKey, id) {
  const c = sellersCfg[lineKey];
  const swapWithin = (arr, idx, delta) => {
    const j = idx + delta;
    if (j < 0 || j >= arr.length) return false;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    return true;
  };
  if (action === "sup-add") {
    const name = normalizeStr($(`#sd-new-sup-name-${lineKey}`).value);
    const rawCode = normalizeStr($(`#sd-new-sup-code-${lineKey}`).value);
    if (!name) return showToast("نام سرپرست را وارد کنید", "error");
    let ownCode = "";
    if (rawCode) {
      ownCode = normalizeTypedSellerCode(rawCode);
      if (!ownCode) return showToast("کد فروشندگی باید فقط عدد باشد", "error");
      if (sellerCodeTaken(lineKey, ownCode)) return showToast("این کد قبلاً در همین لاین تعریف شده است", "error");
    }
    c.supervisors.push({ id: sellersUid(), name, ownCode });
  } else if (action === "seller-add") {
    const code = normalizeTypedSellerCode($(`#sd-new-seller-code-${lineKey}`).value);
    const name = normalizeStr($(`#sd-new-seller-name-${lineKey}`).value);
    const supId = $(`#sd-new-seller-sup-${lineKey}`).value;
    if (!code) return showToast("کد فروشنده باید یک عدد باشد", "error");
    if (!name) return showToast("نام فروشنده را وارد کنید", "error");
    if (!c.supervisors.some((s) => s.id === supId)) return showToast("سرپرست را انتخاب کنید", "error");
    if (sellerCodeTaken(lineKey, code)) return showToast("این کد قبلاً در همین لاین تعریف شده است", "error");
    c.sellers.push({ id: sellersUid(), code, name, supervisorId: supId });
  } else if (action === "sup-up" || action === "sup-down") {
    swapWithin(c.supervisors, c.supervisors.findIndex((s) => s.id === id), action === "sup-up" ? -1 : 1);
  } else if (action === "seller-up" || action === "seller-down") {
    const me = c.sellers.find((s) => s.id === id);
    if (!me) return;
    const sameSup = c.sellers.map((s, i) => ({ s, i })).filter((x) => x.s.supervisorId === me.supervisorId);
    const pos = sameSup.findIndex((x) => x.s.id === id);
    const neighbor = sameSup[pos + (action === "seller-up" ? -1 : 1)];
    if (neighbor) {
      const a = c.sellers.findIndex((s) => s.id === id);
      [c.sellers[a], c.sellers[neighbor.i]] = [c.sellers[neighbor.i], c.sellers[a]];
    }
  } else if (action === "sup-del") {
    const sup = c.supervisors.find((s) => s.id === id);
    if (!sup) return;
    if (c.sellers.some((s) => s.supervisorId === id)) {
      return showToast("ابتدا فروشنده‌های این سرپرست را حذف کنید یا به سرپرست دیگری منتقل کنید", "error");
    }
    const ok = await confirmModal({ icon: "alert-triangle", title: "حذف سرپرست", body: `سرپرست «${escapeHtml(sup.name)}» حذف شود؟`, confirmLabel: "حذف" });
    if (!ok) return;
    c.supervisors = c.supervisors.filter((s) => s.id !== id);
  } else if (action === "seller-del") {
    const sel = c.sellers.find((s) => s.id === id);
    if (!sel) return;
    const ok = await confirmModal({ icon: "alert-triangle", title: "حذف فروشنده", body: `فروشنده «${escapeHtml(sel.name || sel.code)}» (کد ${escapeHtml(sel.code)}) حذف شود؟ هدف ماهانه‌اش هم پاک می‌شود.`, confirmLabel: "حذف" });
    if (!ok) return;
    c.sellers = c.sellers.filter((s) => s.id !== id);
    delete sellerTargets[lineKey][id];
    await persistSellerTargets();
  }
  await persistSellersCfg();
  renderSellerDefinitions();
  renderSellerTargets();
}

/** Inline edits (name / code / supervisor of an existing row). */
async function handleSellerDefChange(el) {
  const { sdLine: lineKey, sdKind: kind, sdId: id, sdField: field } = el.dataset;
  const c = sellersCfg[lineKey];
  const rec = kind === "sup" ? c.supervisors.find((s) => s.id === id) : c.sellers.find((s) => s.id === id);
  if (!rec) return;
  const v = el.value;
  if (field === "name") {
    if (!normalizeStr(v)) { showToast("نام نمی‌تواند خالی باشد", "error"); return renderSellerDefinitions(); }
    rec.name = normalizeStr(v);
  } else if (field === "code" || field === "ownCode") {
    if (field === "ownCode" && !normalizeStr(v)) rec.ownCode = "";
    else {
      const code = normalizeTypedSellerCode(v);
      if (!code) { showToast("کد باید فقط عدد باشد", "error"); return renderSellerDefinitions(); }
      if (sellerCodeTaken(lineKey, code, id)) { showToast("این کد قبلاً در همین لاین تعریف شده است", "error"); return renderSellerDefinitions(); }
      rec[field] = code;
    }
  } else if (field === "supervisorId") {
    if (!c.supervisors.some((s) => s.id === v)) return renderSellerDefinitions();
    rec.supervisorId = v;
  }
  await persistSellersCfg();
  renderSellerDefinitions();
  renderSellerTargets();
}

/* =========================================================
   مدیریت > اهداف فروشندگان
   ========================================================= */

function renderSellerTargets() {
  const wd = $("#sellers-working-days-input");
  if (wd) wd.value = state.workingDays > 0 ? state.workingDays : "";
  for (const lineKey of ["line1", "line2"]) {
    const slot = $(`#sellers-targets-${lineKey}-slot`);
    if (!slot) continue;
    const c = sellersCfg[lineKey];
    const body = c.supervisors.map((sup) => {
      const list = c.sellers.filter((s) => s.supervisorId === sup.id);
      if (!list.length) return "";
      return `<div class="card-section-label" style="margin-top:var(--space-3)">${escapeHtml(sup.name)}</div>` + list.map((s) => `
        <div class="order-item" style="gap:var(--space-3)">
          <span class="badge badge-neutral">${escapeHtml(toPersianDigits(s.code))}</span>
          <span class="name" style="flex:1">${escapeHtml(s.name || s.code)}</span>
          <input type="number" min="0" step="any" value="${sellerTargets[lineKey][s.id] != null ? sellerTargets[lineKey][s.id] : ""}" placeholder="هدف ماهانه" style="width:130px" data-st-line="${lineKey}" data-st-id="${s.id}" />
        </div>`).join("");
    }).join("");
    slot.innerHTML = body
      ? `${body}
         <div class="row" style="margin-top:var(--space-4)">
           <button class="btn btn-primary" data-st-save="${lineKey}">${icon("save")} ذخیره اهداف ${SELLER_LINE_LABEL[lineKey]}</button>
         </div>`
      : `<div class="field-hint">ابتدا در «تعریف فروشندگان» فروشنده‌های ${SELLER_LINE_LABEL[lineKey]} را تعریف کنید</div>`;
  }
}

async function handleSaveSellerTargets(lineKey) {
  const next = {};
  for (const inp of $all(`#sellers-targets-${lineKey}-slot [data-st-id]`)) {
    const raw = normalizeStr(inp.value);
    if (raw === "") continue;
    const v = toPersianSafeNumber(raw);
    if (isNaN(v) || v < 0) { showToast("هدف‌ها باید عدد مثبت باشند", "error"); return; }
    next[inp.dataset.stId] = v;
  }
  sellerTargets[lineKey] = next;
  await persistSellerTargets();
  showToast(`اهداف ${SELLER_LINE_LABEL[lineKey]} ذخیره شد`, "success");
}

async function handleSaveSellersWorkingDays() {
  const raw = $("#sellers-working-days-input").value;
  const v = toPersianSafeNumber(raw);
  if (normalizeStr(raw) !== "" && (isNaN(v) || !Number.isInteger(v) || v < 1 || v > 31)) {
    showToast("تعداد روز کاری باید یک عدد صحیح بین ۱ تا ۳۱ باشد", "error");
    return;
  }
  state.workingDays = normalizeStr(raw) === "" ? 0 : v;
  await setSetting("workingDays", state.workingDays);
  const other = $("#working-days-input");
  if (other) other.value = state.workingDays > 0 ? state.workingDays : "";
  showToast(state.workingDays > 0 ? `تعداد روز کاری ذخیره شد (${state.workingDays})` : "تعداد روز کاری پاک شد", "success");
}

/* =========================================================
   گزارش‌گیری > گزارش فروشندگان
   ========================================================= */

function sellerColumnExistsInRange(range, letter) {
  if (!letter || !range) return false;
  try { return XLSX.utils.decode_col(letter) <= range.e.c; } catch (e) { return false; }
}

function initSellersDateInputs() {
  const [jy, jm, jd] = todayJalali();
  if (!$("#sr-date-y").value) { $("#sr-date-y").value = jy; $("#sr-date-m").value = jm; $("#sr-date-d").value = jd; }
}

function sellersReadDate() {
  const y = Number($("#sr-date-y").value), m = Number($("#sr-date-m").value), d = Number($("#sr-date-d").value);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1 || d > 31 || y < 1300 || y > 1600) return null;
  return jalaliToStr(y, m, d);
}

function renderSellersWarnings(computed) {
  const slot = $("#sellers-warning-slot");
  const blocks = [];
  for (const lineKey of ["line1", "line2"]) {
    const w = computed[lineKey].warnings;
    for (const u of w.undefinedSellers) {
      blocks.push(`${SELLER_LINE_LABEL[lineKey]}: کد ${toPersianDigits(u.code)}${u.text ? ` («${escapeHtml(u.text)}»)` : ""} در فایل هست ولی در تعریف فروشندگان نیست — ${formatNumber(u.rows)} ردیف (${formatNumber(Math.round(u.sales))} کارتن) در گزارش حساب نشد.`);
    }
    if (w.noCodeRows) blocks.push(`${SELLER_LINE_LABEL[lineKey]}: ${formatNumber(w.noCodeRows)} ردیف بدون کد فروشنده بود و در گزارش حساب نشد.`);
  }
  slot.innerHTML = blocks.length
    ? `<div class="alert alert-warning" style="margin-top:var(--space-4); align-items:flex-start">${icon("alert-triangle")}<div>${blocks.map((b) => `<div>${b}</div>`).join("")}</div></div>`
    : "";
}

async function handleGenerateSellersReport() {
  if (!currentSalesRows) return showToast("ابتدا فایل فروش را انتخاب کنید", "error");
  const valid = validateColumnsExist(currentSalesRows.range, state.columnMap);
  if (!valid.ok) { showColumnValidationError(valid.field); return; }
  if (!getSellerColumn()) return showToast("ستون فروشنده را در تنظیمات (تطبیق ستون‌ها) مشخص کنید", "error");
  if (!sellerColumnExistsInRange(currentSalesRows.range, getSellerColumn())) return showToast("ستون فروشنده در این فایل وجود ندارد — تنظیمات ستون‌ها را بررسی کنید", "error");
  if (!state.lines.line1.excelValue || !state.lines.line2.excelValue) return showToast("ابتدا مقدار دقیق لاین‌ها را در تنظیمات وارد کنید", "error");
  const dateStr = sellersReadDate();
  if (!dateStr) return showToast("تاریخ معتبر وارد کنید", "error");
  const anyDefined = ["line1", "line2"].some((k) => sellersCfg[k].sellers.length);
  if (!anyDefined) return showToast("ابتدا در مدیریت > تعریف فروشندگان، فروشنده‌ها را تعریف کنید", "error");

  const computed = computeSellersReport({
    rows: currentSalesRows.rows,
    columnMap: state.columnMap,
    sellerColumn: getSellerColumn(),
    lines: state.lines,
    productMap: new Map(state.products.map((p) => [p.code, p])),
    groupsById: new Map(state.groups.map((g) => [g.id, g])),
    cfg: sellersCfg,
    targets: sellerTargets,
    workingDays: state.workingDays,
  });
  renderSellersWarnings(computed);
  lastSellersContext = { dateStr, results: {} };
  for (const lineKey of ["line1", "line2"]) {
    lastSellersContext.results[lineKey] = {
      lineLabel: SELLER_LINE_LABEL[lineKey],
      groups: computed[lineKey].groups,
      total: computed[lineKey].total,
      hasData: computed[lineKey].groups.length > 0,
      imageDataUrl: null,
    };
  }
  if (!state.workingDays) showToast("تعداد روز کاری وارد نشده — هدف روزانه و درصد تحقق «—» می‌شود", "warning");
  await renderSellersImages();
}

function sellersImageData(lineKey) {
  const r = lastSellersContext.results[lineKey];
  return { lineLabel: r.lineLabel, dateStr: lastSellersContext.dateStr, rows: assembleSellersRows(r.groups, sellersStyle), total: r.total };
}

async function renderSellersImages() {
  const out = $("#sellers-report-output");
  if (!lastSellersContext) { out.innerHTML = ""; return; }
  const block = (lineKey, dot) => `
    <div>
      <div class="line-block-title" style="margin-bottom:var(--space-3)"><span class="line-dot ${dot}"></span> ${lastSellersContext.results[lineKey].lineLabel}:</div>
      <div class="report-image-wrap" id="sr-image-wrap-${lineKey}"><span class="loading-row"><span class="spinner dark"></span> در حال ساخت تصویر...</span></div>
      <div class="report-image-actions" id="sr-actions-${lineKey}" style="display:none">
        <button class="btn btn-secondary btn-sm" data-sr-action="copy" data-sr-line="${lineKey}">${icon("copy")} کپی</button>
        <button class="btn btn-secondary btn-sm" data-sr-action="download" data-sr-line="${lineKey}">${icon("download")} دریافت تصویر</button>
        <button class="btn btn-secondary btn-sm" data-sr-action="share" data-sr-line="${lineKey}">${icon("share")} اشتراک‌گذاری</button>
      </div>
    </div>`;
  out.innerHTML = `<div class="stack" style="gap:var(--space-6); margin-top:var(--space-5)">${block("line1", "line1")}<div class="divider"></div>${block("line2", "line2")}</div>`;
  for (const lineKey of ["line1", "line2"]) {
    const r = lastSellersContext.results[lineKey];
    const wrap = $(`#sr-image-wrap-${lineKey}`);
    if (!r.hasData) {
      wrap.innerHTML = `<div class="field-hint">برای ${r.lineLabel} فروشنده‌ای تعریف نشده است.</div>`;
      continue;
    }
    try {
      const canvas = await drawSellersReportCanvas(sellersImageData(lineKey), sellersStyle);
      r.imageDataUrl = canvas.toDataURL("image/png");
      wrap.innerHTML = `<img src="${r.imageDataUrl}" alt="گزارش فروشندگان ${r.lineLabel}" style="width:100%;border-radius:var(--radius-md);border:1px solid var(--color-border);cursor:pointer" data-sr-image="${lineKey}" />`;
      $(`#sr-actions-${lineKey}`).style.display = "flex";
      $(`[data-sr-image="${lineKey}"]`, wrap).addEventListener("click", () => copySellersImage(lineKey));
    } catch (err) {
      wrap.innerHTML = `<div class="alert alert-warning">${icon("alert-triangle")}<span>ساخت تصویر با خطا مواجه شد</span></div>`;
    }
  }
  $all("[data-sr-action]", out).forEach((btn) => {
    btn.addEventListener("click", () => {
      const lineKey = btn.dataset.srLine;
      if (btn.dataset.srAction === "copy") copySellersImage(lineKey);
      else if (btn.dataset.srAction === "download") downloadSellersImage(lineKey);
      else shareSellersImage(lineKey);
    });
  });
}

async function copySellersImage(lineKey) {
  const dataUrl = lastSellersContext?.results?.[lineKey]?.imageDataUrl;
  if (!dataUrl) return;
  try {
    const blob = dataUrlToBlob(dataUrl);
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    showToast("تصویر گزارش کپی شد — آماده ارسال", "success");
  } catch (err) {
    showToast("کپی تصویر پشتیبانی نشد — از «دریافت تصویر» استفاده کنید", "warning");
  }
}
function sellersImageFileName(lineKey) {
  return `salesflow-sellers-${lineKey}-${lastSellersContext.dateStr.replace(/\//g, "-")}.png`;
}
function downloadSellersImage(lineKey) {
  const dataUrl = lastSellersContext?.results?.[lineKey]?.imageDataUrl;
  if (!dataUrl) return;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = sellersImageFileName(lineKey);
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function shareSellersImage(lineKey) {
  const r = lastSellersContext?.results?.[lineKey];
  if (!r?.imageDataUrl) return;
  const file = new File([dataUrlToBlob(r.imageDataUrl)], sellersImageFileName(lineKey), { type: "image/png" });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `گزارش فروشندگان ${r.lineLabel}` }); } catch (err) { /* cancelled */ }
  } else {
    showToast("اشتراک‌گذاری مستقیم پشتیبانی نمی‌شود — تصویر دانلود شد", "warning");
    downloadSellersImage(lineKey);
  }
}

/* =========================================================
   تنظیمات ظاهر گزارش فروشندگان (مودال با پیش‌نمایش زنده)
   ========================================================= */

const SELLERS_STYLE_SECTIONS = [
  { title: "عنوان و تاریخ", fields: [
    ["titleTemplate", "text", "متن عنوان — {line} با «لاین یک/دو» جایگزین می‌شود"],
    ["dateTemplate", "text", "متن تاریخ — {date} جایگزین می‌شود"],
    ["titleFontFamily", "font", "فونت عنوان"], ["titleSize", "num", "اندازه فونت عنوان", 8, 60], ["titleBold", "bool", "عنوان بولد باشد"],
    ["dateCellSpan", "num", "تعداد ستونِ خانه تاریخ", 1, 5],
    ["titleCellBg", "color", "رنگ پس‌زمینه عنوان"], ["titleCellText", "color", "رنگ متن عنوان"],
    ["dateCellBg", "color", "رنگ پس‌زمینه تاریخ"], ["dateCellText", "color", "رنگ متن تاریخ"],
    ["title", "height", "ارتفاع ردیف عنوان"],
  ] },
  { title: "هدر ستون‌ها", fields: [
    ["headerFontFamily", "font", "فونت هدر"], ["headerSize", "num", "اندازه فونت هدر", 8, 60], ["headerBold", "bool", "هدر بولد باشد"],
    ["headerRowBg", "color", "رنگ پس‌زمینه هدر"], ["headerRowText", "color", "رنگ متن هدر"], ["header", "height", "ارتفاع ردیف هدر"],
  ] },
  { title: "ردیف فروشنده‌ها", fields: [
    ["bodyFontFamily", "font", "فونت جدول"], ["bodySize", "num", "اندازه فونت جدول", 8, 60],
    ["dataRowBg", "color", "رنگ پس‌زمینه ردیف‌ها"], ["dataRowText", "color", "رنگ نام‌ها"], ["dataNumberText", "color", "رنگ عددها"], ["data", "height", "ارتفاع ردیف فروشنده"],
  ] },
  { title: "ردیف سرپرست", fields: [
    ["supervisorRowBg", "color", "رنگ پس‌زمینه"], ["supervisorRowText", "color", "رنگ متن"], ["supervisorBold", "bool", "بولد باشد"],
    ["supervisor", "height", "ارتفاع ردیف سرپرست"],
    ["supervisorRowPosition", "select", "جای سطر جمع سرپرست (در حالت عادی)", [["bottom", "زیر فروشنده‌هایش"], ["top", "بالای فروشنده‌هایش"]]],
  ] },
  { title: "ردیف مجموع لاین", fields: [["totalRowBg", "color", "رنگ پس‌زمینه"], ["totalRowText", "color", "رنگ متن"], ["total", "height", "ارتفاع ردیف مجموع"]] },
  { title: "جدول", fields: [["imageWidth", "num", "عرض تصویر (پیکسل)", 400, 2400], ["borderColor", "color", "رنگ خطوط"], ["borderWidth", "num", "ضخامت خطوط", 0, 6]] },
];

let sellersPendingColumnOrder = [];

function sellersStyleFieldHtml(S, f) {
  const [key, kind, label, a, b] = f;
  const id = `ss-${key}`;
  if (kind === "text") return `<div class="field" style="grid-column:1/-1"><label>${label}</label><input type="text" id="${id}" data-ss-key="${key}" data-ss-kind="text" value="${escapeHtml(S[key])}" /></div>`;
  if (kind === "num") return `<div class="field"><label>${label}</label><input type="number" id="${id}" data-ss-key="${key}" data-ss-kind="num" min="${a}" max="${b}" step="any" value="${S[key]}" /></div>`;
  if (kind === "color") return `<div class="field"><label>${label}</label><input type="color" id="${id}" data-ss-key="${key}" data-ss-kind="color" value="${S[key]}" /></div>`;
  if (kind === "bool") return `<div class="field"><label class="checkbox-label"><input type="checkbox" id="${id}" data-ss-key="${key}" data-ss-kind="bool" ${S[key] ? "checked" : ""} /> ${label}</label></div>`;
  if (kind === "font") return `<div class="field"><label>${label}</label><select id="${id}" data-ss-key="${key}" data-ss-kind="font">${FONT_FAMILY_OPTIONS.map(([v, t]) => `<option value="${escapeHtml(v)}" ${S[key] === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
  if (kind === "height") return `<div class="field"><label>${label}</label><input type="number" id="${id}" data-ss-key="${key}" data-ss-kind="height" min="20" max="120" value="${S.rowHeights[key]}" /></div>`;
  if (kind === "select") return `<div class="field"><label>${label}</label><select id="${id}" data-ss-key="${key}" data-ss-kind="select">${a.map(([v, t]) => `<option value="${v}" ${S[key] === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
  return "";
}

function renderSellersColumnRows(S) {
  const slot = $("#ss-columns-slot");
  if (!slot) return;
  slot.innerHTML = sellersPendingColumnOrder.map((key, i) => `
    <div class="order-item" style="gap:var(--space-2); flex-wrap:wrap">
      <span class="badge badge-neutral">${toPersianDigits(i + 1)}</span>
      <input type="text" value="${escapeHtml(S.columnLabels[key])}" style="width:150px" data-sc-key="${key}" data-sc-field="label" />
      <label class="checkbox-label" style="gap:4px">عرض <input type="number" min="5" max="100" value="${S.columnWeights[key]}" style="width:64px" data-sc-key="${key}" data-sc-field="weight" /></label>
      <select style="width:96px" data-sc-key="${key}" data-sc-field="align">
        ${[["right", "راست"], ["center", "وسط"], ["left", "چپ"]].map(([v, t]) => `<option value="${v}" ${S.columnAlign[key] === v ? "selected" : ""}>${t}</option>`).join("")}
      </select>
      <label class="checkbox-label"><input type="checkbox" ${S.columnBold[key] ? "checked" : ""} data-sc-key="${key}" data-sc-field="bold" /> بولد</label>
      <div class="move-btns">
        <button class="btn btn-icon btn-sm btn-secondary" data-sc-move="up" data-sc-key="${key}" ${i === 0 ? "disabled" : ""}>${icon("chevron-up")}</button>
        <button class="btn btn-icon btn-sm btn-secondary" data-sc-move="down" data-sc-key="${key}" ${i === sellersPendingColumnOrder.length - 1 ? "disabled" : ""}>${icon("chevron-down")}</button>
      </div>
    </div>`).join("");
}

function collectSellersStyleFromForm() {
  const raw = JSON.parse(JSON.stringify(sellersStyle));
  raw.rowHeights = { ...raw.rowHeights };
  $all("[data-ss-key]").forEach((el) => {
    const k = el.dataset.ssKey, kind = el.dataset.ssKind;
    if (kind === "bool") raw[k] = el.checked;
    else if (kind === "num") raw[k] = Number(el.value);
    else if (kind === "height") raw.rowHeights[k] = Number(el.value);
    else raw[k] = el.value;
  });
  raw.columnOrder = [...sellersPendingColumnOrder];
  raw.columnLabels = { ...raw.columnLabels }; raw.columnWeights = { ...raw.columnWeights };
  raw.columnAlign = { ...raw.columnAlign }; raw.columnBold = { ...raw.columnBold };
  $all("[data-sc-key][data-sc-field]").forEach((el) => {
    const k = el.dataset.scKey, f = el.dataset.scField;
    if (f === "label") raw.columnLabels[k] = el.value;
    else if (f === "weight") raw.columnWeights[k] = Number(el.value);
    else if (f === "align") raw.columnAlign[k] = el.value;
    else if (f === "bold") raw.columnBold[k] = el.checked;
  });
  const sk = $("#ss-sortKey"), sd = $("#ss-sortDir");
  if (sk) raw.sortKey = sk.value;
  if (sd) raw.sortDir = sd.value;
  return sanitizeSellersStyle(raw);
}

let sellersPreviewTimer = null;
function sellersSampleData(S) {
  const mk = (kind, sup, name, mt, sales, cov, days = 26) => {
    const pct = sellersPctOf(sales, mt, days);
    return { kind, supervisorName: sup, name, monthlyTarget: mt, dailyTarget: sellersDailyOf(mt, days), salesExact: sales, sales: Math.round(sales), pctExact: pct, pct: pct == null ? null : Math.round(pct), coverage: cov };
  };
  const g1 = { supervisor: mk("supervisor", "سرپرست اول", "سرپرست اول", 4400, 210, 22), sellers: [mk("seller", "سرپرست اول", "فروشنده الف", 2200, 94, 10), mk("seller", "سرپرست اول", "فروشنده ب", 2200, 116, 12)] };
  const g2 = { supervisor: mk("supervisor", "سرپرست دوم", "سرپرست دوم", 2600, 120, 9), sellers: [mk("seller", "سرپرست دوم", "فروشنده ج", 2600, 120, 9)] };
  const total = (() => { const t = 7000, s = 330, p = sellersPctOf(s, t, 26); return { monthlyTarget: t, dailyTarget: sellersDailyOf(t, 26), salesExact: s, sales: s, pctExact: p, pct: Math.round(p), coverage: 31 }; })();
  return { lineLabel: "لاین یک", dateStr: "1405/08/30", rows: assembleSellersRows([g1, g2], S), total };
}
async function renderSellersStylePreview() {
  const wrap = $("#sellers-style-preview");
  if (!wrap) return;
  try {
    const S = collectSellersStyleFromForm();
    const canvas = await drawSellersReportCanvas(sellersSampleData(S), S);
    wrap.innerHTML = `<img src="${canvas.toDataURL("image/png")}" alt="پیش‌نمایش" style="width:100%;border-radius:var(--radius-sm)" />`;
  } catch (err) {
    wrap.innerHTML = `<div class="alert alert-warning">${icon("alert-triangle")}<span>ساخت پیش‌نمایش با خطا مواجه شد</span></div>`;
  }
}
function scheduleSellersPreview() {
  clearTimeout(sellersPreviewTimer);
  sellersPreviewTimer = setTimeout(renderSellersStylePreview, 150);
}

function openSellersStyleModal() {
  const S = sellersStyle;
  sellersPendingColumnOrder = [...S.columnOrder];
  const region = $("#modal-region");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" style="max-width:920px; max-height:92vh; overflow-y:auto">
      <div class="modal-title">تنظیمات ظاهر — گزارش فروشندگان</div>
      <div class="card-subtitle" style="margin-bottom:var(--space-4)">یک تنظیم برای تصویر هر دو لاین</div>
      <div id="sellers-style-preview" class="report-image-wrap" style="margin-bottom:var(--space-4)"></div>
      <div id="sellers-style-form">
        ${SELLERS_STYLE_SECTIONS.map((sec) => `
          <div class="card-section-label" style="margin-top:var(--space-4)">${sec.title}</div>
          <div class="form-grid">${sec.fields.map((f) => sellersStyleFieldHtml(S, f)).join("")}</div>`).join("")}
        <div class="card-section-label" style="margin-top:var(--space-4)">ستون‌ها (از راست به چپ)</div>
        <div id="ss-columns-slot"></div>
        <div class="card-section-label" style="margin-top:var(--space-4)">مرتب‌سازی</div>
        <div class="field-hint" style="margin-bottom:var(--space-2)">با انتخاب یک ستون، همه سطرها (فروشنده‌ها و سطر سرپرست‌ها) با هم بر اساس آن ستون مرتب می‌شوند. در حالت «بدون مرتب‌سازی» به ترتیب سرپرست‌ها است.</div>
        <div class="form-grid">
          <div class="field"><label>مرتب‌سازی بر اساس</label>
            <select id="ss-sortKey"><option value="">بدون مرتب‌سازی (به ترتیب سرپرست)</option>${SELLERS_COLUMN_KEYS.map((k) => `<option value="${k}" ${S.sortKey === k ? "selected" : ""}>${escapeHtml(S.columnLabels[k])}</option>`).join("")}</select></div>
          <div class="field"><label>جهت</label>
            <select id="ss-sortDir"><option value="asc" ${S.sortDir === "asc" ? "selected" : ""}>کوچک به بزرگ</option><option value="desc" ${S.sortDir === "desc" ? "selected" : ""}>بزرگ به کوچک</option></select></div>
        </div>
      </div>
      <div class="modal-actions" style="margin-top:var(--space-5); flex-wrap:wrap">
        <button class="btn btn-secondary" id="ss-close">بستن</button>
        <button class="btn btn-secondary" id="ss-reset">${icon("trash")} بازگشت به پیش‌فرض</button>
        <button class="btn btn-primary" id="ss-save">${icon("save")} ذخیره</button>
      </div>
    </div>`;
  region.appendChild(overlay);
  renderSellersColumnRows(S);
  renderSellersStylePreview();

  const form = $("#sellers-style-form", overlay);
  form.addEventListener("input", scheduleSellersPreview);
  form.addEventListener("change", scheduleSellersPreview);
  form.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sc-move]");
    if (!btn) return;
    const key = btn.dataset.scKey, i = sellersPendingColumnOrder.indexOf(key);
    const j = i + (btn.dataset.scMove === "up" ? -1 : 1);
    if (j < 0 || j >= sellersPendingColumnOrder.length) return;
    const draft = collectSellersStyleFromForm();      // keep typed-in values while re-rendering
    [sellersPendingColumnOrder[i], sellersPendingColumnOrder[j]] = [sellersPendingColumnOrder[j], sellersPendingColumnOrder[i]];
    renderSellersColumnRows(draft);
    scheduleSellersPreview();
  });
  $("#ss-close", overlay).addEventListener("click", () => overlay.remove());
  $("#ss-reset", overlay).addEventListener("click", async () => {
    sellersStyle = sanitizeSellersStyle(null);
    await persistSellersStyle();
    overlay.remove();
    showToast("ظاهر گزارش فروشندگان به حالت پیش‌فرض بازگشت", "success");
    if (lastSellersContext) renderSellersImages();
  });
  $("#ss-save", overlay).addEventListener("click", async () => {
    sellersStyle = collectSellersStyleFromForm();
    await persistSellersStyle();
    overlay.remove();
    showToast("ظاهر گزارش فروشندگان ذخیره شد", "success");
    if (lastSellersContext) renderSellersImages();
  });
}

/* =========================================================
   اتصال به صفحه‌ها
   ========================================================= */

function switchReportSubtab(name) {
  $all("#report-subtabs .tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.rtab === name));
  $all(".rtab-panel").forEach((p) => (p.style.display = p.id === `rtab-${name}` ? "" : "none"));
}

/** Called by app.js whenever a مدیریت tab is shown. */
function onManagementTabShown(tabKey) {
  if (tabKey === "sellers-targets") renderSellerTargets();
}

function refreshSellersUI() {
  renderSellerDefinitions();
  renderSellerTargets();
  const el = $("#col-seller");
  if (el) el.value = getSellerColumn();
}

function initSellersFeature() {
  refreshSellersUI();
  initSellersDateInputs();

  // مدیریت > تعریف فروشندگان
  const defPanel = $("#mtab-sellers-def");
  defPanel.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sd-action]");
    if (btn) handleSellerDefAction(btn.dataset.sdAction, btn.dataset.sdLine, btn.dataset.sdId);
  });
  defPanel.addEventListener("change", (e) => {
    if (e.target.dataset && e.target.dataset.sdField) handleSellerDefChange(e.target);
  });

  // مدیریت > اهداف فروشندگان
  const tgtPanel = $("#mtab-sellers-targets");
  tgtPanel.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-st-save]");
    if (btn) handleSaveSellerTargets(btn.dataset.stSave);
  });
  $("#btn-save-sellers-working-days").addEventListener("click", handleSaveSellersWorkingDays);

  // گزارش‌گیری: زیرمنوها + گزارش فروشندگان
  $all("#report-subtabs .tab-btn").forEach((b) => b.addEventListener("click", () => switchReportSubtab(b.dataset.rtab)));
  $("#btn-sellers-generate").addEventListener("click", handleGenerateSellersReport);
  $("#btn-sellers-style").addEventListener("click", openSellersStyleModal);
}
