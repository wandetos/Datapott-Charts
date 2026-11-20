/* Datapott Charts — the renderer.
   One function, DP.renderChart(), draws a chart from a config + dataset.
   The editor (index.html) and the public viewer (chart.html) both use it,
   so what you see while editing is exactly what readers see. */
window.DP = window.DP || {};

(function (DP) {
  "use strict";

  DP.PALETTES = {
    datapott: ["#168232", "#1d81a2", "#e0614a", "#f2a93b", "#6c4f9e", "#18a1cd", "#8c8c8c", "#a7d38a", "#c2185b", "#4e342e"],
    classic: ["#1d9bd1", "#00dca6", "#fbcfb0", "#d4697c", "#a5aaa9", "#15607a", "#ff7a5a", "#7a6ad8", "#ffd166", "#06a77d"],
    colorblind: ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#999999", "#000000", "#882255"],
    mono: ["#168232", "#3c9a52", "#62b273", "#8bc996", "#b4dfbb", "#0f5c23", "#0a3d17", "#d6eedb", "#2f7d40", "#79bd86"],
  };

  DP.CHART_TYPES = [
    { id: "bar", name: "Bar Chart", icon: "▤" },
    { id: "stacked-bars", name: "Stacked Bars", icon: "▥" },
    { id: "grouped-bars", name: "Grouped Bars", icon: "☰" },
    { id: "column", name: "Column Chart", icon: "▮" },
    { id: "stacked-columns", name: "Stacked Columns", icon: "▦" },
    { id: "grouped-columns", name: "Grouped Columns", icon: "▯▮" },
    { id: "multiple-columns", name: "Multiple Columns", icon: "▮▮" },
    { id: "lines", name: "Lines", icon: "⟋" },
    { id: "multiple-lines", name: "Multiple Lines", icon: "⟋⟋" },
    { id: "area", name: "Area Chart", icon: "◭" },
    { id: "scatter", name: "Scatter Plot", icon: "⁘" },
    { id: "dot", name: "Dot Plot", icon: "•–•" },
    { id: "range", name: "Range Plot", icon: "●━●" },
    { id: "arrow", name: "Arrow Plot", icon: "→" },
    { id: "pie", name: "Pie Chart", icon: "◔" },
    { id: "donut", name: "Donut Chart", icon: "◯" },
    { id: "multiple-donuts", name: "Multiple Donuts", icon: "◯◯" },
    { id: "table", name: "Table", icon: "▦" },
    { id: "map-choropleth", name: "Choropleth Map", icon: "🗺" },
    { id: "map-symbols", name: "Symbol Map", icon: "◉" },
  ];

  DP.defaultConfig = function () {
    return {
      version: 1,
      id: "",
      folder: "",
      type: "column",
      title: "",
      description: "",
      notes: "",
      source: "",
      sourceUrl: "",
      byline: "",
      alt: "",
      data: { mode: "paste", text: "", url: "", live: true },
      transpose: false,
      firstRowLabel: true,
      columns: {},
      annotations: [], // { text, x, y (0–1 of the chart area), size, color, bold, box, align }
      refine: {
        labelCol: "",
        palette: "datapott",
        colors: {},
        colorBy: "auto", // auto | single | category | series
        sort: "none", // none | asc | desc
        valueLabels: true,
        decimals: "auto",
        height: 400,
        panelsPerRow: 3,
        panelHeight: 180,
        rotateLabels: "auto", // auto | always | never
        grid: true,
        tableBars: true,
        prefix: "",
        suffix: "",
        thousands: true,
        axisMin: "",
        axisMax: "",
        highlight: [],
        tooltips: true,
        labelMode: "all", // all | firstlast | last
        mapRegion: "world",
        mapValue: "",
        mapScheme: "greens",
        mapScale: "linear", // linear | quantize | quantile | breaks
        mapSteps: 5,
        mapBreaks: "",
        mapReverse: false,
        mapMaxRadius: 24,
      },
      layout: {
        dataDownload: true,
        attribution: true,
        dark: false,
        previewWidth: 630,
        logo: "datapott", // none | datapott | image
        logoUrl: "assets/logo.png",
      },
    };
  };

  /** Fill in missing keys from defaults (keeps old saved charts working). */
  DP.normalizeConfig = function (cfg) {
    const d = DP.defaultConfig();
    cfg = Object.assign({}, d, cfg || {});
    cfg.data = Object.assign({}, d.data, cfg.data || {});
    cfg.refine = Object.assign({}, d.refine, cfg.refine || {});
    cfg.layout = Object.assign({}, d.layout, cfg.layout || {});
    cfg.columns = cfg.columns || {};
    cfg.annotations = Array.isArray(cfg.annotations) ? cfg.annotations : [];
    return cfg;
  };

  /* ------------------------------ helpers ------------------------------ */
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => c && n.appendChild(c));
    return n;
  }
  DP.el = el;

  /** Number formatter for labels and tooltips: decimals, thousands, prefix and suffix. */
  function makeFormatter(cfgOrDecimals) {
    const r = typeof cfgOrDecimals === "object" ? cfgOrDecimals.refine : { decimals: cfgOrDecimals };
    const sep = r.thousands === false ? "" : ",";
    const auto = r.decimals === "auto" || r.decimals === "" || r.decimals == null;
    const f = d3.format(sep + (auto ? ".2~f" : "." + Number(r.decimals) + "f"));
    const pre = r.prefix || "", suf = r.suffix || "";
    return (v) => {
      if (v == null || Number.isNaN(v)) return "";
      const neg = v < 0;
      return (neg ? "\u2212" : "") + pre + f(Math.abs(v)) + suf;
    };
  }
  DP.makeFormatter = makeFormatter;

  /** Axis tick formatter: short numbers with prefix/suffix. */
  function axisFormatter(cfg) {
    const r = cfg.refine;
    const f = d3.format(r.thousands === false ? "~f" : ",~f");
    const pre = r.prefix || "", suf = r.suffix || "";
    return (v) => (v < 0 ? "\u2212" : "") + pre + f(Math.abs(v)) + suf;
  }

  DP.axisFormatter = axisFormatter;

  /** Value-axis options: custom min/max range and formatted ticks. */
  function valueAxis(cfg, values, extra) {
    const o = Object.assign({ grid: cfg.refine.grid, label: null, tickFormat: axisFormatter(cfg) }, extra || {});
    const lo = cfg.refine.axisMin, hi = cfg.refine.axisMax;
    if (lo !== "" && lo != null || hi !== "" && hi != null) {
      const ext = d3.extent(values.filter((v) => !Number.isNaN(v)));
      const min = lo !== "" && lo != null && !isNaN(Number(lo)) ? Number(lo) : Math.min(0, ext[0]);
      const max = hi !== "" && hi != null && !isNaN(Number(hi)) ? Number(hi) : ext[1];
      o.domain = [min, max];
      o.clamp = true;
    }
    return o;
  }

  /** Hover info for one data point (read by DP.attachHover). k = key used to link panels. */
  function hoverInfo(cfg, fmt, colors) {
    if (cfg.refine.tooltips === false) return undefined;
    return (d) => JSON.stringify({ k: String(d.label), h: String(d.label), s: d.series, v: fmt(d.value), c: colors.of(d) });
  }

  /** Which value labels to show: all, first & last, or last (per series). */
  function pickLabels(cfg, data) {
    const mode = cfg.refine.labelMode || "all";
    if (mode === "all") return data;
    const groups = d3.group(data.filter((d) => !Number.isNaN(d.value)), (d) => d.series);
    const out = [];
    groups.forEach((arr) => {
      if (mode !== "last" && arr.length) out.push(arr[0]);
      if (arr.length > 1 || mode === "last") out.push(arr[arr.length - 1]);
    });
    return out;
  }

  /** Year axes like Datawrapper: when years would need rotating, show only the first and last year. */
  function yearAxis(order, rotate) {
    if (!rotate || order.length < 4 || !order.every((l) => /^\d{4}$/.test(l))) return null;
    const first = order[0], last = order[order.length - 1];
    return { tickRotate: 0, tickFormat: (d) => (d === first || d === last ? d : "") };
  }


  /** Work out label column, value columns and sorted rows. */
  function prepare(cfg, ds) {
    const visible = ds.columns.filter((c) => !c.hidden);
    let labelCol = visible.find((c) => c.name === cfg.refine.labelCol);
    if (!labelCol) labelCol = visible.find((c) => c.type !== "number") || visible[0];
    const valueCols = visible.filter((c) => c !== labelCol && c.type === "number").map((c) => c.name);
    let rows = ds.rows.slice();
    const first = valueCols[0];
    if (first && cfg.refine.sort === "asc") rows.sort((a, b) => d3.ascending(a[first], b[first]));
    if (first && cfg.refine.sort === "desc") rows.sort((a, b) => d3.descending(a[first], b[first]));
    const label = labelCol ? labelCol.name : null;
    const long = [];
    rows.forEach((r) => valueCols.forEach((s) => long.push({ label: String(r[label]), series: s, value: r[s], row: r })));
    return { label, labelType: labelCol ? labelCol.type : "text", valueCols, rows, long };
  }

  const DIM = "#d4d4d4";
  function colorizer(cfg, p, multiSeries, hlScope) {
    const pal = DP.PALETTES[cfg.refine.palette] || DP.PALETTES.datapott;
    const custom = cfg.refine.colors || {};
    let mode = cfg.refine.colorBy;
    if (mode === "auto") mode = multiSeries ? "series" : "single";
    const cats = p.rows.map((r) => String(r[p.label]));
    const keys = mode === "series" ? p.valueCols : mode === "category" ? cats : ["__single__"];
    const map = {};
    keys.forEach((k, i) => (map[k] = custom[k] || pal[i % pal.length]));
    // hlScope "series": only whole series (lines) can be highlighted
    const hl = (cfg.refine.highlight || []).filter((h) => (hlScope !== "series" && cats.includes(h)) || p.valueCols.includes(h));
    return {
      mode,
      keys,
      map,
      of: (d) => {
        const label = d.label !== undefined ? d.label : String(d[p.label]);
        if (hl.length && !(hlScope !== "series" && hl.includes(label)) && !(d.series !== undefined && hl.includes(d.series))) return DIM;
        if (mode === "series") return map[d.series] || pal[0];
        if (mode === "category") return map[label] || pal[0];
        return map.__single__;
      },
    };
  }

  function legendNode(colors) {
    if (colors.mode === "single") return null;
    const box = el("div", { class: "dp-legend" });
    colors.keys.forEach((k) =>
      box.appendChild(el("span", { class: "dp-legend-item" }, [el("i", { style: "background:" + colors.map[k] }), document.createTextNode(k)]))
    );
    return box;
  }

  function textWidth(s, px) {
    return String(s).length * (px || 12) * 0.6 + 4;
  }

  function shouldRotate(cfg, labels, width) {
    if (cfg.refine.rotateLabels === "always") return true;
    if (cfg.refine.rotateLabels === "never") return false;
    const per = width / Math.max(1, labels.length);
    return d3.max(labels, (l) => textWidth(l, 11)) > per - 6;
  }

  const baseStyle = { fontFamily: "inherit", fontSize: "12px", overflow: "visible", background: "transparent" };

  /* ------------------------------ chart types ------------------------------ */
  function barChart(cfg, p, width, kind) {
    const fmt = makeFormatter(cfg);
    const order = p.rows.map((r) => String(r[p.label]));
    const marginLeft = Math.min(width * 0.4, d3.max(order, (l) => textWidth(l, 12)) + 14);
    const multi = kind !== "bar" && p.valueCols.length > 1;
    const colors = colorizer(cfg, p, multi);
    const data = kind === "bar" ? p.long.filter((d) => d.series === p.valueCols[0]) : p.long;
    const marks = [];
    let height;
    const H = hoverInfo(cfg, fmt, colors);
    const opt = { width, marginLeft, marginRight: 40, style: baseStyle, color: { type: "identity" }, x: valueAxis(cfg, data.map((d) => d.value), { axis: "top" }) };
    if (kind === "grouped-bars") {
      height = order.length * (p.valueCols.length * 14 + 14) + 40;
      Object.assign(opt, { fy: { domain: order, label: null }, y: { axis: null, domain: p.valueCols, padding: 0.1 } });
      marks.push(Plot.barX(data, { x: "value", y: "series", fy: "label", fill: colors.of, title: H }));
      if (cfg.refine.valueLabels) marks.push(Plot.text(pickLabels(cfg, data), { x: "value", y: "series", fy: "label", text: (d) => fmt(d.value), dx: 4, textAnchor: "start", fill: "currentColor" }));
    } else if (kind === "stacked-bars") {
      height = order.length * 30 + 40;
      Object.assign(opt, { y: { domain: order, label: null, padding: 0.25 } });
      marks.push(Plot.barX(data, Plot.stackX({ x: "value", y: "label", fill: colors.of, order: p.valueCols, z: "series", title: H })));
      if (cfg.refine.valueLabels) marks.push(Plot.text(pickLabels(cfg, data), Plot.stackX({ x: "value", y: "label", z: "series", order: p.valueCols, text: (d) => fmt(d.value), fill: "white" })));
    } else {
      height = order.length * 30 + 40;
      Object.assign(opt, { y: { domain: order, label: null, padding: 0.25 } });
      marks.push(Plot.barX(data, { x: "value", y: "label", fill: colors.of, title: H }));
      if (cfg.refine.valueLabels) {
        marks.push(Plot.text(pickLabels(cfg, data.filter((d) => !(d.value < 0))), { x: "value", y: "label", text: (d) => fmt(d.value), dx: 4, textAnchor: "start", fill: "currentColor" }));
        marks.push(Plot.text(data.filter((d) => d.value < 0), { x: "value", y: "label", text: (d) => fmt(d.value), dx: -4, textAnchor: "end", fill: "currentColor" }));
      }
    }
    marks.push(Plot.ruleX([0]));
    opt.height = height;
    opt.marks = marks;
    return { node: Plot.plot(opt), colors };
  }

  function columnChart(cfg, p, width, kind) {
    const fmt = makeFormatter(cfg);
    const order = p.rows.map((r) => String(r[p.label]));
    const multi = kind !== "column" && p.valueCols.length > 1;
    const colors = colorizer(cfg, p, multi);
    const data = kind === "column" ? p.long.filter((d) => d.series === p.valueCols[0]) : p.long;
    const rotate = shouldRotate(cfg, order, width - 60);
    const marginBottom = rotate && !yearAxis(order, rotate) ? Math.min(240, d3.max(order, (l) => textWidth(l, 11)) + 10) : 30;
    const opt = {
      width, height: Number(cfg.refine.height) || 400, marginBottom, marginTop: 24, style: baseStyle,
      color: { type: "identity" },
      y: valueAxis(cfg, data.map((d) => d.value)),
    };
    const H = hoverInfo(cfg, fmt, colors);
    const yAx = yearAxis(order, rotate);
    const marks = [];
    if (kind === "grouped-columns") {
      Object.assign(opt, { fx: { domain: order, label: null, tickRotate: rotate ? -90 : 0, padding: 0.15 }, x: { axis: null, domain: p.valueCols, padding: 0.05 } });
      marks.push(Plot.barY(data, { x: "series", y: "value", fx: "label", fill: colors.of, title: H }));
      if (cfg.refine.valueLabels) marks.push(Plot.text(pickLabels(cfg, data), { x: "series", y: "value", fx: "label", text: (d) => fmt(d.value), dy: -6, fontSize: 10, fill: "currentColor" }));
      opt.fx.axis = "bottom";
    } else if (kind === "stacked-columns") {
      Object.assign(opt, { x: Object.assign({ domain: order, label: null, tickRotate: rotate ? -90 : 0, padding: 0.25 }, yAx || {}) });
      marks.push(Plot.barY(data, Plot.stackY({ x: "label", y: "value", fill: colors.of, z: "series", order: p.valueCols, title: H })));
      if (cfg.refine.valueLabels) marks.push(Plot.text(pickLabels(cfg, data), Plot.stackY({ x: "label", y: "value", z: "series", order: p.valueCols, text: (d) => fmt(d.value), fill: "white", fontSize: 10 })));
    } else {
      Object.assign(opt, { x: Object.assign({ domain: order, label: null, tickRotate: rotate ? -90 : 0, padding: 0.25 }, yAx || {}) });
      marks.push(Plot.barY(data, { x: "label", y: "value", fill: colors.of, title: H }));
      if (cfg.refine.valueLabels) {
        marks.push(Plot.text(pickLabels(cfg, data.filter((d) => !(d.value < 0))), { x: "label", y: "value", text: (d) => fmt(d.value), dy: -6, fill: "currentColor" }));
        marks.push(Plot.text(data.filter((d) => d.value < 0), { x: "label", y: "value", text: (d) => fmt(d.value), dy: 8, fill: "currentColor" }));
      }
    }
    marks.push(Plot.ruleY([0]));
    opt.marks = marks;
    return { node: Plot.plot(opt), colors };
  }

  /** "Multiple Columns" — one small panel per value column (like your CPI chart). */
  function multiplePanels(cfg, p, width, kind) {
    const fmt = makeFormatter(cfg);
    const perRow = Math.max(1, Math.min(Number(cfg.refine.panelsPerRow) || 3, width < 500 ? 2 : 12));
    const gap = 18;
    const panelW = Math.floor((width - gap * (perRow - 1)) / perRow);
    const grid = el("div", { class: "dp-panels", style: `grid-template-columns:repeat(${perRow}, ${panelW}px);gap:${gap}px` });
    const order = p.rows.map((r) => String(r[p.label]));
    let colors;
    if (kind === "multiple-columns") {
      const cfg2 = Object.assign({}, cfg, { refine: Object.assign({}, cfg.refine, { colorBy: cfg.refine.colorBy === "auto" ? "category" : cfg.refine.colorBy }) });
      colors = colorizer(cfg2, p, false);
    } else {
      colors = colorizer(cfg, p, true, "series");
    }
    const rotate = kind === "multiple-columns" && shouldRotate(cfg, order, panelW - 30);
    const yAx = yearAxis(order, rotate);
    const marginBottom = rotate && !yAx ? Math.min(220, d3.max(order, (l) => textWidth(l, 10)) + 10) : 28;
    const H = hoverInfo(cfg, fmt, colors);
    const hlStroke = (s) => colors.of({ series: s, label: "\u0000" });
    p.valueCols.forEach((s) => {
      const data = p.long.filter((d) => d.series === s);
      let plot;
      if (kind === "multiple-columns") {
        plot = Plot.plot({
          width: panelW, height: Number(cfg.refine.panelHeight) + marginBottom, marginBottom, marginLeft: 34, marginTop: 18, style: Object.assign({}, baseStyle, { fontSize: "10px" }),
          color: { type: "identity" },
          x: Object.assign({ domain: order, label: null, tickRotate: rotate ? -90 : 0, padding: 0.2 }, yAx || {}),
          y: valueAxis(cfg, data.map((d) => d.value), { ticks: 4 }),
          marks: [
            Plot.barY(data, { x: "label", y: "value", fill: (d) => colors.of(d), title: H }),
            cfg.refine.valueLabels ? Plot.text(pickLabels(cfg, data.filter((d) => !(d.value < 0))), { x: "label", y: "value", text: (d) => fmt(d.value), dy: -6, fontSize: 10, fill: "currentColor" }) : null,
            cfg.refine.valueLabels ? Plot.text(data.filter((d) => d.value < 0), { x: "label", y: "value", text: (d) => fmt(d.value), dy: 8, fontSize: 10, fill: "currentColor" }) : null,
            Plot.ruleY([0]),
          ],
        });
      } else {
        const x = xAccessor(p);
        plot = Plot.plot({
          width: panelW, height: Number(cfg.refine.panelHeight) + 30, marginLeft: 34, marginTop: 14, style: Object.assign({}, baseStyle, { fontSize: "10px" }),
          color: { type: "identity" },
          x: Object.assign(xScale(p), xScale(p).type === "point" && order.length * 40 > panelW ? { tickFormat: () => "" } : {}),
          y: valueAxis(cfg, data.map((d) => d.value), { ticks: 4 }),
          marks: [
            Plot.lineY(p.long, { x: (d) => x(d.row), y: "value", z: "series", stroke: "#cfcfcf", strokeWidth: 1 }),
            Plot.lineY(data, { x: (d) => x(d.row), y: "value", stroke: hlStroke(s), strokeWidth: 2.5 }),
            H ? Plot.dot(data.filter((d) => !Number.isNaN(d.value)), { x: (d) => x(d.row), y: "value", r: 6, fill: hlStroke(s), fillOpacity: 0, className: "dp-ghost", title: H }) : null,
          ],
        });
      }
      grid.appendChild(el("div", { class: "dp-panel" }, [el("div", { class: "dp-panel-title", text: s }), plot]));
    });
    return { node: grid, colors };
  }

  function xAccessor(p) {
    if (p.labelType === "number") return (r) => r[p.label];
    if (p.labelType === "date") return (r) => new Date(String(r[p.label]).length === 4 ? r[p.label] + "-01-01" : r[p.label]);
    // year-like text such as "2020"
    if (p.rows.every((r) => /^\d{4}$/.test(String(r[p.label])))) return (r) => Number(r[p.label]);
    return (r) => String(r[p.label]);
  }
  function xScale(p, cfg, width) {
    const isYear = p.rows.every((r) => /^\d{4}$/.test(String(r[p.label])));
    if (p.labelType === "number" || isYear) return { label: null, tickFormat: isYear ? "d" : undefined, ticks: 6 };
    if (p.labelType === "date") return { label: null, type: "utc", ticks: 6 };
    const domain = p.rows.map((r) => String(r[p.label]));
    const rotate = cfg && width ? shouldRotate(cfg, domain, width - 60) : false;
    return { label: null, type: "point", domain, tickRotate: rotate ? -90 : 0 };
  }

  function lineChart(cfg, p, width, kind) {
    const fmt = makeFormatter(cfg);
    const colors = colorizer(cfg, p, true, "series");
    const x = xAccessor(p);
    const hlSet = new Set(cfg.refine.highlight || []);
    const data = p.long.map((d) => Object.assign({ x: x(d.row) }, d)).filter((d) => !Number.isNaN(d.value))
      .sort((a, b) => (kind === "area" ? 0 : (hlSet.has(a.series) ? 1 : 0) - (hlSet.has(b.series) ? 1 : 0)));
    const last = p.valueCols.map((s) => data.filter((d) => d.series === s).pop()).filter(Boolean);
    const maxName = d3.max(p.valueCols, (s) => textWidth(s, 11)) || 0;
    const xs = xScale(p, cfg, width);
    const marks = [];
    if (kind === "area") {
      marks.push(Plot.areaY(data, { x: "x", y: "value", z: "series", fill: colors.of, order: p.valueCols, fillOpacity: 0.9 }));
      marks.push(Plot.ruleY([0]));
    } else {
      marks.push(Plot.ruleY([0], { stroke: "#ccc" }));
      marks.push(Plot.lineY(data, { x: "x", y: "value", z: "series", stroke: colors.of, strokeWidth: 2.5 }));
      marks.push(Plot.dot(data, { x: "x", y: "value", fill: colors.of, r: data.length < 120 ? 3 : 0 }));
      if (cfg.refine.valueLabels) {
        marks.push(Plot.text(pickLabels(cfg, data), { x: "x", y: "value", text: (d) => fmt(d.value), dy: -9, fontSize: 10, fill: colors.of }));
      }
      marks.push(Plot.text(last, { x: "x", y: "value", text: "series", dx: 8, textAnchor: "start", fill: colors.of, fontWeight: "bold" }));
    }
    const H = hoverInfo(cfg, fmt, colors);
    if (H && kind === "area") marks.push(Plot.dot(data, Plot.stackY({ x: "x", y: "value", z: "series", order: p.valueCols, r: 10, fill: colors.of, fillOpacity: 0, className: "dp-ghost", title: H })));
    else if (H) marks.push(Plot.dot(data, { x: "x", y: "value", r: 7, fill: colors.of, fillOpacity: 0, className: "dp-ghost", title: H }));
    const node = Plot.plot({
      width, height: Number(cfg.refine.height) || 400, marginRight: kind === "area" ? 20 : Math.min(180, maxName + 20), marginTop: 20,
      marginBottom: xs.tickRotate ? Math.min(240, d3.max(xs.domain, (l) => textWidth(l, 11)) + 10) : 30,
      style: baseStyle, color: { type: "identity" },
      x: xs, y: valueAxis(cfg, data.map((d) => d.value)),
      marks,
    });
    return { node, colors };
  }

  function scatterChart(cfg, p, width) {
    const fmt = makeFormatter(cfg);
    const [xs, ys] = p.valueCols;
    const colors = colorizer(cfg, p, false);
    const rows = p.rows.filter((r) => !Number.isNaN(r[xs]) && !Number.isNaN(r[ys]));
    const node = Plot.plot({
      width, height: Number(cfg.refine.height) || 400, grid: cfg.refine.grid, style: baseStyle, color: { type: "identity" },
      x: { label: xs + " →", tickFormat: axisFormatter(cfg) }, y: { label: "↑ " + ys, tickFormat: axisFormatter(cfg) },
      marks: [
        Plot.dot(rows, { x: xs, y: ys, r: 5, fill: (r) => colors.of(r), fillOpacity: 0.85, title: cfg.refine.tooltips === false ? undefined : (r) => JSON.stringify({ k: String(r[p.label]), h: String(r[p.label]), rows: [[xs, fmt(r[xs]), colors.of(r)], [ys, fmt(r[ys]), colors.of(r)]] }) }),
        cfg.refine.valueLabels ? Plot.text(rows, { x: xs, y: ys, text: (r) => String(r[p.label]), dy: -10, fontSize: 10, fill: "currentColor" }) : null,
      ],
    });
    return { node, colors };
  }

  function dotRangeChart(cfg, p, width, kind) {
    const fmt = makeFormatter(cfg);
    const order = p.rows.map((r) => String(r[p.label]));
    const marginLeft = Math.min(width * 0.4, d3.max(order, (l) => textWidth(l, 12)) + 14);
    const colors = colorizer(cfg, p, true);
    const [a, b] = p.valueCols;
    const marks = [];
    if (kind === "dot") {
      const spans = p.rows.map((r) => ({ label: String(r[p.label]), min: d3.min(p.valueCols, (s) => r[s]), max: d3.max(p.valueCols, (s) => r[s]) }));
      marks.push(Plot.link(spans, { x1: "min", x2: "max", y1: "label", y2: "label", stroke: "#ccc", strokeWidth: 2 }));
      marks.push(Plot.dot(p.long, { x: "value", y: "label", fill: colors.of, r: 6, title: hoverInfo(cfg, fmt, colors) }));
    } else {
      const rows = p.rows.map((r) => ({ label: String(r[p.label]), a: r[a], b: r[b] }));
      if (kind === "arrow") {
        marks.push(Plot.arrow(rows, { x1: "a", x2: "b", y1: "label", y2: "label", stroke: (d) => (d.b >= d.a ? colors.map[b] || "#168232" : colors.map[a] || "#e0614a"), strokeWidth: 2.5, headLength: 8,
          title: cfg.refine.tooltips === false ? undefined : (d) => JSON.stringify({ k: d.label, h: d.label, rows: [[a, fmt(d.a), colors.map[a]], [b, fmt(d.b), colors.map[b]], ["Change", fmt(d.b - d.a), ""]] }) }));
      } else {
        marks.push(Plot.link(rows, { x1: "a", x2: "b", y1: "label", y2: "label", stroke: "#bbb", strokeWidth: 3 }));
        const dimmed = (d, key) => colors.of({ label: d.label, series: key });
        marks.push(Plot.dot(rows, { x: "a", y: "label", fill: (d) => dimmed(d, a), r: 6, title: cfg.refine.tooltips === false ? undefined : (d) => JSON.stringify({ k: d.label, h: d.label, rows: [[a, fmt(d.a), dimmed(d, a)], [b, fmt(d.b), dimmed(d, b)]] }) }));
        marks.push(Plot.dot(rows, { x: "b", y: "label", fill: (d) => dimmed(d, b), r: 6 }));
      }
      if (cfg.refine.valueLabels) {
        const up = rows.filter((d) => d.a <= d.b), down = rows.filter((d) => d.a > d.b);
        const lab = (data, key, side) => Plot.text(pickLabels(cfg, data), { x: key, y: "label", text: (d) => fmt(d[key]), dx: side < 0 ? -10 : 10, textAnchor: side < 0 ? "end" : "start", fill: "currentColor" });
        marks.push(lab(up, "a", -1), lab(up, "b", 1), lab(down, "a", 1), lab(down, "b", -1));
      }
    }
    const node = Plot.plot({
      width, height: order.length * 30 + 50, marginLeft: marginLeft + (cfg.refine.valueLabels && kind !== "dot" ? 36 : 0), marginRight: 50, style: baseStyle, color: { type: "identity" },
      x: valueAxis(cfg, p.long.map((d) => d.value), { axis: "top", inset: 40 }), y: { domain: order, label: null },
      marks,
    });
    return { node, colors };
  }

  function pieSvg(values, labels, colors, size, inner, fmt, showLabels, series) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", `${-size / 2} ${-size / 2} ${size} ${size}`);
    const r = size / 2 - 4;
    const arcs = d3.pie().sort(null)(values.map((v) => (Number.isNaN(v) || v < 0 ? 0 : v)));
    const arc = d3.arc().innerRadius(r * inner).outerRadius(r);
    const total = d3.sum(arcs, (a) => a.data);
    arcs.forEach((a, i) => {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", arc(a));
      path.setAttribute("fill", colors[i]);
      path.setAttribute("stroke", "white");
      path.setAttribute("stroke-width", "1.5");
      const t = document.createElementNS(ns, "title");
      t.textContent = JSON.stringify({ k: labels[i], h: labels[i], s: series, v: fmt(a.data), c: colors[i] });
      path.appendChild(t);
      svg.appendChild(path);
      if (showLabels && a.endAngle - a.startAngle > 0.25) {
        const [cx, cy] = d3.arc().innerRadius(r * Math.max(inner, 0.45)).outerRadius(r).centroid(a);
        const tx = document.createElementNS(ns, "text");
        tx.setAttribute("x", cx);
        tx.setAttribute("y", cy);
        tx.setAttribute("text-anchor", "middle");
        tx.setAttribute("dominant-baseline", "middle");
        tx.setAttribute("fill", "white");
        tx.setAttribute("font-size", "11");
        tx.setAttribute("font-weight", "bold");
        tx.textContent = fmt(a.data);
        svg.appendChild(tx);
      }
    });
    if (inner > 0) {
      const tx = document.createElementNS(ns, "text");
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("dominant-baseline", "middle");
      tx.setAttribute("font-size", Math.round(size / 9));
      tx.setAttribute("font-weight", "bold");
      tx.setAttribute("fill", "currentColor");
      tx.textContent = fmt(total);
      svg.appendChild(tx);
    }
    return svg;
  }

  function pieChart(cfg, p, width, kind) {
    const fmt = makeFormatter(cfg);
    const cfg2 = Object.assign({}, cfg, { refine: Object.assign({}, cfg.refine, { colorBy: "category" }) });
    const colors = colorizer(cfg2, p, false);
    const labels = p.rows.map((r) => String(r[p.label]));
    const cols = labels.map((l) => colors.of({ label: l }));
    const inner = kind === "pie" ? 0 : 0.55;
    if (kind === "multiple-donuts") {
      const perRow = Math.max(1, Math.min(Number(cfg.refine.panelsPerRow) || 3, 8));
      const size = Math.min(220, Math.floor((width - 16 * (perRow - 1)) / perRow));
      const grid = el("div", { class: "dp-panels", style: `grid-template-columns:repeat(${perRow}, ${size}px);gap:16px` });
      p.valueCols.forEach((s) => {
        grid.appendChild(el("div", { class: "dp-panel" }, [el("div", { class: "dp-panel-title", text: s }), pieSvg(p.rows.map((r) => r[s]), labels, cols, size, inner, fmt, cfg.refine.valueLabels, s)]));
      });
      return { node: grid, colors };
    }
    const size = Math.min(width, Number(cfg.refine.height) || 400, 420);
    const s = p.valueCols[0];
    return { node: el("div", { class: "dp-pie-wrap" }, [pieSvg(p.rows.map((r) => r[s]), labels, cols, size, inner, fmt, cfg.refine.valueLabels, s)]), colors };
  }

  function tableChart(cfg, ds) {
    const fmt = makeFormatter(cfg);
    const cols = ds.columns.filter((c) => !c.hidden);
    const table = el("table", { class: "dp-table" });
    const thead = el("thead");
    const tr = el("tr");
    let sortCol = null, sortDir = 1;
    const tbody = el("tbody");
    const pal = DP.PALETTES[cfg.refine.palette] || DP.PALETTES.datapott;
    const extents = {};
    const isYear = (c) => c.type === "number" && (/year|yr/i.test(c.name) || ds.rows.every((r) => Number.isNaN(r[c.name]) || (Number.isInteger(r[c.name]) && r[c.name] >= 1000 && r[c.name] <= 2999)));
    cols.forEach((c) => c.type === "number" && (extents[c.name] = d3.extent(ds.rows, (r) => r[c.name])));
    function fill() {
      tbody.innerHTML = "";
      let rows = ds.rows.slice();
      if (sortCol) rows.sort((a, b) => sortDir * (cols.find((c) => c.name === sortCol).type === "number" ? d3.ascending(a[sortCol], b[sortCol]) : String(a[sortCol]).localeCompare(String(b[sortCol]))));
      rows.forEach((r) => {
        const row = el("tr");
        cols.forEach((c) => {
          if (isYear(c)) row.appendChild(el("td", { text: Number.isNaN(r[c.name]) ? "" : String(r[c.name]) }));
          else if (c.type === "number") {
            const td = el("td", { class: "num" });
            if (cfg.refine.tableBars && extents[c.name][1] > 0) {
              const w = Math.max(0, (r[c.name] / Math.max(Math.abs(extents[c.name][0]), extents[c.name][1])) * 100);
              td.appendChild(el("span", { class: "dp-cellbar", style: `width:${w}%;background:${cfg.refine.colors[c.name] || pal[0]}` }));
            }
            td.appendChild(el("span", { class: "dp-cellval", text: fmt(r[c.name]) }));
            row.appendChild(td);
          } else row.appendChild(el("td", { text: r[c.name] }));
        });
        tbody.appendChild(row);
      });
    }
    cols.forEach((c) => {
      const th = el("th", { class: c.type === "number" ? "num" : "", text: c.name });
      th.onclick = () => {
        sortDir = sortCol === c.name ? -sortDir : -1;
        sortCol = c.name;
        fill();
      };
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    table.appendChild(tbody);
    fill();
    return { node: el("div", { class: "dp-table-wrap" }, [table]), colors: { mode: "single" } };
  }

  /* ------------------------------ hover tooltips ------------------------------ */
  /**
   * Instant tooltips. Each hoverable mark carries a JSON <title> (from the chart code).
   * We turn it into data, then one tooltip box follows the pointer.
   * In multi-panel charts the same category lights up in every panel with its value.
   */
  DP.attachHover = function (body) {
    const items = [];
    body.querySelectorAll("svg title").forEach((t) => {
      let info;
      try { info = JSON.parse(t.textContent); } catch (e) { return; }
      const node = t.parentNode;
      t.remove();
      node.__dp = info;
      node.setAttribute("data-dp", "");
      items.push(node);
    });
    if (!items.length) return;
    const linked = body.dataset.linked === "1";
    const tip = el("div", { class: "dp-tip" });
    body.appendChild(tip);
    const floating = [];
    let current = null;

    function clear() {
      if (!current) return;
      body.classList.remove("dp-hovering");
      items.forEach((i) => i.classList.remove("dp-on"));
      floating.forEach((f) => f.remove());
      floating.length = 0;
      tip.style.display = "none";
      current = null;
    }
    function rowHtml(name, value, color, bold) {
      return `<div class="dp-tip-row${bold ? " b" : ""}">${color ? `<i style="background:${color}"></i>` : ""}<span>${escapeHtml(name)}</span><b>${escapeHtml(value)}</b></div>`;
    }
    function open(target) {
      clear();
      current = target;
      const info = target.__dp;
      const same = items.filter((i) => i.__dp.k === info.k);
      body.classList.add("dp-hovering");
      same.forEach((i) => i.classList.add("dp-on"));
      target.classList.add("dp-on");
      let html = `<div class="dp-tip-head">${escapeHtml(info.h)}</div>`;
      if (info.rows) html += info.rows.map((r) => rowHtml(r[0], r[1], r[2])).join("");
      else if (!linked && same.length > 1) html += same.map((i) => rowHtml(i.__dp.s, i.__dp.v, i.__dp.c, i === target)).join("");
      else html += rowHtml(info.s || "", info.v, info.c);
      tip.innerHTML = html;
      tip.style.display = "block";
      if (linked) {
        const box = body.getBoundingClientRect();
        same.forEach((i) => {
          if (!/^(rect|circle)$/.test(i.tagName)) return;
          const b = i.getBoundingClientRect();
          const lab = el("div", { class: "dp-linklabel" + (i === target ? " b" : ""), text: i.__dp.v });
          lab.style.left = b.left + b.width / 2 - box.left + "px";
          lab.style.top = b.top - box.top + "px";
          body.appendChild(lab);
          floating.push(lab);
        });
      }
    }
    function move(e) {
      const box = body.getBoundingClientRect();
      let x = e.clientX - box.left + 14, y = e.clientY - box.top + 14;
      if (x + tip.offsetWidth > box.width) x = e.clientX - box.left - tip.offsetWidth - 14;
      if (y + tip.offsetHeight > box.height) y = Math.max(0, e.clientY - box.top - tip.offsetHeight - 14);
      tip.style.left = Math.max(0, x) + "px";
      tip.style.top = y + "px";
    }
    body.addEventListener("pointermove", (e) => {
      const t = e.target && e.target.closest ? e.target.closest("[data-dp]") : null;
      if (t && t.__dp) {
        if (t !== current) open(t);
        move(e);
      } else clear();
    });
    body.addEventListener("pointerleave", clear);
    // Phones and tablets: tap a bar to see its tooltip, tap elsewhere to close
    body.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      const t = e.target.closest && e.target.closest("[data-dp]");
      if (t && t.__dp) { open(t); move(e); } else clear();
    });
  };
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ------------------------------ text annotations ------------------------------ */
  /** Notes placed on the chart. Position is stored as a share (0–1) of the chart area. */
  function drawAnnotations(body, cfg, opts) {
    const list = cfg.annotations || [];
    list.forEach((a, i) => {
      if (!a || !a.text) return;
      const n = el("div", { class: `dp-anno dp-anno-${a.size || "m"}${a.bold ? " b" : ""}${a.box ? " box" : ""}`, "data-anno": i, text: a.text });
      n.style.left = (Number(a.x) || 0) * 100 + "%";
      n.style.top = (Number(a.y) || 0) * 100 + "%";
      if (a.color) n.style.color = a.color;
      n.style.textAlign = a.align || "left";
      if (a.align === "center") n.style.transform = "translateX(-50%)";
      if (a.align === "right") n.style.transform = "translateX(-100%)";
      body.appendChild(n);
    });
    if (!opts || !opts.editable || !list.length) return;
    body.classList.add("dp-anno-edit");
    // Editor only: drag notes to move them
    body.addEventListener("pointerdown", (e) => {
      const n = e.target.closest && e.target.closest("[data-anno]");
      if (!n) return;
      e.preventDefault();
      const box = body.getBoundingClientRect();
      const start = n.getBoundingClientRect();
      const a = list[Number(n.dataset.anno)];
      const shift = a.align === "center" ? start.width / 2 : a.align === "right" ? start.width : 0;
      const offX = e.clientX - start.left - shift, offY = e.clientY - start.top;
      n.setPointerCapture(e.pointerId);
      n.classList.add("dragging");
      const move = (ev) => {
        const x = Math.min(0.99, Math.max(0, (ev.clientX - box.left - offX) / box.width));
        const y = Math.min(0.99, Math.max(0, (ev.clientY - box.top - offY) / box.height));
        n.style.left = x * 100 + "%";
        n.style.top = y * 100 + "%";
        n.dataset.x = x;
        n.dataset.y = y;
      };
      const up = () => {
        n.removeEventListener("pointermove", move);
        n.removeEventListener("pointerup", up);
        n.classList.remove("dragging");
        if (n.dataset.x !== undefined && opts.onAnnoMove) opts.onAnnoMove(Number(n.dataset.anno), Number(n.dataset.x), Number(n.dataset.y));
      };
      n.addEventListener("pointermove", move);
      n.addEventListener("pointerup", up);
    });
  }

  /* ------------------------------ main entry ------------------------------ */
  /**
   * Render a full chart (title, legend, plot, notes, footer) into `container`.
   * opts.width: pixel width. opts.embedUrl: link used in the footer.
   */
  DP.renderChart = function (container, cfg, ds, opts) {
    opts = opts || {};
    cfg = DP.normalizeConfig(cfg);
    container.innerHTML = "";
    const root = el("div", { class: "dp-chart" + (cfg.layout.dark ? " dp-dark" : "") });
    container.appendChild(root);
    const width = Math.max(260, Math.floor(opts.width || container.clientWidth || 630) - 2 * 16);

    if (cfg.title) root.appendChild(el("h1", { class: "dp-title", text: cfg.title }));
    if (cfg.description) root.appendChild(el("p", { class: "dp-desc", text: cfg.description }));
    const legendSlot = el("div");
    root.appendChild(legendSlot);
    const body = el("div", { class: "dp-body", role: "img", "aria-label": cfg.alt || cfg.title || "Chart" });
    root.appendChild(body);

    let out;
    try {
      if (!ds || !ds.rows.length) throw new Error("Add some data in step 1 to see your chart.");
      const p = prepare(cfg, ds);
      const t = cfg.type;
      if (t === "table") out = tableChart(cfg, ds);
      else if (!p.valueCols.length) throw new Error("No number columns found. Check step 2: number columns should be blue.");
      else if (t === "scatter" && p.valueCols.length < 2) throw new Error("A scatter plot needs two number columns.");
      else if ((t === "range" || t === "arrow") && p.valueCols.length < 2) throw new Error("This chart needs two number columns (start and end).");
      else if (t.startsWith("map-")) {
        if (!DP.renderMap) throw new Error("Map code (js/maps.js) is not loaded on this page.");
        out = DP.renderMap(cfg, p, ds, width, () => DP.renderChart(container, cfg, ds, opts));
      }
      else if (t === "bar" || t === "stacked-bars" || t === "grouped-bars") out = barChart(cfg, p, width, t);
      else if (t === "column" || t === "stacked-columns" || t === "grouped-columns") out = columnChart(cfg, p, width, t);
      else if (t === "multiple-columns" || t === "multiple-lines") out = multiplePanels(cfg, p, width, t);
      else if (t === "lines" || t === "area") out = lineChart(cfg, p, width, t);
      else if (t === "scatter") out = scatterChart(cfg, p, width);
      else if (t === "dot" || t === "range" || t === "arrow") out = dotRangeChart(cfg, p, width, t);
      else if (t === "pie" || t === "donut" || t === "multiple-donuts") out = pieChart(cfg, p, width, t);
      else out = columnChart(cfg, p, width, "column");
      const legend = legendNode(out.colors);
      if (legend) legendSlot.appendChild(legend);
      body.appendChild(out.node);
      body.dataset.linked = ["multiple-columns", "multiple-lines", "multiple-donuts"].includes(cfg.type) ? "1" : "";
      body.dataset.map = out.map ? "1" : "";
    } catch (err) {
      console.error(err);
      body.appendChild(el("div", { class: "dp-empty", text: err.message }));
    }

    if (cfg.notes) root.appendChild(el("p", { class: "dp-notes", text: cfg.notes }));
    const footer = el("div", { class: "dp-footer" });
    const bits = [];
    if (cfg.source) {
      const s = el("span", { text: "Source: " });
      if (cfg.sourceUrl) s.appendChild(el("a", { href: cfg.sourceUrl, target: "_blank", rel: "noopener", text: cfg.source }));
      else s.appendChild(document.createTextNode(cfg.source));
      bits.push(s);
    }
    if (cfg.byline) bits.push(el("span", { text: "Chart: " + cfg.byline }));
    if (cfg.layout.dataDownload && ds && ds.rows.length) {
      const a = el("a", { href: "#", class: "dp-getdata", text: "Get the data" });
      a.onclick = (e) => {
        e.preventDefault();
        const blob = new Blob([DP.toCSV(ds)], { type: "text/csv" });
        const link = el("a", { href: URL.createObjectURL(blob), download: (cfg.id || "data") + ".csv" });
        document.body.appendChild(link);
        link.click();
        link.remove();
      };
      bits.push(a);
    }
    if (cfg.layout.attribution) bits.push(el("span", { class: "dp-attrib", html: 'Created with <a href="https://datapott.com" target="_blank" rel="noopener">Datapott Charts</a>' }));
    const left = el("div", { class: "dp-footer-left" });
    bits.forEach((b, i) => {
      if (i) left.appendChild(el("span", { class: "dp-sep", text: " · " }));
      left.appendChild(b);
    });
    footer.appendChild(left);
    if (cfg.layout.logo === "datapott") {
      footer.appendChild(el("span", { class: "dp-logo", html: "<b>DataPott</b><small>ANALYTICS</small>" }));
    } else if (cfg.layout.logo === "image" && cfg.layout.logoUrl) {
      footer.appendChild(el("img", { class: "dp-logo-img", src: cfg.layout.logoUrl, alt: "Logo" }));
    }
    root.appendChild(footer);
    DP.attachHover(body);
    drawAnnotations(body, cfg, opts);
    return root;
  };
})(window.DP);
