import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Session } from '@shopify/shopify-api';
import { Redis } from '@upstash/redis';
import { shopify } from './shopify-server.js';

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

async function loadApiHandlers() {
  const map = new Map();
  const apiDir = resolve(__dirname, 'api');
  if (!existsSync(apiDir)) return map;

  for (const file of readdirSync(apiDir).filter((f) => f.endsWith('.js'))) {
    const name = basename(file, '.js');
    const href = pathToFileURL(join(apiDir, file)).href;
    const mod = await import(href);
    if (typeof mod.default !== 'function') continue;
    map.set(name, mod.default);
  }
  return map;
}

const apiHandlers = await loadApiHandlers();

const appBridgeMarker = '<!-- shopify-app-bridge -->';

function polarisShellHtml() {
  const indexPath = resolve(distDir, 'index.html');
  if (!existsSync(indexPath)) return null;
  const raw = readFileSync(indexPath, 'utf8');
  const tags = `<meta name="shopify-api-key" content="${ process.env.SHOPIFY_API_KEY }" />\n    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>`;
  return raw.replace(appBridgeMarker, tags);
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
    const raw = await redis.get(`kitsuchan:session:${ shop }`);
    return sessionFromStored(raw);
  }
  return memorySessions.get(shop);
}

async function saveSession(session) {
  if (redis) {
    await redis.set(`kitsuchan:session:${ session.shop }`, JSON.stringify(session.toObject()));
    return;
  }
  memorySessions.set(session.shop, session);
}

createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error('requestError', err);
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal error');
    }
  }
}).listen(process.env.PORT);

async function handleRequest(req, res) {
  const url = new URL(req.url, `https://${ req.headers.host }`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (serveDistAsset(res, url.pathname)) return;

  if (url.pathname.startsWith('/api/')) {
    const apiMatch = url.pathname.match(/^\/api\/([^/]+)$/);
    if (!apiMatch) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    const handlerName = apiMatch[1];
    const shop = url.searchParams.get('shop');
    if (!shop) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Missing shop' }));
      return;
    }
    const existing = await loadSession(shop);
    if (!existing?.accessToken) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const handler = apiHandlers.get(handlerName);
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    try {
      await handler(req, res, { shop, session: existing });
    } catch (err) {
      console.error(err);
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Internal error' }));
      }
    }
    return;
  }

  const shop = url.searchParams.get('shop');

  if (url.pathname === '/auth/callback') {
    try {
      const { session } = await shopify.auth.callback({ rawRequest: req, rawResponse: res });
      await saveSession(session);
      res.writeHead(302, { Location: `/?shop=${ session.shop }&host=${ url.searchParams.get('host') }` });
      res.end();
    } catch (err) {
      console.error('authCallbackError', err.message);
      if (!res.writableEnded) {
        if (shop) {
          const host = url.searchParams.get('host') ?? '';
          res.writeHead(302, {
            Location: `/?shop=${ encodeURIComponent(shop) }&host=${ encodeURIComponent(host) }`,
          });
          res.end();
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid OAuth callback');
        }
      }
    }
    return;
  }

  if (!shop) {
    res.writeHead(400);
    res.end('Missing shop');
    return;
  }

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

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
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
}
