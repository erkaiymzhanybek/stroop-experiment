# Kyrgyz–Russian Stroop Study

Ready-to-run React + TypeScript + Vite project.

## Current settings
- 48 main trials in Kyrgyz + 48 main trials in Russian = 96 main trials total.
- 24 congruent + 24 incongruent per language.
- 8 practice trials before each language.
- 1500 ms timeout.
- RT uses `performance.now()`.
- BLP scoring and dominance thresholds follow the supplied PsyToolkit logic.
- Balanced participants stop after BLP.
- Final participant screen shows accuracy, mean RT and Stroop effect for each language.
- Research export is one Excel worksheet (`Study Data`), one row per trial, with participant-level fields repeated on each row for easy analysis.

## Run
1. Install Node.js 20.19+ or 22.12+.
2. In the project folder:
   `npm install`
3. Copy `.env.example` to `.env.local` and set the VITE Supabase URL + publishable key.
4. Run the SQL in `supabase/001_schema.sql` in the Supabase SQL Editor.
5. `npm run dev`

## Excel export
Create a researcher-only `.env` with:
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
Then:
`npm run export`

Never expose the service-role key in frontend code or any `VITE_*` variable.

## Before real recruitment
Confirm online/electronic consent and data storage with the approved AUCA IRB protocol. Pilot the final build on iPhone Safari, Android Chrome, tablet and desktop before collecting research data.

## Counterbalancing and data collection (v1.0.5)

- Eligible non-balanced participants are assigned exactly 30 to Group 1 and 30 to Group 2 by a server-side Supabase allocation function.
- Group 1: dominant-language Stroop first, then non-dominant.
- Group 2: non-dominant-language Stroop first, then dominant.
- Balanced BLP profiles do not enter Stroop.
- The database itself is not limited to 60 participants. The 60-person limit applies only to the planned 30/30 counterbalancing allocation. Additional participants can be stored, but after 60 eligible allocations the study displays a target-reached message instead of starting Stroop.

### Connect Supabase
1. Create/open your Supabase project.
2. Run `supabase/001_schema.sql` in the Supabase SQL Editor.
3. Copy `.env.example` to `.env.local`.
4. Put your Supabase project URL and publishable/anon key in `.env.local`:
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=...`
5. Restart Vite with `npm run dev`.

### Export researcher data
Create a researcher-only `.env` in the project root with:
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

Never put the service-role key in `.env.local` or in client-side code.
Then run:

`npm run export`

This creates `study_data.xlsx` with one row per trial and participant-level variables repeated on each row.
