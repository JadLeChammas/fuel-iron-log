# Fuel & Iron Log

Track daily calories and protein, gym and street sessions with the weights you lift, and weekly weigh-ins, with progress charts. Static site (no build step) hosted on Vercel, data stored in Supabase. Installs to the phone home screen like an app.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `config.js` | Your Supabase URL and anon key (the only file you edit) |
| `supabase/schema.sql` | Tables and security rules, run once in Supabase |
| `manifest.webmanifest`, `sw.js`, `icons/` | Home-screen install and offline app shell |

## 1. Supabase

1. Create a project at supabase.com (pick the Tokyo region, `ap-northeast-1`, since you're there).
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**.
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key into `config.js`.
4. **Authentication → URL Configuration**: set **Site URL** to your Vercel address (e.g. `https://fuel-iron-log.vercel.app`) once you have it, so the confirmation email links back to the app.
5. Optional: **Authentication → Providers → Email**, turn off "Confirm email" if you don't want to confirm by email before the first sign-in.

The anon key is safe to publish: row-level security only lets each signed-in user read and write their own rows.

## 2. Vercel

1. Push this folder to a new GitHub repo (e.g. `JadLeChammas/fuel-iron-log`).
2. On vercel.com: **Add New → Project**, import the repo.
3. Framework preset: **Other**. Leave build command and output directory empty. **Deploy**.

Every push to `main` redeploys automatically.

## 3. On your phone

1. Open the Vercel link, tap **Create account**, then sign in.
2. Add it to the home screen:
   - iPhone (Safari): Share → **Add to Home Screen**
   - Android (Chrome): menu → **Add to Home screen** / **Install app**
3. Enter today's weight (117 kg) on the Today tab, fill in the Plan and Targets tabs.

## Data model

- `days` (one row per date): `meals` JSON list, `workout` JSON (`type` rest/gym/street, exercises with sets/reps/weight, or street activity/minutes/notes)
- `weighins` (one row per date): `kg`
- `settings` (one row): calorie and protein targets, goal weight, and the weekly `plan`

Run locally: `npx serve .` then open http://localhost:3000.
