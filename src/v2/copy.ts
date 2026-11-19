import { plural } from "./plural";
// Shared visible terminology. API identifiers stay unchanged.
export const subscriptionActions = {
  notify: "Notify only",
  download: "Download automatically",
} as const;

export const fileStatusLabels: Record<string, string> = {
  present: "Files present",
  missing: "Moved or removed",
  partial: "Some files missing",
  modified: "Changed on disk",
  detached: "Cannot access files",
  unavailable: "Cannot access files",
  destination_unavailable: "Destination unavailable",
};

/** Plain paragraphs for the remove-source confirmation, with correct counts. */
export function sourceRemovalCopy(
  review: { accounts: number; jobs: number; subscriptions: number },
  credentialStore: string,
): string[] {
  const first = ["OMD will stop using this plugin and remove it."];
  if (review.accounts) first.push(`Its ${plural(review.accounts, "saved account", "saved accounts")} will be deleted.`);
  const effects = [
    review.jobs ? `${plural(review.jobs, "unfinished download", "unfinished downloads")} will pause` : "",
    review.subscriptions ? `${plural(review.subscriptions, "subscription", "subscriptions")} will turn off` : "",
  ].filter(Boolean);
  const second = effects.length ? [`${effects.join(" and ")}.`] : [];
  if (review.jobs) second.push("Downloads that are almost finished may still complete.");
  return [
    first.join(" "),
    ...(second.length ? [second.join(" ")] : []),
    "Your downloaded files and history stay. If you add this plugin again, you’ll review it again, then you can resume your downloads and subscriptions.",
    ...(review.accounts
      ? [`If ${credentialStore} is locked, the plugin stays off until you unlock it and try again.`]
      : []),
  ];
}

const namingSample = {
  collection: { title: "Harbor Picture Book", provider: "example.source", source_id: "harbor-book", kind: "book" },
  release: { title: "Chapter 1", provider: "example.source", source_id: "harbor-book-1", kind: "release", chapter: "1", volume: "1", language: "en", group: "Example Group" },
} as const;

/** A sample folder path for the naming templates, e.g. "Harbor Picture Book / Chapter 1". */
export function namingExample(templates: { collection?: string; release?: string }): string {
  const fill = (template: string, values: Record<string, string>) =>
    template.replace(/\{(\w+)\}/g, (field, key: string) => values[key] ?? field);
  return `${fill(templates.collection ?? "{title}", namingSample.collection)} / ${fill(templates.release ?? "{title}", namingSample.release)}`;
}
