import { GearIcon, MagnifyingGlassIcon, ImageIcon } from '@radix-ui/react-icons';
import { Box, Flex, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { useBatchSync } from '../features/batch/use-batch.js';
import { RouteFocusProvider } from '../shared/route-focus.js';
import { AppLogo } from './AppLogo.js';
import { useCatalogSync } from './use-catalog-sync.js';

/** Sidebar navigation next to the current page. */
export function AppShell() {
  const { t } = useTranslation();
  useCatalogSync();
  useBatchSync();

  return (
    <Flex minHeight="100dvh">
      <Flex
        asChild
        direction="column"
        gap="1"
        p="4"
        width="220px"
        flexShrink="0"
        style={{
          position: 'sticky',
          top: 0,
          height: '100dvh',
          borderRight: '1px solid var(--gray-a5)',
          background: 'var(--gray-a2)',
        }}
      >
        <nav aria-label={t('app.nav.label')}>
          <Flex align="center" gap="2" mb="4">
            <AppLogo size={28} />
            <Text size="4" weight="bold">
              {t('app.name')}
            </Text>
          </Flex>
          <NavItem to="/" icon={<ImageIcon />} label={t('app.nav.catalog')} end />
          <NavItem to="/research" icon={<MagnifyingGlassIcon />} label={t('app.nav.research')} />
          <NavItem to="/settings" icon={<GearIcon />} label={t('app.nav.settings')} />
        </nav>
      </Flex>
      <Box asChild flexGrow="1" p="6" style={{ minWidth: 0 }}>
        <main>
          <RouteFocusProvider>
            <Outlet />
          </RouteFocusProvider>
        </main>
      </Box>
    </Flex>
  );
}

interface NavItemProps {
  readonly to: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly end?: boolean;
}

function NavItem({ to, icon, label, end = false }: NavItemProps) {
  return (
    <NavLink to={to} end={end} style={{ textDecoration: 'none', color: 'inherit' }}>
      {({ isActive }) => (
        <Flex
          align="center"
          gap="2"
          px="3"
          py="2"
          style={{
            borderRadius: 'var(--radius-3)',
            background: isActive ? 'var(--accent-a4)' : undefined,
          }}
        >
          {icon}
          <Text size="2" weight={isActive ? 'medium' : 'regular'}>
            {label}
          </Text>
        </Flex>
      )}
    </NavLink>
  );
}
