import { vi } from 'vitest';
import { SCENE_LOOK_OPTIONS, type DesktopApi, type PrintRequest } from '@pod/contracts/client';
import { mockupDto, printCheckDto } from '../dtos/catalog-dtos.js';
import type { FakeState } from './fake-state.js';

/** Print checks, Printful photos and scenes. */
export function fakePrintApi(state: FakeState) {
  return {
    checkPrint: vi.fn((request: PrintRequest) =>
      Promise.resolve(
        printCheckDto({
          designId: request.designId,
          variantId: request.variantId ?? '1320',
          printArea: request.printArea ?? 'default',
          fit: request.fit,
          ...(request.fit === 'cover' && {
            placement: { left: 0, top: -54, width: 2700, height: 1159 },
            effectiveDpi: 426,
            areaCovered: 1,
            imageCropped: 0.094,
            turnsToFit: false,
            upright: null,
          }),
        }),
      ),
    ),
    createMockups: vi.fn((request: PrintRequest) => {
      const variantId = request.variantId ?? '1320';
      const area = request.printArea ?? 'default';
      state.mockups = [
        mockupDto('m-front', 'default', variantId, area),
        mockupDto('m-left', 'Left', variantId, area),
      ];
      return Promise.resolve(state.mockups);
    }),
    listMockups: vi.fn<DesktopApi['listMockups']>(() => Promise.resolve(state.mockups)),
    removeMockup: vi.fn<DesktopApi['removeMockup']>((request) => {
      state.mockups = state.mockups.filter((mockup) => mockup.id !== request.mockupId);
      return Promise.resolve(state.mockups);
    }),
    savePhoto: vi.fn<DesktopApi['savePhoto']>(() => Promise.resolve(true)),
    ...fakeSceneApi(state),
  };
}

/** Scene photos, their checks and their look. */
function fakeSceneApi(state: FakeState) {
  return {
    createScene: vi.fn<DesktopApi['createScene']>((request) => {
      const source = state.mockups.find((mockup) => mockup.id === request.mockupId);
      const scene = {
        ...mockupDto(
          `scene-${state.mockups.length}`,
          'Scene',
          source?.variantId,
          source?.printArea,
        ),
        scenePrompt: request.prompt,
        sceneLook: request.look,
        sceneCheck: state.connections.ai[state.settings.textProvider]
          ? { same: true, issues: [], unverifiable: [] }
          : null,
        canCheckAgain: true,
      };
      state.mockups = [scene, ...state.mockups];
      return Promise.resolve({ scenes: [scene], candidateFailed: false });
    }),
    confirmScenePrint: vi.fn<DesktopApi['confirmScenePrint']>((request) => {
      state.mockups = state.mockups.map((mockup) =>
        mockup.id === request.mockupId ? { ...mockup, printConfirmed: request.confirmed } : mockup,
      );
      const scene = state.mockups.find((mockup) => mockup.id === request.mockupId);
      return scene ? Promise.resolve(scene) : Promise.reject(new Error('unknown photo'));
    }),
    checkSceneAgain: vi.fn<DesktopApi['checkSceneAgain']>((request) => {
      state.mockups = state.mockups.map((mockup) =>
        mockup.id === request.mockupId
          ? { ...mockup, sceneCheck: { same: true, issues: [], unverifiable: [] } }
          : mockup,
      );
      const scene = state.mockups.find((mockup) => mockup.id === request.mockupId);
      return scene ? Promise.resolve(scene) : Promise.reject(new Error('unknown photo'));
    }),
    ...fakeSceneLookApi(),
  };
}

/** Reading a style from a photo, and the look options a family is offered. */
function fakeSceneLookApi() {
  return {
    describeSceneStyle: vi.fn<DesktopApi['describeSceneStyle']>(() =>
      Promise.resolve({
        found: true,
        description: 'Place the mug from the photo on a marble counter with a lemon.',
        look: {},
      }),
    ),
    // Like the app, a mug is not offered a top-down view and studio light shows no time of
    // day; the line names the options chosen.
    previewSceneLook: vi.fn<DesktopApi['previewSceneLook']>(({ familyId, look }) => {
      const chosen = Object.entries(look).flatMap(([control, option]) =>
        control !== 'shape' && option ? [option] : [],
      );
      return Promise.resolve({
        line: chosen.length > 0 ? `Look: ${chosen.join('; ')}.` : null,
        options: {
          ...SCENE_LOOK_OPTIONS,
          cameraHeight: SCENE_LOOK_OPTIONS.cameraHeight.filter(
            (option) => familyId !== 'mug' || option !== 'topDown',
          ),
          timeOfDay: look.lighting === 'studio' ? [] : SCENE_LOOK_OPTIONS.timeOfDay,
        },
      });
    }),
  };
}
