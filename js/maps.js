/* Datapott Charts — maps (choropleth + symbol maps).
   Map shapes come from Natural Earth via world-atlas (data/world-*.json),
   country names and codes from world-countries (data/countries.json).
   Rebuild them with: node tools/build-geo.js */
window.DP = window.DP || {};

(function (DP) {
  "use strict";
  const G = (DP.geo = { meta: null, byA3: null, index: null, features: {}, loading: {} });

  /* ------------------------------ regions ------------------------------ */
  // bbox = [west, south, east, north] in degrees, used to zoom the map
  DP.MAP_REGIONS = [
    { id: "world", name: "World" },
    { id: "africa", name: "Africa", bbox: [-19, -36, 53, 38], test: (m) => m.r === "Africa" },
    { id: "africa-north", name: "Northern Africa", bbox: [-18, 15, 38, 38], test: (m) => m.s === "Northern Africa" },
    { id: "africa-west", name: "Western Africa", bbox: [-26, 3, 17, 28], test: (m) => m.s === "Western Africa" },
    { id: "africa-east", name: "Eastern Africa", bbox: [21, -27, 58, 19], test: (m) => m.s === "Eastern Africa" },
    { id: "africa-central", name: "Central (Middle) Africa", bbox: [5, -19, 32, 24], test: (m) => m.s === "Middle Africa" },
    { id: "africa-south", name: "Southern Africa", bbox: [10, -36, 34, -16], test: (m) => m.s === "Southern Africa" },
    { id: "mena", name: "Middle East & North Africa", bbox: [-18, 10, 64, 42],
      test: (m) => (m.s === "Northern Africa" || m.s === "Western Asia" || m.a3 === "IRN") && !["ARM", "AZE", "GEO", "CYP", "TUR", "SDN"].includes(m.a3) },
    { id: "europe", name: "Europe", bbox: [-25, 34, 45, 71], test: (m) => m.r === "Europe" },
    { id: "asia", name: "Asia", bbox: [25, -12, 150, 56], test: (m) => m.r === "Asia" },
    { id: "americas", name: "Americas", bbox: [-170, -57, -30, 75], test: (m) => m.r === "Americas" },
    { id: "latam", name: "Latin America & Caribbean", bbox: [-118, -57, -33, 33],
      test: (m) => ["South America", "Central America", "Caribbean"].includes(m.s) || m.a3 === "MEX" },
    { id: "oceania", name: "Oceania", bbox: [110, -48, 180, 0], test: (m) => m.r === "Oceania" },
  ];

  DP.MAP_SCHEMES = [
    ["greens", "Greens"], ["blues", "Blues"], ["reds", "Reds"], ["oranges", "Oranges"], ["purples", "Purples"],
    ["ylgnbu", "Yellow → Green → Blue"], ["ylorrd", "Yellow → Orange → Red"], ["rdylgn", "Red → Yellow → Green"],
    ["rdbu", "Red → Blue"], ["brbg", "Brown → Teal"], ["viridis", "Viridis"], ["magma", "Magma"],
  ];

  /* ------------------------------ country matching ------------------------------ */
  function norm(s) {
    return String(s == null ? "" : s)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/&/g, " and ").replace(/[’'`.]/g, "")
      .replace(/[^a-z0-9]+/g, " ").replace(/\b(the|of)\b/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  function buildIndex(meta) {
    const idx = new Map();
    const add = (key, a3, force) => {
      const k = norm(key);
      if (k && (force || !idx.has(k))) idx.set(k, a3);
    };
    // codes first (exact), then names, then alternative spellings
    meta.forEach((m) => { add(m.a3, m.a3, true); add(m.a2, m.a3); if (m.num) { add(m.num, m.a3); add(String(Number(m.num)), m.a3); } });
    meta.forEach((m) => { add(m.n, m.a3, true); add(m.o, m.a3); add(m.n.replace(/\(.*\)/, ""), m.a3); });
    meta.forEach((m) => m.alt.forEach((a) => add(a, m.a3)));
    return idx;
  }

  /** Country name or code → ISO3 code (or null). */
  DP.matchCountry = function (value) {
    if (!G.index) return null;
    const k = norm(value);
    if (!k) return null;
    if (G.index.has(k)) return G.index.get(k);
    const noBrackets = norm(String(value).replace(/\(.*?\)/g, ""));
    return G.index.get(noBrackets) || null;
  };

  /* ------------------------------ loading ------------------------------ */
  DP.loadGeo = function (res) {
    res = res || "110m";
    if (G.features[res] && G.meta) return Promise.resolve();
    if (G.loading[res]) return G.loading[res];
    const base = (DP.basePath || "") + "data/";
    const metaP = G.meta ? Promise.resolve(G.meta) : fetch(base + "countries.json").then((r) => r.json());
    G.loading[res] = Promise.all([metaP, fetch(base + "world-" + res + ".json").then((r) => r.json())]).then(([meta, topo]) => {
      if (!G.meta) {
        G.meta = meta;
        G.byA3 = new Map(meta.map((m) => [m.a3, m]));
        G.index = buildIndex(meta);
      }
      G.features[res] = topojson.feature(topo, topo.objects.countries).features;
    });
    return G.loading[res];
  };

  /** Match report for the editor: which rows found a country. */
  DP.mapMatchReport = function (ds, labelName) {
    const unmatched = [];
    let matched = 0;
    ds.rows.forEach((r) => {
      const v = r[labelName];
      if (v === "" || v == null) return;
      if (DP.matchCountry(v)) matched++;
      else unmatched.push(String(v));
    });
    return { matched, total: matched + unmatched.length, unmatched };
  };

  /* ------------------------------ drawing ------------------------------ */
  function regionOf(cfg) {
    return DP.MAP_REGIONS.find((r) => r.id === cfg.refine.mapRegion) || DP.MAP_REGIONS[0];
  }

  /** Points along a bbox outline, used as the projection "domain" (what to zoom to). */
  function bboxDomain(b) {
    const [w, s, e, n] = b, pts = [];
    for (let i = 0; i <= 8; i++) {
      const x = w + ((e - w) * i) / 8, y = s + ((n - s) * i) / 8;
      pts.push([x, s], [x, n], [w, y], [e, y]);
    }
    return { type: "MultiPoint", coordinates: pts };
  }

  function projectionFor(region) {
    // World: fit the inhabited world (no empty Antarctica space)
    if (!region.bbox) return { type: "equal-earth", domain: bboxDomain([-170, -56, 180, 83]) };
    const [w, s, e, n] = region.bbox;
    return { type: "azimuthal-equal-area", rotate: [-(w + e) / 2, -(s + n) / 2], domain: bboxDomain(region.bbox), inset: 6 };
  }

  /**
   * Draw a map. Returns { node, colors } like the other chart types.
   * If map data is still loading, returns a placeholder and calls `redraw` when ready.
   */
  DP.renderMap = function (cfg, p, ds, width, redraw) {
    const region = regionOf(cfg);
    const res = region.id === "world" ? "110m" : "50m";
    if (!G.features[res] || !G.meta) {
      DP.loadGeo(res).then(redraw, (e) => console.error(e));
      return { node: DP.el("div", { class: "dp-empty", text: "Loading map…" }), colors: { mode: "single" } };
    }
    const fmt = DP.makeFormatter(cfg);
    const axisFmt = DP.axisFormatter(cfg);
    const valueCol = p.valueCols.includes(cfg.refine.mapValue) ? cfg.refine.mapValue : p.valueCols[0];
    const tipsOn = cfg.refine.tooltips !== false;

    // join data rows to countries
    const data = new Map();
    ds.rows.forEach((r) => {
      const a3 = DP.matchCountry(r[p.label]);
      if (a3 && !Number.isNaN(r[valueCol])) data.set(a3, { label: String(r[p.label]), value: r[valueCol], row: r });
    });
    const metaOf = (f) => G.byA3.get(f.properties.a3);
    const all = G.features[res];
    const inside = region.test ? all.filter((f) => metaOf(f) && region.test(metaOf(f))) : all;
    const outside = region.test ? all.filter((f) => !inside.includes(f)) : [];
    const withData = inside.filter((f) => data.has(f.properties.a3));
    const noData = inside.filter((f) => !data.has(f.properties.a3));
    const hl = new Set((cfg.refine.highlight || []).map((h) => DP.matchCountry(h)).filter(Boolean));
    const nameOf = (f) => (data.get(f.properties.a3) || {}).label || (metaOf(f) ? metaOf(f).n : f.properties.name);
    const tip = (f) => tipsOn ? JSON.stringify({ k: f.properties.a3 || f.properties.name, h: nameOf(f), s: valueCol, v: data.has(f.properties.a3) ? fmt(data.get(f.properties.a3).value) : "No data" }) : undefined;

    const style = { fontFamily: "inherit", fontSize: "12px", overflow: "visible", background: "transparent" };
    const marks = [
      outside.length ? Plot.geo(outside, { fill: "#f1f1f1", stroke: "#fff", strokeWidth: 0.5, clip: "frame" }) : null,
      Plot.geo(noData, { fill: "#cfcfcf", stroke: "#fff", strokeWidth: 0.5, clip: "frame", title: tip }),
    ];
    let colorOpt;
    let rOpt;
    let extraLegend = null;

    if (cfg.type === "map-symbols") {
      const base = (cfg.refine.colors && cfg.refine.colors.__single__) || (DP.PALETTES[cfg.refine.palette] || DP.PALETTES.datapott)[0];
      marks.push(Plot.geo(withData, { fill: "#d9d9d9", stroke: "#fff", strokeWidth: 0.5, clip: "frame" }));
      const pts = withData
        .map((f) => { const m = metaOf(f), d = data.get(f.properties.a3); return m && m.ll ? { f, lon: m.ll[1], lat: m.ll[0], value: d.value } : null; })
        .filter((d) => d && d.value > 0)
        .sort((a, b) => b.value - a.value);
      const maxV = d3.max(pts, (d) => d.value) || 1;
      // circles scale with the map size, so the world map is not covered by bubbles
      const maxR = (Number(cfg.refine.mapMaxRadius) || 24) * Math.min(1, width / 600) * (region.id === "world" ? 0.55 : 1);
      marks.push(Plot.dot(pts, {
        x: "lon", y: "lat", r: "value", fill: (d) => (hl.size && !hl.has(d.f.properties.a3) ? "#bdbdbd" : base),
        fillOpacity: 0.75, stroke: "#fff", strokeWidth: 1, clip: "frame", title: (d) => tip(d.f),
      }));
      colorOpt = { type: "identity" };
      rOpt = { type: "sqrt", domain: [0, maxV], range: [0, maxR] };
      // size legend: three reference circles
      const rScale = (v) => Math.sqrt(v / maxV) * maxR;
      const refs = [maxV, maxV / 2, maxV / 8].map((v) => Number(d3.format(".2~r")(v)));
      const lw = refs.length * (maxR * 2 + 40);
      const svg = d3.create("svg").attr("width", lw).attr("height", maxR * 2 + 22).attr("class", "dp-size-legend");
      let x = 4;
      refs.forEach((v) => {
        const r = rScale(v);
        svg.append("circle").attr("cx", x + maxR).attr("cy", maxR * 2 + 2 - r).attr("r", r).attr("fill", "none").attr("stroke", "currentColor").attr("stroke-opacity", 0.5);
        svg.append("text").attr("x", x + maxR).attr("y", maxR * 2 + 16).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", "currentColor").text(fmt(v));
        x += maxR * 2 + 40;
      });
      extraLegend = DP.el("div", { class: "dp-map-legend" }, [DP.el("div", { class: "dp-map-legend-title", text: valueCol }), svg.node()]);
      return finish();
    }

    // choropleth colour scale
    const scaleType = cfg.refine.mapScale || "linear";
    colorOpt = {
      scheme: cfg.refine.mapScheme || "greens",
      reverse: !!cfg.refine.mapReverse,
      legend: true,
      label: valueCol,
      tickFormat: axisFmt,
      width: Math.min(320, width),
    };
    const vals = Array.from(data.values()).filter((d) => inside.some((f) => f.properties.a3 && data.get(f.properties.a3) === d)).map((d) => d.value);
    const lo = cfg.refine.axisMin, hi = cfg.refine.axisMax;
    const ext = d3.extent(vals);
    const dom = [lo !== "" && lo != null && !isNaN(+lo) ? +lo : ext[0], hi !== "" && hi != null && !isNaN(+hi) ? +hi : ext[1]];
    const breaks = String(cfg.refine.mapBreaks || "").split(/[,;\s]+/).map(Number).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
    if (scaleType === "breaks" && breaks.length) Object.assign(colorOpt, { type: "threshold", domain: breaks });
    else if (scaleType === "quantile") Object.assign(colorOpt, { type: "quantile", n: Number(cfg.refine.mapSteps) || 5 });
    else if (scaleType === "quantize") Object.assign(colorOpt, { type: "quantize", n: Number(cfg.refine.mapSteps) || 5, domain: dom });
    else Object.assign(colorOpt, { type: "linear", domain: dom });

    marks.push(Plot.geo(withData, {
      fill: (f) => data.get(f.properties.a3).value,
      fillOpacity: (f) => (hl.size && !hl.has(f.properties.a3) ? 0.3 : 1),
      stroke: "#fff", strokeWidth: 0.5, clip: "frame", title: tip,
    }));
    return finish();

    function finish() {
      const plot = Plot.plot({
        width,
        projection: projectionFor(region),
        color: colorOpt,
        r: rOpt,
        style,
        marks: marks.filter(Boolean),
      });
      const nd = noData.length && cfg.type === "map-choropleth" ? DP.el("div", { class: "dp-map-nodata", html: '<i></i>No data' }) : null;
      const wrap = DP.el("div", { class: "dp-map" }, [extraLegend, plot, nd]);
      return { node: wrap, colors: { mode: "single" }, map: true };
    }
  };
})(window.DP);
