import { Badge, Box, Flex, Grid, Text } from '@radix-ui/themes';
import type { TFunction } from 'i18next';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { MockupDto, PrintVariantDto } from '@pod/contracts/client';
import { DesignImage } from '../../shared/DesignImage.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { areaLabel, viewLabel } from '../../shared/print-labels.js';
import { PhotoViewer } from './PhotoViewer.js';
import { RemovePhotoButton } from './RemovePhotoButton.js';
import { SceneDialog } from './scenes/SceneDialog.js';
import { SceneReview } from './scenes/SceneReview.js';
import { useRemoveMockup } from './use-mockups.js';

interface MockupGalleryProps {
  readonly designId: string;
  /** The design's product family, whose ready-made scenes are offered. */
  readonly familyId: string;
  readonly mockups: readonly MockupDto[];
  readonly variants: readonly PrintVariantDto[];
  readonly designKey: string;
  readonly revision: number;
  /** Whether scenes can be made, with the seller's key for the chosen image service. */
  readonly scenes: boolean;
}

export function MockupGallery(props: MockupGalleryProps) {
  const { t } = useTranslation();
  const remove = useRemoveMockup(props.designId);
  const list = useRef<HTMLUListElement>(null);
  const variantName = (id: string) =>
    props.variants.find((variant) => variant.id === id)?.name ?? id;
  const altOf = (mockup: MockupDto) =>
    mockup.scenePrompt === null
      ? t('mockups.alt', { design: props.designKey })
      : t('scenes.alt', {
          design: props.designKey,
          scene: shortened(mockup.scenePrompt),
        });
  const outdated = (mockup: MockupDto) => mockup.designRevision !== props.revision;
  // Photos of an earlier revision never reach the listing, so they come last.
  const ordered = [...props.mockups].sort((a, b) => Number(outdated(a)) - Number(outdated(b)));

  return (
    <Flex direction="column" gap="2">
      <Grid asChild columns={{ initial: '2', sm: '3', lg: '4' }} gap="3">
        <ul
          ref={list}
          tabIndex={-1}
          aria-label={t('mockups.title')}
          style={{ listStyle: 'none', padding: 0, margin: 0 }}
        >
          {ordered.map((mockup) => {
            const caption = captionOf(t, mockup, variantName(mockup.variantId));
            return (
              <li key={mockup.id}>
                <MockupFigure
                  designId={props.designId}
                  mockup={mockup}
                  caption={caption}
                  alt={altOf(mockup)}
                  outdated={outdated(mockup)}
                />
                {mockup.scenePrompt !== null && (
                  <SceneReview designId={props.designId} scene={mockup} />
                )}
                <Flex gap="2" mt="1" align="center">
                  {props.scenes && mockup.scenePrompt === null && (
                    <SceneDialog
                      designId={props.designId}
                      familyId={props.familyId}
                      mockupId={mockup.id}
                      label={caption}
                    />
                  )}
                  <RemovePhotoButton
                    photo={caption}
                    busy={remove.isPending}
                    onConfirm={() => {
                      remove.mutate(mockup.id, {
                        onSuccess: () => {
                          list.current?.focus();
                        },
                      });
                    }}
                  />
                </Flex>
              </li>
            );
          })}
        </ul>
      </Grid>
      {remove.error && <ErrorCallout error={remove.error} />}
    </Flex>
  );
}

interface MockupFigureProps {
  readonly designId: string;
  readonly mockup: MockupDto;
  readonly caption: string;
  readonly alt: string;
  /** Made for an earlier revision of the design. */
  readonly outdated: boolean;
}

function MockupFigure({ designId, mockup, caption, alt, outdated }: MockupFigureProps) {
  const { t } = useTranslation();
  return (
    <figure style={{ margin: 0 }}>
      <Box position="relative">
        <PhotoViewer
          designId={designId}
          mockupId={mockup.id}
          storageKey={mockup.asset.storageKey}
          photo={caption}
          alt={alt}
        >
          <DesignImage
            storageKey={mockup.asset.storageKey}
            width={640}
            imageWidth={mockup.asset.width}
            imageHeight={mockup.asset.height}
            alt={alt}
          />
        </PhotoViewer>
        {mockup.scenePrompt !== null && (
          <Badge style={{ position: 'absolute', top: 6, left: 6 }}>{t('common.sceneBadge')}</Badge>
        )}
        {outdated && (
          <Badge color="gray" style={{ position: 'absolute', top: 6, right: 6 }}>
            {t('mockups.outdated')}
          </Badge>
        )}
      </Box>
      <Text size="1" color="gray" mt="1" asChild>
        <figcaption title={mockup.scenePrompt ?? undefined}>{caption}</figcaption>
      </Text>
    </figure>
  );
}

function captionOf(t: TFunction, mockup: MockupDto, variant: string): string {
  if (mockup.scenePrompt !== null) return `${variant} · ${shortened(mockup.scenePrompt)}`;
  return [
    variant,
    // Front and back sets of one variant share their side views.
    mockup.printArea === 'default' ? null : areaLabel(t, mockup.printArea),
    viewLabel(t, mockup.view),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Scene prompts run to a thousand characters; captions and labels show the first words. */
function shortened(prompt: string): string {
  const characters = Array.from(prompt);
  if (characters.length <= 60) return prompt;
  const head = characters.slice(0, 60).join('');
  const space = head.lastIndexOf(' ');
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`;
}
