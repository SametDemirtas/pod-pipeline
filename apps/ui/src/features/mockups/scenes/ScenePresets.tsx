import { Button, Flex, Tabs } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { presetsFor, sceneKindsFor } from '@pod/rules';

interface ScenePresetsProps {
  /** The design's product family, whose ready-made scenes are offered. */
  readonly familyId: string;
  readonly onPick: (prompt: string) => void;
}

/** The family's ready-made scenes, one kind per tab. */
export function ScenePresets({ familyId, onPick }: ScenePresetsProps) {
  const { t } = useTranslation();
  const kinds = sceneKindsFor(familyId);
  if (!kinds.length) return null;

  return (
    <Tabs.Root defaultValue={kinds[0]}>
      <Tabs.List size="1" aria-label={t('scenes.kind')}>
        {kinds.map((kind) => (
          <Tabs.Trigger key={kind} value={kind}>
            {t(`scenes.kinds.${kind}`)}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {kinds.map((kind) => (
        <Tabs.Content key={kind} value={kind}>
          <Flex gap="2" wrap="wrap" pt="2">
            {presetsFor(familyId, kind).map(([name, text]) => (
              <Button
                key={name}
                size="1"
                variant="outline"
                type="button"
                onClick={() => {
                  onPick(text);
                }}
              >
                {t(`scenes.presetNames.${name}`)}
              </Button>
            ))}
          </Flex>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
