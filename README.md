# Datapott Charts

Your own chart maker for Datapott Analytics: load data from Google Sheets, Excel/CSV or paste,
make the chart in 4 steps (Upload → Check → Visualize → Publish), then embed it in datapott.org articles.

No monthly fees. No "Created with Datawrapper" footer. Free SVG export. Live Google Sheets updates.

---

## What is in this folder

```
datapott-charts/
├── index.html          ← the editor (dashboard + 4-step chart wizard)
├── chart.html          ← the public chart page that articles embed
├── charts/             ← published chart files (one .json per chart)
│   └── cpi-2025-regional.json   (example)
├── css/
│   ├── app.css         ← editor look
│   └── chart.css       ← chart look (title, legend, footer)
├── js/
│   ├── data.js         ← reading paste / CSV / Excel / Google Sheets, column types
│   ├── render.js       ← draws all 18 chart types
│   ├── store.js        ← saves your charts (in the browser for now)
│   └── editor.js       ← the editor screens
├── vendor/             ← chart libraries (D3, Observable Plot, PapaParse, SheetJS, html-to-image)
├── ROADMAP.md          ← what we build next, phase by phase
└── README.md           ← this guide
```

There is no build step. Every file is plain HTML, CSS and JavaScript, so you can edit it in any editor
and upload it anywhere.

---

## STEP 1. Run it on your computer

1. Install **Visual Studio Code** (free): https://code.visualstudio.com
2. In VS Code, open the Extensions panel and install **Live Server** (by Ritwick Dey).
3. Unzip this folder, then in VS Code choose **File → Open Folder** and pick `datapott-charts`.
4. Right-click `index.html` → **Open with Live Server**. Your browser opens the editor.
5. Click **Create new chart → Load sample data → Proceed**, and try the chart types.

(Double-clicking `index.html` also works for the editor, but the permanent chart links need Live Server.)

---

## STEP 2. Put the code on GitHub

1. Create a free account at https://github.com (use datapottanalytics@gmail.com).
2. Click **+ → New repository**.
   * Name: `datapott-charts`
   * Public (GitHub Pages is free for public repositories)
   * Click **Create repository**.
3. On the new empty repository page click **uploading an existing file**.
4. Drag **everything inside** the `datapott-charts` folder (not the folder itself) into the page.
   Do not upload `node_modules` if you see one.
5. Write a message such as `First version` and click **Commit changes**.

Later, when you are comfortable, install **GitHub Desktop** (https://desktop.github.com). It lets you edit
files in VS Code and push changes with one click instead of uploading by hand.

---

## STEP 3. Switch on free hosting (GitHub Pages)

1. In the repository click **Settings → Pages**.
2. Under **Build and deployment** choose **Source: Deploy from a branch**, Branch: **main**, folder **/ (root)**, click **Save**.
3. Wait 1–2 minutes. The page shows a link such as `https://YOUR-USERNAME.github.io/datapott-charts/`.
4. Open it. You should see the Datapott Charts dashboard.

Test the example chart: `https://YOUR-USERNAME.github.io/datapott-charts/chart.html?id=cpi-2025-regional`

---

## STEP 4. Connect datapott.com

### 4a. Tell GitHub about the domain
1. **Settings → Pages → Custom domain**: type `datapott.com`, click **Save**.
   GitHub adds a small `CNAME` file to your repository. Leave it there.
2. Recommended for safety: GitHub profile picture → **Settings → Pages → Add a domain** and follow the
   steps to verify datapott.com (it gives you one TXT record to add in 4b).

### 4b. Point the domain at GitHub (in Namecheap)
First find out where datapott.com's DNS is managed:

* Namecheap → **Domain List → datapott.com → Manage**. Look at **Nameservers**.
  * If it says **Namecheap BasicDNS**: go to the **Advanced DNS** tab.
  * If it says **Custom DNS** with `dns1.namecheaphosting.com` / `dns2.namecheaphosting.com`:
    the DNS lives in your hosting. Log in to **cPanel → Zone Editor → datapott.com → Manage**.

Then:
1. Delete the existing **A record** for `@` and the existing **CNAME** (or A) record for `www`
   (they point to your Namecheap hosting, which datapott.com is not using).
2. Add these records:

| Type  | Host | Value                       |
|-------|------|-----------------------------|
| A     | @    | 185.199.108.153             |
| A     | @    | 185.199.109.153             |
| A     | @    | 185.199.110.153             |
| A     | @    | 185.199.111.153             |
| CNAME | www  | YOUR-USERNAME.github.io     |

3. Wait. It usually works within an hour, sometimes up to 24 hours.
4. Back in **Settings → Pages**, tick **Enforce HTTPS** once it is available.

datapott.org is not touched. It stays on your Namecheap hosting exactly as it is.

Your links are now:
* Editor: `https://datapott.com/`
* A chart: `https://datapott.com/chart.html?id=cpi-2025-regional`

---

## STEP 5. Your everyday workflow

1. Prepare data in Google Sheets (variable names in row 1). Share it: **Anyone with the link → Viewer**.
2. Open `https://datapott.com` → **Create new chart → Connect Google Sheet** → paste the URL → **Load**.
   Keep **Live updates** ticked if you want the published chart to follow changes in the sheet.
3. **Check & Describe**: numbers should be blue. Click a column letter to hide it or change its type.
4. **Visualize**: pick the chart type, then Refine (colours, sorting, panels), Annotate (title, notes,
   source), Layout (footer, dark mode, folder).
5. **Publish & Embed**:
   * Click **Rename ID** to give a readable name, e.g. `hiv-funding-2026`.
   * Click **Download hiv-funding-2026.json**.
   * On GitHub open the `charts` folder → **Add file → Upload files** → drop the .json → **Commit**.
   * After about a minute, copy the **embed code** and paste it into your datapott.org article
     (in WordPress use a **Custom HTML** block). The chart resizes itself on phones.
   * Or download a PNG/SVG for social media and Word documents.

Changing a published chart: edit it, download the .json again, upload it to `charts/` with the same name.
GitHub replaces the old file and every article updates.

---

## STEP 6. Back up your work

In this first version your chart drafts are saved **inside your browser** on this computer.
Use **Dashboard → Download backup** every week, and **Import backup** on another computer.
Phase 3 of the roadmap moves charts into an online database so this step disappears.

---

## Updating the chart libraries (optional, later)

```
npm install
cp node_modules/d3/dist/d3.min.js node_modules/@observablehq/plot/dist/plot.umd.min.js \
   node_modules/papaparse/papaparse.min.js node_modules/xlsx/dist/xlsx.full.min.js \
   node_modules/html-to-image/dist/html-to-image.js vendor/
```
