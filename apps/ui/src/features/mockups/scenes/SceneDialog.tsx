import { Button, Callout, Dialog, Flex, Text } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BusyButton } from '../../../shared/BusyButton.js';
import { ConnectionNotice } from '../../../shared/ConnectionNotice.js';
import { ErrorCallout } from '../../../shared/ErrorCallout.js';
import { useChosenAi } from '../../../shared/use-ai.js';
import { missingConnection } from '../../../shared/missing-connection.js';
import { SceneLook } from './SceneLook.js';
import { CandidatesChoice, PromptField } from './SceneFields.js';
import { ScenePresets } from './ScenePresets.js';
import { SceneStyleOffer } from './SceneStyleOffer.js';
import { StyleFromPhoto } from './StyleFromPhoto.js';
import { useSceneForm } from './use-scene-form.js';
import { useCreateScene, useDescribingStyle, useSceneRunning } from './use-scenes.js';

interface SceneDialogProps {
  readonly designId: string;
  /** The design's product family, whose ready-made scenes are offered. */
  readonly familyId: string;
  readonly mockupId: string;
  readonly label: string;
}

/** Asks the chosen image service for a scene around one photo, billed to the seller's key. */
export function SceneDialog({ designId, familyId, mockupId, label }: SceneDialogProps) {
  const { t } = useTranslation();
  const ai = useChosenAi();
  // The image service makes the scene; the text service checks it and reads photos.
  const names = { service: ai.scenes.service, checker: ai.text.service };
  const [open, setOpen] = useState(false);
  const form = useSceneForm();
  const { prompt, look, twoCandidates } = form;
  const create = useCreateScene(designId);
  const running = useSceneRunning(designId);
  const describing = useDescribingStyle(designId);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Closing would hide the outcome of a scene or a description that is already billed.
        if (!next && (create.isPending || describing)) return;
        setOpen(next);
        if (next) {
          create.reset();
          form.restart();
        }
      }}
    >
      <Dialog.Trigger>
        <Button size="1" variant="soft" aria-label={t('scenes.makeFor', { photo: label })}>
          {t('scenes.make')}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="560px">
        <Dialog.Title>{t('scenes.title')}</Dialog.Title>
        <Dialog.Description size="2">{t('scenes.help', names)}</Dialog.Description>
        <Flex direction="column" gap="3" mt="3">
          <ScenePresets familyId={familyId} onPick={form.setPrompt} />
          <StyleSuggestion
            designId={designId}
            disabled={create.isPending}
            service={names.checker}
            form={form}
          />
          <PromptField prompt={prompt} onChange={form.setPrompt} />
          <SceneLook familyId={familyId} look={look} onChange={form.setLook} />
          <CandidatesChoice
            checked={twoCandidates}
            disabled={create.isPending}
            hint={t('scenes.twoCandidatesHint', names)}
            onChange={form.setTwoCandidates}
          />
          <SceneOutcome
            names={names}
            creating={create.isPending}
            running={running}
            candidateFailed={create.data?.candidateFailed === true}
            error={create.error}
          />
        </Flex>
        <SceneActions
          canCreate={prompt.trim() !== ''}
          busy={running}
          creating={create.isPending}
          describing={describing}
          onCreate={() => {
            create.mutate(
              { mockupId, prompt, look, candidates: twoCandidates ? 2 : 1 },
              {
                onSuccess: ({ candidateFailed }) => {
                  // With one of two scenes missing, the dialog stays open to say so.
                  if (!candidateFailed) setOpen(false);
                },
              },
            );
          }}
        />
      </Dialog.Content>
    </Dialog.Root>
  );
}

interface StyleSuggestionProps {
  readonly designId: string;
  readonly disabled: boolean;
  /** The text service that describes the photo. */
  readonly service: string;
  readonly form: ReturnType<typeof useSceneForm>;
}

/** Reads a style from a photo and offers it in place of the seller's own words. */
function StyleSuggestion({ designId, disabled, service, form }: StyleSuggestionProps) {
  const { offered } = form;
  return (
    <>
      <StyleFromPhoto designId={designId} disabled={disabled} onDescribed={form.offer} />
      {offered !== null && (
        <SceneStyleOffer
          service={service}
          onTake={() => {
            form.take(offered);
          }}
          onKeep={form.keep}
        />
      )}
    </>
  );
}

interface SceneOutcomeProps {
  readonly names: { readonly service: string; readonly checker: string };
  readonly creating: boolean;
  readonly running: boolean;
  readonly candidateFailed: boolean;
  readonly error: Error | null;
}

function SceneOutcome({ names, creating, running, candidateFailed, error }: SceneOutcomeProps) {
  const { t } = useTranslation();
  const missing = missingConnection(error);
  return (
    <>
      <Text size="1" color="gray" role="status">
        {creating
          ? t('scenes.creating', names)
          : running
            ? t('scenes.busy')
            : t('scenes.cost', names)}
      </Text>
      {candidateFailed && (
        <Callout.Root color="amber" size="1" role="alert">
          <Callout.Text>{t('scenes.candidateFailed')}</Callout.Text>
        </Callout.Root>
      )}
      {missing ? <ConnectionNotice {...missing} /> : error && <ErrorCallout error={error} />}
    </>
  );
}

interface SceneActionsProps {
  readonly canCreate: boolean;
  readonly busy: boolean;
  readonly creating: boolean;
  readonly describing: boolean;
  readonly onCreate: () => void;
}

function SceneActions({ canCreate, busy, creating, describing, onCreate }: SceneActionsProps) {
  const { t } = useTranslation();
  return (
    <Flex gap="3" mt="4" justify="end">
      <Dialog.Close>
        <Button variant="soft" color="gray" disabled={creating || describing}>
          {t('common.cancel')}
        </Button>
      </Dialog.Close>
      <BusyButton disabled={!canCreate} busy={busy} loading={creating} onClick={onCreate}>
        {t('scenes.create')}
      </BusyButton>
    </Flex>
  );
}
