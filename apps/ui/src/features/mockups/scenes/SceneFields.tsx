import { Checkbox, Flex, Text, TextArea } from '@radix-ui/themes';
import { typedCharacterCount } from '@pod/rules';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_SCENE_PROMPT_LENGTH } from '@pod/contracts/client';
import { Field } from '../../../shared/Field.js';

interface PromptFieldProps {
  readonly prompt: string;
  readonly onChange: (prompt: string) => void;
}

/** The scene's description, with its character count. */
export function PromptField({ prompt, onChange }: PromptFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Field
      id={id}
      label={t('scenes.prompt')}
      hint={t('common.characterCount', {
        used: typedCharacterCount(prompt),
        limit: MAX_SCENE_PROMPT_LENGTH,
      })}
    >
      {(describedBy) => (
        <TextArea
          id={id}
          rows={4}
          maxLength={MAX_SCENE_PROMPT_LENGTH}
          aria-describedby={describedBy}
          value={prompt}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}

interface CandidatesChoiceProps {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly hint: string;
  readonly onChange: (checked: boolean) => void;
}

/** Whether to make two scenes and keep the better one. */
export function CandidatesChoice({ checked, disabled, hint, onChange }: CandidatesChoiceProps) {
  const { t } = useTranslation();
  const hintId = useId();
  return (
    <>
      <Text as="label" size="2">
        <Flex as="span" gap="2" align="center">
          <Checkbox
            checked={checked}
            disabled={disabled}
            aria-describedby={hintId}
            onCheckedChange={(state) => {
              onChange(state === true);
            }}
          />
          {t('scenes.twoCandidates')}
        </Flex>
      </Text>
      <Text id={hintId} size="1" color="gray">
        {hint}
      </Text>
    </>
  );
}
