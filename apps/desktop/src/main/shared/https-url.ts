/** Only HTTPS addresses are fetched or opened in the browser. */
export function isHttpsUrl(url: string): boolean {
  return URL.canParse(url) && new URL(url).protocol === 'https:';
}
