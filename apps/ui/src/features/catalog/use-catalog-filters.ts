import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ProductFamilyDto } from '@pod/contracts/client';
import { useDebouncedValue } from '../../shared/use-debounced-value.js';
import type { DesignFilter } from './use-design-list.js';

export const ALL_FAMILIES = 'all';
export const SEARCH_DELAY_MS = 250;

/**
 * Catalog filters kept in the URL, so they survive opening a design and
 * coming back. Typing is debounced before the search reaches the URL. A
 * product the app does not know, e.g. from an old link, or one asked for
 * before the products have loaded, filters nothing.
 */
export function useCatalogFilters(families: readonly ProductFamilyDto[]) {
  const [params, setParams] = useSearchParams();
  const asked = params.get('family');
  const familyId = families.some((family) => family.id === asked) ? asked : null;
  const committedSearch = params.get('q') ?? '';
  const [search, setSearch] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const [seenSearch, setSeenSearch] = useState(committedSearch);
  if (committedSearch !== seenSearch) {
    setSeenSearch(committedSearch);
    // Not typed here, e.g. the sidebar's catalog link: the box follows the URL.
    if (committedSearch !== debouncedSearch) setSearch(committedSearch);
  }

  // Only a newly typed value is written, so a URL changed elsewhere is not overwritten
  // with an old one.
  const written = useRef(debouncedSearch);
  useEffect(() => {
    if (written.current === debouncedSearch) return;
    written.current = debouncedSearch;
    setParams(
      (current) => {
        if ((current.get('q') ?? '') === debouncedSearch) return current;
        const next = new URLSearchParams(current);
        if (debouncedSearch) next.set('q', debouncedSearch);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, setParams]);

  const filter: DesignFilter = {
    familyId: familyId ?? undefined,
    search: committedSearch || undefined,
  };

  return {
    familyId: familyId ?? ALL_FAMILIES,
    search,
    filter,
    setSearch,
    setFamilyId: (next: string) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (next === ALL_FAMILIES) updated.delete('family');
          else updated.set('family', next);
          return updated;
        },
        { replace: true },
      );
    },
    clear: () => {
      setSearch('');
      setParams({}, { replace: true });
    },
  };
}

/** Location state for a design opened from the catalog, so its back link keeps the filters. */
export interface CatalogReturn {
  readonly catalogSearch: string;
}

/** Where a design page's back link goes: the catalog as it was left. */
export function catalogReturnPath(state: unknown): string {
  const search =
    typeof state === 'object' && state !== null && 'catalogSearch' in state
      ? state.catalogSearch
      : undefined;
  return typeof search === 'string' ? `/${search}` : '/';
}
