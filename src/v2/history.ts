import type { Job } from "./client";
import { appLocale } from "./locale";
type HistoryGroup = {
  id: string;
  title: string;
  provider: string;
  jobs: Job[];
  date: string;
};
export function historyGroups(jobs: Job[]): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>();
  for (const job of jobs) {
    const ref = job.plan.collection.reference;
    const id = JSON.stringify([ref.provider, ref.id]);
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        title: job.plan.collection.title,
        provider: ref.provider,
        jobs: [],
        date: job.updated_at,
      };
      groups.set(id, group);
    }
    group.jobs.push(job);
    if (job.updated_at > group.date) group.date = job.updated_at;
  }
  const order = new Intl.Collator(appLocale(), {
    numeric: true,
    sensitivity: "base",
  });
  for (const group of groups.values())
    group.jobs.sort(
      (a, b) =>
        order.compare(
          a.plan.release.chapter ?? a.title,
          b.plan.release.chapter ?? b.title,
        ) || b.updated_at.localeCompare(a.updated_at),
    );
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
}
export const fileSize = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
export type RemovalMode =
  | "remove_files"
  | "forget_history"
  | "remove_files_and_history";
export const removalLabels: Record<RemovalMode, string> = {
  remove_files: "Remove files",
  forget_history: "Remove history",
  remove_files_and_history: "Remove files and history",
};
