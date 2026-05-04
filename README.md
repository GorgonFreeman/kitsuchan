# kitsuchan

Small Shopify embedded app. **`server.js`** handles OAuth and serves the built UI; **`src/`** is a React app bundled with **Vite**.

Two commands run the whole project:

- `npm run dev` — Shopify CLI runs the app locally with a temporary tunnel and live preview in your dev store.
- `npm run deploy` — deploys to Google Cloud Run, then runs `shopify app deploy --allow-updates` so Partners + extensions match the live URL.

## Requirements

- Node 22+
- A Shopify Partner account + a development store
- The [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) is invoked via `npx`, no global install needed
- For `npm run deploy`: [`gcloud`](https://cloud.google.com/sdk/docs/install) installed and authenticated (`gcloud auth login` and `gcloud config set project …`)
- Optional: an [Upstash](https://upstash.com/) Redis database for persistent OAuth sessions; otherwise sessions stay in-memory only (lost on restart)

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `SHOPIFY_API_KEY` (Partners → Client ID), `SHOPIFY_API_SECRET` (Client secret), `GCP_PROJECT`, and (optionally) Upstash REST URL + token. `HOST` and `SCOPES` already have sensible defaults; `shopify app dev` overrides them locally.

Update **`shopify.app.toml`** with your `client_id` and your prod `application_url` (the Cloud Run URL — `npm run deploy` will overwrite this once you deploy).

## Develop

```bash
npm run dev
```

This calls `shopify app dev`, which:

- Starts a Cloudflare tunnel to your local port,
- Updates the dev tunnel URL in `shopify.app.toml` (reverted on exit because **`automatically_update_urls_on_dev = true`**),
- Runs the **`[[web]]`** dev command (`npm run web:dev`) — `vite build && concurrently vite-watch + node server.js`,
- Prints a preview URL to install/launch the app in your dev store.

Add a Polaris page by dropping a default-export JSX file into **`pages/`** — auto-discovered via `import.meta.glob`. Add an HTTP endpoint by dropping a file into **`api/`** with a `default async (req, res, { shop, session })` export, then restart the server (handlers load once at startup). Adding a scope? Delete the Upstash session for the shop so the next install re-prompts for consent.

## Deploy

```bash
npm run deploy
```

1. Resolves the public URL (from `GCP_PUBLIC_APP_URL` if set, else the existing Cloud Run URL, else a deterministic `*.run.app`).
2. `gcloud run deploy --source . --allow-unauthenticated` with **`HOST`** + your `.env` (minus `PORT` and `GCP_*`) injected as `--set-env-vars`.
3. Patches `shopify.app.toml` `application_url` and `[auth].redirect_urls` to the live URL.
4. Runs `shopify app deploy --allow-updates` so Partners + extensions sync.

`GET /health` returns `200 ok` for Cloud Run probes.

## Architecture

- **`index.html`** is the Vite entry; **`src/App.jsx`** sets up Polaris + react-router and discovers pages via `import.meta.glob('../pages/**/*.jsx')` → routes at `/pages/<slug>`.
- **`server.js`** serves `dist/index.html` for authenticated GETs (any path used by the SPA), `/assets/*`, autoloaded `/api/<handler>`, and `/auth/callback`. Embedded iframes are detected (`Sec-Fetch-Dest: iframe`) and the **top window** is redirected before OAuth so the `SameSite=Lax` cookie survives.
- Offline OAuth sessions persist to Upstash under `kitsuchan:session:<shop>` if both Upstash env vars are set, else a process-local `Map`.
