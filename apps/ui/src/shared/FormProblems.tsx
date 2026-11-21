import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { Callout } from '@radix-ui/themes';
import type { Ref } from 'react';

interface FormProblemsProps {
  readonly title: string;
  readonly problems: readonly string[];
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

/** What still keeps a form from being sent, announced and focusable after a failed submit. */
export function FormProblems({ title, problems, ref }: FormProblemsProps) {
  return (
    <Callout.Root color="amber" role="alert" ref={ref} tabIndex={-1}>
      <Callout.Icon>
        <ExclamationTriangleIcon />
      </Callout.Icon>
      <Callout.Text>{title}</Callout.Text>
      <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
        {problems.map((problem) => (
          <li key={problem}>
            <Callout.Text>{problem}</Callout.Text>
          </li>
        ))}
      </ul>
    </Callout.Root>
  );
}
