// Selects the platform visual treatment (fonts, palette, control geometry and
// navigation styling in ui/tokens.css). This styles web controls after each
// platform's conventions; it does not make them native controls.
export type Platform = "macos" | "windows" | "linux";
type NavigatorLike = {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
};

export function detectPlatform(nav: NavigatorLike = navigator): Platform {
  const hint = `${nav.userAgentData?.platform ?? ""} ${nav.platform ?? ""} ${nav.userAgent ?? ""}`;
  if (/mac/i.test(hint)) return "macos";
  if (/win/i.test(hint)) return "windows";
  // Linux, BSD and anything unrecognized use the contemporary Linux treatment.
  return "linux";
}

export function applyPlatform(
  root: HTMLElement = document.documentElement,
  nav: NavigatorLike = navigator,
): Platform {
  const platform = detectPlatform(nav);
  root.dataset.platform = platform;
  applyVisualTheme(undefined,root);
  return platform;
}

export const visualThemes = [
  {id:"system",label:"Follow platform"}, {id:"macos",label:"macOS"},
  {id:"windows",label:"Windows · Fluent"}, {id:"linux",label:"GNOME · Adwaita"},
  {id:"kde",label:"KDE · Breeze"}, {id:"tokyo-night",label:"Tokyo Night"},
];
export function selectedVisualTheme() {
  const value=localStorage.getItem("omd.visual-theme") ?? "system";
  return visualThemes.some(t=>t.id===value) ? value : "system";
}
export function applyVisualTheme(value=selectedVisualTheme(), root:HTMLElement=document.documentElement) {
  const id=visualThemes.some(t=>t.id===value) ? value : "system";
  root.dataset.visualTheme=id;
  root.dataset.appearance=id==="system" ? root.dataset.platform ?? "linux" : ["macos","windows","linux"].includes(id) ? id : "linux";
  window.dispatchEvent(new Event("omd-theme-changed"));
}

/** What the operating system calls its password store, for plain copy. Uses the real OS, not the chosen look. */
export function credentialStoreName(platform: string | undefined = document.documentElement.dataset.platform): string {
  return platform === "macos" ? "your Mac’s keychain" : platform === "windows" ? "Windows Credential Manager" : "your system keyring";
}
