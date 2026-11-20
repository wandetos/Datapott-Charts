/* Datapott Charts — GitHub as the "cloud".
   • Publish: writes charts/<id>.json into the website repository (GitHub Pages then serves it).
   • Drafts sync (optional): keeps every draft in a PRIVATE repository, one file per chart,
     so your charts follow you to any computer.
   The access token is kept only in this browser (localStorage) and is never put into charts. */
window.DP = window.DP || {};

(function (DP) {
  "use strict";
  const KEY = "datapott-github-v1";
  const SHA_KEY = "datapott-draft-shas-v1";
  const API = "https://api.github.com";

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage blocked */ }
  }

  /** UTF-8 safe base64 (GitHub needs file contents in base64). */
  function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  const cloud = (DP.cloud = {
    status: "",
    lastSync: 0,
    listeners: [],

    /* ---------- settings ---------- */
    settings() {
      return Object.assign({ owner: "", repo: "", branch: "main", token: "", draftsRepo: "", draftsBranch: "main" }, readJSON(KEY, {}));
    },
    saveSettings(s) { writeJSON(KEY, s); cloud.emit(); },
    disconnect() { try { localStorage.removeItem(KEY); localStorage.removeItem(SHA_KEY); } catch (e) { /* */ } cloud.emit(); },
    connected() { const s = cloud.settings(); return !!(s.owner && s.repo && s.token); },
    draftsOn() { const s = cloud.settings(); return cloud.connected() && !!s.draftsRepo; },
    onChange(fn) { cloud.listeners.push(fn); },
    emit() { cloud.listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); },
    setStatus(text) { cloud.status = text; cloud.emit(); },

    /* ---------- low-level API ---------- */
    async api(method, path, body, raw) {
      const s = cloud.settings();
      const res = await fetch(API + path, {
        method,
        headers: Object.assign(
          { Authorization: "Bearer " + s.token, "X-GitHub-Api-Version": "2022-11-28", Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json" },
          body ? { "Content-Type": "application/json" } : {}
        ),
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        let msg = "GitHub error " + res.status;
        try { const j = await res.json(); if (j.message) msg += ": " + j.message; } catch (e) { /* */ }
        if (res.status === 401) msg = "GitHub did not accept the token (401). Check that it is pasted correctly and has not expired.";
        if (res.status === 403) msg += " — check the token has 'Contents: Read and write' for this repository.";
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      if (res.status === 204) return {};
      return raw ? res.text() : res.json();
    },
    repoPath(which) {
      const s = cloud.settings();
      if (which === "drafts") {
        const [o, r] = s.draftsRepo.includes("/") ? s.draftsRepo.split("/") : [s.owner, s.draftsRepo];
        return { owner: o.trim(), repo: r.trim(), branch: s.draftsBranch || "main" };
      }
      return { owner: s.owner.trim(), repo: s.repo.trim(), branch: s.branch || "main" };
    },
    async getFile(which, path) {
      const r = cloud.repoPath(which);
      return cloud.api("GET", `/repos/${r.owner}/${r.repo}/contents/${path}?ref=${encodeURIComponent(r.branch)}`);
    },
    async putFile(which, path, text, message, sha) {
      const r = cloud.repoPath(which);
      const body = { message, content: toB64(text), branch: r.branch };
      if (sha) body.sha = sha;
      try {
        return await cloud.api("PUT", `/repos/${r.owner}/${r.repo}/contents/${path}`, body);
      } catch (e) {
        // file changed elsewhere (or sha unknown): fetch the current sha and try once more
        if (e.status === 409 || e.status === 422) {
          const cur = await cloud.getFile(which, path);
          if (cur && cur.sha) { body.sha = cur.sha; return cloud.api("PUT", `/repos/${r.owner}/${r.repo}/contents/${path}`, body); }
        }
        throw e;
      }
    },
    async deleteFile(which, path, message, sha) {
      const r = cloud.repoPath(which);
      if (!sha) { const cur = await cloud.getFile(which, path); if (!cur) return; sha = cur.sha; }
      return cloud.api("DELETE", `/repos/${r.owner}/${r.repo}/contents/${path}`, { message, sha, branch: r.branch });
    },

    /** Check the token can read (and is allowed to write) each repository. */
    async test() {
      const out = [];
      const check = async (which, label) => {
        const r = cloud.repoPath(which);
        const info = await cloud.api("GET", `/repos/${r.owner}/${r.repo}`);
        if (!info) throw new Error(`${label} "${r.owner}/${r.repo}" was not found, or the token cannot see it.`);
        const canWrite = !info.permissions || info.permissions.push !== false;
        if (!canWrite) throw new Error(`The token can read ${label} but cannot write to it. Give it "Contents: Read and write".`);
        out.push(`${label}: ${info.full_name} (${info.private ? "private" : "public"})`);
        return info;
      };
      await check("site", "Website repository");
      if (cloud.settings().draftsRepo) {
        const d = await check("drafts", "Drafts repository");
        if (!d.private) out.push("⚠ Your drafts repository is PUBLIC. Anyone can read your drafts. Make it private on GitHub (Settings → Danger zone → Change visibility).");
      }
      return out;
    },

    /* ---------- publishing ---------- */
    async publish(cfg) {
      const clean = JSON.parse(JSON.stringify(cfg));
      delete clean.publishedAt;
      clean.publishedVersion = (cfg.publishedVersion || 0) + 1;
      const path = `charts/${cfg.id}.json`;
      const cur = await cloud.getFile("site", path);
      await cloud.putFile("site", path, JSON.stringify(clean, null, 2), `${cur ? "Update" : "Publish"} chart: ${cfg.title || cfg.id}`, cur && cur.sha);
      return clean.publishedVersion;
    },
    async unpublish(id) {
      await cloud.deleteFile("site", `charts/${id}.json`, `Unpublish chart: ${id}`);
    },

    /* ---------- drafts sync ---------- */
    shas() { return readJSON(SHA_KEY, {}); },
    setSha(id, sha) { const m = cloud.shas(); if (sha) m[id] = sha; else delete m[id]; writeJSON(SHA_KEY, m); },
    pending: new Map(),
    timer: null,

    /** Called by the store after every save/delete. Uploads a few seconds later (batched). */
    queue(id, cfgOrNull) {
      if (!cloud.draftsOn()) return;
      cloud.pending.set(id, cfgOrNull);
      clearTimeout(cloud.timer);
      cloud.setStatus("Unsaved changes…");
      cloud.timer = setTimeout(cloud.flush, 4000);
    },
    async flush() {
      if (!cloud.draftsOn() || !cloud.pending.size) return;
      const items = Array.from(cloud.pending.entries());
      cloud.pending.clear();
      cloud.setStatus("Saving to GitHub…");
      try {
        for (const [id, cfg] of items) {
          const path = `drafts/${id}.json`;
          if (cfg) {
            const res = await cloud.putFile("drafts", path, JSON.stringify(cfg), `Save draft: ${cfg.title || id}`, cloud.shas()[id]);
            cloud.setSha(id, res && res.content && res.content.sha);
          } else {
            await cloud.deleteFile("drafts", path, `Delete draft: ${id}`, cloud.shas()[id]).catch((e) => { if (e.status !== 404) throw e; });
            cloud.setSha(id, null);
          }
        }
        cloud.lastSync = Date.now();
        cloud.setStatus("Saved to GitHub");
      } catch (e) {
        items.forEach(([id, cfg]) => { if (!cloud.pending.has(id)) cloud.pending.set(id, cfg); });
        cloud.setStatus("⚠ Not saved to GitHub: " + e.message);
        clearTimeout(cloud.timer);
        cloud.timer = setTimeout(cloud.flush, 30000);
      }
    },

    /**
     * Download drafts that are newer on GitHub (e.g. made on another computer).
     * Returns the number of charts added or updated locally.
     */
    async pull() {
      if (!cloud.draftsOn()) return 0;
      cloud.setStatus("Checking GitHub for changes…");
      const r = cloud.repoPath("drafts");
      const list = (await cloud.api("GET", `/repos/${r.owner}/${r.repo}/contents/drafts?ref=${encodeURIComponent(r.branch)}`)) || [];
      const known = cloud.shas();
      let changed = 0;
      const remoteIds = new Set();
      for (const f of list) {
        if (!/\.json$/.test(f.name)) continue;
        const id = f.name.replace(/\.json$/, "");
        remoteIds.add(id);
        if (known[id] === f.sha) continue;
        const file = await cloud.api("GET", `/repos/${r.owner}/${r.repo}/contents/${f.path}?ref=${encodeURIComponent(r.branch)}`);
        let remote;
        try { remote = JSON.parse(file.content ? fromB64(file.content) : await cloud.api("GET", `/repos/${r.owner}/${r.repo}/contents/${f.path}?ref=${encodeURIComponent(r.branch)}`, null, true)); } catch (e) { continue; }
        const local = DP.store.get(id);
        if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
          DP.store.save(remote, { keepTime: true, silent: true });
          changed++;
        } else if ((local.updatedAt || 0) > (remote.updatedAt || 0)) {
          cloud.queue(id, local); // ours is newer: upload it
        }
        cloud.setSha(id, f.sha);
      }
      // local charts never uploaded yet → upload them
      DP.store.list().forEach((c) => { if (!remoteIds.has(c.id) && !known[c.id]) cloud.queue(c.id, c); });
      // charts deleted on another computer (we had uploaded them before, now gone)
      Object.keys(known).forEach((id) => { if (!remoteIds.has(id) && DP.store.get(id)) { DP.store.remove(id, { silent: true }); cloud.setSha(id, null); changed++; } });
      cloud.lastSync = Date.now();
      cloud.setStatus(cloud.pending.size ? "Unsaved changes…" : "Saved to GitHub");
      return changed;
    },
  });

  // Save anything waiting before the tab closes
  window.addEventListener("pagehide", () => { if (cloud.pending.size) cloud.flush(); });
})(window.DP);
