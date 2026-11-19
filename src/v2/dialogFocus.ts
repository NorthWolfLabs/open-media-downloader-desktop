// Record the initiating control before async actions disable it and blur focus.
// Dialog interactions never replace the underlying page's return destination.
let trigger: HTMLElement | null = null;
export function trackDialogTriggers() {
  const remember = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button,a[href],[role="button"]') : null;
    if (target && !target.closest('dialog[open]')) trigger = target;
  };
  document.addEventListener('click', remember, true);
  return () => { document.removeEventListener('click', remember, true); trigger = null; };
}
export function dialogReturnTarget(): HTMLElement | null {
  // Safari/native AX activation can dispatch a button click without moving
  // focus off the page heading. The observed activation is the return target.
  if (trigger?.isConnected) return trigger;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && !active.closest('dialog[open]')) return active;
  return null;
}
