export interface Webcam { id: string; name: string; lat: number; lon: number; url: string }
// Vedetta locality map centres, checked 2026-11-18; not surveyed camera positions.
export const WEBCAMS: Webcam[] = [
  {
    "id": "giovanni-di-sinis",
    "name": "San Giovanni Di Sinis",
    "lat": 39.88516,
    "lon": 8.42982,
    "url": "https://vedetta.org/webcam/italia/sardegna/oristano/giovanni-di-sinis/"
  },
  {
    "id": "olbia-lega-navale",
    "name": "Olbia – Lega Navale",
    "lat": 40.92618,
    "lon": 9.50721,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/olbia-lega-navale/"
  },
  {
    "id": "alghero-punta-negra",
    "name": "Punta Negra Alghero",
    "lat": 40.59372,
    "lon": 8.2728,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/alghero-punta-negra/"
  },
  {
    "id": "sa-serra",
    "name": "Punta Palai",
    "lat": 40.33333,
    "lon": 8.90637,
    "url": "https://vedetta.org/webcam/italia/sardegna/nuoro/sa-serra/"
  },
  {
    "id": "sant-antioco",
    "name": "Sant’Antioco",
    "lat": 39.09806,
    "lon": 8.42091,
    "url": "https://vedetta.org/webcam/italia/sardegna/carbonia-iglesias/sant-antioco/"
  },
  {
    "id": "la-ciaccia",
    "name": "La Ciaccia",
    "lat": 40.91643,
    "lon": 8.77918,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/la-ciaccia/"
  },
  {
    "id": "marina-di-sorso",
    "name": "Marina di Sorso",
    "lat": 40.82679,
    "lon": 8.54429,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/marina-di-sorso/"
  },
  {
    "id": "marina-di-carloforte",
    "name": "Marina di Carloforte",
    "lat": 39.14345,
    "lon": 8.30183,
    "url": "https://vedetta.org/webcam/italia/sardegna/sud-sardegna/marina-di-carloforte/"
  },
  {
    "id": "capo-coda-cavallo",
    "name": "Capo Coda Cavallo",
    "lat": 40.84043,
    "lon": 9.71579,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/capo-coda-cavallo/"
  },
  {
    "id": "torre-chia",
    "name": "Torre Chia",
    "lat": 38.90683,
    "lon": 8.8734,
    "url": "https://vedetta.org/webcam/italia/sardegna/cagliari/torre-chia/"
  },
  {
    "id": "isola-rossa",
    "name": "Isola Rossa",
    "lat": 41.01447,
    "lon": 8.88676,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/isola-rossa/"
  },
  {
    "id": "pittulongu",
    "name": "Olbia Pittulongu",
    "lat": 40.93739,
    "lon": 9.56518,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/pittulongu/"
  },
  {
    "id": "olbia-marina-maria",
    "name": "Olbia Marina Maria",
    "lat": 40.89995,
    "lon": 9.5851,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/olbia-marina-maria/"
  },
  {
    "id": "alghero-mugoni",
    "name": "Alghero Spiaggia di Mugoni",
    "lat": 40.62076,
    "lon": 8.20695,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/alghero-mugoni/"
  },
  {
    "id": "roccaruja-stintino",
    "name": "Roccaruja Stintino",
    "lat": 40.96065,
    "lon": 8.21202,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/roccaruja-stintino/"
  },
  {
    "id": "siniscola-la-caletta",
    "name": "Siniscola la Caletta",
    "lat": 40.60223,
    "lon": 9.75097,
    "url": "https://vedetta.org/webcam/italia/sardegna/nuoro/siniscola-la-caletta/"
  },
  {
    "id": "torre-grande",
    "name": "Torregrande",
    "lat": 39.90353,
    "lon": 8.52338,
    "url": "https://vedetta.org/webcam/italia/sardegna/oristano/torre-grande/"
  },
  {
    "id": "olbia-marina-costa-corallina",
    "name": "Olbia Marina di Costa Corallina",
    "lat": 40.88512,
    "lon": 9.62778,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/olbia-marina-costa-corallina/"
  },
  {
    "id": "badesi",
    "name": "Badesi",
    "lat": 40.95896,
    "lon": 8.83419,
    "url": "https://vedetta.org/webcam/italia/sardegna/sassari/badesi/"
  }
];
export const webcamIcon = `<span style="display:grid;place-items:center;width:30px;height:30px;border:2px solid white;border-radius:50%;background:#0369a1;color:white;box-shadow:0 2px 8px #0008"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h-4L8 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4z"/><circle cx="12" cy="13" r="4"/></svg></span>`;
export function webcamPopup(webcam: Webcam): HTMLElement {
  const panel = document.createElement("div");
  panel.dataset.testid = "webcam-popup";
  panel.style.cssText = "min-width:210px;line-height:1.5";
  const title = document.createElement("strong");
  title.textContent = webcam.name;
  title.style.cssText = "display:block;font-size:16px;margin-bottom:8px";
  const note = document.createElement("p");
  note.textContent = "Webcam Vedetta · posizione della località indicata dalla fonte. Diretta e orario delle immagini consultabili sul sito originale.";
  note.style.cssText = "font-size:13px;margin:0 0 12px";
  const link = document.createElement("a");
  link.textContent = "Apri webcam su Vedetta";
  link.href = webcam.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.style.cssText = "display:inline-block;padding:8px 12px;border-radius:6px;background:#0369a1;color:white;font-size:14px;text-decoration:none";
  panel.append(title, note, link);
  return panel;
}
