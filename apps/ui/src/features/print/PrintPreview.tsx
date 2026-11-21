import { Box } from '@radix-ui/themes';
import { assetUrl, type PrintAreaDto, type PrintCheckDto } from '@pod/contracts/client';

interface PrintPreviewProps {
  readonly check: PrintCheckDto;
  readonly area: PrintAreaDto;
  readonly storageKey: string;
  readonly label: string;
}

const percent = (part: number, whole: number) => `${(part / whole) * 100}%`;

/** The print area drawn to scale, with the design where it will be printed. */
export function PrintPreview({ check, area, storageKey, label }: PrintPreviewProps) {
  const { placement } = check;

  return (
    <Box
      role="img"
      aria-label={label}
      style={{
        position: 'relative',
        aspectRatio: `${area.width} / ${area.height}`,
        overflow: 'hidden',
        borderRadius: 'var(--radius-2)',
        border: '1px dashed var(--gray-a8)',
        background:
          'repeating-conic-gradient(var(--gray-a3) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px',
      }}
    >
      <img
        src={assetUrl(storageKey, 1280)}
        alt=""
        decoding="async"
        style={{
          position: 'absolute',
          left: percent(placement.left, area.width),
          top: percent(placement.top, area.height),
          width: percent(placement.width, area.width),
          height: percent(placement.height, area.height),
        }}
      />
    </Box>
  );
}
