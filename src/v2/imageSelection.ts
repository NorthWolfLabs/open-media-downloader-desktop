import type { Collection, SourceRef } from './client';
export const imageKey = (item: Collection) => JSON.stringify([item.reference.provider, item.reference.id]);
export function imageRelease(item: Collection): SourceRef {
  if (!item.summary?.image) throw new Error('Choose an image post.');
  return { provider: item.reference.provider, id: item.summary.image.release_id };
}
export function imageCount(items: Collection[]) { return items.reduce((sum, item) => sum + (item.summary?.image?.count ?? 0), 0); }
export function toggleImageSelection(items: Collection[], selected: Set<string>, key: string, anchor: string | null, range: boolean) {
  const next = new Set(selected), index = items.findIndex(i => imageKey(i) === key), start = items.findIndex(i => imageKey(i) === anchor);
  const adding = !next.has(key);
  for (const item of range && start >= 0 && index >= 0 ? items.slice(Math.min(start, index), Math.max(start, index) + 1) : items.filter(i => imageKey(i) === key)) {
    if (item.summary?.image) adding ? next.add(imageKey(item)) : next.delete(imageKey(item));
  }
  return next;
}
export function imageGroups(items: Collection[]) {
  const groups = new Map<string, Collection[]>();
  for (const item of items) if(item.summary?.image) {
    const rows = groups.get(item.reference.provider) ?? [];
    if(!rows.some(row => imageKey(row) === imageKey(item))) rows.push(item);
    groups.set(item.reference.provider, rows);
  }
  return [...groups.values()].flatMap(rows => Array.from({length:Math.ceil(rows.length / 2000)}, (_, i) => rows.slice(i * 2000, (i + 1) * 2000)));
}
