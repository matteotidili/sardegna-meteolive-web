import { expect, test, type Page } from "@playwright/test";

test.use({
  ...(process.env.METEOLIVE_TEST_URL ? { baseURL: process.env.METEOLIVE_TEST_URL } : {}),
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
});

const data = "https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/**";
const boundary = "**/geography/sardegna-istat-2026.geojson";

async function openLayers(page: Page, mobile: boolean) {
  if (mobile) await page.getByTestId("mobile-layers-sheet-trigger").click();
}

test("opens all ten satellite products with their public titles and displayed time", async ({ page }, info) => {
  test.setTimeout(150_000);
  const mobile = info.project.name === "mobile";
  await page.route(data, (route) => route.fulfill({ json: { stations: [] } }));
  await page.route("https://view.eumetsat.int/**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("request") === "GetCapabilities") return route.fulfill({
      contentType: "application/xml",
      body: `<WMS_Capabilities><Capability><Layer><Name>${url.pathname.split("/").at(-2)}</Name><EX_GeographicBoundingBox><westBoundLongitude>-78</westBoundLongitude><eastBoundLongitude>78</eastBoundLongitude><southBoundLatitude>-78</southBoundLatitude><northBoundLatitude>78</northBoundLatitude></EX_GeographicBoundingBox><Dimension name="time">2026-11-26T11:10:00Z</Dimension></Layer></Capability></WMS_Capabilities>`,
    });
    return route.fulfill({ contentType: "image/png", body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64") });
  });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await openLayers(page, mobile);
  await page.getByText("Altre immagini satellitari", { exact: true }).click();
  const products = {
    eview: "Nubi ad alta definizione", airmass: "Masse d’aria e fronti",
    rdt: "Temporali individuati dal satellite", truecolour: "Nubi e superficie terrestre",
    cloudtype: "Tipo e quota delle nubi", ir105: "Temperatura delle nubi",
    cloudphase: "Acqua e ghiaccio nelle nubi", snowfog: "Neve, nebbia e nubi basse",
    preciprate: "Intensità di pioggia stimata", li: "Fulmini rilevati dal satellite",
  };
  for (const [key, title] of Object.entries(products)) {
    const toggle = page.getByTestId(`layer-toggle-sat-${key}`);
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId("timeline-title")).toHaveText(title);
    await expect(page.getByTestId("timeline-player")).toContainText("Immagine satellitare · ora locale");
    await expect(page.getByTestId("timeline-current-label")).toContainText("12:10");
    await toggle.click();
  }
  if (mobile) await page.keyboard.press("Escape");
});

test("clips the estimated surface to the regional coast and fails closed without the mask", async ({ page }, info) => {
  const mobile = info.project.name === "mobile";
  const last = new Date(Date.now() - 60000).toISOString();
  const stations = Array.from({ length: 128 }, (_, i) => ({
    name: `Campione ${i}`, lat: 38.75 + Math.floor(i / 8) * 0.18, lon: 7.9 + (i % 8) * 0.31,
    temp: 12 + i * 0.1, last,
  }));
  const raster = page.getByTestId("station-interpolation-canvas");
  let failMask = false;
  await page.route(data, (route) => route.fulfill({ json: { stations: route.request().url().includes("/stations.json?") ? stations : [] } }));
  await page.route(boundary, (route) => failMask ? route.fulfill({ status: 503 }) : route.continue());
  await page.addInitScript(() => localStorage.setItem("smm2:view", JSON.stringify({ center: [40.08, 9.03], zoom: 7 })));
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await openLayers(page, mobile);
  await page.getByTestId("layer-toggle-station-interpolation").click();
  if (mobile) await page.keyboard.press("Escape");

  const pixels = () => raster.evaluate((canvas: HTMLCanvasElement) => {
    const d = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const box = canvas.getBoundingClientRect(), ratio = canvas.width / box.width;
    const view = JSON.parse(localStorage.getItem("smm2:view")!);
    const project = (lat: number, lon: number) => {
      const sin = Math.sin(lat * Math.PI / 180), scale = 256 * 2 ** view.zoom;
      return [(lon / 360 + 0.5) * scale, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale];
    };
    const [cx, cy] = project(...view.center as [number, number]);
    const pixel = (lat: number, lon: number) => {
      const [x, y] = project(lat, lon);
      const px = Math.round((x - cx + box.width / 2) * ratio), py = Math.round((y - cy + box.height / 2) * ratio);
      return px < 0 || py < 0 || px >= canvas.width || py >= canvas.height ? -1 : d[(py * canvas.width + px) * 4 + 3];
    };
    return {
      land: pixel(40.08, 9.03), west: pixel(40.30, 8.16), east: pixel(40.25, 9.79),
      south: pixel(38.96, 9.30), minor: pixel(39.07, 8.43),
      colored: d.some((value, i) => i % 4 === 3 && value > 0),
    };
  });
  await expect.poll(async () => (await pixels()).land).toBeGreaterThan(0);
  expect(await pixels()).toMatchObject({ west: 0, east: 0, south: 0 });
  if (!mobile) expect((await pixels()).minor).toBeGreaterThan(0);

  await page.getByTestId("basemap-selector-dropdown").click();
  await page.getByTestId("basemap-option-streets").click();
  await page.getByTestId("map-zoom-in").click();
  await page.setViewportSize(mobile ? { width: 410, height: 810 } : { width: 1280, height: 840 });
  const box = (await page.getByTestId("map-canvas").boundingBox())!;
  await page.mouse.move(box.width / 2 + 40, box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.width / 2 + 80, box.height / 2 + 25, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await pixels()).west).toBe(0);
  expect((await pixels()).colored).toBe(true);

  failMask = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("station-interpolation-legend")).toContainText("Confine della Sardegna non disponibile");
  await expect.poll(async () => (await pixels()).colored).toBe(false);
});

test("exposes the other layer groups and preserves their switches", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.route(data, (route) => route.fulfill({ json: { stations: [] } }));
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await openLayers(page, info.project.name === "mobile");
  for (const section of ["Radar e piogge osservate", "Stazioni e osservazioni", "Previsioni meteo", "Mare e boe"]) {
    await expect(page.getByText(section, { exact: true })).toBeVisible();
  }
  await page.getByText("Altri dati", { exact: true }).click();
  for (const key of ["radar-vmi", "radar-opera", "arome", "station-interpolation", "ispra-mareografico", "ispra-ron",
    "marine", "live-wind", "webcams", "hydrometers", "lightning", "boundaries", "municipalities", "subregions", "alerts"]) {
    const toggle = page.getByTestId(`layer-toggle-${key}`);
    const initial = await toggle.getAttribute("aria-pressed");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", initial === "true" ? "false" : "true");
    if (key === "arome") await expect(page.getByTestId("arome-parameter-select")).toBeVisible();
    if (key === "marine") await expect(page.getByTestId("marine-parameter-select")).toBeVisible();
    if (key === "live-wind") await expect(page.getByTestId("layer-toggle-station-arrows")).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", initial!);
  }
  for (const key of ["srt1", "cum3", "cum6", "cum12", "cum24"]) {
    const toggle = page.getByTestId(`dpc-accumulation-${key}`);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  }
});
