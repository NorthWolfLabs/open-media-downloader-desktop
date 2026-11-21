import { expect, it } from "vitest";
import { formatChoice, formatPreparation, needsAnotherFormat } from "./jobIssue";

const reference = { provider: "p", id: "r1" };
const source = {
  title: "Episode 1",
  reference,
  destination_id: "d1",
  credential_profile: "acct",
  policy: { languages: [], groups: [], max_height: 720, subtitle_languages: ["en"], automatic_subtitles: true },
  recipe: "mp4" as const,
};

it("asks for another format only when retrying would fail the same way", () => {
  expect(needsAnotherFormat({ retryable: false, actions: ["prepare_again"] })).toBe(true);
  expect(needsAnotherFormat({ retryable: false, actions: [] })).toBe(true);
  expect(needsAnotherFormat({ retryable: true, actions: ["prepare_again"] })).toBe(true);
  expect(needsAnotherFormat({ retryable: true, actions: ["retry"] })).toBe(false);
  expect(needsAnotherFormat(null)).toBe(false);
  expect(needsAnotherFormat(undefined)).toBe(false);
});

it("seeds the choice from the failed plan and keeps its destination, account and filters", () => {
  const choice = formatChoice(source, { media: true, audio: false });
  expect(choice).toMatchObject({ previous: "mp4", recipe: "mp4", maxHeight: 720, subtitles: "en", automaticSubtitles: true });
  choice.recipe = "mkv";
  choice.maxHeight = 1080;
  choice.subtitles = "en, fr, en";
  expect(formatPreparation(choice)).toEqual({
    releases: [reference],
    destination_id: "d1",
    credential_profile: "acct",
    recipe: "mkv",
    policy: { languages: [], groups: [], max_height: 1080, subtitle_languages: ["en", "fr"], automatic_subtitles: true },
  });
});

it("leaves video and subtitle options alone for audio and image items", () => {
  const audio = formatChoice({ ...source, recipe: "mp3", policy: { languages: [] } }, { media: true, audio: true });
  audio.recipe = "opus";
  expect(formatPreparation(audio).policy).toEqual({ languages: [], subtitle_languages: [], automatic_subtitles: false });
  const book = formatChoice(
    { ...source, credential_profile: undefined, recipe: "cbz", policy: { languages: ["en"], groups: ["g"] } },
    { media: false, audio: false },
  );
  book.recipe = "image_folder";
  expect(formatPreparation(book)).toEqual({
    releases: [reference],
    destination_id: "d1",
    credential_profile: null,
    recipe: "image_folder",
    policy: { languages: ["en"], groups: ["g"] },
  });
});
