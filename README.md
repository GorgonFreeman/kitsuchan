# minishopi

The most minimal Node Shopify embedded app I could manage. Single file (`server.js`), one runtime dep (`@shopify/shopify-api`), in-memory sessions, no Express.

## Requirements

- Node 22+
- A public HTTPS URL pointing at your local machine (e.g. `cloudflared tunnel` or `ngrok http 3000`)
- A Shopify Partner account + a development store

## Setup

1. **Install deps**

   ```bash
   npm install
   ```

2. **Start a tunnel** so Shopify can reach your local server:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   # or: ngrok http 3000
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

   Fill in `SHOPIFY_API_KEY` (Client ID), `SHOPIFY_API_SECRET` (Client secret), and `HOST` (your tunnel URL). `SCOPES` is pre-populated with a wide set; trim if you like.

5. **Run**

   ```bash
   npm start
   ```

6. **Install on your dev store** from the Partners app page → *Test your app* → pick the dev store. You should land on a page that says `It's minishopi c:`.

## Notes

- Sessions live in a `Map` and vanish on restart — re-install if that happens.
- All routes are inline in `server.js`: `/auth/callback` for OAuth, everything else expects `?shop=` and either kicks off OAuth or serves the homepage.
