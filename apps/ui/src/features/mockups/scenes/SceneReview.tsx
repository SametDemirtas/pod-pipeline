import { Badge, Checkbox, Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { MockupDto, SceneCheckDto } from '@pod/contracts/client';
import { BusyButton } from '../../../shared/BusyButton.js';
import { ConnectionNotice } from '../../../shared/ConnectionNotice.js';
import { ErrorCallout } from '../../../shared/ErrorCallout.js';
import { missingConnection } from '../../../shared/missing-connection.js';
import { useCheckSceneAgain, useConfirmScenePrint } from './use-scenes.js';

/**
 * What the language model found when it compared the scene with its photo, and the
 * seller's own check, without which the scene stays out of the listing.
 */
export function SceneReview({ designId, scene }: { designId: string; scene: MockupDto }) {
  const { t } = useTranslation();
  const confirm = useConfirmScenePrint(designId);
  const checkAgain = useCheckSceneAgain(designId);
  const check = scene.sceneCheck;
  // Each action clears the other's error, so only the latest one shows.
  const error = confirm.error ?? checkAgain.error;
  const missing = missingConnection(error);

  return (
    <Flex direction="column" gap="1" mt="1" align="start">
      <Flex direction="column" gap="1" align="start" role="status">
        <CheckBadge check={check} />
        <Notes items={check?.issues ?? []} color={check?.same === false ? 'red' : 'gray'} />
        <Notes items={check?.unverifiable ?? []} color="amber" />
      </Flex>
      <Text as="label" size="1">
        <Flex gap="1" align="center">
          <Checkbox
            checked={scene.printConfirmed}
            // Keeps the focus while the check saves.
            aria-disabled={confirm.isPending || checkAgain.isPending}
            onCheckedChange={(state) => {
              if (confirm.isPending || checkAgain.isPending) return;
              checkAgain.reset();
              confirm.mutate({ mockupId: scene.id, confirmed: state === true });
            }}
          />
          {t('scenes.check.confirm')}
        </Flex>
      </Text>
      {scene.canCheckAgain && (
        <BusyButton
          size="1"
          variant="ghost"
          busy={checkAgain.isPending}
          loading={checkAgain.isPending}
          onClick={() => {
            confirm.reset();
            checkAgain.mutate(scene.id);
          }}
        >
          {t('scenes.check.again')}
        </BusyButton>
      )}
      {missing ? <ConnectionNotice {...missing} /> : error && <ErrorCallout error={error} />}
    </Flex>
  );
}

/** A changed print weighs more than details the check could not see well enough. */
function CheckBadge({ check }: { check: SceneCheckDto | null }) {
  const { t } = useTranslation();
  if (check === null) return <Badge color="gray">{t('scenes.check.unchecked')}</Badge>;
  if (!check.same) return <Badge color="red">{t('scenes.check.different')}</Badge>;
  if (check.unverifiable.length > 0) {
    return <Badge color="amber">{t('scenes.check.doubts')}</Badge>;
  }
  return <Badge color="jade">{t('scenes.check.same')}</Badge>;
}

function Notes({ items, color }: { items: readonly string[]; color: 'red' | 'gray' | 'amber' }) {
  if (items.length === 0) return null;
  return (
    <Text size="1" color={color} asChild>
      <ul style={{ margin: 0, paddingInlineStart: 16 }}>
        {items.map((item, index) => (
          // The check may repeat a sentence, so its place keeps the key unique.
          <li key={`${String(index)}-${item}`}>{item}</li>
        ))}
      </ul>
    </Text>
  );
}
