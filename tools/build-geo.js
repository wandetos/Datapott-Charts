/* Builds the map files in /data from npm packages.
   Run once (or when updating map data):
     npm install world-atlas@2 world-countries
     node tools/build-geo.js
*/
const fs = require("fs");
const path = require("path");
const countries = require("world-countries");
const out = path.join(__dirname, "..", "data");
fs.mkdirSync(out, { recursive: true });

// Extra spellings used by the World Bank, UN, WHO, IMF and Transparency International
const EXTRA = {
  CIV: ["Cote d'Ivoire", "Côte d’Ivoire", "Ivory Coast"],
  COD: ["Congo, Dem. Rep.", "Congo (Kinshasa)", "Democratic Republic of the Congo", "Congo DR", "Congo, Democratic Republic", "DR Congo", "D.R. Congo"],
  COG: ["Congo", "Congo, Rep.", "Congo (Brazzaville)", "Republic of the Congo", "Congo Republic"],
  EGY: ["Egypt, Arab Rep."],
  GMB: ["Gambia, The", "The Gambia"],
  IRN: ["Iran, Islamic Rep.", "Iran (Islamic Republic of)"],
  KOR: ["Korea, Rep.", "Korea, South", "South Korea", "Republic of Korea", "Korea"],
  PRK: ["Korea, Dem. People's Rep.", "Korea, North", "North Korea", "Democratic People's Republic of Korea"],
  LAO: ["Lao PDR", "Laos", "Lao People's Democratic Republic"],
  KGZ: ["Kyrgyz Republic"],
  SVK: ["Slovak Republic"],
  SYR: ["Syrian Arab Republic"],
  VEN: ["Venezuela, RB", "Venezuela (Bolivarian Republic of)"],
  YEM: ["Yemen, Rep."],
  RUS: ["Russian Federation"],
  TUR: ["Turkiye", "Türkiye", "Turkey"],
  FSM: ["Micronesia, Fed. Sts.", "Micronesia (Federated States of)"],
  LCA: ["St. Lucia"],
  KNA: ["St. Kitts and Nevis"],
  VCT: ["St. Vincent and the Grenadines"],
  HKG: ["Hong Kong SAR, China", "Hong Kong, China"],
  MAC: ["Macao SAR, China", "Macau"],
  VNM: ["Viet Nam", "Vietnam"],
  SWZ: ["Eswatini", "Swaziland", "eSwatini"],
  CPV: ["Cabo Verde", "Cape Verde"],
  CZE: ["Czechia", "Czech Republic"],
  MKD: ["North Macedonia", "Macedonia", "Macedonia, FYR"],
  MMR: ["Myanmar", "Burma"],
  TLS: ["Timor-Leste", "East Timor"],
  BHS: ["Bahamas, The", "The Bahamas"],
  BRN: ["Brunei Darussalam"],
  PSE: ["West Bank and Gaza", "Palestine", "State of Palestine", "Palestinian Territories"],
  USA: ["United States", "United States of America", "USA", "US", "U.S."],
  GBR: ["United Kingdom", "UK", "U.K.", "Great Britain", "Britain"],
  TZA: ["Tanzania", "United Republic of Tanzania"],
  BOL: ["Bolivia (Plurinational State of)"],
  MDA: ["Republic of Moldova", "Moldova"],
  STP: ["Sao Tome and Principe", "São Tomé and Príncipe"],
  UNK: ["Kosovo", "XKX", "KSV", "KOS"],
  TWN: ["Taiwan", "Taiwan, China", "Chinese Taipei"],
  CUW: ["Curacao"],
  SOM: ["Somalia"],
  SSD: ["South Sudan"],
  SDN: ["Sudan"],
  GNB: ["Guinea-Bissau", "Guinea Bissau"],
  GNQ: ["Equatorial Guinea"],
  CAF: ["Central African Republic", "CAR"],
  ARE: ["United Arab Emirates", "UAE"],
  NLD: ["Netherlands", "The Netherlands", "Holland"],
};

const meta = countries
  .filter((c) => c.cca3 !== "ATA")
  .map((c) => ({
    a3: c.cca3,
    a2: c.cca2,
    num: c.ccn3 || "",
    n: c.name.common,
    o: c.name.official,
    r: c.region,
    s: c.subregion,
    ll: c.latlng,
    alt: Array.from(new Set([...(c.altSpellings || []), ...(EXTRA[c.cca3] || [])])).filter((a) => a.length > 1),
  }));
fs.writeFileSync(path.join(out, "countries.json"), JSON.stringify(meta));

// Map shapes: add the ISO3 code to every shape; drop Antarctica
const byNum = new Map(meta.filter((m) => m.num).map((m) => [m.num, m.a3]));
const byName = { Kosovo: "UNK", Somaliland: "SOL", "N. Cyprus": "NCY", "Indian Ocean Ter.": "IOT2", "Siachen Glacier": "SIA" };
for (const res of ["110m", "50m"]) {
  const topo = JSON.parse(fs.readFileSync(require.resolve(`world-atlas/countries-${res}.json`)));
  topo.objects.countries.geometries = topo.objects.countries.geometries
    .filter((g) => g.id !== "010")
    .map((g) => ({ ...g, properties: { name: g.properties.name, a3: byNum.get(g.id) || byName[g.properties.name] || "" } }));
  delete topo.objects.land;
  fs.writeFileSync(path.join(out, `world-${res}.json`), JSON.stringify(topo));
}
console.log("Wrote", meta.length, "countries and 2 map files to", out);
