import { Heading } from '@radix-ui/themes';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useTakeFocusRequest } from './route-focus.js';

/** The page's h1; also names the window, and receives focus after navigation. */
export function PageHeading({ children }: { children: string }) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const takeFocusRequest = useTakeFocusRequest();
  const { pathname } = useLocation();
  const shown = useRef<string>(undefined);
  // Every move to another page uses up the request, so a later heading cannot claim it.
  // Focus moves when the heading appears or shows something else, e.g. another design;
  // a heading that stays the same keeps the focus where the seller is.
  useEffect(() => {
    const wanted = takeFocusRequest();
    const changed = shown.current !== children;
    shown.current = children;
    if (wanted && changed) heading.current?.focus();
  }, [takeFocusRequest, children, pathname]);

  useEffect(() => {
    document.title = `${children} - ${t('app.name')}`;
  }, [children, t]);

  return (
    <Heading ref={heading} as="h1" size="7" tabIndex={-1} style={{ outline: 'none' }}>
      {children}
    </Heading>
  );
}
