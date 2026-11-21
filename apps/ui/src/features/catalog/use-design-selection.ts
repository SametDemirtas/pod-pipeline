import { useState } from 'react';
import type { BatchSelection } from '@pod/contracts/client';
import { toggled } from '../../shared/collections.js';
import type { DesignFilter } from './use-design-list.js';

/**
 * Designs ticked one by one, or every design the filter matches, also those
 * not loaded yet, but the ones unticked.
 */
type Picked =
  | { readonly allMatching: false; readonly ids: ReadonlySet<string> }
  | { readonly allMatching: true; readonly excluded: ReadonlySet<string> };

const NONE: Picked = { allMatching: false, ids: new Set() };

/** Designs picked on the catalog page; a new filter starts afresh. */
export function useDesignSelection(filter: DesignFilter) {
  const [picked, setPicked] = useState<Picked>(NONE);
  const filterKey = JSON.stringify(filter);
  const [seenFilter, setSeenFilter] = useState(filterKey);
  if (filterKey !== seenFilter) {
    setSeenFilter(filterKey);
    setPicked(NONE);
  }

  return {
    isPicked: (id: string) => (picked.allMatching ? !picked.excluded.has(id) : picked.ids.has(id)),
    /** How many are picked, given how many the filter matches. */
    count: (total: number) => (picked.allMatching ? total - picked.excluded.size : picked.ids.size),
    toggle: (id: string, on: boolean) => {
      setPicked(
        picked.allMatching
          ? { allMatching: true, excluded: toggled(picked.excluded, id, !on) }
          : { allMatching: false, ids: toggled(picked.ids, id, on) },
      );
    },
    /** Adds the designs shown; all matching holds them already. */
    pickShown: (shown: readonly string[]) => {
      if (picked.allMatching) return;
      setPicked({ allMatching: false, ids: new Set([...picked.ids, ...shown]) });
    },
    pickAllMatching: () => {
      setPicked({ allMatching: true, excluded: new Set() });
    },
    clear: () => {
      setPicked(NONE);
    },
    /** What to prepare; `null` while nothing is picked. */
    selection: (total: number): BatchSelection | null => {
      if (!picked.allMatching) {
        return picked.ids.size > 0 ? { kind: 'designs', designIds: [...picked.ids] } : null;
      }
      if (picked.excluded.size >= total) return null;
      return {
        kind: 'filter',
        ...(filter.familyId === undefined ? {} : { familyId: filter.familyId }),
        ...(filter.search === undefined ? {} : { search: filter.search }),
        ...(picked.excluded.size > 0 ? { excludeIds: [...picked.excluded] } : {}),
      };
    },
  };
}

export type DesignSelection = ReturnType<typeof useDesignSelection>;
