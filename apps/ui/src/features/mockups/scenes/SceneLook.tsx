import type { TFunction } from 'i18next';
import { ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { Box, Button, Flex, Grid, Skeleton, Text } from '@radix-ui/themes';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SCENE_SHAPES,
  type SceneLookControl,
  type SceneLookDto,
  type SceneLookOption,
  type SceneLookPreviewDto,
  type SceneShapeDto,
} from '@pod/contracts/client';
import { LabeledSelect } from '../../../shared/LabeledSelect.js';
import { LoadingStatus } from '../../../shared/LoadingStatus.js';
import { useSceneLookPreview } from './use-scenes.js';

/** A scene in Etsy's shape with every look control on Auto. */
export const PLAIN_LOOK: SceneLookDto = { shape: '4:3' };

const AUTO = 'auto';

type LookChoice = SceneLookOption<SceneLookControl> | typeof AUTO;

/** Shapes by name, as i18next reads a colon in a key as a namespace. */
const SHAPE_NAMES = {
  '4:3': 'landscape',
  '1:1': 'square',
  '3:4': 'portrait',
} as const satisfies Record<SceneShapeDto, string>;

interface SceneLookProps {
  /** The design's product family, which decides the options offered. */
  readonly familyId: string;
  readonly look: SceneLookDto;
  readonly onChange: (look: SceneLookDto) => void;
}

/**
 * The scene's optional look, folded away until opened: its shape and one
 * select per control, each on Auto until chosen, with the line they add.
 */
export function SceneLook({ familyId, look, onChange }: SceneLookProps) {
  const { t } = useTranslation();
  const panelId = useId();
  const previewId = useId();
  const [open, setOpen] = useState(false);
  const preview = useSceneLookPreview(familyId, look, open);
  const options = preview.data?.options;
  const chosen = Object.entries(look).filter(([key, value]) =>
    key === 'shape' ? value !== PLAIN_LOOK.shape : value !== undefined,
  ).length;

  return (
    <Flex direction="column" gap="2">
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        style={{ alignSelf: 'start' }}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        {t('scenes.look.toggle')}
        <Text color="gray" weight="regular">
          {chosen === 0 ? t('scenes.look.allAuto') : t('scenes.look.chosen', { number: chosen })}
        </Text>
      </Button>
      {open && (
        <Flex id={panelId} direction="column" gap="3">
          <Text size="1" color="gray">
            {t('scenes.look.help')}
          </Text>
          {options ? (
            <LookControls options={options} look={look} onChange={onChange} />
          ) : (
            <LoadingStatus label={t('scenes.look.loading')}>
              <Skeleton height="120px" />
            </LoadingStatus>
          )}
          <Box>
            <Text as="p" size="1" weight="medium" id={previewId}>
              {t('scenes.look.preview')}
            </Text>
            <Text as="p" size="1" color="gray" aria-labelledby={previewId}>
              {preview.data?.line ?? t('scenes.look.nothing')}
            </Text>
          </Box>
        </Flex>
      )}
    </Flex>
  );
}

interface LookControlsProps {
  readonly options: SceneLookPreviewDto['options'];
  readonly look: SceneLookDto;
  readonly onChange: (look: SceneLookDto) => void;
}

/** The shape and one select per control the family offers. */
function LookControls({ options, look, onChange }: LookControlsProps) {
  const { t } = useTranslation();
  return (
    <Grid columns={{ initial: '1', sm: '2' }} gap="3">
      <LabeledSelect<SceneShapeDto>
        label={t('scenes.look.controls.shape')}
        value={look.shape}
        options={SCENE_SHAPES.map((shape) => ({
          value: shape,
          label: t(`scenes.look.shapes.${SHAPE_NAMES[shape]}`),
        }))}
        onChange={(shape) => {
          onChange({ ...look, shape });
        }}
        minWidth={0}
        {...(look.shape === PLAIN_LOOK.shape ? {} : { hint: t('scenes.look.cropHint') })}
      />
      {controlsOf(options).map((control) => {
        const offered: readonly LookChoice[] = options[control];
        const labels = optionLabels(t, control);
        const value = look[control];
        return (
          <LabeledSelect<LookChoice>
            key={control}
            label={t(`scenes.look.controls.${control}`)}
            value={value !== undefined && offered.includes(value) ? value : AUTO}
            options={[
              { value: AUTO, label: t('scenes.look.auto') },
              ...offered.map((option) => ({
                value: option,
                label: labels[option] ?? option,
              })),
            ]}
            onChange={(choice) => {
              onChange({ ...look, [control]: choice === AUTO ? undefined : choice });
            }}
            disabled={offered.length === 0}
            minWidth={0}
          />
        );
      })}
    </Grid>
  );
}

function controlsOf(options: SceneLookPreviewDto['options']): SceneLookControl[] {
  return Object.keys(options) as SceneLookControl[];
}

/** The control's option names; like i18next, an option without one would show its key. */
function optionLabels(t: TFunction, control: SceneLookControl): Readonly<Record<string, string>> {
  return t(`scenes.look.options.${control}`, { returnObjects: true });
}
