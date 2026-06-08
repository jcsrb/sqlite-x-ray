# SQLite X-Ray

Drop a SQLite database into the browser and get an instant, automatic breakdown — schema, per-column profiles, distributions, charts, and a SQL console. **100% client-side**: the file is read in-browser via WebAssembly and never leaves your device.

**Live:** https://jcsrb.github.io/sqlite-x-ray/

## Stack

- **Svelte + Vite + TypeScript**
- **[sql.js](https://github.com/sql-js/sql.js)** — SQLite compiled to WebAssembly, runs entirely in the browser
- Hand-rolled SVG charts (no charting dependency)

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/ — deploy anywhere
npm run check    # svelte-check type checking
```

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`.
One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

## What it profiles

- **Overview** — table/view/row/column counts, largest tables, FK relationship map
- **Per column** — inferred kind (int/real/text/date/datetime/boolean/blob), declared type, distinct count, null %, min/max/avg
- **Auto charts** — histograms for continuous numerics, bar charts of top values for categoricals/booleans/low-cardinality columns
- **Schema tab** — foreign keys, indexes, raw DDL
- **Data tab** — sample rows
- **SQL console** — run arbitrary queries (⌘/Ctrl+Enter)

## How it works

`src/lib/profile.ts` is the engine: it reads `sqlite_master` plus `PRAGMA table_info` / `foreign_key_list` / `index_list`, then runs aggregate queries (`COUNT(DISTINCT)`, `MIN`/`MAX`/`AVG`, `GROUP BY` for top values, and an in-SQL bucketing query for histograms) per column. Column "kind" is inferred from declared type affinity refined by sampling actual values (SQLite is dynamically typed), so ISO date strings and 0/1 booleans are detected even when stored as TEXT/INTEGER.
