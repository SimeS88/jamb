# Jamb

Jamb (Yamb) dice game with **6 dice**, in **Croatian and English**, with **manual or automatic dice throwing**. Built with React + Vite + TypeScript, Supabase (auth, saved scores, leaderboard) and deployed on Netlify.

## Game rules (6-dice variant)

- 6 dice, at most 5 count in every field.
- Up to 3 rolls per turn; click dice to hold them between rolls.
- Four columns: **Down** (top to bottom), **Up** (bottom to top), **Free** (any order), **Announce** (row must be announced right after the first roll).
- Number section bonus: +30 when the 1–6 sum is 60 or more.
- Middle section: (Max − Min) × number of ones.
- Straight (kenta) scores 66/56/46 for 1st/2nd/3rd roll; Full +30, Poker +40, Jamb +50.

## Development

```bash
cp .env.example .env   # fill in your Supabase URL + publishable key
npm install
npm run dev
```

## Security

- Supabase **Row Level Security** on all tables: users can only read/insert their own rows; scores are immutable (no update/delete policies).
- Leaderboard goes through a `security definer` RPC that exposes only display names and aggregate scores — never emails or user ids.
- Dice rolls use `crypto.getRandomValues` (rejection-sampled for uniformity), not `Math.random`.
- Database constraints validate score bounds, name length, and throw mode server-side.
- Netlify serves strict security headers: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, restrictive Permissions-Policy.
- Only the publishable Supabase key ships to the client; no secrets in the repo (`.env` is gitignored).

## Database

The schema lives in [supabase/migrations](supabase/migrations) and is applied to the Supabase project as migration `jamb_schema`.

## Deployment

Netlify builds with `npm run build` and publishes `dist/` (see `netlify.toml`). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables in Netlify.
