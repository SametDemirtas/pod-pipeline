import { VisuallyHidden } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface LoadingStatusProps {
  /** What is loading; "Loading" unless something more telling fits. */
  readonly label?: string;
  readonly children: ReactNode;
}

/** Wraps placeholder content and tells assistive technology what is loading. */
export function LoadingStatus({ label, children }: LoadingStatusProps) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true">
      <VisuallyHidden>{label ?? t('common.loading')}</VisuallyHidden>
      {children}
    </div>
  );
}
