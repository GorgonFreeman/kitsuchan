# minishopi

Small Shopify embedded app: **`server.js`** handles OAuth and serves the built UI; **`src/`** is a React app bundled with **Vite** (Polaris components need React — Vite keeps the config small and readable compared with hand-rolled Rollup or Webpack).

## Requirements

- Node 22+
- A public HTTPS URL pointing at your local machine (provided via `npm run tunnel`, which uses Cloudflare's `cloudflared`)
- A Shopify Partner account + a development store
- Optionally an [Upstash](https://upstash.com/) Redis database — copy **REST URL** and **REST TOKEN** into `.env`. If either is missing, sessions stay **in-memory only** (lost on restart).

## Setup

1. **Install deps**

   ```bash
   npm install
   ```

2. **Start a tunnel** so Shopify can reach your local server:

   ```bash
   npm run tunnel
   ```

   Copy the HTTPS URL it prints (e.g. `https://something.trycloudflare.com`).

3. **Create the app in Shopify Partners**
   - Go to https://partners.shopify.com → Apps → Create app → Create app manually
   - **App URL**: `https://<your-tunnel>/`
   - **Allowed redirection URL**: `https://<your-tunnel>/auth/callback`
   - Copy the **Client ID** and **Client secret**

4. **Configure env**

   ```bash
   cp .env.example .env
   ```

   Fill in `SHOPIFY_API_KEY` (Client ID), `SHOPIFY_API_SECRET` (Client secret), and `HOST` (your tunnel URL). Add `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` from the Upstash console if you want Redis-backed sessions; omit them to use in-memory storage only. `SCOPES` is pre-populated with a wide set; trim if you like.

5. **Build the Polaris UI** (generates `dist/` — required before `npm start`)

   ```bash
   npm run build
   ```

6. **Run the server**

   ```bash
   npm start
   ```

7. **Install on your dev store** from the Partners app page → *Test your app* → pick the dev store. You should see the Polaris shell with **It's minishopi c:**.

## Frontend (Polaris + Vite)

- Source lives under **`src/`** (`App.jsx`, `main.jsx`). Root **`index.html`** is the Vite entry.
- **`vite.config.js`** only enables `@vitejs/plugin-react` and writes output to **`dist/`**.
- **`server.js`** serves **`dist/index.html`** for authenticated embed requests (injecting App Bridge + API key meta) and **`/assets/*`** for hashed JS/CSS from the build.
- After you change UI code, run **`npm run build`** again before refreshing the app.

## Notes

- Offline OAuth sessions: **Upstash** under `minishopi:session:<shop>` when both Upstash env vars are set; otherwise a **process-local `Map`** (same behavior as before Redis — wiped on restart).
- **Embedded iframe**: Shopify loads your app in an iframe first. OAuth cookies from `@shopify/shopify-api` use `SameSite=Lax`, which browsers often block in that cross-site iframe. Before starting OAuth we detect `Sec-Fetch-Dest: iframe` and redirect the **top window** to the same URL so `auth.begin` runs in a first-party tab and the cookie survives through the Shopify redirect back to `/auth/callback`.
- All HTTP routes live in **`server.js`**: `/auth/callback`, `/assets/*`, and authenticated `/` with `?shop=`.
