# Datapott Charts roadmap

We build in phases. Each phase ends with something that works and is live on datapott.com.

## Phase 1: Working chart maker (DONE, this version)
- [x] 4-step wizard: Upload, Check & Describe, Visualize, Publish & Embed
- [x] Data: paste, CSV/XLSX upload, Google Sheets link, external CSV link
- [x] Column types (number/text/date), hide columns, swap rows and columns
- [x] 18 chart types: bar, stacked bars, grouped bars, column, stacked columns, grouped columns,
      multiple columns, lines, multiple lines, area, scatter, dot, range, arrow, pie, donut,
      multiple donuts, table
- [x] Refine: palettes, custom colours per series/category, sorting, value labels, decimals,
      panels per row, panel height, label rotation, grid
- [x] Annotate: title, description, notes, source + link, byline, screen-reader description
- [x] Layout: "Get the data", attribution on/off, dark mode, folders
- [x] Publish: permanent links (charts/*.json), instant share links, responsive auto-height embed
- [x] Export: PNG, JPG, SVG at 1×–3×
- [x] Dashboard with folders, duplicate, delete, backup/import
- [x] Live Google Sheets: published charts re-read the sheet on every view

## Phase 2: Datawrapper-level polish
- [x] Choropleth maps: World, Africa + 5 African sub-regions, MENA, Europe, Asia, Americas, Latin America, Oceania
- [x] Symbol (bubble) maps with size legend
- [x] Country matching by name or ISO code (World Bank / UN / TI spellings), with a report of unmatched rows
- [x] Colour scales: continuous, equal steps, quantiles, own break points; 12 colour schemes; reverse
- [ ] Locator maps, country labels on maps, sub-national maps (e.g. Kenya counties)
- [x] Instant hover tooltips on every chart type (also works by tapping on phones)
- [x] Linked hover in multi-panel charts: the same year/category lights up in every panel
- [x] Value labels: all, first and last, last only, or hidden; year axes show first and last year
- [x] Number formats: prefix/suffix (%, $, M), thousands, custom axis ranges
- [x] Highlights (colour chosen bars/regions/lines, grey the rest)
- [ ] Text annotations on the chart
- [x] Logo in footer (DataPott wordmark or your own image in assets/logo.png)
- [ ] Brand fonts and saved default settings
- [ ] PDF export; social-media sizes (1080×1080, 1200×675)
- [ ] Sort panels, separate mobile panel count, reverse order
- [ ] Election donut, waterfall and dual-axis charts (Datawrapper Business features, free here)

## Phase 3: Accounts and online saving
- [ ] Move saving from the browser into an online database (Supabase: database + login, has a free tier)
      Alternative: PHP + MySQL on the existing Namecheap hosting
- [ ] Log in from any device; drafts follow you
- [ ] One-click Publish (no more uploading .json files to GitHub)
- [ ] Edit history and comments
- [ ] Team members (co-authors, students, partners)

## Phase 4: datapott.com as a product
- [ ] Landing page and public gallery of Datapott charts, linked to datapott.org articles
- [ ] View counts per chart
- [ ] "Reuse this chart" for other users (like Datawrapper River)
- [ ] Simple API: create charts from Python/R scripts
- [ ] Optional paid tier or grant-funded open access for NGOs and researchers

## Phase 5: Engineering upgrades (when the code grows)
- [ ] Move to Vite + Svelte (or React) with TypeScript
- [ ] Automated tests and GitHub Actions deploys
- [ ] Error tracking and backups
