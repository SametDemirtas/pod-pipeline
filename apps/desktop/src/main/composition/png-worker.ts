import { parentPort } from 'node:worker_threads';
import { servePngJobs } from '@pod/adapter-fs';

// The entry of the worker thread PNGs are scaled, turned or flattened in, started once per image.
if (parentPort) servePngJobs(parentPort);
