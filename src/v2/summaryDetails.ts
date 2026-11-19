import type { Collection, CollectionDetails, MetadataField } from "./client";
import { durationLabel } from "./mediaPresentation";
import { languageName } from "./languages";
import { appLocale } from "./locale";
/** Search already carries these fields; never replace them with loading bars. */
export function summaryDetails(
  collection: Collection,
): CollectionDetails | null {
  const summary = collection.summary;
  if (!summary) return null;
  const facts: MetadataField[] = [];
  if (summary.status)
    facts.push({
      label: "Publication status",
      values: [summary.status],
      appearance: summary.status_appearance,
    });
  if (summary.rating != null)
    facts.push({
      label: "Rating",
      values: [
        `${summary.rating.toFixed(1)}${summary.rating_max ? ` / ${summary.rating_max}` : ""}`,
      ],
    });
  if (summary.duration_seconds != null)
    facts.push({
      label: "Duration",
      values: [durationLabel(summary.duration_seconds)],
    });
  if (summary.view_count != null)
    facts.push({
      label: "Views",
      values: [Intl.NumberFormat(appLocale()).format(summary.view_count)],
    });
  if (summary.published_label)
    facts.push({ label: "Published", values: [summary.published_label] });
  if (summary.year && !summary.published_label)
    facts.push({ label: "Publication year", values: [String(summary.year)] });
  if (summary.original_language)
    facts.push({
      label: "Original language",
      values: [languageName(summary.original_language)],
    });
  if (summary.content_rating)
    facts.push({
      label: "Content rating",
      values: [summary.content_rating],
      appearance: summary.content_rating_appearance,
    });
  return {
    reference: collection.reference,
    description: collection.description,
    alternative_titles: {},
    creators: summary.creators?.length
      ? [{ label: "Creators", values: summary.creators }]
      : [],
    facts,
    tags: (summary.tags ?? []).map((label) => ({
      id: label,
      label,
      appearance: summary.tag_appearances?.[label],
    })),
    languages: summary.languages ?? [],
  };
}
