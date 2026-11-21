import { Callout, Code, Flex, Heading, Skeleton, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '../../shared/CopyButton.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { claudeCodeCommand, mcpClientConfig } from './assistant-setup.js';
import { useMcpLaunch } from './use-mcp-launch.js';

/** How to let an AI assistant use the app through the MCP server that ships with it. */
export function AssistantSetting() {
  const { t } = useTranslation();
  const launch = useMcpLaunch();

  return (
    <Flex direction="column" gap="3">
      <Heading as="h2" size="4">
        {t('settings.assistant.title')}
      </Heading>
      <Text size="2" color="gray">
        {t('settings.assistant.help')}
      </Text>
      {launch.isPending && (
        <LoadingStatus>
          <Skeleton height="96px" />
        </LoadingStatus>
      )}
      {launch.isError && (
        <ErrorCallout error={launch.error} onRetry={() => void launch.refetch()} />
      )}
      {launch.data && (
        <>
          {launch.data.outsideApplicationsFolder && (
            <Callout.Root color="amber" size="1" role="status">
              <Callout.Text>{t('settings.assistant.moveToApplications')}</Callout.Text>
            </Callout.Root>
          )}
          <Snippet
            label={t('settings.assistant.claudeCode')}
            text={claudeCodeCommand(launch.data)}
          />
          <Snippet label={t('settings.assistant.config')} text={mcpClientConfig(launch.data)} />
        </>
      )}
    </Flex>
  );
}

function Snippet({ label, text }: { label: string; text: string }) {
  const { t } = useTranslation();
  return (
    <Flex direction="column" gap="2" align="start">
      <Text size="2" weight="medium">
        {label}
      </Text>
      <Code
        size="1"
        variant="soft"
        style={{ display: 'block', width: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
      >
        {text}
      </Code>
      <CopyButton text={text} label={t('settings.assistant.copy', { what: label })} />
    </Flex>
  );
}
