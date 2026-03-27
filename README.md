# EasyWishlist — Sim Report Extractor

A browser-based tool that converts [Raidbots Droptimizer](https://www.raidbots.com/simbot/droptimizer) and [Questionably Epic](https://questionablyepic.com) upgrade reports into a compact string you can import directly into the **EasyWishlist** WoW addon.

## How it works

1. **Run a sim** — Run a Droptimizer on Raidbots or an upgrade report on Questionably Epic.
2. **Paste the URL** — Copy the report URL from your browser and paste it into the extractor.
3. **Extract** — The tool fetches the report data, filters items that are genuine upgrades over your baseline, deduplicates by item ID (keeping the best result per item), and ranks them by % DPS gain.
4. **Import in-game** — Copy the output string and paste it into **EasyWishlist → Import** inside WoW.

All processing happens locally in your browser. Nothing is uploaded or stored anywhere.

### Manual fallback

If the report can't be fetched directly due to CORS or network restrictions, expand the "Or paste JSON manually" section and paste the raw `data.json` contents instead.

## Tech stack

- [Astro](https://astro.build) — static site framework
- Vanilla TypeScript — no runtime framework
- Deployed via GitHub Pages

## Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:4321)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository and create a branch from `main`.
2. Make your changes — keep PRs focused on a single concern.
3. Test locally with `npm run dev` before submitting.
4. Open a pull request with a clear description of what you changed and why.

### Common things to update

- **New season items** — update `src/lib/itemSource.ts` with the new `ITEM_SOURCE` entries and `INSTANCE_NAMES`.
- **Item level caps** — update `src/lib/constants.ts` and `src/lib/itemLevelDb.ts`.
- **New dungeons or raids** — add entries to `src/lib/instanceDB.ts` and the `INSTANCE_NAMES` map in `src/lib/itemSource.ts`.

## License

[MIT](./LICENSE)
