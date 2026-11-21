import { Badge, Flex, Link, Text } from '@radix-ui/themes';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListingDto } from '@pod/contracts/client';
import { BusyButton } from '../../shared/BusyButton.js';
import { ConfirmDialog } from '../../shared/ConfirmDialog.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { formatDate } from '../../shared/format.js';
import { resetOthers } from '../../shared/reset-others.js';
import {
  useLinkListing,
  useListingBusy,
  usePublishListing,
  useRefreshListing,
} from './use-listing.js';

const STATE_LABELS = {
  draft: 'listing.stateDraft',
  active: 'listing.stateActive',
  inactive: 'listing.stateInactive',
} as const;

/** The design's Etsy listing and the steps left: link Printful, then publish. */
export function ListingStatus({ listing }: { listing: ListingDto }) {
  const { t, i18n } = useTranslation();
  const { designId } = listing;
  const link = useLinkListing(designId);
  const publish = usePublishListing(designId);
  const refresh = useRefreshListing(designId);
  // Only the latest action's error is shown; an older one may no longer apply.
  const busy = useListingBusy(designId);
  const error = link.error ?? publish.error ?? refresh.error;
  const active = listing.state === 'active';
  const linkStatusId = useId();
  const changes = [link, publish, refresh];

  return (
    <Flex direction="column" gap="3" align="start">
      <Flex gap="2" align="center" wrap="wrap">
        <Badge color={active ? 'jade' : listing.state === 'inactive' ? 'amber' : 'gray'}>
          {t(STATE_LABELS[listing.state])}
        </Badge>
        <Text size="2">{t('listing.number', { id: listing.listingId })}</Text>
        <Link href={listing.editUrl} target="_blank" rel="noreferrer" size="2">
          {t('listing.openOnEtsy')}
        </Link>
      </Flex>
      <Text id={linkStatusId} size="2" color="gray">
        {listing.linkedAt === null
          ? t('listing.notLinked')
          : listing.linkCurrent
            ? t('listing.linked', { date: formatDate(listing.linkedAt, i18n.language) })
            : t('listing.linkOutdated')}
      </Text>
      <Flex gap="3" wrap="wrap">
        <BusyButton
          variant={listing.linkCurrent ? 'soft' : 'solid'}
          busy={busy}
          loading={link.isPending}
          onClick={() => {
            resetOthers(changes, link);
            link.mutate(listing.linkedAt !== null);
          }}
        >
          {t(listing.linkedAt ? 'listing.linkAgain' : 'listing.link')}
        </BusyButton>
        {!active && (
          <PublishButton
            renew={listing.state === 'inactive'}
            busy={!listing.linkCurrent || busy}
            describedBy={listing.linkCurrent ? undefined : linkStatusId}
            loading={publish.isPending}
            onConfirm={() => {
              resetOthers(changes, publish);
              publish.mutate(undefined);
            }}
          />
        )}
        <BusyButton
          variant="ghost"
          busy={busy}
          loading={refresh.isPending}
          onClick={() => {
            resetOthers(changes, refresh);
            refresh.mutate(undefined);
          }}
        >
          {t('listing.refresh')}
        </BusyButton>
      </Flex>
      {error && <ErrorCallout error={error} />}
    </Flex>
  );
}

interface PublishButtonProps {
  /** An inactive listing is activated again, which Etsy charges for like a new one. */
  readonly renew: boolean;
  /** Not linked yet, or another change runs; the button keeps its focus meanwhile. */
  readonly busy: boolean;
  /** The text that says why publishing is not possible yet. */
  readonly describedBy: string | undefined;
  readonly loading: boolean;
  readonly onConfirm: () => void;
}

/**
 * Publishing is public and costs a fee, so it is confirmed first. While it is
 * not possible the button keeps keyboard focus and points to the reason.
 */
function PublishButton({ renew, busy, describedBy, loading, onConfirm }: PublishButtonProps) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      trigger={
        <BusyButton color="jade" busy={busy} aria-describedby={describedBy} loading={loading}>
          {t(renew ? 'listing.renew' : 'listing.publish')}
        </BusyButton>
      }
      title={t('listing.publishTitle')}
      description={t('listing.publishWarning')}
      confirmLabel={t('listing.publishConfirm')}
      color="jade"
      onConfirm={onConfirm}
    />
  );
}
