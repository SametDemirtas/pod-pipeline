import { useState } from 'react';
import { type DesignDetailDto } from '@pod/contracts/client';
import { familyProfileOf } from '@pod/rules';
import { ListingSection } from '../listing/ListingSection.js';
import { PinsSection } from '../pins/PinsSection.js';
import { PrintWorkspace } from '../print/PrintWorkspace.js';
import type { PrintChoice } from '../print/use-print.js';

/** Print check, mockups, listing and pins of one design, sharing the chosen variant and area. */
export function DesignWorkspace({ design }: { design: DesignDetailDto }) {
  const [choice, setChoice] = useState<PrintChoice>({ fit: familyProfileOf(design.familyId).fit });
  return (
    <>
      <PrintWorkspace design={design} choice={choice} onChoiceChange={setChoice} />
      <ListingSection design={design} choice={choice} />
      <PinsSection design={design} />
    </>
  );
}
