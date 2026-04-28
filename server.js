import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import { createServer } from 'node:http';

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES.split(','),
  hostName: process.env.HOST.replace(/^https?:\/\//, ''),
  apiVersion: ApiVersion.April26,
  isEmbeddedApp: true,
});

const sessions = new Map();

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'>
  <meta name='shopify-api-key' content='${ process.env.SHOPIFY_API_KEY }'>
  <script src='https://cdn.shopify.com/shopifycloud/app-bridge.js'></script>
  <title>minishopi</title>
</head>
<body>It's minishopi c:</body>
</html>`;

createServer(async (req, res) => {
  const url = new URL(req.url, `https://${ req.headers.host }`);
  const shop = url.searchParams.get('shop');

  if (url.pathname === '/auth/callback') {
    const { session } = await shopify.auth.callback({ rawRequest: req, rawResponse: res });
    sessions.set(session.shop, session);
    res.writeHead(302, { Location: `/?shop=${ session.shop }&host=${ url.searchParams.get('host') }` });
    res.end();
    return;
  }

  if (!shop) { res.writeHead(400); res.end('Missing shop'); return; }

  if (!sessions.has(shop)) {
    await shopify.auth.begin({ shop, callbackPath: '/auth/callback', isOnline: false, rawRequest: req, rawResponse: res });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Content-Security-Policy': `frame-ancestors https://${ shop } https://admin.shopify.com`,
  });
  res.end(html);
}).listen(process.env.PORT);
