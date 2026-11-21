import { Flex, Heading, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { PageHeading } from './PageHeading.js';

interface EmptyStateProps {
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
  /** The empty state is the whole page, so its title is the page heading. */
  readonly page?: boolean;
}

export function EmptyState({ title, body, action, page = false }: EmptyStateProps) {
  return (
    <Flex direction="column" align="start" gap="3" py="9" style={{ maxWidth: '48ch' }}>
      {page ? (
        <PageHeading>{title}</PageHeading>
      ) : (
        <Heading as="h2" size="5">
          {title}
        </Heading>
      )}
      <Text color="gray">{body}</Text>
      {action}
    </Flex>
  );
}
