import { counter, jsonOf, route, type Answer, type Json, type Route } from './http.js';
import { failed, ok } from './printful-answers.js';

/** Holds mockup tasks pending until released, to have a step running while a test acts. */
export interface MockupSwitch {
  held: boolean;
}

/**
 * Printful's mockup generator, whose tasks are done on the first look unless
 * held; photos come from `cdn`.
 */
export function mockupTaskRoutes(
  cdn: string,
  hasProduct: (productId: string) => boolean,
  hold: MockupSwitch,
): Route[] {
  const tasks = new Map<string, Json>();
  const taskIds = counter(1);

  const createTask: Answer = async (request, [productId = '']) => {
    const body = await jsonOf(request);
    const placement = (body['files'] as Json[] | undefined)?.[0];
    if (!hasProduct(productId)) return failed(404, 'Product not found');
    if (typeof placement?.['image_url'] !== 'string') return failed(400, 'Missing image_url');
    const taskKey = `gt-${String(taskIds())}`;
    tasks.set(taskKey, { variantIds: body['variant_ids'], placement: placement['placement'] });
    return ok({ task_key: taskKey, status: 'pending' });
  };

  const readTask: Answer = (_request, _params, url) => {
    const taskKey = url.searchParams.get('task_key') ?? '';
    const task = tasks.get(taskKey);
    if (!task) return failed(404, 'Task not found');
    if (hold.held) return ok({ task_key: taskKey, status: 'pending' });
    return ok({
      task_key: taskKey,
      status: 'completed',
      mockups: (task['variantIds'] as number[]).map((variantId) => ({
        placement: task['placement'],
        variant_ids: [variantId],
        mockup_url: `${cdn}/mockups/${taskKey}-${String(variantId)}.png`,
        extra: [
          {
            title: 'Front view',
            option: 'Front view',
            url: `${cdn}/mockups/${taskKey}-${String(variantId)}-front.png`,
          },
        ],
      })),
    });
  };

  return [
    route('POST', '/mockup-generator/create-task/:id', createTask),
    route('GET', '/mockup-generator/task', readTask),
  ];
}
