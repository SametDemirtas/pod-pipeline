import { vi } from 'vitest';
import type { DesktopApi, PinDto, PlanPinRequest } from '@pod/contracts/client';
import { pinDto } from '../dtos/listing-dtos.js';
import type { FakeState } from './fake-state.js';

/** Pinterest boards and pins. */
export function fakePinsApi(state: FakeState) {
  const addPin = (request: PlanPinRequest, pinState: PinDto['state']) => {
    const pin = pinDto({
      ...request,
      id: `pin-${state.pins.length + 1}`,
      publishAt: new Date(request.publishAt).toISOString(),
      state: pinState,
    });
    state.pins = [...state.pins, pin].sort((a, b) => a.publishAt.localeCompare(b.publishAt, 'en'));
    return Promise.resolve(pin);
  };
  const changePin = (id: string, change: Partial<PinDto>) => {
    const current = state.pins.find((pin) => pin.id === id);
    if (!current) return Promise.reject(new Error(`no pin ${id}`));
    const next = { ...current, ...change };
    state.pins = state.pins.map((pin) => (pin.id === id ? next : pin));
    return Promise.resolve(next);
  };
  return {
    listBoards: vi.fn<DesktopApi['listBoards']>(() =>
      Promise.resolve([
        { id: '5001', name: 'Halloween mugs' },
        { id: '5002', name: 'Cozy gifts' },
      ]),
    ),
    listPins: vi.fn<DesktopApi['listPins']>(({ id }) =>
      Promise.resolve(state.pins.filter((pin) => pin.designId === id)),
    ),
    proposePin: vi.fn<DesktopApi['proposePin']>((request) => addPin(request, 'proposed')),
    planPin: vi.fn<DesktopApi['planPin']>((request) => addPin(request, 'planned')),
    approvePin: vi.fn<DesktopApi['approvePin']>(({ id }) => changePin(id, { state: 'planned' })),
    publishPinNow: vi.fn<DesktopApi['publishPinNow']>(({ id }) =>
      changePin(id, {
        state: 'published',
        publishedUrl: 'https://www.pinterest.com/pin/987/',
        failure: null,
      }),
    ),
    removePin: vi.fn<DesktopApi['removePin']>(({ id }) => {
      const designId = state.pins.find((pin) => pin.id === id)?.designId;
      state.pins = state.pins.filter((pin) => pin.id !== id);
      return Promise.resolve(state.pins.filter((pin) => pin.designId === designId));
    }),
  };
}
