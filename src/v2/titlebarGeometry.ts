export function titlebarGeometry(
  container: HTMLElement | undefined,
  toggle: HTMLElement | null,
) {
  const heading = container
    ?.querySelector("h1,.back-button")
    ?.getBoundingClientRect();
  const button = toggle?.getBoundingClientRect();
  return {
    centerY: heading ? heading.top + heading.height / 2 : 42,
    toggleStart: button?.left ?? 96,
    toggleEnd: button?.right ?? 128,
  };
}
