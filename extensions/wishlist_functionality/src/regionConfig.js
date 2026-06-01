export const OPS_URL = 'https://australia-southeast1-foxtware.cloudfunctions.net/shopifyWishlistOperations';

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
