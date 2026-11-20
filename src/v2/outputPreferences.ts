import type { Recipe } from "./client";

/**
 * Saved "Save as" choices are kept per kind of item, so an audio choice made for a
 * podcast episode never becomes the default for a video (and the other way round).
 */
export type OutputKind = "video" | "audio" | "image";
export type OutputPreferences = {
  recipe: Recipe;
  maxHeight: number;
  subtitles: string;
  automaticSubtitles: boolean;
};

export const recipeChoices: Record<OutputKind, Recipe[]> = {
  video: ["mp4", "mkv", "webm", "m4a", "mp3", "opus"],
  audio: ["mp3", "m4a", "opus"],
  image: ["cbz", "image_folder"],
};
const videoRecipes: Recipe[] = ["mp4", "mkv", "webm"];
const heights = [0, 360, 480, 720, 1080, 1440, 2160];
// "omd.media-options" keeps the video name so saved resolution and subtitles carry over.
const keys: Record<OutputKind, string> = {
  video: "omd.media-options",
  audio: "omd.audio-options",
  image: "omd.image-options",
};
// Version 2 records are written per kind. Earlier video records were shared with
// podcasts, so an audio format saved there is not treated as a video choice.
const version = 2;

export function outputKind(media: boolean, audio: boolean): OutputKind {
  return audio ? "audio" : media ? "video" : "image";
}

export function loadOutputPreferences(kind: OutputKind): OutputPreferences {
  let saved: Record<string, unknown> = {};
  try {
    const value = JSON.parse(localStorage.getItem(keys[kind]) ?? "{}");
    if (value && typeof value === "object") saved = value;
  } catch {
    /* Use defaults for malformed local preferences. */
  }
  const choices = recipeChoices[kind];
  const recipe = saved.recipe as Recipe;
  const trusted =
    choices.includes(recipe) &&
    (kind !== "video" || saved.version === version || videoRecipes.includes(recipe));
  return {
    recipe: trusted ? recipe : choices[0],
    maxHeight: heights.includes(saved.maxHeight as number) ? (saved.maxHeight as number) : 1080,
    subtitles: typeof saved.subtitles === "string" ? saved.subtitles : "",
    automaticSubtitles: saved.automaticSubtitles === true,
  };
}

export function saveOutputPreferences(kind: OutputKind, preferences: OutputPreferences) {
  try {
    localStorage.setItem(keys[kind], JSON.stringify({ ...preferences, version }));
  } catch {
    /* Preferences are a convenience; a blocked store keeps the defaults. */
  }
}
