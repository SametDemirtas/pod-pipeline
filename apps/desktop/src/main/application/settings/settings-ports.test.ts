import { describe, expect, it } from 'vitest';
import type { SettingsDto } from '@pod/contracts';
import { productFamilyId } from '@pod/core';
import { SettingsPorts } from './settings-ports.js';

function ports(settings: Partial<SettingsDto>) {
  let current = settings;
  return {
    ports: new SettingsPorts({ get: () => Promise.resolve(current as SettingsDto) }),
    change: (next: Partial<SettingsDto>) => {
      current = { ...current, ...next };
    },
  };
}

describe('SettingsPorts', () => {
  it('reads the product facts of a family, and empty facts for one without', async () => {
    const mug = { material: 'Ceramic', care: 'Dishwasher safe', fit: '', size: '11 oz' };
    const { ports: facts } = ports({ productFacts: { mug } });

    expect(await facts.factsFor(productFamilyId('mug'))).toEqual(mug);
    expect(await facts.factsFor(productFamilyId('poster'))).toEqual({
      material: '',
      care: '',
      fit: '',
      size: '',
    });
  });

  it('reads each choice afresh, so a change applies to the next listing', async () => {
    const { ports: read, change } = ports({ aiDesigns: false, samsungFromIphone: true });

    expect(await read.designsMadeWithAi()).toBe(false);
    expect(await read.shared()).toBe(true);
    change({ aiDesigns: true, samsungFromIphone: false });
    expect(await read.designsMadeWithAi()).toBe(true);
    expect(await read.shared()).toBe(false);
  });
});
