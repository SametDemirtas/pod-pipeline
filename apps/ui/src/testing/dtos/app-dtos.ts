import {
  BATCH_STEP_STATES,
  type BatchEstimateDto,
  type BatchJobDto,
  type AiCatalogDto,
} from '@pod/contracts/client';

const model = (id: string, seesImages = true) => ({ id, seesImages });

/** The AI services as the app offers them, with a text-only model to filter out. */
export const aiCatalogDto: AiCatalogDto = {
  anthropic: {
    service: 'Claude',
    text: {
      defaultModel: 'claude-opus-5-5',
      models: [model('claude-opus-5-5'), model('claude-sonnet-5-5'), model('claude-haiku-5-5')],
      defaultCheckModel: 'claude-haiku-5-5',
      othersSeeImages: true,
    },
    scenes: null,
  },
  openai: {
    service: 'ChatGPT',
    text: {
      defaultModel: 'gpt-6.1-sol',
      models: [model('gpt-6-astra'), model('gpt-6.1-sol'), model('gpt-6-luna')],
      defaultCheckModel: 'gpt-6-luna',
      othersSeeImages: true,
    },
    scenes: {
      defaultModel: 'gpt-image-2.5-sunburst',
      models: [model('gpt-image-2.5-sunburst'), model('gpt-image-2')],
    },
  },
  deepseek: {
    service: 'DeepSeek',
    text: {
      defaultModel: 'deepseek-flash',
      models: [model('deepseek-v4-pro', false), model('deepseek-flash')],
      defaultCheckModel: 'deepseek-flash',
      othersSeeImages: false,
    },
    scenes: null,
  },
  kimi: {
    service: 'Kimi',
    text: {
      defaultModel: 'kimi-k3.1-pro',
      models: [model('kimi-k3.1-pro')],
      defaultCheckModel: 'kimi-k3.1-pro',
      othersSeeImages: true,
    },
    scenes: null,
  },
  gemini: {
    service: 'Gemini',
    text: {
      defaultModel: 'gemini-3.8-flash',
      models: [model('gemini-4-argon'), model('gemini-3.8-flash')],
      defaultCheckModel: 'gemini-3.8-flash',
      othersSeeImages: true,
    },
    scenes: {
      defaultModel: 'gemini-nano-banana-2.1',
      models: [model('gemini-nano-banana-2.1'), model('gemini-3-pro-image')],
    },
  },
};

/** A run part way through, with one design stopped. */
export function batchJobDto(overrides: Partial<BatchJobDto> = {}): BatchJobDto {
  const counts = (changes: object) => ({
    ...Object.fromEntries(BATCH_STEP_STATES.map((state) => [state, 0])),
    ...changes,
  });
  return {
    id: 'job-1',
    state: 'running',
    steps: ['print', 'mockups'],
    market: 'US',
    createdAt: '2026-10-28T09:00:00.000Z',
    finishedAt: null,
    designs: 3,
    settledDesigns: 1,
    stepCounts: {
      print: counts({ done: 2, pending: 1 }),
      mockups: counts({ done: 1, skipped: 0, pending: 1, running: 1 }),
    } as BatchJobDto['stepCounts'],
    current: { designKey: '02-mug', step: 'mockups' },
    failures: [],
    ...overrides,
  };
}

export function batchEstimateDto(overrides: Partial<BatchEstimateDto> = {}): BatchEstimateDto {
  return {
    designs: 225,
    printChecks: 225,
    mockupTasks: 200,
    textRequests: { min: 675, max: 1350 },
    textService: 'Claude',
    textModel: 'claude-opus-5-5',
    languages: ['en-US', 'de', 'fr'],
    drafts: 225,
    draftsWaiting: 0,
    missingPrices: [],
    shipping: [{ familyId: 'mug', profile: 'Printful: Mugs', missing: null }],
    ...overrides,
  };
}
