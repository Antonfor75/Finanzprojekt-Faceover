# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal finance PWA ("Finanzprojekt") built with Next.js 16 (App Router) + React 19 + TypeScript, backed by Supabase (Postgres + Auth). Mobile-first, single-user-per-account budgeting tool. UI copy is in **German** — follow that convention for user-facing strings.

## Commands

```bash
npm run dev          # Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint (eslint-config-next)
npm run test         # Vitest unit tests (utils/finance.test.ts)
npm run test -- -t "50% savings"   # Run a single test by name
npm run test:e2e     # Playwright E2E (auto-starts dev server, chromium only)
npx playwright test e2e/main-flow.spec.ts   # Run a single E2E spec

# Database (Drizzle, schema at src/db/schema.ts)
npx drizzle-kit generate   # Generate migration from schema changes → ./drizzle
npx drizzle-kit migrate    # Apply migrations
```

Requires a `.env` with `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Path alias `@/*` maps to repo root. `scripts/` is excluded from tsconfig — it holds one-off DB maintenance/migration scripts run ad-hoc with `tsx`/`ts-node`, not part of the app build.

## Core Domain Logic (the part that needs reading multiple files)

The heart of the app is a **day-by-day ("bottom-up") checking-account simulation**, not simple monthly/weekly estimates. Understand this before touching any budget/analysis code:

- **`utils/girokonto.ts` → `calculateGirokontoTimeline(...)`** iterates one day at a time from the earliest data point to today. Each day it "drips" a proportional slice of every active income source and fixed cost (monthly amount ÷ days-in-month, weekly ÷ 7, yearly ÷ days-in-year, quarterly ÷ year/4), subtracts that day's variable expenses, and accrues a running balance. Income/fixed-cost activity windows are gated by `valid_from`/`valid_to`. All dates are normalized to **noon (12:00)** to dodge DST/midnight bugs.
- **`utils/financeHelpers.ts`** holds the pure, unit-tested weekly/savings-rate math. The monthly↔weekly conversion factor is **4.33** (see `RULES.md`). This is the only file with unit test coverage — keep new pure finance math here.
- **Rule (`RULES.md`):** analysis charts and metrics MUST stay consistent with the exact daily `girokonto` calculation — don't introduce a parallel/approximate budget calc.

## Data & State Flow

- **`app/page.tsx`** is the client-side root: handles Supabase auth session, fetches all five tables in parallel (`expenses`, `fixed_costs`, `accounts`, `settings`, `income_sources`), computes `monthlyBudget` (income sources + distribution-account payouts), and passes everything as props to `MobileDashboard`. `fetchData` is passed down as `onUpdate` for refetch-after-mutation.
- **`components/MobileDashboard.tsx`** is the central UI hub — owns view/navigation state and renders the tabbed sub-views (`AnalysisView`, `GirokontoView`, `CalendarHistory`, `WeeklyBarChart`, `AddExpenseForm`, `SettingsOverlay`). On mount it runs two lazy background jobs: `processWeeklySavings` (the "Sunday logic") and monthly distribution-account processing.
- **Mutations** live in Server Actions under `app/actions.ts` and `app/actions/` (`admin.ts`, `import.ts`, `savings.ts`). They call Supabase, then `revalidatePath('/')`.
- **Special expense conventions (in `app/actions.ts`):** an expense category `account:<id>` deducts from a savings account and is re-labeled `Konto: <name>` so the frontend can exclude it from spendable budget; `transferFromSavings` inserts a **negative-amount** expense to boost available budget.

### Database

Six tables in `src/db/schema.ts`, all scoped by `user_id uuid default auth.uid()` with **Supabase Row-Level Security** (many `scripts/*rls*` files exist for managing/debugging RLS — RLS correctness is a recurring concern). Notable: `amount` fields are Postgres `numeric` (come back as strings — `Number(...)` them); `expense_date` is stored as a text ISO string, not a timestamp. Types are hand-maintained in `app/types.ts` (kept in sync with the Drizzle schema manually).

## Supabase clients — pick the right one

- **`utils/supabase.ts`** — browser client (anon key), for Client Components.
- **`utils/supabase/server.ts`** — `createClient()` cookie-based server client, respects RLS as the logged-in user; use in Server Actions/Components.
- **`utils/supabase/admin.ts`** — `supabaseAdmin` with the **service-role key, bypasses RLS**. Only for admin/background tasks (user management, `processWeeklySavings`). Never expose to the client.
- **`utils/supabase/middleware.ts`** + `middleware.ts` refresh the session on every request.

Admin area lives under `app/admin/*` and is gated by the hardcoded email `chef@anton.de` (redirected in `app/page.tsx`).

## Styling & UI Conventions (see `DESIGN.md` and `RULES.md`)

- **Tailwind CSS v4 only** — no SCSS, no external CSS files. Global CSS variables live in `app/globals.css`.
- **Theming via CSS custom properties**: use semantic utilities (`bg-primary`, `text-foreground`, `bg-muted`) driven by `:root[data-theme='...']` blocks in `globals.css`. Themes are loaded/switched via `utils/theme.ts` (`loadTheme()`). Current default theme is "Pink Rose". **Do not** hardcode raw colors like `red-500`.
- **Visual language:** Apple-style flat design, heavy rounding (`rounded-3xl`, `rounded-[2rem]`, `rounded-full` for CTAs), glassmorphism (`backdrop-blur-xl`, `bg-white/70`), animated blurred "blob" backgrounds. Mobile-first — tables must scroll and grids must stack on small screens.
- **shadcn/ui** primitives (Radix-based) live in `components/ui/`. `components.json` configures shadcn; `lib/utils.ts` exports the `cn()` helper.

## Other

- **PWA:** `app/manifest.ts`, `public/service-worker.js`, `components/SWRegister.tsx`.
- **Bank statement import:** `components/ImportWizard.tsx` + `utils/parseBankStatement.ts` / `utils/parseFullImport.ts` (uses `pdfjs-dist`); PDF export via `jspdf` + `jspdf-autotable`.
- The repo root contains many stray debug/log files (`*.log`, `*.txt`, `schema_*.json`) — build/diagnostic leftovers, not source.
