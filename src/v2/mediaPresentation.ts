import type { Collection, ProviderManifest } from "./client";
import { appLocale } from "./locale";
export type ArtworkPriority = "portrait" | "landscape" | "banner" | "equal";
export function artworkPriority(
  items: Collection[],
  manifests: Record<string, ProviderManifest>,
  providers: string[],
): ArtworkPriority {
  if(items.some(item => item.summary?.image)) return "equal";
  if(items.length && items.every(item=>item.summary?.artwork_layout === "banner")) return "banner";
  if(items.length && items.every(item=>item.summary?.artwork_layout === "portrait")) return "portrait";
  // Keep the geometry stable while independent sources return their first pages.
  const ids = providers.length ? providers : items.map(item => item.reference.provider);
  const shapes = ids.map(id => manifests[id]?.media_tools ? "landscape" : "portrait");
  return shapes.every((shape) => shape === "landscape") && shapes.length
    ? "landscape"
    : shapes.some((shape) => shape === "landscape")
      ? "equal"
      : "portrait";
}
export function durationLabel(seconds: number): string {
  const total = Math.floor(seconds),
    hours = Math.floor(total / 3600),
    minutes = Math.floor(total / 60) % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
    : `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
/** Preserve source-written labels; only convert unambiguous ISO dates. */
export function publishedAge(value: string, now = Date.now()): string {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return value;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const seconds = (now - timestamp) / 1000;
  if (Math.abs(seconds) < 60) return "Just now";
  const units = [[31557600, "year"], [2629800, "month"], [86400, "day"], [3600, "hour"], [60, "minute"]] as const;
  const [size, unit] = units.find(([size]) => Math.abs(seconds) >= size)!;
  const amount = Math.floor(Math.abs(seconds) / size);
  return new Intl.RelativeTimeFormat(appLocale(), { numeric: "always" }).format(seconds < 0 ? amount : -amount, unit);
}
export function canSubscribe(collection: Collection): boolean {
  return collection.kind !== "item";
}
export function subscriptionLabel(collection: Collection): string {
  if (isAudioCollection(collection)) return "Follow podcast";
  if (collection.summary?.profile === "artist") return "Follow artist";
  if (collection.summary?.profile === "uploader") return "Follow uploader";
  return collection.kind === "channel"
    ? "Follow channel"
    : collection.kind === "playlist"
      ? "Follow playlist"
      : "Subscribe";
}

/** Channel tabs share the source-declared primary video feed for following. */
export function subscriptionTarget(collection: Collection) {
  return collection.kind === "channel"
    ? collection.summary?.sections?.find(section => section.kind === "releases")?.reference ?? collection.reference
    : collection.reference;
}

/** Explicit source metadata, never hostname/title guessing. */
export function isAudioCollection(item:Collection):boolean {
 return !!item.summary?.tags?.some(tag=>/^(podcast|podcast episode|audio podcast)$/i.test(tag));
}
export function artworkKind(item:Collection):"audio"|"video"|"book"|"image" {
 return isAudioCollection(item)?"audio":item.summary?.image?"image":item.kind==="manga"?"book":"video";
}
