import { Badge, Box, Card, Checkbox, Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import type { DesignDto } from '@pod/contracts/client';
import { DesignImage } from '../../shared/DesignImage.js';
import { designTitle, familyLabel } from '../../shared/family-label.js';
import type { CatalogReturn } from './use-catalog-filters.js';

interface DesignCardProps {
  readonly design: DesignDto;
  /** Picked for preparing listings. */
  readonly selected: boolean;
  readonly onSelectedChange: (selected: boolean) => void;
}

/** A design that opens its page, with a box to pick it beside the link rather than in it. */
export function DesignCard({ design, selected, onSelectedChange }: DesignCardProps) {
  const { t } = useTranslation();
  const family = familyLabel(t, design.familyId);
  const title = designTitle(design.concept.name, family);
  const { search } = useLocation();
  const back: CatalogReturn = { catalogSearch: search };

  const label = `${design.designKey}, ${title}`;

  return (
    <Box position="relative" height="100%">
      <Card asChild style={{ height: '100%' }}>
        <Link to={`/designs/${design.id}`} state={back} aria-label={label}>
          <Flex direction="column" gap="3">
            <DesignImage
              storageKey={design.asset.storageKey}
              width={320}
              imageWidth={design.asset.width}
              imageHeight={design.asset.height}
              alt={title}
            />
            <Flex direction="column" gap="1" minWidth="0">
              {/* The product moves under the code rather than cutting it off. */}
              <Flex justify="between" align="center" gap="2" wrap="wrap">
                <Text weight="bold" wrap="nowrap">
                  {design.designKey}
                </Text>
                <Badge variant="soft" color="gray">
                  {family}
                </Badge>
              </Flex>
              <Text size="2" color="gray" truncate title={design.concept.name ?? undefined}>
                {design.concept.name ?? t('catalog.unnamed')}
              </Text>
            </Flex>
            {design.revision > 1 && (
              <Text size="1" color="gray">
                {t('catalog.revision', { revision: design.revision })}
              </Text>
            )}
          </Flex>
        </Link>
      </Card>
      <Box
        position="absolute"
        top="2"
        left="2"
        p="1"
        style={{
          background: 'var(--color-panel-solid)',
          borderRadius: 'var(--radius-2)',
          lineHeight: 0,
        }}
      >
        <Checkbox
          checked={selected}
          aria-label={t('catalog.select', { design: label })}
          onCheckedChange={(checked) => {
            onSelectedChange(checked === true);
          }}
        />
      </Box>
    </Box>
  );
}
