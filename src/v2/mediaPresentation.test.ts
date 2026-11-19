import { it, expect } from "vitest";
import {
  artworkKind, isAudioCollection,
  artworkPriority,
  durationLabel,
  publishedAge,
  canSubscribe,
  subscriptionLabel,
} from "./mediaPresentation";
import { summaryDetails } from "./summaryDetails";
import type { Collection } from "./client";
const video = {
  kind: "item",
  reference: { provider: "video", id: "1" },
  title: "Video",
  summary: {
    duration_seconds: 748,
    view_count: 140123,
    published_label: "1 hour ago",
  },
} as Collection;
const manga = {
  ...video,
  kind: "manga",
  reference: { provider: "comic", id: "2" },
} as Collection;
const manifests = { video: { media_tools: true }, comic: {} } as any;
it("selects portrait, landscape, or equal treatment from the result set and uses sources before results arrive", () => {
  expect(artworkPriority([manga], manifests, [])).toBe("portrait");
  expect(artworkPriority([video], manifests, [])).toBe("landscape");
  expect(artworkPriority([video], manifests, ["video", "comic"])).toBe("equal");
  expect(artworkPriority([manga, video], manifests, [])).toBe("equal");
  expect(artworkPriority([], manifests, ["video"])).toBe("landscape");
  expect(artworkPriority([], manifests, ["video", "comic"])).toBe("equal");
});
it("uses truthful media facts and supports hour-long durations", () => {
  expect(durationLabel(748)).toBe("12:28");
  expect(durationLabel(3723)).toBe("1:02:03");
  expect(summaryDetails(video)?.facts).toEqual([
    { label: "Duration", values: ["12:28"] },
    { label: "Views", values: ["140,123"] },
    { label: "Published", values: ["1 hour ago"] },
  ]);
});
it("does not offer an item subscription or pretend it follows the channel", () => {
  expect(canSubscribe(video)).toBe(false);
  expect(canSubscribe(manga)).toBe(true);
  expect(subscriptionLabel({ ...video, kind: "channel" })).toBe(
    "Follow channel",
  );
  expect(subscriptionLabel({ ...video, kind: "playlist" })).toBe(
    "Follow playlist",
  );
});

it("formats upload age while preserving source labels and unknown dates", () => {
  const now = Date.parse("2026-09-12T15:00:00Z");
  expect(publishedAge("2026-09-12T13:00:00Z", now)).toBe("2 hours ago");
  expect(publishedAge("2026-09-09", now)).toBe("3 days ago");
  expect(publishedAge("2026-09-12T14:45:00Z", now)).toBe("15 minutes ago");
  expect(publishedAge("2026-09-12T15:00:00Z", now)).toBe("Just now");
  expect(publishedAge("2026-09-13T15:00:00Z", now)).toBe("in 1 day");
  expect(publishedAge("Streamed 2 weeks ago", now)).toBe("Streamed 2 weeks ago");
  expect(publishedAge("unknown", now)).toBe("unknown");
});

it("uses explicit podcast metadata without provider or title heuristics",()=>{
 const podcast={...video,kind:"playlist",summary:{tags:["Podcast"]}} as Collection;
 expect(isAudioCollection(podcast)).toBe(true);expect(artworkKind(podcast)).toBe("audio");expect(subscriptionLabel(podcast)).toBe("Follow podcast");
 expect(isAudioCollection({...video,title:"Podcast NASA"})).toBe(false);expect(artworkKind(manga)).toBe("book");
});
