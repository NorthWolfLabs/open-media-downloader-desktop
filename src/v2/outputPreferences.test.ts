import { afterEach, expect, it } from "vitest";
import { loadOutputPreferences, outputKind, saveOutputPreferences } from "./outputPreferences";

afterEach(() => localStorage.clear());

it("defaults video to MP4, audio to MP3 and images to CBZ", () => {
  expect(loadOutputPreferences("video").recipe).toBe("mp4");
  expect(loadOutputPreferences("audio").recipe).toBe("mp3");
  expect(loadOutputPreferences("image").recipe).toBe("cbz");
  expect(outputKind(true, false)).toBe("video");
  expect(outputKind(true, true)).toBe("audio");
  expect(outputKind(false, false)).toBe("image");
});

it("keeps a podcast's audio choice away from video defaults", () => {
  saveOutputPreferences("audio", { recipe: "mp3", maxHeight: 720, subtitles: "", automaticSubtitles: false });
  expect(loadOutputPreferences("video").recipe).toBe("mp4");
  expect(loadOutputPreferences("audio")).toMatchObject({ recipe: "mp3", maxHeight: 720 });
});

it("ignores an audio format left in the shared 0.2.1 record but keeps its video settings", () => {
  localStorage.setItem(
    "omd.media-options",
    JSON.stringify({ recipe: "mp3", maxHeight: 720, subtitles: "en", automaticSubtitles: true }),
  );
  expect(loadOutputPreferences("video")).toEqual({
    recipe: "mp4",
    maxHeight: 720,
    subtitles: "en",
    automaticSubtitles: true,
  });
  localStorage.setItem("omd.media-options", JSON.stringify({ recipe: "mkv" }));
  expect(loadOutputPreferences("video").recipe).toBe("mkv");
});

it("respects audio chosen for a video once it is saved as a video choice", () => {
  saveOutputPreferences("video", { recipe: "m4a", maxHeight: 1080, subtitles: "", automaticSubtitles: false });
  expect(loadOutputPreferences("video").recipe).toBe("m4a");
});

it("uses defaults for malformed or unsupported saved values", () => {
  localStorage.setItem("omd.image-options", "{not json");
  expect(loadOutputPreferences("image").recipe).toBe("cbz");
  localStorage.setItem("omd.audio-options", JSON.stringify({ recipe: "mp4", maxHeight: 999 }));
  expect(loadOutputPreferences("audio")).toMatchObject({ recipe: "mp3", maxHeight: 1080 });
});
