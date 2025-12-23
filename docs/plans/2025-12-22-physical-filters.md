# Physical Filters Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Re-point the app to the new December parquet, migrate queries/UI to the updated column names, add waist/RFM + body-type flags, and provide simplified + detailed controls plus the “6 feet, 6 figures, 6 pack” preset.

**Architecture:** Update shared constants/types first, then expand `FilterState` to include the new metrics. `generateDuckDBQuery` becomes the single source of truth for filters, replacing legacy columns (`AGEP`, `SEX`, `MAR`). UI changes build on state updates: simplified buttons feed the new flags, detailed drawers expose checkboxes/sliders, and a preset button updates multiple fields at once.

**Tech Stack:** React, Tailwind CSS, TypeScript, DuckDB-WASM.

---

### Task 1: Point to the new dataset & schema

**Files:** `constants.ts`, `test-duckdb.mjs`, `test-duckdb-local.mjs`, `services/duckDb.ts`, `utils/sqlBuilder.ts`, `types.ts`, `components/*` where columns appear.

1. Update constants/tests to reference `synthetic_population_mvp_dec22.parquet`.
2. Replace legacy column names in `generateDuckDBQuery`:
   ```ts
   whereClauses.push(`age BETWEEN ...`);
   whereClauses.push(`sex = ${filters.gender === 'Male' ? 1 : 2}`);
   if (!filters.includeMarried) whereClauses.push(`married != 1`);
   ```
3. Update `FilterState` and initial state (see Task 2).
4. Verify schema helpers (`getDbSchema`, `getAverageWeight`) still run.

### Task 2: Expand filter state for new metrics

**Files:** `types.ts`, `App.tsx` (state setters), `components/*` referencing state.

1. Add fields to `FilterState`:
   ```ts
   physicalFlags: { thin: boolean; fit: boolean; abs: boolean; overweight: boolean; obese: boolean; };
   waistRange: [number, number];
   rfmRange: [number, number];
   ```
2. Update `INITIAL_STATE` defaults (ranges from dataset screenshot, e.g., waist 24–87, rfm 13–63).
3. Wire state setters in `App.tsx`: toggle handlers, sliders (reuse `RangeSlider`).

### Task 3: Update simplified “body type” UI

**Files:** `App.tsx`, `components/*` where body type buttons exist.

1. Replace BMI/grip logic with direct flag toggles:
   - “Thin” button → `physicalFlags.thin`
   - “Fit” button → `physicalFlags.fit`
   - “Curvy/Big” button toggles `overweight/obese`.
2. When simplified view toggles change, reflect them both visually and on state.
3. Remove old heuristics from `generateDuckDBQuery`.

### Task 4: Add detailed physical traits drawer

**Files:** `App.tsx`, `components/*`.

1. Below existing simplified buttons, add a collapsible “Detailed Physical Traits” section.
2. Inside, render:
   - Checkbox list for `thin`, `fit`, `abs`, `overweight`, `obese`.
   - Sliders for `waistRange` and `rfmRange` (use `RangeSlider` with dataset bounds). Example:
     ```tsx
     <RangeSlider min={24} max={86} values={state.waistRange} onChange={(values) => updateState({ waistRange: values as [number, number] })} />
     ```
3. When checkboxes are unchecked, queries shouldn’t filter by that flag.

### Task 5: Update query builder for new filters

**Files:** `utils/sqlBuilder.ts`.

1. Replace BMI/grip filters with new logic:
   ```ts
   if (filters.physicalFlags.thin) whereClauses.push(`thin = 1`);
   if (filters.physicalFlags.fit) whereClauses.push(`fit = 1`);
   if (filters.physicalFlags.abs) whereClauses.push(`abs = 1`);
   // Overweight/Obese behave similarly.
   ```
2. Add waist & RFM ranges:
   ```ts
   if (filters.waistRange) whereClauses.push(`waist_circumference BETWEEN ${minWaist} AND ${maxWaist}`);
   if (filters.rfmRange) whereClauses.push(`rfm BETWEEN ${minRfm} AND ${maxRfm}`);
   ```
3. Ensure the query still returns `total_cbsa_pop` when CBSA selected.

### Task 6: “6 feet, 6 figures, 6 pack” preset

**Files:** `App.tsx`.

1. Add a CTA button in the physical section (e.g., under simplified controls).
2. Handler sets:
   ```ts
   updateState({
     heightRange: [72, state.heightRange[1]],
     incomeRange: [100, state.incomeRange[1]],
     physicalFlags: { ...state.physicalFlags, abs: true }
   });
   ```
3. Optionally show a toast/banner confirming preset applied.

### Task 7: Smoke test + build

1. Run `npm run build` – expect success.
2. Manual checks:
   - Without detailed filters, results match simplified toggles.
   - Detailed checkboxes/slider adjustments affect the SQL (inspect dev console log).
   - “6-6-6” button updates filters instantly and results reflect the change.

---

Plan complete and saved to `docs/plans/2025-12-22-physical-filters.md`. Two execution options:

1. **Subagent-Driven (this session)** – I'll dispatch a fresh subagent per task with code review in between.
2. **Parallel Session** – Open a new session using `superpowers:executing-plans`.

Which approach would you like?***
