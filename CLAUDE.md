# QuoteFlow 2026

## Deploying
Only push to GitHub main. NEVER run `wrangler deploy` / `wrangler pages deploy` or any
manual Cloudflare deploy. Cloudflare builds and deploys automatically from main.

- Do not re-add a `push` trigger to `.github/workflows/deploy.yml`, and do not start that
  workflow from the Actions tab — it runs `wrangler deploy` and shows up in Cloudflare as
  "Manually deployed · Wrangler · by mis".
- Do not add a `deploy` script to `package.json`, or a git hook, that runs wrangler.
- Keep `wrangler.toml` — Cloudflare's own build uses it.

## Admins
Ticket admins are listed in two places — ADMIN_EMAILS in src/store/index.tsx and public.is_ticket_admin() in Supabase. Change both together.
