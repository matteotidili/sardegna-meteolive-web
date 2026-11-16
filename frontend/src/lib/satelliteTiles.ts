import L from "leaflet";

export interface SatelliteTileProduct {
  url: string;
  layer: string;
  format: string;
  time: string;
  opacity: number;
  attribution: string;
  bounds: [number, number][];
}

/** Geographic WMS tiles stay attached to the map's zoom lifecycle. */
export function satelliteTileLayer(product: SatelliteTileProduct, opacity: number) {
  return L.tileLayer.wms(product.url, {
    layers: product.layer, styles: "", format: product.format,
    transparent: product.format === "image/png", version: "1.1.1",
    time: product.time,
    crs: L.CRS.EPSG3857, tileSize: 512, maxZoom: 13, detectRetina: true,
    pane: "weather", opacity: opacity * product.opacity,
    bounds: L.latLngBounds(product.bounds as L.LatLngTuple[]),
    noWrap: true, keepBuffer: 2, updateWhenIdle: true,
    updateWhenZooming: false, attribution: product.attribution,
  } as L.WMSOptions);
}
