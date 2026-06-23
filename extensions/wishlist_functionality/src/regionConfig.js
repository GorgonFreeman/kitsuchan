export const OPS_URL = 'https://australia-southeast1-foxtware.cloudfunctions.net/shopifyWishlistOperations';

const CONFIG_TO_BASE_URL = {
  au: 'https://whitefoxboutique.com.au',
  uk: 'https://whitefoxboutique.co.uk',
  us: 'https://whitefoxboutique.com',
};

export function boardPreviewUrl(config, numericCustomerId, boardId) {
  const base = CONFIG_TO_BASE_URL[config] ?? CONFIG_TO_BASE_URL.au;
  const share = String(Number(numericCustomerId) - 579)
    .replace(/0/g, 'j').replace(/1/g, 'O').replace(/2/g, 'h').replace(/3/g, 'N')
    .replace(/4/g, 'i').replace(/5/g, 'S').replace(/6/g, 'b').replace(/7/g, 'o')
    .replace(/8/g, 'z').replace(/9/g, 's');
  return `${base}/pages/share-wishlist?&wishlist_id=${share}&board_id=${boardId}`;
}

const DOMAIN_TO_CONFIG = {
  'white-fox-boutique-aus.myshopify.com': 'au',
  'white-fox-boutique-us.myshopify.com': 'us',
  'white-fox-boutique-uk.myshopify.com': 'uk',
};

const DEFAULT_CONFIG = 'au';

export function configForShop(myshopifyDomain) {
  const c = DOMAIN_TO_CONFIG[myshopifyDomain];
  if (!c) {
    console.warn(`Unknown shop region for ${myshopifyDomain}, falling back to "${DEFAULT_CONFIG}"`);
    return DEFAULT_CONFIG;
  }
  return c;
}
