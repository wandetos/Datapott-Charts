/* Datapott Charts — data loading, parsing and column type detection.
   Everything is attached to the global DP object so plain <script> tags work
   (no build step, works on GitHub Pages and on Namecheap hosting). */
window.DP = window.DP || {};

(function (DP) {
  "use strict";

  /** Parse CSV / TSV / pasted text into an array of arrays. */
  DP.parseText = function (text) {
    const result = Papa.parse(String(text || "").trim(), {
      skipEmptyLines: true,
      delimiter: "", // auto-detect comma, tab, semicolon
    });
    return result.data.map((r) => r.map((c) => (c == null ? "" : String(c).trim())));
  };

  /** Read an uploaded CSV or Excel file into an array of arrays (first sheet). */
  DP.readFile = function (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.onload = (e) => {
        try {
          if (isExcel) {
            const wb = XLSX.read(e.target.result, { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const csv = XLSX.utils.sheet_to_csv(ws);
            resolve({ text: csv, rows: DP.parseText(csv) });
          } else {
            resolve({ text: e.target.result, rows: DP.parseText(e.target.result) });
          }
        } catch (err) {
          reject(err);
        }
      };
      if (isExcel) reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
    });
  };

  /** Turn any Google Sheets link into CSV download URLs (tries several). */
  DP.googleSheetUrls = function (url) {
    url = String(url || "").trim();
    // Already a "Publish to web" CSV link
    if (/output=csv|format=csv|tqx=out:csv/.test(url)) return [url];
    const idMatch = url.match(/\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/);
    if (!idMatch) return [url]; // treat as a plain CSV URL
    const id = idMatch[1];
    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";
    if (url.includes("/d/e/")) {
      return [`https://docs.google.com/spreadsheets/d/e/${id}/pub?gid=${gid}&single=true&output=csv`];
    }
    return [
      `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
      `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
    ];
  };

  /** Fetch a Google Sheet or any public CSV URL. */
  DP.fetchSheet = async function (url) {
    const candidates = DP.googleSheetUrls(url);
    let lastErr;
    for (const u of candidates) {
      try {
        const res = await fetch(u, { redirect: "follow" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const text = await res.text();
        if (/^\s*<!DOCTYPE html|<html/i.test(text)) throw new Error("Sheet is not shared publicly.");
        return { text, rows: DP.parseText(text) };
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(
      "Could not load the sheet (" + (lastErr && lastErr.message) + "). " +
        "In Google Sheets, set Share → 'Anyone with the link: Viewer', or use File → Share → Publish to web → CSV."
    );
  };

  /** Swap rows and columns. */
  DP.transpose = function (rows) {
    const width = Math.max(0, ...rows.map((r) => r.length));
    const out = [];
    for (let c = 0; c < width; c++) out.push(rows.map((r) => (r[c] == null ? "" : r[c])));
    return out;
  };

  /** Convert "1,234.5", "45%", " 12 " into numbers. Returns NaN if not numeric. */
  DP.toNumber = function (v) {
    if (typeof v === "number") return v;
    if (v == null) return NaN;
    const s = String(v).trim().replace(/[,\s%]/g, "").replace(/[−–]/g, "-");
    if (s === "" || s === "-") return NaN;
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : NaN;
  };

  const DATE_RE = /^(\d{4})-(\d{1,2})(-(\d{1,2}))?$|^\d{1,2}\/\d{1,2}\/\d{4}$/;

  /** Guess column type: number, date or text (80% rule, like Datawrapper). */
  DP.detectType = function (values) {
    const filled = values.filter((v) => v !== "" && v != null);
    if (!filled.length) return "text";
    const nums = filled.filter((v) => !isNaN(DP.toNumber(v))).length;
    const dates = filled.filter((v) => DATE_RE.test(String(v).trim())).length;
    if (dates / filled.length >= 0.8) return "date";
    if (nums / filled.length >= 0.8) return "number";
    return "text";
  };

  /**
   * Build a clean dataset from raw rows and the chart config.
   * Returns { columns:[{name,type,hidden}], rows:[{col:value}] }
   */
  DP.buildDataset = function (rawRows, cfg) {
    let rows = (rawRows || []).filter((r) => r.some((c) => c !== ""));
    if (cfg.transpose) rows = DP.transpose(rows);
    if (!rows.length) return { columns: [], rows: [] };
    let header;
    if (cfg.firstRowLabel !== false) {
      header = rows[0].map((h, i) => (h ? h : "Column " + (i + 1)));
      rows = rows.slice(1);
    } else {
      header = rows[0].map((_, i) => "Column " + (i + 1));
    }
    // De-duplicate header names
    const seen = {};
    header = header.map((h) => {
      if (seen[h]) return h + " (" + ++seen[h] + ")";
      seen[h] = 1;
      return h;
    });
    const overrides = cfg.columns || {};
    const columns = header.map((name, i) => {
      const o = overrides[name] || {};
      return {
        name,
        type: o.type || DP.detectType(rows.map((r) => r[i])),
        hidden: !!o.hidden,
      };
    });
    const objects = rows.map((r) => {
      const obj = {};
      columns.forEach((c, i) => {
        const raw = r[i] == null ? "" : r[i];
        obj[c.name] = c.type === "number" ? DP.toNumber(raw) : raw;
      });
      return obj;
    });
    return { columns, rows: objects };
  };

  /** Rows → CSV text (for "Get the data"). */
  DP.toCSV = function (dataset) {
    const cols = dataset.columns.filter((c) => !c.hidden).map((c) => c.name);
    return Papa.unparse({
      fields: cols,
      data: dataset.rows.map((r) => cols.map((c) => (Number.isNaN(r[c]) ? "" : r[c]))),
    });
  };

  /* ---------- Sharing: pack the whole chart config into a URL ---------- */
  function b64url(bytes) {
    let s = "";
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64url(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(str);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  DP.packConfig = async function (cfg) {
    const json = new TextEncoder().encode(JSON.stringify(cfg));
    if (window.CompressionStream) {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const buf = new Uint8Array(await new Response(stream).arrayBuffer());
      return "z" + b64url(buf);
    }
    return "j" + b64url(json);
  };

  DP.unpackConfig = async function (packed) {
    const kind = packed[0];
    const bytes = fromB64url(packed.slice(1));
    let json = bytes;
    if (kind === "z") {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      json = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return JSON.parse(new TextDecoder().decode(json));
  };

  /** Load the raw rows for a config (inline data or live Google Sheet). */
  DP.loadRows = async function (cfg) {
    if (cfg.data && cfg.data.mode === "sheet" && cfg.data.url && cfg.data.live !== false) {
      try {
        return (await DP.fetchSheet(cfg.data.url)).rows;
      } catch (e) {
        console.warn("Live sheet failed, using saved copy", e);
      }
    }
    return DP.parseText((cfg.data && cfg.data.text) || "");
  };
})(window.DP);
