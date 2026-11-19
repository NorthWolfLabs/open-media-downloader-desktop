// Mirrors native window activation on the root element as
// data-window="active" | "inactive", so styles can show each platform's
// inactive-window treatment (macOS de-emphasizes the sidebar selection; GNOME
// switches the sidebar to its backdrop color).
//
// Activation is the operating system's key/foreground window state, which Tauri
// reports as `tauri://focus` / `tauri://blur` and `Window.isFocused()` (on
// macOS: windowDidBecomeKey / windowDidResignKey and isKeyWindow). It is not
// DOM focus: blurring an input, moving focus between controls or opening an
// in-window popover never changes it. Until the first answer arrives the
// attribute is absent and styles treat the window as active, so startup never
// flashes the inactive look. Outside Tauri (development server, tests) the
// page's own window focus is the fallback.
import { TauriEvent } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Unlisten = () => unknown;
/** The subset of Tauri's `Window` used here. */
export type NativeWindow = {
  isFocused(): Promise<boolean>;
  listen(event: string, handler: () => void): Promise<Unlisten>;
};

function currentNativeWindow(): NativeWindow | null {
  try {
    return getCurrentWindow();
  } catch {
    return null; // Not running in Tauri.
  }
}

// Synchronous throws become rejections, so every failure takes the same path.
function attempt<T>(call: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(call());
  } catch (error) {
    return Promise.reject(error);
  }
}

/** Starts tracking and returns a function that stops it. */
export function trackWindowActivity(
  root: HTMLElement = document.documentElement,
  native: NativeWindow | null = currentNativeWindow(),
  page: Window = window,
): () => void {
  let disposed = false;
  // Set by any activation event. A pending isFocused() answer may predate it,
  // so it is ignored once an event has arrived.
  let observed = false;
  let registered: Unlisten[] = [];
  let stopFallback = () => {};
  let warned = false;
  const warn = (error: unknown) => {
    if (warned) return;
    warned = true;
    console.warn("Could not track window activation", error);
  };
  const show = (active: boolean) => {
    if (!disposed) root.dataset.window = active ? "active" : "inactive";
  };
  // Tauri's unlisten functions are async; a failed unregister during teardown
  // must not surface as an unhandled rejection.
  const release = (unlisten: Unlisten) => {
    attempt(async () => unlisten()).catch(() => {});
  };
  const fallback = () => {
    // Window-level focus and blur only. Element focus events do not bubble,
    // so moving focus inside the page never reaches these listeners; the phase
    // check keeps it that way for any event that does.
    const sync = (event: Event) => {
      if (event.eventPhase === Event.AT_TARGET) show(event.type === "focus");
    };
    page.addEventListener("focus", sync);
    page.addEventListener("blur", sync);
    stopFallback = () => {
      page.removeEventListener("focus", sync);
      page.removeEventListener("blur", sync);
    };
    show(page.document.hasFocus());
  };

  if (!native) fallback();
  else {
    const activation = (active: boolean) => () => {
      observed = true;
      show(active);
    };
    void Promise.allSettled([
      attempt(() => native.listen(TauriEvent.WINDOW_FOCUS, activation(true))),
      attempt(() => native.listen(TauriEvent.WINDOW_BLUR, activation(false))),
    ])
      .then(async (results) => {
        const ready = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
        if (disposed) return ready.forEach(release);
        if (ready.length < results.length) {
          // Without both events the native state would go stale.
          ready.forEach(release);
          warn(results.find((r) => r.status === "rejected")?.reason);
          return fallback();
        }
        registered = ready;
        // Ask only after both listeners exist, so no transition can fall
        // between the answer and the first event.
        const focused = await attempt(() => native.isFocused());
        if (!observed) show(focused);
      })
      .catch(warn);
  }

  return () => {
    if (disposed) return;
    disposed = true;
    registered.splice(0).forEach(release);
    stopFallback();
    delete root.dataset.window;
  };
}
