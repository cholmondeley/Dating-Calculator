# CBSA vs National Tile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show both CBSA-specific and national dating-pool metrics, keeping national numbers as a smaller context panel when a CBSA filter is active.

**Architecture:** Extend `ResultGauge` to compute two result sets (primary = current filters, baseline = filters without CBSA) and render a responsive layout that highlights CBSA stats while still surfacing the national context. Logic stays client-side, reusing DuckDB to run queries with modified filters; UI updates happen inside the existing gauge component.

**Tech Stack:** React, TailwindCSS, DuckDB-WASM.

### Task 1: Extend ResultGauge data model

**Files:**
- Modify: `components/ResultGauge.tsx`

**Step 1: Add state for baseline metrics**
```tsx
const [primaryMetrics, setPrimaryMetrics] = useState({ pct: 0, population: 0 });
const [nationalMetrics, setNationalMetrics] = useState<{ pct: number; population: number } | null>(null);
```

**Step 2: Update effect logic**
- Build a helper that runs `runQuery` and returns `{pct, population}` given filters.
- Call it once with actual filters.
- If `filters.selectedCBSA`, clone filters with `selectedCBSA:''` and run helper again.
- Store totals (still use 260M adults denominator) and set state accordingly.
- Keep simulated branch behavior consistent (simulate both metrics when DB down).

**Step 3: Verify with `npm run build` (should pass).**

### Task 2: Update gauge layout

**Files:**
- Modify: `components/ResultGauge.tsx`

**Step 1: Add derived booleans**
```tsx
const hasCBSA = Boolean(filters.selectedCBSA);
```

**Step 2: Adjust JSX**
- Wrap existing percent block in a flex container.
- When `hasCBSA && nationalMetrics`, render a left column:
  - Title `National Benchmark`
  - Small percent (e.g., `text-xl`) + population text (`~24M people`).
- Main column shows CBSA percent, label `CBSA Pool`, plus `~X people in {cbsa}` beneath.
- When no CBSA, keep current centered layout.

**Step 3: Tailwind tweaks**
- Use responsive classes so layout stacks vertically on mobile (`flex-col md:flex-row`).
- Ensure the gradient chip (“REAL DATA”) remains visible.

**Step 4: Run `npm run build` to verify layout compiles.**

### Task 3: Manual verification

**Step 1:** `npm run dev` and:
1. Without CBSA selected, tile matches current centered style.
2. Select a CBSA; observe smaller national block on the left, large CBSA percent center, and both numbers update as filters change.
3. Toggle DB offline (simulate) to ensure fallback still works (both values populate).

**Step 2:** Commit with `feat: show cbsa vs national metrics on gauge`.
