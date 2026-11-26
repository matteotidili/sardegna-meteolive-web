import { AROME_PRECIP_KEY } from "./meteo";
import type { AromeParameter } from "./types";

export const SAT_OPTIONS = [
  { key: "eview", title: "Nubi ad alta definizione", sub: "Dettagli delle nubi nelle ore di luce." },
  { key: "airmass", title: "Masse d’aria e fronti", sub: "Evidenzia fronti, masse d’aria e intrusioni secche." },
  { key: "rdt", title: "Temporali individuati dal satellite", sub: "Contorni delle celle riconosciute automaticamente." },
  { key: "truecolour", title: "Nubi e superficie terrestre", sub: "Colori naturali di giorno e una composizione diversa di notte." },
  { key: "cloudtype", title: "Tipo e quota delle nubi", sub: "Distingue gruppi di nubi per altezza e composizione. Diurno." },
  { key: "ir105", title: "Temperatura delle nubi", sub: "Mostra la temperatura apparente di nubi e superfici, anche di notte." },
  { key: "cloudphase", title: "Acqua e ghiaccio nelle nubi", sub: "Aiuta a distinguere gocce e cristalli. Diurno." },
  { key: "snowfog", title: "Neve, nebbia e nubi basse", sub: "Aiuta a distinguerle nelle ore di luce." },
  { key: "preciprate", title: "Intensità di pioggia stimata", sub: "Stima satellitare in mm/h." },
  { key: "li", title: "Fulmini rilevati dal satellite", sub: "I colori evidenziano le aree interessate dai lampi." },
];

export function satelliteTitle(product: string, fallback: string) {
  return SAT_OPTIONS.find(({ key }) => key === product)?.title ?? fallback;
}

const forecastTitles: Record<string, string> = {
  t2m: "Temperatura a 2 metri", tmaxrun: "Temperatura massima dall’inizio della previsione",
  tminrun: "Temperatura minima dall’inizio della previsione", windchill: "Temperatura percepita con vento freddo",
  humidex: "Indice di disagio per caldo umido", td2m: "Punto di rugiada",
  rh2m: "Umidità relativa", wind10: "Vento medio a 10 metri", winddir10: "Direzione di provenienza del vento",
  gust10: "Raffiche di vento", gustmaxrun: "Raffica massima dall’inizio della previsione",
  cape: "Energia disponibile per i temporali", pressure_sfc: "Pressione al suolo",
  cloud_low: "Copertura di nubi basse", cloud_mid: "Copertura di nubi medie", cloud_high: "Copertura di nubi alte",
  sim_refl: "Echi radar simulati", rain_acc: "Precipitazioni totali dall’inizio della previsione",
  rain_liquid_acc: "Pioggia cumulata dall’inizio della previsione", rain_1h: "Pioggia nell’ora",
  snow_1h: "Neve nell’ora (equivalente in acqua)", graupel_1h: "Neve tonda nell’ora (equivalente in acqua)",
  snow_acc: "Neve cumulata dall’inizio della previsione", graupel_acc: "Neve tonda cumulata dall’inizio della previsione",
  frozen_acc: "Neve e neve tonda cumulate dall’inizio della previsione", precip_phase: "Tipo di precipitazione prevalente",
  sim_ir: "Temperatura vista all’infrarosso, simulata",
};

export function forecastTitle(key: string, meta?: Pick<AromeParameter, "label" | "unit">, withUnit = false) {
  const title = key === AROME_PRECIP_KEY ? "Precipitazioni totali nell’ora" : forecastTitles[key] ?? meta?.label ?? "Parametro previsto";
  const unit = key === AROME_PRECIP_KEY ? "mm" : meta?.unit;
  return withUnit && unit && unit !== "categoria" ? `${title} (${unit})` : title;
}
