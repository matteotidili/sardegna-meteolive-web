import { expect, test } from "@playwright/test";

const origin = "https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/main/";
const cedoc = "https://www.sardegnacedoc.it/idrografico";
const gauges = [
  { station_id: "451800", name: "Iglesias RF", lat: 39.30139, lon: 8.56361 },
  { station_id: "426400", name: "Iglesias San Michele", lat: 39.33917, lon: 8.60417 },
  { station_id: "505900", name: "Diga Punta Gennarta", lat: 39.3325, lon: 8.5475 },
  { station_id: "1057800", name: "Iglesias Nebida", lat: 39.32083, lon: 8.43194 },
];

test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } });

test("renders CEDOC history and hides markers when the networks are disabled", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Uses the desktop map controls");
  const now = Date.now();
  const observed = (age: number) => new Date(now - age * 60000).toISOString();
  const older = observed(26 * 60);
  const expectedDay = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome" }).format(new Date(older));
  const recentCount = 3;
  await page.route(`${origin}data/**`, async (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").at(-1);
    if (filename === "cedoc_sites.json") return route.fulfill({ json: { stations: gauges } });
    if (filename === "cedoc.json") {
      return route.fulfill({ json: {
        status: "degraded", generated_at: observed(0), coverage: { censused: 4, unreachable: 1 },
        stations: gauges.slice(0, recentCount).map((row, index) => ({ ...row, variables: {
          rain_48h: { value: (index + 1) * 7, unit: "mm", observed_at: observed(5), fetched_at: observed(0),
            status: "fresh", source_url: `${cedoc}/stazione/${row.station_id}` },
        } })),
      } });
    }
    if (filename === "cedoc_last_valid.json") {
      return route.fulfill({ json: { stations: [{ ...gauges[0], rain_today: 7, last: older,
        source_url: `${cedoc}/sensore/451800/35523/20207` }] } });
    }
    return route.fulfill({ json: { stations: [] } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("parameter-chip-rain_today").click();
  await expect(page.getByTestId("cedoc-feed-status")).toContainText("3 con dati");
  await expect(page.getByTestId("station-marker-cedoc-451800")).toContainText("7,0");
  await expect(page.getByTestId("station-marker-cedoc-1057800")).toContainText("n.d.");
  await page.getByTestId("station-item-cedoc-451800").click();
  await expect(page.getByTestId("station-popup-card")).toContainText(`Pioggia del ${expectedDay}`);
  await expect(page.getByTestId("station-card-time")).toContainText("Storico");
  await expect(page.getByTestId("station-card-time")).toContainText("Ultima misura conservata");
  await page.getByTestId("station-card-close").click();

  await page.getByTestId("network-toggle-all").click();
  await expect(page.getByTestId("station-marker-cedoc-451800")).toHaveCount(0);
});
