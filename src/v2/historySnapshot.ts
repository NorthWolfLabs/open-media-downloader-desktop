import type { EngineClient, Job } from "./client";
// Per connection, shared across page mounts. Never treat a missing snapshot as an empty result.
const snapshots = new WeakMap<
  EngineClient,
  { revision: number; jobs: Job[] }
>();
export const historySnapshot = (client: EngineClient) => snapshots.get(client);
export function saveHistorySnapshot(
  client: EngineClient,
  revision: number,
  jobs: Job[],
) {
  snapshots.set(client, { revision, jobs });
}
