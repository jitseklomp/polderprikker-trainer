# Speldwerk

A mobile-first training tool for Dutch map knowledge. You get a target, place a pin on an unlabelled aerial photo of the Netherlands, confirm it, and see how far off you were. It runs endlessly, with no daily limit. The interface is in Dutch.

This is a standalone training app with its own design. It is not affiliated with Polderprikker.

## Categories

| Category | Source | Type | Size (gzip) |
|---|---|---|---|
| Treinstations | ProRail station layer (PDOK) + heritage stations (Wikidata) | point | 9 KB |
| Eredivisiestadions 2026/27 | club list checked against Wikipedia, coordinates from Wikidata | point | 1 KB |
| Natura 2000 | RVO Natura2000 WFS (PDOK), merged per area | polygon | 100 KB |
| Plaatsen (3 levels) | BAG woonplaatsen (PDOK) + CBS Wijk- en Buurtkaart 2024 for population | polygon | 80 to 690 KB |
| Water en havens | Wikidata: harbours, lakes, polders | point, optionally with radius | 45 KB |

A category is only downloaded once you select it. Town levels are cumulative: Makkelijk is 50,000+ inhabitants, Gemiddeld 10,000+, Moeilijk 2,000+.

## Scoring

There are two curves, both of the form `1000 / (1 + (d / half)^steepness)`, where d is the distance in km.

**Areas** (towns, Natura 2000, lakes, polders): `half = 15`, `steepness = 2.5`. The score stays close to 1000 for the first few kilometres outside the boundary, drops to half at 15 km, then tails off gradually.

**Points** (stations, stadiums, harbours): `half = 8`, `steepness = 1.5`. Every metre counts from the start: only a pin within about 50 m scores 1000.

| distance | 0.1 km | 0.7 km | 2 km | 5 km | 10 km | 15 km | 30 km | 50 km |
|---|---|---|---|---|---|---|---|---|
| area | 1000 | 1000 | 994 | 940 | 734 | 500 | 150 | 47 |
| point | 999 | 975 | 889 | 669 | 417 | 280 | 121 | 60 |

The values are set in `CURVES` in `src/scoring.ts`.

For areas, d = 0 if the pin falls inside the polygon; otherwise d is the distance to the nearest edge. Lakes and polders from Wikidata are only points. When Wikidata gives an area (P2046), the target is scored as a circle of that same area.

## Development

```bash
npm install
npm run dev        # local server
npm test           # scoring and geometry tests
npm run build      # production build to dist/
```

## Regenerating the data

```bash
npm run data                 # everything
npm run data:stations        # or a single category
```

Needs `service.pdok.nl` and `query.wikidata.org`. Large PDOK downloads are cached in `scripts/.cache/` (not committed); delete that folder to fetch fresh data. Update the club list in `scripts/build-stadiums.mjs` at the start of each new season.

## Map

The base layer is Esri World Imagery. From zoom 12, PDOK Luchtfoto Actueel_orthoHR (EPSG:3857) is laid on top for more detail. PDOK's own low-zoom overviews are blurry, which is why the switch only happens at 12. Built with Leaflet 1.9.4.

## Deploy

GitHub Actions builds and publishes to GitHub Pages on every push to `main` and `feature/trainer`. One-time setup:

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Environments → `github-pages` → Deployment branches: add `feature/trainer` (only `main` is allowed by default).
