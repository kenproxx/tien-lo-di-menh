import { Worker } from "node:worker_threads";
import type { CharacterState } from "../../../packages/database/src/state.js";
import type { offlineSimulation } from "./gameplay.js";
type Result = {
  state: CharacterState;
  report: ReturnType<typeof offlineSimulation>;
};
let active = 0;
const waiting: Array<() => void> = [];
export async function computeOffline(
  state: CharacterState,
  elapsedMs: number,
  plan: { map: string; quest?: string },
  seed: string,
): Promise<Result> {
  if (waiting.length >= 64) throw new Error("OFFLINE_BUSY");
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await new Promise<Result>((resolve, reject) => {
      const worker = new Worker(
        new URL("./offline-worker.mjs", import.meta.url),
        { workerData: { state, elapsedMs, plan, seed }, execArgv: [] },
      );
      const timeout = setTimeout(() => {
        void worker.terminate();
        reject(new Error("OFFLINE_COMPUTE_TIMEOUT"));
      }, 30000);
      let received = false;
      worker.once("message", (result: Result) => {
        received = true;
        clearTimeout(timeout);
        void worker.terminate().then(() => resolve(result), reject);
      });
      worker.once("error", (error) => {
        clearTimeout(timeout);
        if (!received) reject(error);
      });
      worker.once("exit", () => {
        clearTimeout(timeout);
        if (!received) reject(new Error("OFFLINE_WORKER_EXIT"));
      });
    });
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
