/* Datapott Charts — image and PDF export, including social media sizes.
   The chart is re-drawn off-screen at the right shape (e.g. 1080×1080),
   so it is laid out for that size instead of being stretched. */
window.DP = window.DP || {};

(function (DP) {
  "use strict";

  DP.EXPORT_PRESETS = [
    { id: "chart", name: "Chart size (as in preview)" },
    { id: "ig-square", name: "Instagram / Facebook post, square 1080×1080", w: 1080, h: 1080 },
    { id: "ig-portrait", name: "Instagram portrait 1080×1350", w: 1080, h: 1350 },
    { id: "x-linkedin", name: "X (Twitter) / LinkedIn 1200×675", w: 1200, h: 675 },
    { id: "fb-link", name: "Facebook / link preview 1200×630", w: 1200, h: 630 },
    { id: "story", name: "Story / Reels / TikTok 1080×1920", w: 1080, h: 1920 },
    { id: "a4-landscape", name: "A4 landscape (PDF / print)", w: 1754, h: 1240 },
    { id: "a4-portrait", name: "A4 portrait (PDF / print)", w: 1240, h: 1754 },
  ];

  const loaded = {};
  DP.loadScript = function (src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error("Could not load " + src));
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  };

  const PANEL_TYPES = ["multiple-columns", "multiple-lines", "multiple-donuts"];
  const HEIGHT_TYPES = ["column", "stacked-columns", "grouped-columns", "lines", "area", "scatter", "pie", "donut"];

  /** Draw the chart into an off-screen box and fit it to the preset's shape. */
  async function drawOffscreen(cfg, ds, preset, previewWidth) {
    if (cfg.type.startsWith("map-")) {
      await DP.loadGeo(cfg.refine.mapRegion && cfg.refine.mapRegion !== "world" ? "50m" : "110m");
    }
    // CSS size of the box; it is captured at 2× (or more) to reach the target pixels
    const cssW = preset.w ? (preset.w >= 1600 ? preset.w / 2.2 : preset.w / 2) : previewWidth;
    const cssH = preset.h ? preset.h * (cssW / preset.w) : null;
    // A zero-size clipped holder keeps the drawing invisible, while the box itself
    // has a normal position (so the image capture sees it at 0,0).
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;z-index:-1;";
    const box = document.createElement("div");
    box.className = "dp-export-box";
    box.style.cssText = `width:${cssW}px;${cssH ? `height:${cssH}px;` : ""}overflow:hidden;background:#fff;`;
    holder.appendChild(box);
    document.body.appendChild(holder);
    const inner = document.createElement("div");
    box.appendChild(inner);

    let c = JSON.parse(JSON.stringify(cfg));
    c.refine.tooltips = false;
    DP.renderChart(inner, c, ds, { width: cssW });
    let root = inner.querySelector(".dp-chart");

    if (cssH) {
      // Grow or shrink the plot so the whole chart fills the frame
      for (let i = 0; i < 2; i++) {
        const diff = cssH - root.offsetHeight;
        if (Math.abs(diff) < 4) break;
        if (HEIGHT_TYPES.includes(c.type)) {
          c.refine.height = Math.max(140, Number(c.refine.height || 400) + diff);
        } else if (PANEL_TYPES.includes(c.type)) {
          const panels = root.querySelectorAll(".dp-panel").length || 1;
          const perRow = Math.max(1, Math.min(Number(c.refine.panelsPerRow) || 3, panels));
          const rows = Math.ceil(panels / perRow);
          c.refine.panelHeight = Math.max(70, Number(c.refine.panelHeight || 180) + diff / rows);
        } else break;
        DP.renderChart(inner, c, ds, { width: cssW });
        root = inner.querySelector(".dp-chart");
      }
      const bg = getComputedStyle(root).backgroundColor;
      box.style.background = bg;
      inner.style.cssText = "height:100%;display:flex;flex-direction:column;justify-content:center;";
      let h = root.offsetHeight;
      if (h > cssH && c.type.startsWith("map-")) {
        // Maps keep their shape: draw them narrower until they fit, then centre
        for (let i = 0; i < 3 && h > cssH; i++) {
          const w = Math.max(240, Math.floor(root.offsetWidth * (cssH / h) * 0.98));
          inner.style.width = w + "px";
          DP.renderChart(inner, c, ds, { width: w });
          root = inner.querySelector(".dp-chart");
          h = root.offsetHeight;
        }
        inner.style.margin = "0 auto";
      }
      if (h > cssH) {
        // Still too tall (e.g. many bars): shrink the whole chart, keep it centred
        const s = cssH / h;
        root.style.transform = `scale(${s})`;
        root.style.transformOrigin = "top center";
        inner.style.justifyContent = "flex-start";
      }
    }
    return { box: holder, node: cssH ? box : root, cssW, cssH: cssH || root.offsetHeight };
  }

  /**
   * Export the chart. opts: { format: png|jpg|svg|pdf, preset, scale, transparent, previewWidth, fileName }
   */
  DP.exportChart = async function (cfg, ds, opts) {
    const preset = DP.EXPORT_PRESETS.find((p) => p.id === opts.preset) || DP.EXPORT_PRESETS[0];
    const { box, node, cssW, cssH } = await drawOffscreen(cfg, ds, preset, opts.previewWidth || 630);
    try {
      const ratio = preset.w ? preset.w / cssW : Number(opts.scale) || 2;
      const transparent = opts.transparent && opts.format === "png";
      const bg = transparent ? null : getComputedStyle(node.querySelector(".dp-chart") || node).backgroundColor || "#fff";
      if (transparent) { node.style.background = "transparent"; const r = node.querySelector(".dp-chart"); if (r) r.style.background = "transparent"; }
      const o = { pixelRatio: ratio, backgroundColor: bg, cacheBust: true, width: cssW, height: cssH };
      const name = opts.fileName + (preset.w ? `-${preset.w}x${preset.h}` : "");
      if (opts.preview) return await htmlToImage.toPng(node, Object.assign({}, o, { pixelRatio: Math.min(1, ratio) }));
      if (opts.format === "svg") return save(await htmlToImage.toSvg(node, o), name + ".svg");
      if (opts.format === "jpg") return save(await htmlToImage.toJpeg(node, Object.assign({ quality: 0.95 }, o)), name + ".jpg");
      const png = await htmlToImage.toPng(node, o);
      if (opts.format !== "pdf") return save(png, name + ".png");
      await DP.loadScript("vendor/jspdf.umd.min.js");
      const { jsPDF } = window.jspdf;
      const wPt = cssW * 0.75, hPt = cssH * 0.75; // CSS px → PDF points
      const pdf = new jsPDF({ orientation: wPt > hPt ? "landscape" : "portrait", unit: "pt", format: [wPt, hPt], compress: true });
      pdf.setProperties({ title: cfg.title || "Datapott chart", creator: "Datapott Charts" });
      pdf.addImage(png, "PNG", 0, 0, wPt, hPt, undefined, "FAST");
      pdf.save(name + ".pdf");
    } finally {
      box.remove();
    }
  };

  function save(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
})(window.DP);
