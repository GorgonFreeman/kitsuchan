import { OPS_URL } from './regionConfig.js';

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function callOperation({ customerId, config, operation, ...payload }) {
  const secret = shopify.settings.hmac_secret;
  if (!secret) throw new Error('Wishlist HMAC secret is not configured. Set it in the extension settings.');
  const token = await hmacHex(secret, customerId);
  const res = await fetch(OPS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wf-value': customerId,
      'x-wf-token': token,
    },
    body: JSON.stringify({ config, operation, ...payload }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const createBoard = (customerId, config, { boardName, colour, emoji }) =>
  callOperation({ customerId, config, operation: 'createBoard', boardName, colour, emoji });

export const editBoard = (customerId, config, { boardId, boardName, colour, emoji }) =>
  callOperation({ customerId, config, operation: 'editBoard', boardId, boardName, colour, emoji });

export const deleteBoard = (customerId, config, boardId) =>
  callOperation({ customerId, config, operation: 'deleteBoard', boardId });

export const addItems = (customerId, config, boardId, productIds) =>
  callOperation({
    customerId,
    config,
    operation: 'add',
    boardId,
    items: productIds.map(productId => ({ productId })),
  });

export const removeItems = (customerId, config, boardId, productIds) =>
  callOperation({
    customerId,
    config,
    operation: 'remove',
    boardId,
    items: productIds.map(productId => ({ productId })),
  });

export const removeItem = (customerId, config, boardId, productId) =>
  callOperation({ customerId, config, operation: 'remove', boardId, items: [{ productId }] });

export const removeAllItems = (customerId, config, productId) =>
  callOperation({ customerId, config, operation: 'removeAllItems', items: [{ productId }] });
