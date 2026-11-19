// The application icon for the current platform treatment. The images are
// exported from the sources in src-tauri/icons/platform/ (see icons/README.md).
import macos from "../assets/app-icon-macos.png";
import windows from "../assets/app-icon-windows.png";
import linux from "../assets/app-icon-linux.png";

export function appIcon(
  platform: string | undefined = document.documentElement.dataset.platform,
): string {
  return platform === "macos" ? macos : platform === "windows" ? windows : linux;
}
