import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router';

type TakeFocusRequest = () => boolean;

const RouteFocusContext = createContext<TakeFocusRequest>(() => false);

/**
 * Remembers that the user moved to another page, so the next page heading to
 * appear (possibly after its data loads) takes focus. Also scrolls to the top.
 * Changing only the query, e.g. while typing a search, is not a new page.
 */
export function RouteFocusProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const seen = useRef(pathname);
  const pending = useRef(false);
  // Deliberately noted while rendering: headings run their effects before this provider does,
  // and a repeated render only notes the same path again.
  if (seen.current !== pathname) {
    seen.current = pathname;
    pending.current = true;
  }

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.documentElement.scrollTop = 0;
  }, [pathname]);

  const take = useCallback<TakeFocusRequest>(() => {
    const wanted = pending.current;
    pending.current = false;
    return wanted;
  }, []);

  return <RouteFocusContext.Provider value={take}>{children}</RouteFocusContext.Provider>;
}

export function useTakeFocusRequest(): TakeFocusRequest {
  return useContext(RouteFocusContext);
}
