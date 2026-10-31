# Jamb

Jamb (Yamb) dice game with **6 dice**, in **Croatian and English**, with **manual or automatic dice throwing**. Built with React + Vite + TypeScript, Supabase (auth, saved scores, leaderboard) and deployed on Netlify.

## Game rules (6-dice variant)

- 6 dice, at most 5 count in every field.
- Up to 3 rolls per turn; click dice to hold them between rolls.
- Columns: **Down** (top to bottom), **Up** (bottom to top), **Free** (any order), **Announce** (row must be announced right after the first roll). Two-player games add a fifth column, **Counter-announce**: an announcement is an attack — the opponent's next move must be the same field in their own counter-announce column.
- Number section bonus: +30 when the 1–6 sum is 60 or more.
- Middle section: (Max − Min) × number of ones.
- Three of a kind (tris) = 3 × value + 10; straight (skala) scores 35 for 1–5 or 45 for 2–6; Full +30, Poker +40, Jamb +50.

## Development

```bash
cp .env.example .env   # fill in your Supabase URL + publishable key
npm install
npm run dev
```

## Security

- **The database is the referee.** Signed-in games roll their dice in Postgres (pgcrypto, rejection-sampled), keep the current turn server-side, enforce the 3-roll limit, column order, announcements and the counter obligation, and compute every score. The client only sends which dice to hold and which cell to write. Scores reach `jamb_games` only when the database completes a game (`jamb_solo_move` / `jamb_play_move`); no client can insert or edit one.
- SQL rules (`jamb_score`, `jamb_can_write`) are ports of `src/game/rules.ts` and `Game.tsx` — change both together.
- Supabase **Row Level Security** on all tables: users can only read their own rows; `jamb_games`, `jamb_solo` and `jamb_matches` have no client write policies, all writes go through RPCs.
- Leaderboard goes through a `security definer` RPC that exposes only display names and aggregate scores — never emails or user ids.
- Guest play (no account, nothing saved) rolls locally with `crypto.getRandomValues`.
- Database constraints validate score bounds, name length, and throw mode server-side.
- Netlify serves strict security headers: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, restrictive Permissions-Policy.
- Only the publishable Supabase key ships to the client; no secrets in the repo (`.env` is gitignored).

## Database

The schema lives in [supabase/migrations](supabase/migrations) and is applied to the Supabase project as migration `jamb_schema`.

## Deployment

Netlify builds with `npm run build` and publishes `dist/` (see `netlify.toml`). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables in Netlify.
