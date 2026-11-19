/** Preserve source hue as a hint; the app owns saturation, lightness and contrast. */
export function labelStyle(appearance?: { color: string } | null): string {
  const color = appearance?.color;
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return "";
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(color.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  if (d < 0.04) return ""; // Neutral source colors use neutral theme labels.
  let h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return `--label-hue:${Math.round(h)}`;
}
