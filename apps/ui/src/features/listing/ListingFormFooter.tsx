import { Flex, Link, Text } from '@radix-ui/themes';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopOptionsDto } from '@pod/contracts/client';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { DraftProblems } from './DraftProblems.js';
import { DraftsCheckButton } from './DraftsCheckButton.js';
import type { DraftField } from './listing-draft.js';
import type { DraftsCheck } from './use-drafts-check.js';

interface ListingFormFooterProps {
  readonly shop: ShopOptionsDto;
  readonly problems: readonly DraftField[];
  readonly problemsRef: Ref<HTMLDivElement>;
  readonly descriptionLimit: number;
  readonly check: DraftsCheck;
  readonly busy: boolean;
  readonly creating: boolean;
  readonly createError: unknown;
  readonly onCreate: () => void;
}

/** What is still missing, the create button and what went wrong creating the draft. */
export function ListingFormFooter(props: ListingFormFooterProps) {
  const { t } = useTranslation();
  const { check } = props;
  return (
    <>
      <Flex direction="column" gap="2" align="start">
        <Text size="2" color="gray">
          {t('listing.draftNote')}
        </Text>
        {props.problems.length > 0 && (
          <DraftProblems
            ref={props.problemsRef}
            problems={props.problems}
            shop={props.shop}
            descriptionLimit={props.descriptionLimit}
          />
        )}
        <DraftsCheckButton
          check={check}
          busy={props.busy}
          loading={props.creating}
          onCreate={props.onCreate}
        />
        <Text size="2" color="gray" role="status">
          {props.creating ? t('listing.creating') : ''}
        </Text>
      </Flex>
      {check.error !== null && <ErrorCallout error={check.error} />}
      {props.createError !== null && (
        <ErrorCallout error={props.createError}>
          {check.draftMayExist && (
            <Link href={props.shop.draftsUrl} target="_blank" rel="noreferrer" size="2">
              {t('common.openDrafts')}
            </Link>
          )}
        </ErrorCallout>
      )}
    </>
  );
}
