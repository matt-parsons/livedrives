import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

export function launchGeoGridWorker() {
  try {
    const workerPath = process.env.GEO_GRID_WORKER_PATH || path.join(process.cwd(), 'workers', 'geogrid_worker.js');
    const nodeExecutable = process.env.GEO_GRID_WORKER_NODE || process.execPath;

    if (!existsSync(workerPath)) {
      console.warn(`[geo-grid] Worker script not found at ${workerPath}`);
      return;
    }

    const child = spawn(nodeExecutable, [workerPath], {
      cwd: path.dirname(workerPath),
      detached: true,
      stdio: 'ignore'
    });

    child.unref();
  } catch (error) {
    console.error('Failed to launch geo grid worker', error);
  }
}
