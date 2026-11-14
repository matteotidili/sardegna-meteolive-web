#!/usr/bin/env node
/**
 * Browser smoke checks della vera GitHub Pages (non mock di componenti).
 * Copre 2D desktop/mobile, selezione radar, grafico e apertura in 3D.
 */
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error("PLAYWRIGHT_MODULE non impostato");
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true, args: [
  "--no-sandbox", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader",
] });
const url = process.env.RADAR_SITE || "https://matteotidili.github.io/sardegna-meteolive-web/";


// Scarta i badge delle stazioni e i controlli flottanti: sono elementi
// interattivi distinti dal raster radar e non devono perdere i propri clic.
async function clickFreeMapPoint(page, selector) {
  const result = await page.locator(selector).evaluate((container) => {
    const rect = container.getBoundingClientRect();
    const candidates = [[0.45,0.39],[0.55,0.36],[0.40,0.48],[0.58,0.47],[0.49,0.56],
      [0.35,0.55],[0.61,0.56],[0.48,0.66],[0.37,0.66],[0.63,0.69]];
    for (const [fx,fy] of candidates) {
      const x = rect.left + fx*rect.width, y = rect.top+fy*rect.height;
      const target = document.elementFromPoint(x,y);
      if (!target) continue;
      if (target.closest(".stn, .leaflet-marker-icon, .leaflet-popup, .maplibregl-marker, aside, button, [role=dialog], [data-testid=radar-point-panel], .hydro-marker")) continue;
      return { x, y, target: target.tagName };
    }
    throw new Error("Nessun pixel mappa libero dai marker disponibili");
  });
  console.log("RADAR MAP CLICK",selector,JSON.stringify(result));
  await page.mouse.click(result.x,result.y);
}

async function scenario(name, viewport, mobile) {
  const context = await browser.newContext({
    viewport, isMobile: mobile, hasTouch: mobile,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  console.log("SCENARIO",name);
  await page.goto(url + "?radar-smoke=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByTestId("app-root").waitFor({ timeout: 30000 });
  const source = await page.evaluate(async () => {
    const manifestUrl = "https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/main/data/radar_points/manifest.json";
    const r = await fetch(manifestUrl, { cache: "no-store" });
    if (!r.ok) return { status: r.status, png: false };
    const m = await r.json();
    const f = m.frames?.SRI?.at(-1)?.file;
    if (!f) return { status: r.status, png: false };
    const rr = await fetch("https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/main/" + f);
    if (!rr.ok) return { status: r.status, png: false, pngStatus: rr.status };
    const img = await createImageBitmap(await rr.blob());
    try {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { status: r.status, png: false };
      ctx.drawImage(img, 0, 0);
      const sample = ctx.getImageData(0, 0, 1, 1).data;
      return { status: r.status, png: true, width: img.width, height: img.height,
               point: [sample[0], sample[1], sample[2], sample[3]] };
    } finally { img.close(); }
  });
  assert.equal(source.status, 200, "Catalogo radar originale deve essere accessibile dal browser");
  assert.equal(source.png, true, "File PNG numerico deve essere leggibile dal canvas senza blocco CORS");
  console.log("NUMERIC CORS+CANVAS OK", JSON.stringify(source));

  if (mobile) await page.getByTestId("mobile-layers-sheet-trigger").click();
  await page.getByTestId("layer-toggle-radar-sri").click();
  if (mobile) await page.keyboard.press("Escape");
  await page.getByText("Radar DPC SRI · osservato").first().waitFor({ timeout: 45000 });

  const canvas = page.getByTestId("map-canvas");
  await canvas.waitFor({ timeout: 30000 });
  const bounds = await canvas.boundingBox();
  assert(bounds && bounds.width > 150 && bounds.height > 100);
  await page.evaluate(() => {
    window.__radarClickDebug = [];
    document.querySelector('[data-testid="map-canvas"]')?.addEventListener("click", (e) => {
      window.__radarClickDebug.push({ target: e.target?.tagName, x: e.clientX, y: e.clientY });
    });
  });
  await clickFreeMapPoint(page, '[data-testid="map-canvas"]');
  try {
    await page.getByTestId("radar-point-panel").waitFor({ timeout: 9000 });
  } catch (error) {
    console.log("RADAR DEBUG", name, JSON.stringify(await page.evaluate(() => ({
      clicks: window.__radarClickDebug, title: document.title,
      panelCount: document.querySelectorAll('[data-testid="radar-point-panel"]').length,
      sriToggle: document.querySelector('[data-testid="layer-toggle-radar-sri"]')?.getAttribute("aria-pressed"),
      mapClass: document.querySelector('[data-testid="map-canvas"]')?.className,
      mapCenter: document.elementFromPoint(window.innerWidth/2,window.innerHeight*0.54)?.outerHTML.slice(0,350),
    }))));
    console.log("PAGE ERRORS",name,JSON.stringify(errors));
    throw error;
  }
  await page.getByTestId("radar-hours-1").click();
  await page.getByTestId("radar-chart-toggle").click();
  await page.getByTestId("radar-chart-toggle").click();
  console.log("RADAR 2D PANEL OK",name);

  // Richiudiamo il pannello affinché non intercetti i controlli della mappa.
  await page.getByTestId("radar-point-close").click();
  await page.getByTestId("map-mode-toggle").click();
  const canvas3D = page.getByTestId("map-canvas-3d");
  await canvas3D.waitFor({ timeout: 25000 });
  const b3 = await canvas3D.boundingBox();
  assert(b3 && b3.width > 150 && b3.height > 100);
  await clickFreeMapPoint(page, '[data-testid="map-canvas-3d"]');
  await page.getByTestId("radar-point-panel").waitFor({ timeout: 20000 });
  console.log("RADAR 3D PANEL OK",name);
  // Segnala eventuali errori applicativi senza confonderli con asset di rete esterni.
  console.log("PAGE ERRORS",name,JSON.stringify(errors.slice(0,8)));
  await context.close();
}

try {
  await scenario("desktop", { width: 1440, height: 900 }, false);
  await scenario("mobile", { width: 390, height: 844 }, true);
  console.log("SMOKE RADAR OK");
} finally {
  await browser.close();
}
