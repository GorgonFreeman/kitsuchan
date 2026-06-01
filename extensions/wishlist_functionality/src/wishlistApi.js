import { WISHLIST_HMAC_SECRET } from './secrets.js';
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
  const token = await hmacHex(WISHLIST_HMAC_SECRET, customerId);
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

export const removeItem = (customerId, config, boardId, productId) =>
  callOperation({ customerId, config, operation: 'remove', boardId, items: [{ productId }] });

export const removeAllItems = (customerId, config, productId) =>
  callOperation({ customerId, config, operation: 'removeAllItems', items: [{ productId }] });
