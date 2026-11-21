import { Theme } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useSystemAppearance } from './use-system-appearance.js';

/** The app's colours and radius, light or dark as the operating system is. */
export function AppTheme({ children }: { children: ReactNode }) {
  const appearance = useSystemAppearance();
  return (
    <Theme appearance={appearance} accentColor="jade" grayColor="sage" radius="medium">
      {children}
    </Theme>
  );
}
