# `worker/` — the Dojo HQ backend (hand-deployed)

`index.js` is a Cloudflare Workers + D1 backend for **Dojo HQ**, the admin-only
internal tool. It is not part of the learner app, and it is **not built or
deployed from this repository**.

- The learner app is hosted on **Vercel** (`vercel.json`, building from `main`).
  Cloudflare is DNS only. See [`../docs/DEPLOY.md`](../docs/DEPLOY.md) § Hosting.
- Only `src/dojoRemoteClient.js` talks to this worker, and only for the hosted
  standalone HQ build (`*.chatgpt.site`) or the `?online=1` escape hatch. The
  app's own `/hq` route runs on Supabase (`src/dojoSupabaseClient.js`).
- Editing this file ships nothing by itself. The deploy is manual and lives
  outside this repo.

## Do not add a Wrangler config here

There is intentionally no `wrangler.toml` / `wrangler.json(c)` in this
repository. Two Cloudflare Worker services still have a Workers Builds git
integration pointed at this repo, so they attempt a build on every commit and
post two permanently-red `Workers Builds: …` checks on every PR.

Adding a Wrangler config would make those checks green by **starting an
automatic deploy of this worker on every push to `main`** — which is the
opposite of what we want. The fix is to disconnect the git integration in the
Cloudflare dashboard; the exact click-path is in
[`../docs/DEPLOY.md`](../docs/DEPLOY.md) § Cloudflare.
