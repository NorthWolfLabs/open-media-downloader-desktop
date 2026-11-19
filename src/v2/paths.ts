// Engine file paths are a destination root in the operating system's own form
// plus a relative path that always uses "/". Joined as-is, Windows shows
// "C:\Users\me\Downloads/Show/Episode 1.mp3". These helpers change only the text
// people read: copy and open/reveal actions keep using the engine's path or ids.

/** The real operating system (set at boot from navigator), not the chosen look. */
function currentPlatform(): string | undefined {
  return typeof document === "undefined"
    ? undefined
    : document.documentElement.dataset.platform;
}

/** A path written with the platform's own separators, for display only. */
export function displayPath(
  path: string,
  platform: string | undefined = currentPlatform(),
): string {
  if (platform !== "windows") return path;
  const native = path.replaceAll("/", "\\");
  // Keep a leading "\\" (UNC share or "\\?\" long path); collapse any other
  // doubled separator left by joining a root that already ends with one.
  const prefix = native.startsWith("\\\\") ? "\\\\" : "";
  return prefix + native.slice(prefix.length).replace(/\\{2,}/g, "\\");
}

/** A destination root joined with an engine relative path, for display only. */
export function displayJoinedPath(
  root: string,
  relativePath: string,
  platform: string | undefined = currentPlatform(),
): string {
  return displayPath(`${root}/${relativePath}`, platform);
}
