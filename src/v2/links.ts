// Web pages the app links to. Every link derives from PROJECT_URL, so moving the
// project means changing this one line. OMD links only to its own project pages:
// it never recommends or links to a specific plugin or site.
import { invoke } from "@tauri-apps/api/core";

export const PROJECT_URL =
  "https://github.com/NorthWolfLabs/open-media-downloader-desktop";

export const projectLinks = {
  home: PROJECT_URL,
  /** Plain-language page about plugins (docs/plugins.md in this project). */
  plugins: `${PROJECT_URL}/blob/main/docs/plugins.md`,
  releases: `${PROJECT_URL}/releases`,
  latestRelease: `${PROJECT_URL}/releases/latest`,
  license: `${PROJECT_URL}/blob/main/LICENSE`,
} as const;

/** True only for https pages at or below PROJECT_URL (no credentials, no other host). */
export function isProjectLink(url: string, base: string = PROJECT_URL): boolean {
  let target: URL, root: URL;
  try {
    target = new URL(url);
    root = new URL(base);
  } catch {
    return false;
  }
  const prefix = root.pathname.replace(/\/$/, "");
  return (
    target.protocol === "https:" &&
    target.origin === root.origin &&
    !target.username &&
    !target.password &&
    (target.pathname === prefix || target.pathname.startsWith(`${prefix}/`))
  );
}

type Opener = (url: string) => Promise<unknown> | unknown;

function defaultOpener(url: string) {
  // The native shell opens public web pages in the default browser; a
  // browser preview opens a new tab without giving it access to this page.
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window)
    return invoke("v2_open_source", { url });
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Open one of OMD's own pages in the user's browser. Other URLs are refused. */
export async function openProjectLink(
  url: string,
  opener: Opener = defaultOpener,
): Promise<void> {
  if (!isProjectLink(url)) throw new Error("OMD can only open its own web pages here.");
  await opener(url);
}
