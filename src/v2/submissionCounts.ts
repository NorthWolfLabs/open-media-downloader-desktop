/** Both selected-item and collection-batch submissions share the same UI. */
export type Submission = {
  group_id: string;
  created?: number;
  existing?: number;
  items?: { created: boolean }[];
};
export function submissionCounts(value: Submission) {
  if (value.items) {
    const created = value.items.filter((item) => item.created).length;
    return { created, existing: value.items.length - created };
  }
  if (Number.isInteger(value.created) && Number.isInteger(value.existing))
    return { created: value.created!, existing: value.existing! };
  throw new Error(
    "The downloads were submitted, but their confirmation could not be read. Open Downloads to check their progress.",
  );
}
