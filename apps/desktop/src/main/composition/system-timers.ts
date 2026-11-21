import type { Timers } from '../shared/timers.js';

/** The Node timers the app runs on. */
export const systemTimers: Timers = {
  after: (ms, callback) => {
    const timer = setTimeout(callback, ms);
    return () => {
      clearTimeout(timer);
    };
  },
  every: (ms, callback) => {
    const timer = setInterval(callback, ms);
    return () => {
      clearInterval(timer);
    };
  },
};
