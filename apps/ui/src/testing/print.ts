import { ApiError } from '@pod/contracts/client';
import { designDto } from './fake-api.js';

/** The mug design most print and listing tests use. */
export const mug = () => designDto('01-mug', 'Lantern Harbor');
/** An error the app sends, with the given code. */
export const apiError = (code: ApiError['code'], details = {}) =>
  new ApiError({ code, message: 'x', details });
