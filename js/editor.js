/* Datapott Charts — the editor app (dashboard + 4-step chart wizard). */
(function (DP) {
  "use strict";

  const app = document.getElementById("app");
  const S = { cfg: null, raw: [], ds: null, step: 1, tab: "type", activeCol: null, previewWidth: 630, folder: "" };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const SAMPLE = [
    "Group,Average 2025,Range (high - low),Below 50 (count),Change 2020-2025",
    "Western Europe & EU,64.1,49,6,-1.7",
    "Asia Pacific,44.8,69,21,-0.5",
    "Americas,41.8,65,22,-1.6",
    "Middle East & North Africa,38.9,56,11,-0.2",
    "Eastern Europe & Central Asia,34.4,33,18,-1.5",
    "Sub-Saharan Africa,32.1,59,45,-0.2",
    "Global average,42.5,80,123,-0.8",
  ].join("\n");

  /* ------------------------------ routing ------------------------------ */
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    $("#nav-dash").classList.toggle("active", parts[0] !== "edit" && parts[0] !== "settings");
    $("#nav-set").classList.toggle("active", parts[0] === "settings");
    if (parts[0] === "edit" && parts[1]) openEditor(parts[1], Number(parts[2]) || 1);
    else if (parts[0] === "settings") settingsView();
    else dashboard();
  }

  /* ------------------------------ cloud status ------------------------------ */
  function showCloudStatus() {
    const n = $("#cloudstat");
    if (!n) return;
    if (!DP.cloud.connected()) { n.innerHTML = ""; return; }
    const st = DP.cloud.status || (DP.cloud.draftsOn() ? "Saved to GitHub" : "GitHub connected");
    n.className = "cloudstat" + (st.startsWith("⚠") ? " warn" : "");
    n.textContent = (st.startsWith("⚠") ? "" : "☁ ") + st;
    n.title = st;
  }
  DP.cloud.onChange(showCloudStatus);

  let pulledOnce = false;
  async function pullDrafts(force) {
    if (!DP.cloud.draftsOn() || (pulledOnce && !force)) return;
    pulledOnce = true;
    try {
      const changed = await DP.cloud.pull();
      const onDashboard = !location.hash || location.hash === "#" || location.hash === "#/";
      if (changed && onDashboard) dashboard();
    } catch (e) { DP.cloud.setStatus("⚠ Could not reach GitHub: " + e.message); }
  }

  /* ------------------------------ settings ------------------------------ */
  function settingsView() {
    const s = DP.cloud.settings();
    // Guess owner/repo when the site runs on <owner>.github.io/<repo>/
    if (!s.owner && /\.github\.io$/.test(location.hostname)) {
      s.owner = location.hostname.split(".")[0];
      s.repo = location.pathname.split("/").filter(Boolean)[0] || "";
    }
    app.innerHTML = `
      <div class="dash-head"><h2>Settings</h2></div>
      <div class="settings panel">
        <div class="pub-section">
          <h4>☁ Connect to GitHub (one-click publishing and online drafts)</h4>
          <p class="hint">Datapott Charts saves into your own GitHub repositories. It needs an <b>access token</b>: a password that only works for the repositories you choose. The token stays in this browser only.</p>
          <details ${DP.cloud.connected() ? "" : "open"}><summary><b>How to create the token (once, about 3 minutes)</b></summary>
            <ol class="steps-list">
              <li><b>Optional but recommended:</b> create a <b>private</b> repository for drafts: GitHub → <b>+ → New repository</b>, name <code>datapott-charts-drafts</code>, choose <b>Private</b>, tick <b>Add a README file</b>, click <b>Create repository</b>.</li>
              <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a> (GitHub → your picture → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token).</li>
              <li>Token name: <code>Datapott Charts</code>. Expiration: <b>1 year</b> (put a reminder in your calendar).</li>
              <li>Repository access: <b>Only select repositories</b> → pick <b>${esc(s.repo || "Datapott-Charts")}</b> and <b>datapott-charts-drafts</b>.</li>
              <li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Leave everything else as it is.</li>
              <li>Click <b>Generate token</b>, copy it (it starts with <code>github_pat_</code>) and paste it below.</li>
            </ol>
          </details>
          <div class="row">
            <div><label class="field">GitHub username</label><input type="text" id="gowner" value="${esc(s.owner)}" placeholder="wandetos"/></div>
            <div><label class="field">Website repository</label><input type="text" id="grepo" value="${esc(s.repo)}" placeholder="Datapott-Charts"/></div>
            <div style="flex:0 0 90px"><label class="field">Branch</label><input type="text" id="gbranch" value="${esc(s.branch)}"/></div>
          </div>
          <label class="field">Drafts repository (private) <span class="hint">leave empty to keep drafts only in this browser</span></label>
          <input type="text" id="gdrafts" value="${esc(s.draftsRepo)}" placeholder="datapott-charts-drafts"/>
          <label class="field">Access token</label>
          <input type="password" id="gtoken" value="${esc(s.token)}" placeholder="github_pat_…" autocomplete="off"/>
          <div class="row" style="gap:8px;margin-top:12px">
            <button class="btn" id="gsave" style="flex:0 0 auto">Save and test connection</button>
            ${DP.cloud.connected() ? `<button class="btn ghost" id="gsync" style="flex:0 0 auto">⟳ Sync drafts now</button><button class="btn danger" id="gdisc" style="flex:0 0 auto">Disconnect</button>` : ""}
          </div>
          <div id="gmsg" class="hint"></div>
          <p class="hint">⚠ Only connect on your own computer. Anyone who uses this browser could publish charts. You can cancel the token any time on GitHub.</p>
        </div>
      </div>`;
    $("#gsave").onclick = async () => {
      const ns = Object.assign(DP.cloud.settings(), {
        owner: $("#gowner").value.trim(), repo: $("#grepo").value.trim(), branch: $("#gbranch").value.trim() || "main",
        draftsRepo: $("#gdrafts").value.trim(), token: $("#gtoken").value.trim(),
      });
      if (!ns.owner || !ns.repo || !ns.token) { $("#gmsg").innerHTML = '<span class="error">Fill in username, website repository and token.</span>'; return; }
      DP.cloud.saveSettings(ns);
      $("#gmsg").textContent = "Testing…";
      try {
        const lines = await DP.cloud.test();
        $("#gmsg").innerHTML = '<span class="ok">✔ Connected.</span><br/>' + lines.map(esc).join("<br/>");
        if (DP.cloud.draftsOn()) { pulledOnce = false; await pullDrafts(true); $("#gmsg").innerHTML += "<br/>✔ Drafts synced."; }
      } catch (e) { $("#gmsg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
      showCloudStatus();
    };
    if ($("#gsync")) $("#gsync").onclick = async () => { $("#gmsg").textContent = "Syncing…"; await pullDrafts(true); await DP.cloud.flush(); $("#gmsg").innerHTML = '<span class="ok">✔ ' + esc(DP.cloud.status) + "</span>"; };
    if ($("#gdisc")) $("#gdisc").onclick = () => { if (confirm("Disconnect GitHub on this computer? Your charts stay in this browser and on GitHub.")) { DP.cloud.disconnect(); settingsView(); } };
  }
  window.addEventListener("hashchange", route);
  $("#nav-new").onclick = () => newChart();

  function newChart() {
    const cfg = DP.defaultConfig();
    const def = DP.store.getDefaults();
    if (def) { Object.assign(cfg.refine, def.refine || {}); Object.assign(cfg.layout, def.layout || {}); }
    cfg.id = DP.store.newId();
    cfg.folder = S.folder || "";
    cfg.createdAt = Date.now();
    DP.store.save(cfg);
    location.hash = "#/edit/" + cfg.id + "/1";
  }

  /* ------------------------------ dashboard ------------------------------ */
  function dashboard() {
    pullDrafts();
    const all = DP.store.list();
    const folders = Array.from(new Set(all.map((c) => c.folder).filter(Boolean))).sort();
    const shown = S.folder ? all.filter((c) => c.folder === S.folder) : all;
    const icon = (t) => (DP.CHART_TYPES.find((x) => x.id === t) || {}).icon || "▮";
    app.innerHTML = `
      <div class="dash-head">
        <h2>My charts</h2><div class="spacer"></div>
        <button class="btn ghost small" id="imp">Import backup</button>
        <button class="btn ghost small" id="exp">Download backup</button>
        <button class="btn" id="new2">＋ New chart</button>
      </div>
      <div class="folder-row">
        <div class="folder ${S.folder ? "" : "active"}" data-f="">All charts (${all.length})</div>
        ${folders.map((f) => `<div class="folder ${S.folder === f ? "active" : ""}" data-f="${esc(f)}">📁 ${esc(f)} (${all.filter((c) => c.folder === f).length})</div>`).join("")}
      </div>
      ${shown.length ? "" : `<div class="empty-note">No charts yet. Click <b>New chart</b> to make your first one.<br/>Tip: set a folder (Health, Poverty, Development…) in step 3 → Layout.</div>`}
      <div class="cards">
        ${shown.map((c) => `
          <div class="card" data-id="${c.id}">
            <h3 title="${esc(c.title)}">${esc(c.title || "Untitled chart")}</h3>
            <div class="meta">${esc((DP.CHART_TYPES.find((x) => x.id === c.type) || {}).name || "")} · edited ${timeAgo(c.updatedAt)}${c.folder ? " · " + esc(c.folder) : ""}</div>
            <div class="badge ${pubState(c)}">${{ new: "Draft", ok: "Published", changed: "Published · changed" }[pubState(c)]}</div>
            <div class="thumb">${icon(c.type)}</div>
            <div class="actions">
              <button class="btn ghost small" data-dup="${c.id}">Duplicate</button>
              <button class="btn danger small" data-del="${c.id}">Delete</button>
            </div>
          </div>`).join("")}
      </div>
      <input type="file" id="impfile" accept=".json" hidden />`;
    $("#new2").onclick = newChart;
    $$(".folder").forEach((f) => (f.onclick = () => { S.folder = f.dataset.f; dashboard(); }));
    $$(".card").forEach((card) => (card.onclick = (e) => {
      if (e.target.dataset.del) {
        if (confirm("Delete this chart? This cannot be undone.")) { DP.store.remove(e.target.dataset.del); dashboard(); }
        return;
      }
      if (e.target.dataset.dup) {
        const copy = JSON.parse(JSON.stringify(DP.store.get(e.target.dataset.dup)));
        copy.id = DP.store.newId();
        copy.title = (copy.title || "Untitled") + " (copy)";
        DP.store.save(copy);
        dashboard();
        return;
      }
      location.hash = "#/edit/" + card.dataset.id + "/3";
    }));
    $("#exp").onclick = () => download("datapott-charts-backup.json", DP.store.exportAll(), "application/json");
    $("#imp").onclick = () => $("#impfile").click();
    $("#impfile").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const parsed = JSON.parse(text);
        const n = parsed.id ? (DP.store.save(DP.normalizeConfig(parsed)), 1) : DP.store.importAll(text);
        alert("Imported " + n + " chart(s).");
        dashboard();
      } catch (err) { alert("That file is not a valid Datapott backup."); }
    };
  }

  function timeAgo(t) {
    if (!t) return "";
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    if (h < 24) return h + " hours ago";
    return Math.round(h / 24) + " days ago";
  }

  /* ------------------------------ editor shell ------------------------------ */
  function openEditor(id, step) {
    const cfg = DP.store.get(id);
    if (!cfg) { location.hash = "#/"; return; }
    if (!S.cfg || S.cfg.id !== id) {
      S.cfg = DP.normalizeConfig(cfg);
      S.raw = DP.parseText(S.cfg.data.text);
      S.activeCol = null;
      S.previewWidth = S.cfg.layout.previewWidth || 630;
    }
    S.step = step;
    rebuild();
    renderEditor();
  }

  function rebuild() { S.ds = DP.buildDataset(S.raw, S.cfg); }
  function persist() { DP.store.save(S.cfg); }
  function goStep(n) { location.hash = "#/edit/" + S.cfg.id + "/" + n; }

  let previewTimer;
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(drawPreview, 120); }
  function drawPreview() {
    const box = $("#preview");
    if (!box) return;
    box.style.width = S.previewWidth + "px";
    DP.renderChart(box, S.cfg, S.ds, {
      width: S.previewWidth,
      editable: S.step === 3 && S.tab === "annotate",
      onAnnoMove: (i, x, y) => { if (S.cfg.annotations[i]) { S.cfg.annotations[i].x = +x.toFixed(4); S.cfg.annotations[i].y = +y.toFixed(4); persist(); } },
    });
  }

  /** Change the config, save, and redraw. */
  function change(fn, opts) {
    opts = opts || {};
    fn(S.cfg);
    if (opts.data) rebuild();
    persist();
    if (opts.panel) renderEditor();
    else schedulePreview();
  }

  function renderEditor() {
    const names = ["Upload Data", "Check & Describe", "Visualize", "Publish & Embed"];
    app.innerHTML = `
      <div class="steps">${names.map((n, i) => `<div class="step ${S.step === i + 1 ? "active" : ""}" data-step="${i + 1}"><span class="num">${i + 1}</span>${n}</div>`).join("")}</div>
      <div id="stepbody"></div>`;
    $$(".step").forEach((s) => (s.onclick = () => goStep(Number(s.dataset.step))));
    const body = $("#stepbody");
    if (S.step === 1) stepUpload(body);
    else if (S.step === 2) stepCheck(body);
    else if (S.step === 3) stepVisualize(body);
    else stepPublish(body);
  }

  function navButtons(prev, next, nextLabel) {
    return `<div class="nav-buttons">
      ${prev ? `<button class="btn ghost" data-go="${prev}">← Back</button>` : "<span></span>"}
      ${next ? `<button class="btn" data-go="${next}">${nextLabel || "Proceed →"}</button>` : "<span></span>"}
    </div>`;
  }
  function bindNav(root) { $$("[data-go]", root).forEach((b) => (b.onclick = () => goStep(Number(b.dataset.go)))); }

  function previewHtml() {
    return `<div class="preview-wrap">
      <div class="preview" id="preview"></div>
      <div class="preview-bar">
        Size (px) <input type="number" id="pw" value="${S.previewWidth}" min="260" max="1400" />
        <button data-w="320" title="Mobile">📱</button><button data-w="400" title="Tablet">▭</button><button data-w="630" title="Desktop">🖥</button>
        <label class="check" style="margin:0"><input type="checkbox" id="pdark" ${S.cfg.layout.dark ? "checked" : ""}/> Dark mode</label>
      </div>
    </div>`;
  }
  function bindPreview(root) {
    $("#pw", root).oninput = (e) => { S.previewWidth = Number(e.target.value) || 630; S.cfg.layout.previewWidth = S.previewWidth; persist(); schedulePreview(); };
    $$("[data-w]", root).forEach((b) => (b.onclick = () => { S.previewWidth = Number(b.dataset.w); $("#pw").value = S.previewWidth; S.cfg.layout.previewWidth = S.previewWidth; persist(); drawPreview(); }));
    $("#pdark", root).onchange = (e) => change((c) => (c.layout.dark = e.target.checked));
    drawPreview();
  }

  /* ------------------------------ step 1: upload ------------------------------ */
  function stepUpload(body) {
    const d = S.cfg.data;
    const mode = d.mode || "paste";
    const tiles = [
      ["paste", "📋", "Copy & paste data table"],
      ["upload", "📄", "XLS/CSV upload"],
      ["sheet", "▦", "Connect Google Sheet"],
      ["url", "🔗", "Link external CSV"],
    ];
    let right = "";
    if (mode === "paste") {
      right = `<label class="field">Paste your table here (from Excel, Google Sheets, or CSV text)</label>
        <textarea id="pastebox" rows="14" placeholder="Region,2024,2025&#10;Africa,32,33&#10;Europe,64,65">${esc(d.text)}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn ghost small" id="sample" style="flex:0 0 auto">Load sample data</button><span class="hint">Sample: your CPI regional comparison</span></div>
        <div class="row" style="margin-top:6px"><button class="btn ghost small" id="mapsample" style="flex:0 0 auto">Load map test data</button><span class="hint">Every country with made-up test values (not real data)</span></div>`;
    } else if (mode === "upload") {
      right = `<label class="field">Choose a .csv, .xlsx or .xls file (first sheet is used)</label>
        <input type="file" id="filein" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods" />
        <div id="fstatus" class="hint">${d.fileName ? "Loaded: " + esc(d.fileName) : ""}</div>`;
    } else {
      right = `<label class="field">${mode === "sheet" ? "Enter a URL to a Google Sheet" : "Enter a URL to a public CSV file"}</label>
        <div class="row"><input type="url" id="sheeturl" value="${esc(d.url)}" placeholder="https://docs.google.com/spreadsheets/d/…" /><button class="btn" id="loadsheet" style="flex:0 0 auto">Load</button></div>
        <div id="sstatus" class="hint"></div>
        <label class="check"><input type="checkbox" id="live" ${d.live !== false ? "checked" : ""}/> Live updates: published charts re-read the sheet every time someone opens them</label>
        <p class="hint">In Google Sheets click <b>Share → Anyone with the link → Viewer</b>. Each tab has its own <code>gid=</code> in the URL; copy the URL while the right tab is open.</p>`;
    }
    body.innerHTML = `
      <div class="editor">
        <div class="panel">
          <h3>How do you want to upload your data?</h3>
          <div class="tiles">${tiles.map((t) => `<button class="tile ${mode === t[0] ? "active" : ""}" data-mode="${t[0]}"><span class="ico">${t[1]}</span>${t[2]}</button>`).join("")}</div>
          <p class="hint">Tip: put variable names in the first row, one row per item (country, region, year…), and one column per number series.</p>
          <p class="hint">${S.raw.length ? `✔ ${S.raw.length} rows × ${Math.max(...S.raw.map((r) => r.length))} columns loaded.` : "No data yet."}</p>
        </div>
        <div class="panel">${right}</div>
      </div>
      ${navButtons(null, 2)}`;
    bindNav(body);
    $$(".tile", body).forEach((t) => (t.onclick = () => change((c) => (c.data.mode = t.dataset.mode), { panel: true })));

    const setText = (text, extra) => {
      S.raw = DP.parseText(text);
      change((c) => { c.data.text = text; Object.assign(c.data, extra || {}); c.columns = {}; }, { data: true });
    };
    if (mode === "paste") {
      $("#pastebox").oninput = (e) => setText(e.target.value);
      $("#mapsample").onclick = async () => {
        await DP.loadGeo("110m");
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const rows = DP.geo.meta.filter((m) => m.num && m.r !== "Antarctic").map((m) => `"${m.n}",${m.a3},${Math.round(10 + rnd() * 80)},${Math.round(rnd() * 500) / 10}`);
        const text = "Country,ISO3,Test score,Test rate (%)\n" + rows.join("\n");
        $("#pastebox").value = text;
        setText(text);
        change((c) => { c.title = "Map test (made-up values, not real data)"; c.type = "map-choropleth"; c.refine.mapValue = "Test score"; c.notes = "Test values for trying the map. Not real data."; }, { panel: true });
      };
      $("#sample").onclick = () => {
        $("#pastebox").value = SAMPLE;
        setText(SAMPLE);
        change((c) => { if (!c.title) c.title = "2025 Corruption Perceptions Index (CPI) Regional Comparison"; c.type = "multiple-columns"; c.refine.panelsPerRow = 4; c.notes = "Source: Transparency International, Corruption Perceptions Index 2020–2025. Compiled by Datapott Analytics."; }, { panel: true });
      };
    } else if (mode === "upload") {
      $("#filein").onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const res = await DP.readFile(f);
          setText(res.rows.map((r) => r.map(csvCell).join(",")).join("\n"), { fileName: f.name });
          renderEditor();
        } catch (err) { $("#fstatus").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
      };
    } else {
      $("#live").onchange = (e) => change((c) => (c.data.live = e.target.checked));
      $("#loadsheet").onclick = async () => {
        const url = $("#sheeturl").value.trim();
        $("#sstatus").textContent = "Loading…";
        try {
          const res = await DP.fetchSheet(url);
          setText(res.text, { url });
          renderEditor();
        } catch (err) { $("#sstatus").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
      };
    }
  }
  function csvCell(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  /* ------------------------------ step 2: check ------------------------------ */
  function stepCheck(body) {
    let rows = S.raw.filter((r) => r.some((c) => c !== ""));
    if (S.cfg.transpose) rows = DP.transpose(rows);
    const cols = S.ds.columns;
    const dataRows = S.cfg.firstRowLabel !== false ? rows.slice(1) : rows;
    const active = cols.find((c) => c.name === S.activeCol);
    const letters = (i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");
    body.innerHTML = `
      <div class="editor">
        <div class="panel">
          <h3>Make sure the data looks right</h3>
          <p class="hint legend-types">In the table, <code style="color:#1d6fb8">number</code> columns are blue, <code style="color:#168232">dates</code> green and <code>text</code> black. A <code style="color:#c62828">red</code> cell is a problem to fix. Click a column header to change its type or hide it from the chart.</p>
          <label class="check"><input type="checkbox" id="frl" ${S.cfg.firstRowLabel !== false ? "checked" : ""}/> First row as label</label>
          <div class="row" style="margin-top:8px">
            <button class="btn ghost small" id="tr">⇄ Swap rows and columns</button>
            <button class="btn ghost small" id="rev">⟲ Revert column changes</button>
          </div>
          ${active ? `<div class="colmenu">
              <b>Column: ${esc(active.name)}</b>
              <label class="field">Type</label>
              <select id="ctype">${["auto", "number", "text", "date"].map((t) => `<option value="${t}" ${(S.cfg.columns[active.name] || {}).type === t || (t === "auto" && !(S.cfg.columns[active.name] || {}).type) ? "selected" : ""}>${t === "auto" ? "Auto-detect (" + DP.detectType(dataRows.map((r) => r[cols.indexOf(active)])) + ")" : t}</option>`).join("")}</select>
              <label class="check"><input type="checkbox" id="chide" ${active.hidden ? "checked" : ""}/> Hide column from visualization</label>
            </div>` : ""}
        </div>
        <div class="panel">
          ${cols.length ? `<div class="grid-wrap"><table class="grid">
            <thead><tr><th>↕</th>${cols.map((c, i) => `<th class="${c.hidden ? "hidden-col" : ""}" data-col="${esc(c.name)}">${letters(i)}</th>`).join("")}</tr>
            <tr><td class="rownum">1</td>${cols.map((c) => `<td class="${c.hidden ? "hidden-col" : ""}"><b>${esc(c.name)}</b></td>`).join("")}</tr></thead>
            <tbody>${dataRows.slice(0, 300).map((r, ri) => `<tr><td class="rownum">${ri + 2}</td>${cols.map((c, i) => {
              const v = r[i] == null ? "" : r[i];
              let cls = c.type;
              if (c.type === "number" && v !== "" && Number.isNaN(DP.toNumber(v))) cls = "bad";
              return `<td class="${cls} ${c.hidden ? "hidden-col" : ""}">${v === "" ? "—" : esc(v)}</td>`;
            }).join("")}</tr>`).join("")}</tbody></table></div>
            ${dataRows.length > 300 ? `<p class="hint">Showing the first 300 of ${dataRows.length} rows.</p>` : ""}` : `<div class="empty-note">No data yet. Go back to step 1.</div>`}
        </div>
      </div>
      ${navButtons(1, 3)}`;
    bindNav(body);
    $("#frl").onchange = (e) => change((c) => (c.firstRowLabel = e.target.checked), { data: true, panel: true });
    $("#tr").onclick = () => change((c) => { c.transpose = !c.transpose; c.columns = {}; }, { data: true, panel: true });
    $("#rev").onclick = () => change((c) => (c.columns = {}), { data: true, panel: true });
    $$("th[data-col]", body).forEach((th) => (th.onclick = () => { S.activeCol = th.dataset.col; renderEditor(); }));
    if (active) {
      const o = () => (S.cfg.columns[active.name] = S.cfg.columns[active.name] || {});
      $("#ctype").onchange = (e) => change(() => { if (e.target.value === "auto") delete o().type; else o().type = e.target.value; }, { data: true, panel: true });
      $("#chide").onchange = (e) => change(() => (o().hidden = e.target.checked), { data: true, panel: true });
    }
  }

  /* ------------------------------ step 3: visualize ------------------------------ */
  function stepVisualize(body) {
    const tabs = [["type", "Chart type"], ["refine", "Refine"], ["annotate", "Annotate"], ["layout", "Layout"]];
    body.innerHTML = `
      <div class="editor">
        <div class="panel">
          <div class="tabs">${tabs.map((t) => `<button data-tab="${t[0]}" class="${S.tab === t[0] ? "active" : ""}">${t[1]}</button>`).join("")}</div>
          <div id="tabbody"></div>
        </div>
        ${previewHtml()}
      </div>
      ${navButtons(2, 4)}`;
    bindNav(body);
    $$("[data-tab]", body).forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; renderEditor(); }));
    const tb = $("#tabbody");
    if (S.tab === "type") tabType(tb);
    else if (S.tab === "refine") (S.cfg.type.startsWith("map-") ? tabRefineMap(tb) : tabRefine(tb));
    else if (S.tab === "annotate") tabAnnotate(tb);
    else tabLayout(tb);
    bindPreview(body);
  }

  function tabType(tb) {
    tb.innerHTML = `<div class="types">${DP.CHART_TYPES.map((t) => `<button class="type ${S.cfg.type === t.id ? "active" : ""}" data-type="${t.id}"><span class="ico">${t.icon}</span>${t.name}</button>`).join("")}</div>
      <p class="hint">Hint: try <b>Swap rows and columns</b> in step 2 if your chart doesn't look right.</p>`;
    $$("[data-type]", tb).forEach((b) => (b.onclick = () => change((c) => { c.type = b.dataset.type; c.refine.colorBy = "auto"; }, { panel: true })));
  }

  /** Which keys get a colour picker for the current chart. */
  function colorKeys() {
    const t = S.cfg.type;
    const vis = S.ds.columns.filter((c) => !c.hidden);
    let label = vis.find((c) => c.name === S.cfg.refine.labelCol) || vis.find((c) => c.type !== "number") || vis[0];
    const valueCols = vis.filter((c) => c !== label && c.type === "number").map((c) => c.name);
    const cats = label ? S.ds.rows.map((r) => String(r[label.name])) : [];
    let mode = S.cfg.refine.colorBy;
    if (["pie", "donut", "multiple-donuts"].includes(t)) mode = "category";
    if (mode === "auto") {
      if (t === "multiple-columns") mode = "category";
      else if (["bar", "column", "scatter"].includes(t)) mode = "single";
      else mode = "series";
    }
    if (t === "table") return { mode: "series", keys: valueCols };
    return { mode, keys: mode === "series" ? valueCols : mode === "category" ? cats : ["__single__"] };
  }

  function tabRefine(tb) {
    const r = S.cfg.refine;
    const t = S.cfg.type;
    const vis = S.ds.columns.filter((c) => !c.hidden);
    const isPanels = ["multiple-columns", "multiple-lines", "multiple-donuts"].includes(t);
    const isColumn = ["column", "stacked-columns", "grouped-columns", "multiple-columns"].includes(t);
    const ck = colorKeys();
    const pal = DP.PALETTES[r.palette] || DP.PALETTES.datapott;
    const sel = (id, val, opts) => `<select id="${id}">${opts.map((o) => `<option value="${o[0]}" ${String(val) === String(o[0]) ? "selected" : ""}>${o[1]}</option>`).join("")}</select>`;
    tb.innerHTML = `
      <label class="field">Label column (categories / x-axis)</label>
      ${sel("labelCol", r.labelCol, [["", "Auto (first text column)"]].concat(vis.map((c) => [esc(c.name), esc(c.name)])))}
      <div class="row">
        <div><label class="field">Sort</label>${sel("sort", r.sort, [["none", "As in data"], ["desc", "Largest first"], ["asc", "Smallest first"]])}</div>
        <div><label class="field">Decimals</label>${sel("decimals", r.decimals, [["auto", "Auto"], [0, "0"], [1, "1"], [2, "2"], [3, "3"]])}</div>
      </div>
      <div class="row">
        <div><label class="field">Palette</label>${sel("palette", r.palette, Object.keys(DP.PALETTES).map((k) => [k, k[0].toUpperCase() + k.slice(1)]))}</div>
        <div><label class="field">Colour by</label>${sel("colorBy", r.colorBy, [["auto", "Auto"], ["single", "One colour"], ["category", "Each category"], ["series", "Each series"]])}</div>
      </div>
      <label class="field">Colours</label>
      <div class="colors">${ck.keys.map((k, i) => `<span>${k === "__single__" ? "Base colour" : esc(k)}</span><input type="color" data-ckey="${esc(k)}" value="${r.colors[k] || pal[i % pal.length]}" />`).join("")}</div>
      <button class="btn ghost small" id="resetcol" style="margin-top:6px">Reset colours</button>
      <h3 style="margin-top:18px">Number format</h3>
      <div class="row">
        <div><label class="field">Prefix</label><input type="text" id="prefix" value="${esc(r.prefix)}" placeholder="e.g. $"/></div>
        <div><label class="field">Suffix</label><input type="text" id="suffix" value="${esc(r.suffix)}" placeholder="e.g. % or M"/></div>
      </div>
      <label class="check"><input type="checkbox" id="thou" ${r.thousands !== false ? "checked" : ""}/> Thousands separator (1,000)</label>
      ${t === "table" || ["pie", "donut", "multiple-donuts"].includes(t) ? "" : `
      <label class="field">Value axis range <span class="hint">(leave empty for automatic)</span></label>
      <div class="row"><input type="number" id="amin" value="${esc(r.axisMin)}" placeholder="min"/><input type="number" id="amax" value="${esc(r.axisMax)}" placeholder="max"/></div>`}
      <h3 style="margin-top:18px">Display</h3>
      <label class="check"><input type="checkbox" id="tips" ${r.tooltips !== false ? "checked" : ""}/> Tooltips on hover</label>
      <label class="field">Value labels</label>
      <select id="lmode">
        <option value="all" ${r.valueLabels && (r.labelMode || "all") === "all" ? "selected" : ""}>Show all</option>
        <option value="firstlast" ${r.valueLabels && r.labelMode === "firstlast" ? "selected" : ""}>First and last only</option>
        <option value="last" ${r.valueLabels && r.labelMode === "last" ? "selected" : ""}>Last only</option>
        <option value="none" ${!r.valueLabels ? "selected" : ""}>Hide</option>
      </select>
      <label class="check"><input type="checkbox" id="grid" ${r.grid ? "checked" : ""}/> Grid lines</label>
      ${t === "table" ? `<label class="check"><input type="checkbox" id="tbars" ${r.tableBars ? "checked" : ""}/> Bars inside number cells</label>` : ""}
      ${isPanels ? `<h3 style="margin-top:18px">Panel layout</h3>
        <label class="field">Panels per row: <b id="pprv">${r.panelsPerRow}</b></label><input type="range" id="ppr" min="1" max="6" value="${r.panelsPerRow}" style="width:100%"/>
        <label class="field">Panel height (px)</label><input type="number" id="ph" value="${r.panelHeight}" min="80" max="600"/>`
        : `<label class="field">Chart height (px) <span class="hint">(bar and dot charts size themselves)</span></label><input type="number" id="hgt" value="${r.height}" min="120" max="1200"/>`}
      ${isColumn ? `<label class="field">Rotate axis labels</label>${sel("rot", r.rotateLabels, [["auto", "Auto"], ["always", "Always"], ["never", "Never"]])}` : ""}`;
    const bindSel = (id, key, panel) => { const n = $("#" + id, tb); if (n) n.onchange = (e) => change((c) => (c.refine[key] = e.target.value), { panel }); };
    bindSel("labelCol", "labelCol", true);
    bindSel("sort", "sort");
    bindSel("decimals", "decimals");
    bindSel("palette", "palette", true);
    bindSel("colorBy", "colorBy", true);
    bindSel("rot", "rotateLabels");
    $$("[data-ckey]", tb).forEach((inp) => (inp.oninput = (e) => change((c) => (c.refine.colors[inp.dataset.ckey] = e.target.value))));
    $("#resetcol", tb).onclick = () => change((c) => (c.refine.colors = {}), { panel: true });
    $("#lmode", tb).onchange = (e) => change((c) => {
      c.refine.valueLabels = e.target.value !== "none";
      if (e.target.value !== "none") c.refine.labelMode = e.target.value;
    });
    $("#tips", tb).onchange = (e) => change((c) => (c.refine.tooltips = e.target.checked));
    $("#thou", tb).onchange = (e) => change((c) => (c.refine.thousands = e.target.checked));
    $("#prefix", tb).oninput = (e) => change((c) => (c.refine.prefix = e.target.value));
    $("#suffix", tb).oninput = (e) => change((c) => (c.refine.suffix = e.target.value));
    if ($("#amin", tb)) $("#amin", tb).oninput = (e) => change((c) => (c.refine.axisMin = e.target.value));
    if ($("#amax", tb)) $("#amax", tb).oninput = (e) => change((c) => (c.refine.axisMax = e.target.value));
    $("#grid", tb).onchange = (e) => change((c) => (c.refine.grid = e.target.checked));
    if ($("#tbars", tb)) $("#tbars", tb).onchange = (e) => change((c) => (c.refine.tableBars = e.target.checked));
    if ($("#ppr", tb)) $("#ppr", tb).oninput = (e) => { $("#pprv").textContent = e.target.value; change((c) => (c.refine.panelsPerRow = Number(e.target.value))); };
    if ($("#ph", tb)) $("#ph", tb).oninput = (e) => change((c) => (c.refine.panelHeight = Number(e.target.value) || 180));
    if ($("#hgt", tb)) $("#hgt", tb).oninput = (e) => change((c) => (c.refine.height = Number(e.target.value) || 400));
  }

  function tabRefineMap(tb) {
    const r = S.cfg.refine;
    const t = S.cfg.type;
    const vis = S.ds.columns.filter((c) => !c.hidden);
    const nums = vis.filter((c) => c.type === "number");
    const sel = (id, val, opts) => `<select id="${id}">${opts.map((o) => `<option value="${esc(o[0])}" ${String(val) === String(o[0]) ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`;
    const scale = r.mapScale || "linear";
    tb.innerHTML = `
      <h3>Data</h3>
      <label class="field">Country column (country names or ISO codes like KEN, NGA)</label>
      ${sel("labelCol", r.labelCol, [["", "Auto (first text column)"]].concat(vis.map((c) => [c.name, c.name])))}
      <label class="field">Value to show on the map</label>
      ${sel("mapValue", r.mapValue, [["", "Auto (first number column)"]].concat(nums.map((c) => [c.name, c.name])))}
      <div id="matchrep" class="hint">Checking country names…</div>
      <h3 style="margin-top:18px">Map</h3>
      <label class="field">Region</label>
      ${sel("mapRegion", r.mapRegion, DP.MAP_REGIONS.map((x) => [x.id, x.name]))}
      ${t === "map-choropleth" ? `
        <label class="field">Colour scheme</label>
        ${sel("mapScheme", r.mapScheme, DP.MAP_SCHEMES)}
        <label class="check"><input type="checkbox" id="mapReverse" ${r.mapReverse ? "checked" : ""}/> Reverse colours</label>
        <label class="field">Colour scale</label>
        ${sel("mapScale", scale, [["linear", "Continuous gradient"], ["quantize", "Steps: equal intervals"], ["quantile", "Steps: equal number of countries"], ["breaks", "Steps: my own break points"]])}
        ${scale === "quantize" || scale === "quantile" ? `<label class="field">Number of steps</label><input type="number" id="mapSteps" min="2" max="9" value="${esc(r.mapSteps)}"/>` : ""}
        ${scale === "breaks" ? `<label class="field">Break points (comma separated)</label><input type="text" id="mapBreaks" value="${esc(r.mapBreaks)}" placeholder="e.g. 20, 40, 60, 80"/>` : ""}
        ${scale === "linear" || scale === "quantize" ? `<label class="field">Colour range <span class="hint">(empty = data min and max; CPI: 0 to 100)</span></label>
          <div class="row"><input type="number" id="amin" value="${esc(r.axisMin)}" placeholder="min"/><input type="number" id="amax" value="${esc(r.axisMax)}" placeholder="max"/></div>` : ""}`
      : `
        <label class="field">Circle colour</label>
        <input type="color" id="symcol" value="${(r.colors && r.colors.__single__) || (DP.PALETTES[r.palette] || DP.PALETTES.datapott)[0]}"/>
        <label class="field">Largest circle size: <b id="mrv">${esc(r.mapMaxRadius)}</b> px</label>
        <input type="range" id="mapMaxRadius" min="8" max="60" value="${esc(r.mapMaxRadius)}" style="width:100%"/>`}
      <h3 style="margin-top:18px">Number format</h3>
      <div class="row">
        <div><label class="field">Prefix</label><input type="text" id="prefix" value="${esc(r.prefix)}" placeholder="e.g. $"/></div>
        <div><label class="field">Suffix</label><input type="text" id="suffix" value="${esc(r.suffix)}" placeholder="e.g. %"/></div>
      </div>
      <div class="row">
        <div><label class="field">Decimals</label>${sel("decimals", r.decimals, [["auto", "Auto"], [0, "0"], [1, "1"], [2, "2"], [3, "3"]])}</div>
        <div><label class="check" style="margin-top:30px"><input type="checkbox" id="thou" ${r.thousands !== false ? "checked" : ""}/> 1,000 separator</label></div>
      </div>
      <label class="check"><input type="checkbox" id="tips" ${r.tooltips !== false ? "checked" : ""}/> Tooltips on hover</label>`;

    const bindSel = (id, key, panel) => { const n = $("#" + id, tb); if (n) n.onchange = (e) => change((c) => (c.refine[key] = e.target.value), { panel }); };
    bindSel("labelCol", "labelCol", true);
    bindSel("mapValue", "mapValue");
    bindSel("mapRegion", "mapRegion");
    bindSel("mapScheme", "mapScheme");
    bindSel("mapScale", "mapScale", true);
    bindSel("decimals", "decimals");
    const bindIn = (id, key, num) => { const n = $("#" + id, tb); if (n) n.oninput = (e) => change((c) => (c.refine[key] = num ? Number(e.target.value) : e.target.value)); };
    bindIn("mapSteps", "mapSteps", true);
    bindIn("mapBreaks", "mapBreaks");
    bindIn("amin", "axisMin");
    bindIn("amax", "axisMax");
    bindIn("prefix", "prefix");
    bindIn("suffix", "suffix");
    if ($("#mapReverse", tb)) $("#mapReverse", tb).onchange = (e) => change((c) => (c.refine.mapReverse = e.target.checked));
    if ($("#mapMaxRadius", tb)) $("#mapMaxRadius", tb).oninput = (e) => { $("#mrv").textContent = e.target.value; change((c) => (c.refine.mapMaxRadius = Number(e.target.value))); };
    if ($("#symcol", tb)) $("#symcol", tb).oninput = (e) => change((c) => (c.refine.colors.__single__ = e.target.value));
    $("#thou", tb).onchange = (e) => change((c) => (c.refine.thousands = e.target.checked));
    $("#tips", tb).onchange = (e) => change((c) => (c.refine.tooltips = e.target.checked));

    // country match report
    DP.loadGeo("110m").then(() => {
      const box = $("#matchrep", tb);
      if (!box) return;
      const label = vis.find((c) => c.name === r.labelCol) || vis.find((c) => c.type !== "number") || vis[0];
      if (!label) { box.textContent = ""; return; }
      const rep = DP.mapMatchReport(S.ds, label.name);
      box.innerHTML = rep.unmatched.length
        ? `<span class="ok">✔ ${rep.matched} of ${rep.total} rows matched a country.</span><br/><span class="error">Not matched (${rep.unmatched.length}): ${rep.unmatched.slice(0, 15).map(esc).join(", ")}${rep.unmatched.length > 15 ? "…" : ""}</span><br/>Rows like regions or "Global average" are fine to leave. For a country, use its English name or 3-letter ISO code.`
        : `<span class="ok">✔ All ${rep.total} rows matched a country.</span>`;
    });
  }

  function tabAnnotate(tb) {
    const c = S.cfg;
    const f = (id, label, val, ph, area) => `<label class="field">${label}</label>${area ? `<textarea id="${id}" rows="3" placeholder="${ph}">${esc(val)}</textarea>` : `<input type="text" id="${id}" value="${esc(val)}" placeholder="${ph}"/>`}`;
    tb.innerHTML = `
      ${f("title", "Title", c.title, "e.g. 2025 Corruption Perceptions Index: Regional Comparison")}
      ${f("description", "Description", c.description, "One or two sentences under the title", true)}
      ${f("notes", "Notes", c.notes, "Notes shown below the chart", true)}
      <div class="row"><div>${f("source", "Data source", c.source, "Who published the data?")}</div><div>${f("sourceUrl", "Link to data source", c.sourceUrl, "https://…")}</div></div>
      ${f("byline", "Byline", c.byline, "Who created the visualization? e.g. Datapott Analytics")}
      ${f("alt", "Alternative description for screen readers", c.alt, "Describe the chart for readers who can't see it", true)}
      <h3 style="margin-top:18px">Highlight elements</h3>
      <p class="hint">Tick bars, regions or lines to keep in colour. Everything else turns grey.</p>
      <div class="hl-list">${highlightOptions().map((o) => `<label class="hl-chip ${(c.refine.highlight || []).includes(o) ? "on" : ""}"><input type="checkbox" data-hl="${esc(o)}" ${(c.refine.highlight || []).includes(o) ? "checked" : ""}/>${esc(o)}</label>`).join("")}</div>
      ${(c.refine.highlight || []).length ? `<button class="btn ghost small" id="hlclear" style="margin-top:6px">Clear highlights</button>` : ""}
      <h3 style="margin-top:18px">Text annotations</h3>
      <p class="hint">Add a note, then <b>drag it</b> in the preview to place it.</p>
      <div id="annos">${(c.annotations || []).map((a, i) => `
        <div class="anno-item" data-i="${i}">
          <textarea rows="2" data-k="text">${esc(a.text)}</textarea>
          <div class="row anno-opts">
            <select data-k="size"><option value="s" ${a.size === "s" ? "selected" : ""}>Small</option><option value="m" ${!a.size || a.size === "m" ? "selected" : ""}>Normal</option><option value="l" ${a.size === "l" ? "selected" : ""}>Large</option></select>
            <select data-k="align"><option value="left" ${!a.align || a.align === "left" ? "selected" : ""}>Left</option><option value="center" ${a.align === "center" ? "selected" : ""}>Centre</option><option value="right" ${a.align === "right" ? "selected" : ""}>Right</option></select>
            <input type="color" data-k="color" value="${esc(a.color || "#1d1d1d")}" title="Text colour"/>
            <label class="mini"><input type="checkbox" data-k="bold" ${a.bold ? "checked" : ""}/>Bold</label>
            <label class="mini"><input type="checkbox" data-k="box" ${a.box ? "checked" : ""}/>Box</label>
            <button class="btn danger small" data-del="${i}" title="Delete note">✕</button>
          </div>
        </div>`).join("")}</div>
      <button class="btn ghost small" id="addanno">＋ Add text annotation</button>`;
    $("#addanno", tb).onclick = () => change((cfg) => cfg.annotations.push({ text: "Your note here", x: 0.55, y: 0.15, size: "m", align: "left", color: "#1d1d1d", bold: false, box: false }), { panel: true });
    $$(".anno-item", tb).forEach((item) => {
      const i = Number(item.dataset.i);
      $$("[data-k]", item).forEach((inp) => {
        const k = inp.dataset.k;
        const ev = inp.tagName === "SELECT" || inp.type === "checkbox" ? "onchange" : "oninput";
        inp[ev] = () => change((cfg) => (cfg.annotations[i][k] = inp.type === "checkbox" ? inp.checked : inp.value));
      });
      $("[data-del]", item).onclick = () => change((cfg) => cfg.annotations.splice(i, 1), { panel: true });
    });
    $$("[data-hl]", tb).forEach((cb) => (cb.onchange = () => change((cfg) => {
      const set = new Set(cfg.refine.highlight || []);
      if (cb.checked) set.add(cb.dataset.hl); else set.delete(cb.dataset.hl);
      cfg.refine.highlight = Array.from(set);
    }, { panel: true })));
    if ($("#hlclear", tb)) $("#hlclear", tb).onclick = () => change((cfg) => (cfg.refine.highlight = []), { panel: true });
    ["title", "description", "notes", "source", "sourceUrl", "byline", "alt"].forEach((k) => ($("#" + k, tb).oninput = (e) => change((cfg) => (cfg[k] = e.target.value))));
  }

  /** Categories and series the user can highlight. */
  function highlightOptions() {
    const vis = S.ds.columns.filter((c) => !c.hidden);
    const label = vis.find((c) => c.name === S.cfg.refine.labelCol) || vis.find((c) => c.type !== "number") || vis[0];
    const cats = label ? S.ds.rows.map((r) => String(r[label.name])) : [];
    const series = vis.filter((c) => c !== label && c.type === "number").map((c) => c.name);
    const t = S.cfg.type;
    if (["lines", "multiple-lines", "area"].includes(t)) return series;
    if (["stacked-bars", "stacked-columns", "grouped-bars", "grouped-columns", "dot", "range", "arrow"].includes(t)) return series.concat(cats);
    return cats;
  }

  function tabLayout(tb) {
    const l = S.cfg.layout;
    tb.innerHTML = `
      <h3>Footer</h3>
      <label class="check"><input type="checkbox" id="dd" ${l.dataDownload ? "checked" : ""}/> "Get the data" download link</label>
      <label class="check"><input type="checkbox" id="att" ${l.attribution ? "checked" : ""}/> "Created with Datapott Charts" (free to switch off: it is your tool)</label>
      <h3 style="margin-top:18px">Logo</h3>
      <select id="logo">
        <option value="datapott" ${l.logo === "datapott" ? "selected" : ""}>DataPott Analytics wordmark</option>
        <option value="image" ${l.logo === "image" ? "selected" : ""}>My logo image</option>
        <option value="none" ${l.logo === "none" ? "selected" : ""}>No logo</option>
      </select>
      ${l.logo === "image" ? `<label class="field">Logo image address</label><input type="text" id="logourl" value="${esc(l.logoUrl)}"/>
        <p class="hint">Put your logo file in the <code>assets</code> folder on GitHub as <code>logo.png</code>, or paste a full image link.</p>` : ""}
      <h3 style="margin-top:18px">Appearance</h3>
      <label class="check"><input type="checkbox" id="dark" ${l.dark ? "checked" : ""}/> Dark mode</label>
      <h3 style="margin-top:18px">Organize</h3>
      <label class="field">Folder (e.g. Health, Poverty, Development, Climate Change, Food & Hunger)</label>
      <input type="text" id="folder" value="${esc(S.cfg.folder)}" list="folders"/>
      <datalist id="folders">${Array.from(new Set(DP.store.list().map((c) => c.folder).filter(Boolean))).map((f) => `<option value="${esc(f)}">`).join("")}</datalist>
      <h3 style="margin-top:18px">My default style</h3>
      <p class="hint">Save this chart's palette, number format, labels, grid, footer, logo and map colours as the starting style for every new chart.</p>
      <div class="row" style="gap:8px">
        <button class="btn ghost small" id="savedef" style="flex:0 0 auto">💾 Save as my default style</button>
        ${DP.store.getDefaults() ? `<button class="btn ghost small" id="resetdef" style="flex:0 0 auto">Reset to standard</button>` : ""}
      </div>
      <div id="defmsg" class="hint"></div>`;
    $("#savedef", tb).onclick = () => {
      const r = S.cfg.refine, l = S.cfg.layout;
      const pick = (o, keys) => keys.reduce((m, k) => ((m[k] = o[k]), m), {});
      DP.store.setDefaults({
        refine: pick(r, ["palette", "decimals", "thousands", "prefix", "suffix", "valueLabels", "labelMode", "grid", "tooltips", "rotateLabels", "panelsPerRow", "panelHeight", "height", "mapScheme", "mapScale", "mapSteps", "mapReverse"]),
        layout: pick(l, ["dataDownload", "attribution", "dark", "logo", "logoUrl", "previewWidth"]),
      });
      $("#defmsg").innerHTML = '<span class="ok">✔ Saved. New charts will start with this style.</span>';
    };
    if ($("#resetdef", tb)) $("#resetdef", tb).onclick = () => { DP.store.setDefaults(null); renderEditor(); };
    $("#dd", tb).onchange = (e) => change((c) => (c.layout.dataDownload = e.target.checked));
    $("#logo", tb).onchange = (e) => change((c) => (c.layout.logo = e.target.value), { panel: true });
    if ($("#logourl", tb)) $("#logourl", tb).oninput = (e) => change((c) => (c.layout.logoUrl = e.target.value.trim()));
    $("#att", tb).onchange = (e) => change((c) => (c.layout.attribution = e.target.checked));
    $("#dark", tb).onchange = (e) => change((c) => (c.layout.dark = e.target.checked), { panel: true });
    $("#folder", tb).oninput = (e) => change((c) => (c.folder = e.target.value.trim()));
  }

  /* ------------------------------ step 4: publish ------------------------------ */
  function embedCode(url, id, title) {
    return `<iframe title="${esc(title || "Datapott chart")}" src="${url}" data-datapott-id="${id}" scrolling="no" frameborder="0" style="width:100%;border:none;" height="500"></iframe>` +
      `<script>window.addEventListener("message",function(e){if(e.data&&e.data.type==="datapott-height"){document.querySelectorAll("iframe[data-datapott-id]").forEach(function(f){if(f.contentWindow===e.source){f.style.height=e.data.height+"px";}});}});<\/script>`;
  }

  /** Fingerprint of everything that affects how the chart looks (to spot unpublished changes). */
  function contentHash(cfg) {
    const c = Object.assign({}, cfg);
    ["updatedAt", "createdAt", "publishedAt", "publishedHash", "publishedVersion", "folder"].forEach((k) => delete c[k]);
    c.layout = Object.assign({}, c.layout);
    delete c.layout.previewWidth;
    const str = JSON.stringify(c);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function pubState(cfg) {
    cfg = cfg || S.cfg;
    if (!cfg.publishedHash) return "new";
    return cfg.publishedHash === contentHash(cfg) ? "ok" : "changed";
  }

  function stepPublish(body) {
    const base = new URL("chart.html", location.href.split("#")[0]).href;
    const permUrl = base + "?id=" + encodeURIComponent(S.cfg.id);
    body.innerHTML = `
      <div class="editor">
        <div class="panel">
          <div class="pub-section">
            <h4>1. Publish (permanent link for datapott.org articles)</h4>
            ${DP.cloud.connected() ? `
              <div class="pubstate ${pubState()}">${{ new: "Not published yet.", ok: "✔ Published. The live chart matches what you see.", changed: "✎ Published, but changed since. Republish to update every article that embeds it." }[pubState()]}</div>
              <button class="btn big" id="pubbtn">${pubState() === "new" ? "🚀 Publish" : "🔄 Republish"}</button>
              <div id="pubmsg" class="hint"></div>`
            : `<p class="hint">Connect GitHub once in <a href="#/settings">⚙ Settings</a> to publish with one click. Until then, use the manual steps further down.</p>`}
            <label class="field">Chart ID (part of the link)</label>
            <div class="row"><input type="text" id="cid" value="${esc(S.cfg.id)}"/><button class="btn ghost small" id="renid" style="flex:0 0 auto">Rename ID</button></div>
            <details ${DP.cloud.connected() ? "" : "open"} style="margin-top:8px"><summary>Manual publishing (download the file and upload it to GitHub yourself)</summary>
              <p class="hint">Download the chart file, then upload it into the <code>charts/</code> folder of your GitHub repository. After about a minute the link below works for everyone.</p>
              <button class="btn ghost" id="dljson">⬇ Download ${esc(S.cfg.id)}.json</button>
            </details>
            <label class="field">Link to your visualization</label>
            <div class="row"><input type="text" readonly value="${esc(permUrl)}" id="plink"/><button class="btn ghost small" data-copy="plink" style="flex:0 0 auto">Copy</button></div>
            <label class="field">Embed code (responsive iframe)</label>
            <textarea class="codebox" rows="4" readonly id="pembed">${esc(embedCode(permUrl, S.cfg.id, S.cfg.title))}</textarea>
            <button class="btn ghost small" data-copy="pembed">Copy embed code</button>
          </div>
          <div class="pub-section">
            <h4>2. Instant share link (no upload needed)</h4>
            <p class="hint">The whole chart is packed inside the link itself. Great for quick sharing and testing. For large tables the link gets long.</p>
            <button class="btn ghost" id="mkquick">Create instant link</button>
            <div id="quick"></div>
          </div>
          <div class="pub-section">
            <h4>3. Export image or PDF</h4>
            <label class="field">Size</label>
            <select id="epreset">${DP.EXPORT_PRESETS.map((p) => `<option value="${p.id}" ${S.exportPreset === p.id ? "selected" : ""}>${p.name}</option>`).join("")}</select>
            <div class="row">
              <div><label class="field">Format</label><select id="efmt">
                <option value="png">PNG (best for social media)</option><option value="jpg">JPG</option>
                <option value="pdf">PDF</option><option value="svg">SVG</option></select></div>
              <div id="escalebox"><label class="field">Resolution</label><select id="escale"><option value="1">1×</option><option value="2" selected>2×</option><option value="3">3×</option></select></div>
            </div>
            <label class="check"><input type="checkbox" id="etrans"/> Transparent background (PNG only)</label>
            <div class="row" style="gap:8px">
              <button class="btn ghost" id="eprev" style="flex:0 0 auto">👁 Preview this size</button>
              <button class="btn" id="dlimg" style="flex:0 0 auto">⬇ Download</button>
            </div>
            <div id="eout" class="hint"></div>
            <p class="hint">Social sizes re-draw the chart to fit the frame (taller or shorter plot), so nothing is stretched.</p>
          </div>
        </div>
        ${previewHtml()}
      </div>
      ${navButtons(3, null)}`;
    bindNav(body);
    bindPreview(body);
    $$("[data-copy]", body).forEach((b) => (b.onclick = () => copy($("#" + b.dataset.copy).value, b)));
    $("#dljson").onclick = () => {
      const out = Object.assign({}, S.cfg);
      download(S.cfg.id + ".json", JSON.stringify(out, null, 2), "application/json");
    };
    if ($("#pubbtn")) $("#pubbtn").onclick = async (e) => {
      const btn = e.target;
      btn.disabled = true;
      $("#pubmsg").textContent = "Publishing to GitHub…";
      try {
        const v = await DP.cloud.publish(S.cfg);
        S.cfg.publishedVersion = v;
        S.cfg.publishedHash = contentHash(S.cfg);
        S.cfg.publishedAt = Date.now();
        persist();
        stepPublish(body);
        $("#pubmsg").innerHTML = `<span class="ok">✔ Published (version ${v}). GitHub Pages updates the live link in about 1 minute.</span> <a href="${esc(permUrl)}" target="_blank" rel="noopener">Open live chart ↗</a>`;
      } catch (err) {
        btn.disabled = false;
        $("#pubmsg").innerHTML = `<span class="error">${esc(err.message)}</span>`;
      }
    };
    $("#renid").onclick = () => {
      const nid = $("#cid").value.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
      if (!nid || nid === S.cfg.id) return;
      if (DP.store.get(nid)) { alert("That ID is already used by another chart."); return; }
      DP.store.remove(S.cfg.id);
      S.cfg.id = nid;
      persist();
      goStep(4);
    };
    $("#mkquick").onclick = async () => {
      const cfg = JSON.parse(JSON.stringify(S.cfg));
      if (cfg.data.mode === "sheet" && cfg.data.live !== false && cfg.data.text.length > 4000) cfg.data.text = "";
      const packed = await DP.packConfig(cfg);
      const url = base + "#" + packed;
      $("#quick").innerHTML = `<label class="field">Link (${url.length} characters)</label>
        <div class="row"><input type="text" readonly id="qlink" value="${esc(url)}"/><button class="btn ghost small" id="cq1" style="flex:0 0 auto">Copy</button></div>
        <label class="field">Embed code</label><textarea class="codebox" rows="4" readonly id="qembed">${esc(embedCode(url, S.cfg.id, S.cfg.title))}</textarea>
        <button class="btn ghost small" id="cq2">Copy embed code</button> <a href="${esc(url)}" target="_blank" rel="noopener">Open in new tab ↗</a>`;
      $("#cq1").onclick = (e) => copy($("#qlink").value, e.target);
      $("#cq2").onclick = (e) => copy($("#qembed").value, e.target);
    };
    const expOpts = () => ({
      format: $("#efmt").value,
      preset: $("#epreset").value,
      scale: Number($("#escale").value),
      transparent: $("#etrans").checked,
      previewWidth: S.previewWidth,
      fileName: (S.cfg.title || S.cfg.id).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60).toLowerCase() || "chart",
    });
    const syncScale = () => ($("#escalebox").style.visibility = $("#epreset").value === "chart" ? "visible" : "hidden");
    $("#epreset").onchange = () => { S.exportPreset = $("#epreset").value; syncScale(); $("#eout").innerHTML = ""; };
    syncScale();
    $("#eprev").onclick = async () => {
      $("#eout").textContent = "Drawing…";
      try {
        const url = await DP.exportChart(S.cfg, S.ds, Object.assign(expOpts(), { preview: true }));
        $("#eout").innerHTML = `<img src="${url}" class="export-preview" alt="Export preview"/>`;
      } catch (err) { $("#eout").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
    };
    $("#dlimg").onclick = async (e) => {
      const btn = e.target, old = btn.textContent;
      btn.disabled = true; btn.textContent = "Preparing…";
      try { await DP.exportChart(S.cfg, S.ds, expOpts()); }
      catch (err) { alert("Export failed: " + err.message); }
      finally { btn.disabled = false; btn.textContent = old; }
    };
  }

  /* ------------------------------ utils ------------------------------ */
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    const old = btn.textContent;
    btn.textContent = "Copied ✓";
    setTimeout(() => (btn.textContent = old), 1500);
  }

  route();
  showCloudStatus();
})(window.DP);
