import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/svelte";
import { trackWindowActivity, type NativeWindow } from "./windowActivity";
import App from "./App.svelte";

const FOCUS = "tauri://focus";
const BLUR = "tauri://blur";
type Pending<T> = { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void };
function pending<T>(): Pending<T> {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
}
// Lets queued promise callbacks and Node's unhandled-rejection check run.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A native window whose registrations and answers the test releases by hand. */
class FakeWindow implements NativeWindow {
  calls: string[] = [];
  live = new Map<string, () => void>();
  handlers = new Map<string, () => void>();
  registrations = new Map<string, Pending<() => unknown>>();
  answers: Pending<boolean>[] = [];
  released: string[] = [];
  listen(event: string, handler: () => void) {
    this.calls.push(`listen ${event}`);
    this.handlers.set(event, handler);
    const registration = pending<() => unknown>();
    this.registrations.set(event, registration);
    return registration.promise;
  }
  isFocused() {
    this.calls.push("isFocused");
    const answer = pending<boolean>();
    this.answers.push(answer);
    return answer.promise;
  }
  grant(event: string, unlisten?: () => unknown) {
    this.live.set(event, this.handlers.get(event)!);
    this.registrations.get(event)!.resolve(
      unlisten ??
        (async () => {
          this.released.push(event);
          this.live.delete(event);
        }),
    );
  }
  emit(event: string) {
    this.live.get(event)?.();
  }
}

let root: HTMLElement;
let unhandled: unknown[];
const collect = (reason: unknown) => unhandled.push(reason);
beforeEach(() => {
  root = document.createElement("html");
  unhandled = [];
  process.on("unhandledRejection", collect);
});
afterEach(async () => {
  await settle();
  process.off("unhandledRejection", collect);
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  Reflect.deleteProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__");
  delete document.documentElement.dataset.window;
  expect(unhandled).toEqual([]);
});

it("asks for the native state only after both events are registered, and a newer event beats an older answer", async () => {
  const native = new FakeWindow();
  trackWindowActivity(root, native);
  // Unknown counts as active: no attribute, so startup never flashes inactive.
  expect(root.dataset.window).toBeUndefined();
  expect(native.calls).toEqual([`listen ${FOCUS}`, `listen ${BLUR}`]);
  native.grant(FOCUS);
  await settle();
  expect(native.calls).not.toContain("isFocused");
  native.grant(BLUR);
  await settle();
  expect(native.calls.at(-1)).toBe("isFocused");
  // The window resigns key while the answer computed before it is in flight.
  native.emit(BLUR);
  expect(root.dataset.window).toBe("inactive");
  native.answers[0].resolve(true);
  await settle();
  expect(root.dataset.window).toBe("inactive");
  native.emit(FOCUS);
  expect(root.dataset.window).toBe("active");
});

it("applies the first answer when no event preceded it, then follows activation changes", async () => {
  const native = new FakeWindow();
  trackWindowActivity(root, native);
  native.grant(FOCUS);
  native.grant(BLUR);
  await settle();
  native.answers[0].resolve(false);
  await settle();
  expect(root.dataset.window).toBe("inactive");
  native.emit(FOCUS);
  expect(root.dataset.window).toBe("active");
  native.emit(BLUR);
  expect(root.dataset.window).toBe("inactive");
});

it("ignores DOM focus, input blur, page blur and in-window popovers while native events are available", async () => {
  const native = new FakeWindow();
  trackWindowActivity(root, native);
  native.grant(FOCUS);
  native.grant(BLUR);
  await settle();
  native.answers[0].resolve(true);
  await settle();
  const input = document.body.appendChild(document.createElement("input"));
  const menu = document.body.appendChild(document.createElement("div"));
  menu.setAttribute("popover", "");
  input.focus();
  input.blur();
  menu.showPopover();
  window.dispatchEvent(new FocusEvent("blur"));
  expect(root.dataset.window).toBe("active");
  input.remove();
  menu.remove();
});

it("releases listeners that finish registering after disposal and writes nothing afterward", async () => {
  const native = new FakeWindow();
  const stop = trackWindowActivity(root, native);
  stop();
  native.grant(FOCUS);
  native.grant(BLUR);
  await settle();
  expect(native.released.sort()).toEqual([BLUR, FOCUS]);
  expect(native.calls).not.toContain("isFocused");
  native.handlers.get(BLUR)!();
  expect(root.dataset.window).toBeUndefined();
});

it("on disposal releases both listeners, clears the state and ignores a late answer or racing event", async () => {
  const native = new FakeWindow();
  const stop = trackWindowActivity(root, native);
  native.grant(FOCUS);
  native.grant(BLUR);
  await settle();
  native.emit(BLUR);
  expect(root.dataset.window).toBe("inactive");
  stop();
  stop();
  await settle();
  expect(native.released.sort()).toEqual([BLUR, FOCUS]);
  expect(root.dataset.window).toBeUndefined();
  native.answers[0].resolve(false);
  native.handlers.get(FOCUS)!();
  await settle();
  expect(root.dataset.window).toBeUndefined();
});

it("keeps the active look and live events when the state query fails, without unhandled rejections", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const native = new FakeWindow();
  trackWindowActivity(root, native);
  native.grant(FOCUS);
  native.grant(BLUR);
  await settle();
  native.answers[0].reject(new Error("is_focused not allowed"));
  await settle();
  expect(root.dataset.window).toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(1);
  native.emit(BLUR);
  expect(root.dataset.window).toBe("inactive");
});

it("falls back to page focus when a native listener cannot be registered, releasing the other one", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const native = new FakeWindow();
  trackWindowActivity(root, native);
  native.grant(FOCUS);
  native.registrations.get(BLUR)!.reject(new Error("listen not allowed"));
  await settle();
  expect(native.released).toEqual([FOCUS]);
  expect(native.calls).not.toContain("isFocused");
  expect(warn).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new FocusEvent("blur"));
  expect(root.dataset.window).toBe("inactive");
  window.dispatchEvent(new FocusEvent("focus"));
  expect(root.dataset.window).toBe("active");
});

it("contains synchronous API throws and failed unregistration during teardown", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const throwing: NativeWindow = {
    listen: () => {
      throw new Error("IPC unavailable");
    },
    isFocused: () => {
      throw new Error("IPC unavailable");
    },
  };
  const first = trackWindowActivity(root, throwing);
  await settle();
  first();

  const native = new FakeWindow();
  const stop = trackWindowActivity(root, native);
  native.grant(FOCUS, () => Promise.reject(new Error("unlisten failed")));
  native.grant(BLUR, () => {
    throw new Error("unlisten threw");
  });
  native.answers.forEach((answer) => answer.resolve(true));
  await settle();
  stop();
  await settle();
  expect(root.dataset.window).toBeUndefined();
});

it("follows page focus outside Tauri without treating control focus or popovers as deactivation", async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const stop = trackWindowActivity(root, null);
  expect(root.dataset.window).toBe("active");
  const input = document.body.appendChild(document.createElement("input"));
  const menu = document.body.appendChild(document.createElement("div"));
  menu.setAttribute("popover", "");
  input.focus();
  input.blur();
  menu.showPopover();
  expect(root.dataset.window).toBe("active");
  window.dispatchEvent(new FocusEvent("blur"));
  expect(root.dataset.window).toBe("inactive");
  window.dispatchEvent(new FocusEvent("focus"));
  expect(root.dataset.window).toBe("active");
  stop();
  window.dispatchEvent(new FocusEvent("blur"));
  expect(root.dataset.window).toBeUndefined();
  input.remove();
  menu.remove();
});

/** Tauri's IPC globals, recording commands, as the pinned @tauri-apps/api uses them. */
function fakeTauri(options: { focused?: boolean; failUnlisten?: boolean } = {}) {
  const callbacks = new Map<number, (event: unknown) => void>();
  const listeners = new Map<string, number>();
  let next = 0;
  const invoke = vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    if (command === "plugin:event|listen") {
      listeners.set(args.event as string, args.handler as number);
      return 100 + Number(args.handler);
    }
    if (command === "plugin:window|is_focused") return options.focused ?? true;
    if (command === "plugin:event|unlisten" && options.failUnlisten) throw new Error("webview closing");
    if (command === "v2_bootstrap_engine") return new Promise(() => {});
    return undefined;
  });
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      transformCallback: (callback: (event: unknown) => void) => (callbacks.set(++next, callback), next),
      invoke,
    },
  });
  Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
    configurable: true,
    value: { unregisterListener: vi.fn() },
  });
  const emit = (event: string) => callbacks.get(listeners.get(event)!)!({ event, id: 1, payload: null });
  const commands = () => invoke.mock.calls.map(([command, args]) => [command, args]);
  return { invoke, emit, commands };
}

it("uses Tauri's window-targeted focus events and is_focused query through the pinned API", async () => {
  const tauri = fakeTauri({ focused: false, failUnlisten: true });
  const stop = trackWindowActivity(root);
  await settle();
  const target = { kind: "Window", label: "main" };
  expect(tauri.commands()).toEqual([
    ["plugin:event|listen", { event: FOCUS, target, handler: 1 }],
    ["plugin:event|listen", { event: BLUR, target, handler: 2 }],
    ["plugin:window|is_focused", { label: "main" }],
  ]);
  expect(root.dataset.window).toBe("inactive");
  tauri.emit(FOCUS);
  expect(root.dataset.window).toBe("active");
  tauri.emit(BLUR);
  expect(root.dataset.window).toBe("inactive");
  // Rejected unlisten IPC (webview closing) must not escape as unhandled.
  stop();
  await settle();
  expect(tauri.commands().filter(([command]) => command === "plugin:event|unlisten")).toHaveLength(2);
});

it("treats a page without Tauri window metadata as a browser page", async () => {
  const warn = vi.spyOn(console, "warn");
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
  trackWindowActivity(root)();
  await settle();
  expect(warn).not.toHaveBeenCalled();
});

it("the app tracks native activation for its whole lifetime", async () => {
  const tauri = fakeTauri({ focused: true });
  render(App);
  await screen.findByRole("heading", { name: "Opening OMD" });
  await settle();
  const html = document.documentElement;
  expect(html.dataset.window).toBe("active");
  tauri.emit(BLUR);
  expect(html.dataset.window).toBe("inactive");
  tauri.emit(FOCUS);
  expect(html.dataset.window).toBe("active");
  cleanup();
  await settle();
  expect(html.dataset.window).toBeUndefined();
  expect(tauri.commands().filter(([command]) => command === "plugin:event|unlisten")).toHaveLength(2);
});
