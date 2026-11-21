import type { Problem, Recipe, SelectionPolicy, SourceRef } from "./client";

/**
 * A failed download whose issue would fail the same way again: the engine marks it
 * not retryable or asks for a new preparation ("prepare_again"). The desktop offers
 * another format for these instead of Retry.
 */
export function needsAnotherFormat(
  issue: Pick<Problem, "retryable" | "actions"> | null | undefined,
): boolean {
  return (
    !!issue &&
    (issue.retryable === false || (issue.actions ?? []).includes("prepare_again"))
  );
}

/** The item to prepare again, with the output choices the person can change. */
export type FormatChoice = {
  title: string;
  reference: SourceRef;
  destination_id: string;
  credential_profile: string | null;
  policy: SelectionPolicy;
  /** The format that failed, so the dialog can name it. */
  previous: Recipe;
  media: boolean;
  audio: boolean;
  recipe: Recipe;
  maxHeight: number;
  subtitles: string;
  automaticSubtitles: boolean;
};

export function formatChoice(
  source: {
    title: string;
    reference: SourceRef;
    destination_id: string;
    credential_profile?: string | null;
    policy: SelectionPolicy;
    recipe: Recipe;
  },
  kind: { media: boolean; audio: boolean },
): FormatChoice {
  return {
    title: source.title,
    reference: source.reference,
    destination_id: source.destination_id,
    credential_profile: source.credential_profile ?? null,
    policy: source.policy,
    previous: source.recipe,
    ...kind,
    recipe: source.recipe,
    maxHeight: source.policy.max_height ?? 1080,
    subtitles: (source.policy.subtitle_languages ?? []).join(", "),
    automaticSubtitles: !!source.policy.automatic_subtitles,
  };
}

/** The `/v2/preparations` body for one item, keeping its destination, account and filters. */
export function formatPreparation(choice: FormatChoice) {
  const policy: SelectionPolicy = { ...choice.policy };
  if (choice.media && !choice.audio) policy.max_height = choice.maxHeight;
  if (choice.media) {
    policy.subtitle_languages = [
      ...new Set(
        choice.subtitles
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    policy.automatic_subtitles = choice.automaticSubtitles;
  }
  return {
    releases: [choice.reference],
    destination_id: choice.destination_id,
    credential_profile: choice.credential_profile,
    recipe: choice.recipe,
    policy,
  };
}
