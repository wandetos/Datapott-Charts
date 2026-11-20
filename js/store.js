/* Datapott Charts — saving charts.
   Phase 1 saves charts in your browser (localStorage).
   Phase 3 of the roadmap swaps this file for a real database (Supabase),
   without changing the rest of the app. */
window.DP = window.DP || {};

(function (DP) {
  "use strict";
  const KEY = "datapott-charts-v1";
  let memory = {}; // fallback if storage is blocked

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch (e) {
      return memory;
    }
  }
  function writeAll(all) {
    memory = all;
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) {
      console.warn("Could not save to browser storage", e);
    }
  }

  DP.store = {
    list() {
      return Object.values(readAll()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    get(id) {
      return readAll()[id] || null;
    },
    save(cfg) {
      const all = readAll();
      cfg.updatedAt = Date.now();
      all[cfg.id] = cfg;
      writeAll(all);
    },
    remove(id) {
      const all = readAll();
      delete all[id];
      writeAll(all);
    },
    newId() {
      const chars = "abcdefghijkmnpqrstuvwxyz23456789";
      let id = "";
      for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
      return readAll()[id] ? DP.store.newId() : id;
    },
    /** Your default style for new charts (colours, labels, footer, logo…). */
    getDefaults() {
      try { return JSON.parse(localStorage.getItem(KEY + "-defaults") || "null"); } catch (e) { return null; }
    },
    setDefaults(d) {
      try { if (d) localStorage.setItem(KEY + "-defaults", JSON.stringify(d)); else localStorage.removeItem(KEY + "-defaults"); } catch (e) { /* ignore */ }
    },
    /** Backup: download every chart as one JSON file. */
    exportAll() {
      return JSON.stringify(readAll(), null, 2);
    },
    importAll(json) {
      const incoming = JSON.parse(json);
      const all = readAll();
      Object.assign(all, incoming);
      writeAll(all);
      return Object.keys(incoming).length;
    },
  };
})(window.DP);
