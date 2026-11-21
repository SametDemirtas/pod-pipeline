import { Text } from '@radix-ui/themes';

/**
 * The end of a path: a file with its folder, e.g. `01. Frost Garden/Mug.png`,
 * or a folder alone, whose parent says little, e.g. `Designs`.
 */
export function shortPath(path: string, folder = false): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.slice(folder ? -1 : -2).join('/') || path;
}

interface PathTextProps {
  readonly path: string;
  /** The path is a folder, shown by its name alone. */
  readonly folder?: boolean;
  readonly size?: '1' | '2' | '3';
}

/** A file or folder path that fits on one line; the full path shows on hover. */
export function PathText({ path, folder = false, size = '2' }: PathTextProps) {
  return (
    <Text size={size} truncate title={path} style={{ display: 'block', minWidth: 0 }}>
      {shortPath(path, folder)}
    </Text>
  );
}
