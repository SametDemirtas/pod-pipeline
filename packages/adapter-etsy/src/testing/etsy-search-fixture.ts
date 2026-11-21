/**
 * Two result cards shaped like Etsy's search page in October 2026, with made-up
 * listings and shops, for testing the page script.
 */
function card(options: {
  id: string;
  title: string;
  shop: string;
  price: string;
  symbol: string;
  extra: string;
  starSeller?: boolean;
}): string {
  const star = options.starSeller
    ? '<clg-icon name="starseller" data-star-seller-badge="true"></clg-icon>'
    : '';
  return `
    <li>
      <div class="v2-listing-card search-listing-card--desktop" data-listing-id="${options.id}" data-shop-id="1">
        <a class="v2-listing-card__img" data-listing-id="${options.id}" data-listing-link=""
           href="https://www.etsy.com/listing/${options.id}/x" aria-label="${options.title}"></a>
        <p class="seller-name">
          <span aria-hidden="true">${options.extra.includes('Ad') ? 'Ad<strong>・</strong>' : ''}By
            <span class="clickable-shop-name" data-shop-url="https://www.etsy.com/shop/${options.shop}"
              data-seller-name-link="">${options.shop}${star}</span>
          </span>
        </p>
        <div class="n-listing-card__price lc-price">
          <p class="lc-price dense"><span class="currency-value">${options.price}</span>
            <span class="currency-symbol">${options.symbol}</span></p>
        </div>
        <div>${options.extra}</div>
      </div>
    </li>`;
}

export const SEARCH_PAGE_HTML = `
  <main>
    <p>1,000+ items with ads</p>
    <ol>
      ${card({ id: '101', title: 'Tulip Mug, Halloween Coffee Cup', shop: 'MoonShop', price: '1,248.09', symbol: 'TL', extra: 'Ad from shop MoonShop', starSeller: true })}
      ${card({ id: '102', title: 'Cute Tulip Mug for Bird Lovers', shop: 'PaperFox', price: '22.40', symbol: '$', extra: 'Sale Price Original Price (20% off) Free shipping Bestseller' })}
      ${card({ id: '103', title: 'Ceramic Tulip Cup', shop: 'ClayBird', price: '', symbol: '', extra: 'Etsy’s Pick' })}
    </ol>
  </main>`;
