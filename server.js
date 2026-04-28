import '@shopify/shopify-api/adapters/node';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import { Redis } from '@upstash/redis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, 'dist');

const mimeByExt = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function polarisShellHtml() {
  const indexPath = resolve(distDir, 'index.html');
  if (!existsSync(indexPath)) return null;
  let raw = readFileSync(indexPath, 'utf8');
  raw = raw.replace(
    '</title>',
    `</title>\n    <meta name="shopify-api-key" content="${ process.env.SHOPIFY_API_KEY }" />\n    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>`,
  );
  return raw;
}

function serveDistAsset(res, pathname) {
  const relativePath = pathname.replace(/^\/+/, '');
  if (!relativePath.startsWith('assets/')) return false;

  const filePath = resolve(distDir, relativePath);
  const assetsRoot = resolve(distDir, 'assets');
  if (!filePath.startsWith(assetsRoot)) {
    res.writeHead(403);
    res.end();
    return true;
  }
  if (!existsSync(filePath)) return false;

  const ext = extname(filePath);
  const type = mimeByExt[ ext ] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(readFileSync(filePath));
  return true;
}

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES.split(','),
  hostName: process.env.HOST.replace(/^https?:\/\//, ''),
  apiVersion: ApiVersion.April26,
  isEmbeddedApp: true,
});

const useRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
const redis = useRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const memorySessions = new Map();

function sessionFromStored(stored) {
  if (stored == null) return undefined;
  const o = typeof stored === 'string' ? JSON.parse(stored) : stored;
  if (o.expires) o.expires = new Date(o.expires);
  if (o.refreshTokenExpires) o.refreshTokenExpires = new Date(o.refreshTokenExpires);
  return new Session(o);
}

async function loadSession(shop) {
  if (redis) {
    const raw = await redis.get(`minishopi:session:${ shop }`);
    return sessionFromStored(raw);
  }
  return memorySessions.get(shop);
}

async function saveSession(session) {
  if (redis) {
    await redis.set(`minishopi:session:${ session.shop }`, JSON.stringify(session.toObject()));
    return;
  }
  memorySessions.set(session.shop, session);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `https://${ req.headers.host }`);
  const shop = url.searchParams.get('shop');

  if (serveDistAsset(res, url.pathname)) return;

  if (url.pathname === '/auth/callback') {
    const { session } = await shopify.auth.callback({ rawRequest: req, rawResponse: res });
    await saveSession(session);
    res.writeHead(302, { Location: `/?shop=${ session.shop }&host=${ url.searchParams.get('host') }` });
    res.end();
    return;
  }

  if (!shop) { res.writeHead(400); res.end('Missing shop'); return; }

  const existing = await loadSession(shop);
  if (!existing?.accessToken) {
    if (req.headers['sec-fetch-dest'] === 'iframe') {
      const absolute = new URL(req.url, `https://${ req.headers.host }`);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><script>window.top.location.href=${ JSON.stringify(absolute.href) }</script>`);
      return;
    }
    await shopify.auth.begin({ shop, callbackPath: '/auth/callback', isOnline: false, rawRequest: req, rawResponse: res });
    return;
  }

  const shell = polarisShellHtml();
  if (!shell) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Run npm run build to generate the Polaris UI.');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `frame-ancestors https://${ shop } https://admin.shopify.com`,
  });
  res.end(shell);
}).listen(process.env.PORT);
