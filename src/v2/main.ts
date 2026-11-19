import { flushSync, mount, unmount } from "svelte";
import { applyPlatform } from "./platform";
import { STARTUP_SETTLED } from "./startup";

/** Replaces a blank or stuck window with plain text when the app cannot start.
 * It uses no app code, because the app's own code is what failed. */
export function showStartupError(target: HTMLElement, error: unknown) {
  console.error(error);
  const box = document.createElement("div");
  box.setAttribute("role", "alert");
  box.style.cssText = "padding:48px 24px;max-width:640px;font:14px/1.5 system-ui,sans-serif";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:20px;margin:0 0 8px";
  title.textContent = "OMD couldn’t start";
  const advice = document.createElement("p");
  advice.textContent = "Quit OMD and open it again. If this keeps happening, reinstall OMD.";
  const detail = document.createElement("pre");
  detail.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;opacity:.7;font-size:12px";
  detail.textContent = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  box.append(title, advice, detail);
  target.replaceChildren(box);
}

const target = document.getElementById("app")!;
// Before the app chunk loads, so the first paint already has the platform look and
// a saved Light or Dark choice (App applies both again). They only style the page.
try {
  applyPlatform();
  const theme = localStorage.getItem("omd.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (error) {
  console.error(error);
}

// Until App reports that startup settled, any uncaught error or unhandled rejection
// would leave "Opening OMD" on screen, so it ends startup with the message instead.
// Afterwards the listeners are gone and errors behave as they always did.
let app: ReturnType<typeof mount> | undefined;
let finished = false;
let failed = false;
function stopGuard() {
  finished = true;
  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onRejection);
  window.removeEventListener(STARTUP_SETTLED, stopGuard);
}
function fail(error: unknown) {
  if (finished) return;
  failed = true;
  stopGuard();
  try {
    if (app) unmount(app);
  } catch {
    // The page is replaced below either way.
  }
  showStartupError(target, error);
}
// ErrorEvents without an error object (such as ResizeObserver loop notices) are not failures.
function onError(event: ErrorEvent) {
  if (event.error != null) fail(event.error);
}
function onRejection(event: PromiseRejectionEvent) {
  fail(event.reason);
}
window.addEventListener("error", onError);
window.addEventListener("unhandledrejection", onRejection);
window.addEventListener(STARTUP_SETTLED, stopGuard);

// Loading the app separately means an error while its modules load (such as a
// locale Intl rejects) reaches the guard. flushSync runs the first effects
// (onMount, $effect) here too, so their errors do as well.
export const started: Promise<boolean> = import("./boot")
  .then(({ default: App }) => {
    app = mount(App, { target });
    flushSync();
    return !failed;
  })
  .catch((error: unknown) => {
    fail(error);
    return false;
  });
