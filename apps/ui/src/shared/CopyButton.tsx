import { CheckIcon, CopyIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { Button } from '@radix-ui/themes';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const RESULT_MS = 2_000;

type CopyState = 'idle' | 'copied' | 'failed';

const ICONS = { idle: CopyIcon, copied: CheckIcon, failed: CrossCircledIcon } as const;

interface CopyButtonProps {
  readonly text: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/** Copies text and says for a moment whether that worked. */
export function CopyButton({ text, label, disabled }: CopyButtonProps) {
  const { t } = useTranslation();
  const [result, setResult] = useState<CopyState>('idle');
  const Icon = ICONS[result];
  useEffect(() => {
    if (result === 'idle') return;
    const timer = setTimeout(() => {
      setResult('idle');
    }, RESULT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [result]);

  return (
    <Button
      variant="soft"
      disabled={disabled}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setResult('copied');
          },
          () => {
            setResult('failed');
          },
        );
      }}
    >
      <Icon />
      {result === 'idle' ? label : t(result === 'copied' ? 'common.copied' : 'common.copyFailed')}
    </Button>
  );
}
