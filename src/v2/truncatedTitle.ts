/** Reveal only visually clipped text, on pointer hover or keyboard focus. */
export function truncatedTitle(node: HTMLElement, text: string) {
  const owner = node.closest<HTMLElement>("button,a,[tabindex]") ?? node;
  let tooltip: HTMLDivElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const id = `omd-title-${crypto.randomUUID()}`;
  const previous = owner.getAttribute("aria-describedby");
  function stopTimer() {
    if (timer) clearTimeout(timer);
  }
  function hide() {
    stopTimer();
    tooltip?.remove();
    tooltip = undefined;
    if (previous) owner.setAttribute("aria-describedby", previous);
    else owner.removeAttribute("aria-describedby");
  }
  function show() {
    stopTimer();
    if (
      tooltip ||
      (node.scrollHeight <= node.clientHeight + 1 &&
        node.scrollWidth <= node.clientWidth + 1)
    )
      return;
    tooltip = document.createElement("div");
    tooltip.id = id;
    tooltip.className = "omd-title-tooltip";
    tooltip.role = "tooltip";
    tooltip.textContent = text;
    document.body.append(tooltip);
    const rect = node.getBoundingClientRect();
    const width = Math.min(400, window.innerWidth - 24);
    tooltip.style.maxWidth = `${width}px`;
    const bounds = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - bounds.width - 12))}px`;
    tooltip.style.top = `${rect.bottom + bounds.height + 8 < window.innerHeight ? rect.bottom + 6 : Math.max(12, rect.top - bounds.height - 6)}px`;
    owner.setAttribute(
      "aria-describedby",
      [previous, id].filter(Boolean).join(" "),
    );
    tooltip.addEventListener("mouseenter", stopTimer);
    tooltip.addEventListener("mouseleave", leave);
  }
  function enter() {
    stopTimer();
    timer = setTimeout(show, 350);
  }
  function leave() {
    stopTimer();
    timer = setTimeout(hide, 120);
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape" && tooltip) {
      event.preventDefault();
      event.stopPropagation();
      hide();
    }
  }
  node.addEventListener("mouseenter", enter);
  node.addEventListener("mouseleave", leave);
  owner.addEventListener("focus", enter);
  owner.addEventListener("blur", hide);
  window.addEventListener("keydown", key, true);
  window.addEventListener("resize", hide);
  window.addEventListener("scroll", hide, true);
  return {
    update(value: string) {
      text = value;
      hide();
    },
    destroy() {
      hide();
      node.removeEventListener("mouseenter", enter);
      node.removeEventListener("mouseleave", leave);
      owner.removeEventListener("focus", enter);
      owner.removeEventListener("blur", hide);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    },
  };
}
