import { expect, test, type Page } from "@playwright/test";

const EUMETSAT = "https://view.eumetsat.int";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const dimensions = `<EX_GeographicBoundingBox><westBoundLongitude>-78</westBoundLongitude><eastBoundLongitude>78</eastBoundLongitude><southBoundLatitude>-78</southBoundLatitude><northBoundLatitude>78</northBoundLatitude></EX_GeographicBoundingBox>`;
const instant = (hour: string) => `2026-11-26T${hour}:00.000Z`;

async function mockBasemap(page: Page) {
  await page.route(/^https:\/\/(?:tile\.openstreetmap\.org|(?:server|services)\.arcgisonline\.com)\//,
    (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("https://tiles.mapterhorn.com/tilejson.json", (route) => route.fulfill({ json: {
    tilejson: "3.0.0", tiles: ["https://tiles.mapterhorn.com/fixture/{z}/{x}/{y}.png"], minzoom: 0, maxzoom: 0,
  } }));
  await page.route("https://tiles.mapterhorn.com/fixture/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
}

test.use({ ...(process.env.METEOLIVE_TEST_URL ? { baseURL: process.env.METEOLIVE_TEST_URL } : {}),
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
} });

test("holds the visible frame, cancels a rapid scrub and reuses previous frames at original map dimensions", async ({ page }, testInfo) => {
  const starts: URL[] = [];
  const errors: string[] = [];
  const log: { cacheHits: number; peakRequests: number }[] = [];
  let suspended!: () => void;
  const postponed = new Promise<void>((resolve) => { suspended = resolve; });
  let failed = false;
  page.on("requestfailed", (r) => {
    if (r.url().includes("GetMap")) errors.push(new URL(r.url()).searchParams.get("time") ?? "");
  });
  page.on("console", (message) => {
    const entry = message.text();
    if (entry.startsWith("EUMETSAT {")) log.push(JSON.parse(entry.slice("EUMETSAT ".length)));
  });
  await page.route(`${EUMETSAT}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("request") === "GetCapabilities") {
      const layer = url.pathname.split("/").at(-2);
      return route.fulfill({ contentType: "application/xml", body: `<WMS_Capabilities><Capability><Layer><Layer><Name>${layer}</Name>${dimensions}<Dimension name="time">${instant("08:10")}/${instant("11:10")}/PT10M</Dimension></Layer></Layer></Capability></WMS_Capabilities>` });
    }
    if (url.searchParams.get("request") !== "GetMap") return route.abort();
    starts.push(url);
    const time = url.searchParams.get("time");
    if (time === instant("08:10")) await postponed;
    if (time === instant("08:30")) {
      failed = true;
      return route.fulfill({ status: 503, body: "offline" });
    }
    return route.fulfill({ contentType: "image/png", body: PNG }).catch(() => {});
  });
  await page.route("https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/**",
    (route) => route.fulfill({ json: { stations: [], warnings: [] } }));
  await page.goto("./?diagnostica=satellite", { waitUntil: "domcontentloaded" });
  if (testInfo.project.name === "mobile") await page.getByTestId("mobile-layers-sheet-trigger").click();
  await page.getByTestId("layer-toggle-sat-ir105").click();
  if (testInfo.project.name === "mobile") await page.keyboard.press("Escape");
  const label = page.getByTestId("timeline-current-label");
  const slider = page.getByTestId("radar-timeline-slider");
  await expect(label).toContainText("12:10");
  const displayed = page.locator("img.leaflet-image-layer").last();
  const first = await displayed.getAttribute("src");
  expect(first).toMatch(/^blob:/);

  await slider.press("Home");
  await expect.poll(() => starts.some((url) => url.searchParams.get("time") === instant("08:10"))).toBe(true);
  await expect(label).toContainText("12:10");
  await expect(displayed).toHaveAttribute("src", first!);
  await expect(page.getByTestId("timeline-requested-label")).toContainText("09:10");
  await slider.press("End");
  await expect(label).toContainText("12:10");
  await expect.poll(() => errors.includes(instant("08:10"))).toBe(true);
  suspended();
  await expect(displayed).toHaveAttribute("src", first!);
  expect(starts.filter((u) => u.searchParams.get("time") === instant("11:10"))).toHaveLength(1);

  await slider.press("ArrowLeft");
  await expect(label).toContainText("12:00");
  await slider.press("ArrowRight");
  await expect(label).toContainText("12:10");
  expect(starts.filter((u) => u.searchParams.get("time") === instant("11:10"))).toHaveLength(1);
  await expect.poll(() => log.at(-1)?.cacheHits ?? 0).toBeGreaterThanOrEqual(1);
  expect(log.at(-1)?.peakRequests).toBeLessThanOrEqual(3);
  const width = testInfo.project.name === "mobile" ? "1280" : "2048";
  expect(starts.every((url) => url.searchParams.get("width") === width && url.searchParams.get("srs") === "EPSG:3857")).toBe(true);

  // Failed neighboring frames never replace the visible timestamp or raster.
  await slider.press("Home");
  await expect(label).toContainText("09:10");
  await slider.press("ArrowRight");
  await expect(label).toContainText("09:20");
  const beforeError = await displayed.getAttribute("src");
  await slider.press("ArrowRight");
  await expect.poll(() => failed).toBe(true);
  await expect(page.getByTestId("timeline-note")).toContainText("Fotogramma non disponibile");
  await expect(label).toContainText("09:20");
  await expect(displayed).toHaveAttribute("src", beforeError!);
  const play = page.getByTestId("radar-timeline-play-btn");
  await play.click();
  await expect(label).toContainText("09:40");
  await play.click();
});

test("switches decoded satellite frames in MapLibre without another WMS request for a cached frame", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  if (testInfo.project.name === "desktop") await page.setViewportSize({ width: 1100, height: 675 });
  const requested: string[] = [];
  await mockBasemap(page);
  await page.route(`${EUMETSAT}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("request") === "GetCapabilities") {
      return route.fulfill({ contentType: "application/xml", body: `<WMS_Capabilities><Capability><Layer><Layer><Name>ir105_hrfi</Name>${dimensions}<Dimension name="time">${instant("11:00")},${instant("11:10")}</Dimension></Layer></Layer></Capability></WMS_Capabilities>` });
    }
    requested.push(url.searchParams.get("time") ?? "");
    return route.fulfill({ contentType: "image/png", body: PNG });
  });
  await page.route("https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/**",
    (route) => route.fulfill({ json: { stations: [], warnings: [] } }));
  await page.addInitScript(() => {
    localStorage.setItem("smm2:anim", '"sat-ir105"');
    localStorage.setItem("smm2:mode3d", "true");
  });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  const map = page.getByTestId("map-canvas-3d");
  await expect(map).toBeVisible({ timeout: 20000 });
  const label = page.getByTestId("timeline-current-label");
  await expect(label).toContainText("12:10", { timeout: 35000 });
  await page.getByTestId("timeline-prev-btn").click();
  await expect(label).toContainText("12:00", { timeout: 15000 });
  await page.getByTestId("timeline-next-btn").click();
  await expect(label).toContainText("12:10", { timeout: 15000 });
  expect(requested.filter((time) => time === instant("11:10"))).toHaveLength(1);
});

test("loads DPC radar tiles through MapLibre before showing their time", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  if (testInfo.project.name === "desktop") await page.setViewportSize({ width: 1100, height: 675 });
  await mockBasemap(page);
  let requested = 0;
  await page.route("https://s3-prod-dpc-radar-webp-cache.s3.eu-south-1.amazonaws.com/**", (route) => {
    requested++;
    return route.fulfill({ contentType: "image/png", body: PNG });
  });
  const time = Math.floor(Date.now() / 300000) * 300000;
  await page.route("https://radar-api.protezionecivile.it/findLastProductByType?*", (route) =>
    route.fulfill({ json: { lastProducts: [{ productType: "VMI", time }] } }));
  await page.route("https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/**",
    (route) => route.fulfill({ json: { stations: [], warnings: [] } }));
  await page.route("**/data/radar_points/manifest.json?*", (route) => route.fulfill({ json: {
    schema_version: 1, encoding: { format: "PNG-RG16" }, grid: { width: 1, height: 1 }, crs_proj4: "+proj=longlat",
    frames: { VMI: [], SRI: [{ time: new Date(time).toISOString(), file: "data/radar_points/fixture.png" }] },
  } }));
  await page.addInitScript(() => {
    localStorage.setItem("smm2:anim", '"radar-VMI"');
    localStorage.setItem("smm2:mode3d", "true");
  });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("map-canvas-3d")).toBeVisible({ timeout: 45000 });
  const label = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", timeStyle: "short" }).format(time);
  await expect(page.getByTestId("timeline-current-label")).toContainText(label, { timeout: 65000 });
  expect(requested).toBeGreaterThan(0);
});

test("can switch away from Leaflet while a resize is settling", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Riproduce il ridimensionamento della finestra desktop");
  await mockBasemap(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("map-canvas")).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 675 });
  await page.getByTestId("map-mode-toggle").click();
  await expect(page.getByTestId("map-canvas-3d")).toBeVisible({ timeout: 35000 });
  // Leaflet's default window resize defers moveend by 200 ms.
  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
});
