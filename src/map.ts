import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LonLat, TargetGeometry } from './geo.ts';
import { bboxOf } from './geo.ts';

// Netherlands incl. Wadden and Zeeland, with a little air around it.
const NL_BOUNDS = L.latLngBounds([50.6, 3.0], [53.75, 7.45]);
const NL_START = L.latLngBounds([50.75, 3.36], [53.55, 7.23]);
const PDOK_MIN_ZOOM = 12;

const PIN_SVG = `
<svg viewBox="0 0 36 52" width="36" height="52" aria-hidden="true">
  <line x1="18" y1="20" x2="18" y2="50" stroke="#1b1b1b" stroke-width="2.6" stroke-linecap="round"/>
  <line x1="18" y1="20" x2="18" y2="50" stroke="#e9e4d8" stroke-width="1" stroke-linecap="round"/>
  <circle cx="18" cy="13" r="11" fill="var(--pin)" stroke="#1b1b1b" stroke-width="2.4"/>
  <circle cx="14.5" cy="9.5" r="3.2" fill="#fff" opacity=".55"/>
</svg>`;

const ANSWER_SVG = `
<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
  <circle cx="20" cy="20" r="13" fill="none" stroke="#0b1512" stroke-width="7" opacity=".55"/>
  <circle cx="20" cy="20" r="13" fill="none" stroke="var(--answer)" stroke-width="3.5"/>
  <circle cx="20" cy="20" r="3.5" fill="var(--answer)" stroke="#0b1512" stroke-width="1.5"/>
</svg>`;

export interface MapApi {
  map: L.Map;
  onPin(cb: (ll: LonLat) => void): void;
  setPinEnabled(on: boolean): void;
  clearRound(): void;
  /** Show or hide the place-name reference layer (only used after answering). */
  setLabels(on: boolean): void;
  showAnswer(pin: LonLat, target: TargetGeometry, nearest: LonLat, label: string, radiusKm?: number): void;
  resetView(): void;
  zoomBy(delta: number): void;
}

export function createMap(el: HTMLElement): MapApi {
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: false,
    maxBounds: NL_BOUNDS,
    maxBoundsViscosity: 1,
    minZoom: 6,
    maxZoom: 19,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 90,
    tapTolerance: 12,
    bounceAtZoomLimits: false,
  });
  L.control
    .attribution({ position: 'bottomleft', prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>' })
    .addTo(map);

  // Esri everywhere, so there is always imagery (also beyond the Dutch border and at low zoom).
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    maxNativeZoom: 18,
    attribution: 'Beeld: Esri, Maxar, Earthstar Geographics, GIS User Community',
  }).addTo(map);

  // PDOK Actueel_orthoHR on top once zoomed in: sharper and more recent within the Netherlands.
  L.tileLayer('https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg', {
    minZoom: PDOK_MIN_ZOOM,
    maxZoom: 19,
    maxNativeZoom: 19,
    bounds: NL_BOUNDS,
    attribution: 'Luchtfoto: <a href="https://www.pdok.nl/" target="_blank" rel="noopener">PDOK</a> / Beeldmateriaal Nederland (CC BY 4.0)',
  }).addTo(map);

  // Reference labels (place names and borders, no roads), shown only after answering so you can see
  // what you actually hit. Own pane: above the imagery, below the answer outline and markers.
  map.createPane('labels');
  const labelsPane = map.getPane('labels')!;
  labelsPane.style.zIndex = '350';
  labelsPane.style.pointerEvents = 'none';
  const esriRef = (service: string, attribution?: string) =>
    L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Reference/${service}/MapServer/tile/{z}/{y}/{x}`, {
      pane: 'labels',
      maxZoom: 19,
      maxNativeZoom: 18,
      attribution,
    });
  const labelsLayer = L.layerGroup([esriRef('World_Boundaries_and_Places', 'Labels: Esri, HERE, Garmin')]);

  const roundLayer = L.layerGroup().addTo(map);
  let pinMarker: L.Marker | null = null;
  let pinEnabled = false;
  let pinCb: (ll: LonLat) => void = () => {};

  const pinIcon = L.divIcon({ className: 'sw-pin', html: PIN_SVG, iconSize: [36, 52], iconAnchor: [18, 50] });
  const answerIcon = L.divIcon({ className: 'sw-answer', html: ANSWER_SVG, iconSize: [40, 40], iconAnchor: [20, 20] });

  // Guard against stray pins: ignore taps during or right after a pinch/pan/zoom gesture.
  let gestureUntil = 0;
  let touches = 0;
  const hold = (ms: number) => (gestureUntil = Math.max(gestureUntil, performance.now() + ms));
  el.addEventListener('touchstart', (e) => {
    touches = e.touches.length;
    if (touches > 1) hold(400);
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (touches > 1 || e.touches.length > 0) hold(400);
    touches = e.touches.length;
  }, { passive: true });
  map.on('zoomstart movestart', () => hold(250));
  map.on('zoomend moveend', () => hold(150));

  const placePin = (ll: L.LatLng) => {
    if (!pinMarker) {
      pinMarker = L.marker(ll, { icon: pinIcon, draggable: true, autoPan: true, keyboard: false }).addTo(roundLayer);
      pinMarker.on('dragend', () => {
        const p = pinMarker!.getLatLng();
        pinCb([p.lng, p.lat]);
      });
    } else {
      pinMarker.setLatLng(ll);
    }
    pinCb([ll.lng, ll.lat]);
  };

  map.on('click', (e: L.LeafletMouseEvent) => {
    if (!pinEnabled) return;
    if (performance.now() < gestureUntil) return;
    placePin(e.latlng);
  });

  const resetView = () => map.fitBounds(NL_START, { animate: false });
  resetView();

  return {
    map,
    onPin: (cb) => (pinCb = cb),
    setPinEnabled(on) {
      pinEnabled = on;
      if (pinMarker) on ? pinMarker.dragging?.enable() : pinMarker.dragging?.disable();
    },
    clearRound() {
      roundLayer.clearLayers();
      labelsLayer.remove();
      pinMarker = null;
    },
    setLabels(on) {
      if (on) labelsLayer.addTo(map);
      else labelsLayer.remove();
    },
    showAnswer(pin, target, nearest, label, radiusKm = 0) {
      const pinLL = L.latLng(pin[1], pin[0]);
      const nearLL = L.latLng(nearest[1], nearest[0]);
      if (target.type === 'Point') {
        const c = L.latLng(target.coordinates[1], target.coordinates[0]);
        if (radiusKm > 0) {
          L.circle(c, { radius: radiusKm * 1000, className: 'sw-area', interactive: false }).addTo(roundLayer);
        }
        L.marker(c, { icon: answerIcon, interactive: false, keyboard: false })
          .bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -18], className: 'sw-label' })
          .addTo(roundLayer);
      } else {
        const shape = L.geoJSON({ type: 'Feature', properties: {}, geometry: target } as GeoJSON.Feature, {
          style: { className: 'sw-area' },
          interactive: false,
        }).addTo(roundLayer);
        const b = shape.getBounds();
        // label just above the shape so the outline itself stays visible
        L.tooltip({ permanent: true, direction: 'top', offset: [0, -6], className: 'sw-label' })
          .setLatLng([b.getNorth(), b.getCenter().lng])
          .setContent(label)
          .addTo(roundLayer);
      }
      if (pinLL.distanceTo(nearLL) > 1) {
        L.polyline([pinLL, nearLL], { className: 'sw-line', interactive: false }).addTo(roundLayer);
      }
      const [minX, minY, maxX, maxY] = bboxOf(target);
      const bounds = L.latLngBounds([minY, minX], [maxY, maxX]).extend(pinLL);
      if (radiusKm > 0 && target.type === 'Point') {
        bounds.extend(L.latLng(target.coordinates[1], target.coordinates[0]).toBounds(radiusKm * 2000));
      }
      const style = getComputedStyle(document.documentElement);
      const top = parseFloat(style.getPropertyValue('--top-h')) || 120;
      const bottom = parseFloat(style.getPropertyValue('--panel-h')) || 200;
      map.flyToBounds(bounds, {
        paddingTopLeft: [40, top + 64], // extra room for the name label above the answer
        paddingBottomRight: [56, bottom + 30],
        maxZoom: 15,
        duration: 0.8,
      });
    },
    resetView,
    zoomBy(delta) {
      map.setZoom(map.getZoom() + delta);
    },
  };
}
