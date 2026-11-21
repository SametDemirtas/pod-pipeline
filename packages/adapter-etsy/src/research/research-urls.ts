const ETSY = 'https://www.etsy.com';
/** Hosts of the human check Etsy shows; the page must be allowed to load it. */
const CHECK_HOSTS = ['geo.captcha-delivery.com', 'captcha-delivery.com', 'ct.captcha-delivery.com'];
/**
 * Pages that would sign the seller in or show their account, which research
 * never does, also under a language like `/de` and as `/signin.php`.
 */
const SIGN_IN =
  /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:signin|join|register|account|your|oauth)(?:[/.]|$)/i;

/** An Etsy page the research window may read, e.g. a search. */
export function isEtsyPage(url: string): boolean {
  return URL.canParse(url) && new URL(url).origin === ETSY;
}

/** Where the research window may go: Etsy without signing in, or Etsy's human check. */
export function isAllowedResearchUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const { protocol, hostname, pathname } = new URL(url);
  if (protocol !== 'https:') return false;
  if (isEtsyPage(url)) return !SIGN_IN.test(pathname);
  return CHECK_HOSTS.includes(hostname);
}
