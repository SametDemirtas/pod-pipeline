import { Theme } from '@radix-ui/themes';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { beforeAll, describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n.js';
import { RouteFocusProvider } from './route-focus.js';
import { PageHeading } from './PageHeading.js';

let navigate: (path: string) => void = () => undefined;
let rename: (text: string) => void = () => undefined;

/** Research pages share a heading; a design page is named after its design. */
function Page() {
  const { pathname } = useLocation();
  const [renamed, setRenamed] = useState<string>();
  const go = useNavigate();
  navigate = (path) => {
    void go(path);
  };
  rename = setRenamed;
  const title = pathname.startsWith('/designs/') ? pathname.slice('/designs/'.length) : 'Research';
  return <PageHeading>{renamed ?? title}</PageHeading>;
}

let i18n: Awaited<ReturnType<typeof createI18n>>;

beforeAll(async () => {
  i18n = await createI18n('en');
});

function renderPage() {
  render(
    <I18nextProvider i18n={i18n}>
      <Theme>
        <MemoryRouter initialEntries={['/research/a']}>
          <RouteFocusProvider>
            <Page />
          </RouteFocusProvider>
        </MemoryRouter>
      </Theme>
    </I18nextProvider>,
  );
  return screen.getByRole('heading', { level: 1 });
}

describe('PageHeading', () => {
  it('focuses when a move to another page shows a new heading', () => {
    const heading = renderPage();

    act(() => {
      navigate('/designs/01-mug');
    });

    expect(heading).toHaveTextContent('01-mug');
    expect(heading).toHaveFocus();
  });

  it('uses up the request when the heading stays the same', () => {
    const heading = renderPage();

    act(() => {
      navigate('/research/b');
    });
    expect(heading).not.toHaveFocus();
    act(() => {
      rename('Other');
    });

    expect(heading).not.toHaveFocus();
  });
});
