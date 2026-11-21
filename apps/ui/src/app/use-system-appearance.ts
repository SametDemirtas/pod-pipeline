import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => {
    media.removeEventListener('change', onChange);
  };
}

/** Follows the operating system's light or dark setting while the app runs. */
export function useSystemAppearance(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, () =>
    window.matchMedia(QUERY).matches ? 'dark' : 'light',
  );
}
