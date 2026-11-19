import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/svelte";
import { STARTUP_SETTLED } from "./startup";

// The native shell never answers here, so a started app stays on "Opening OMD".
vi.mock("@tauri-apps/api/core", () => ({ invoke: () => new Promise(() => {}) }));

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete (navigator as { language?: string }).language;
  delete (navigator as { languages?: readonly string[] }).languages;
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  // Close any startup guard a test left open.
  window.dispatchEvent(new Event(STARTUP_SETTLED));
  vi.doUnmock("./App.svelte");
  vi.doUnmock("./boot");
  vi.restoreAllMocks();
  vi.resetModules();
  document.body.innerHTML = "";
});

function reportLocale(locale: string) {
  Object.defineProperty(navigator, "language", { value: locale, configurable: true });
  Object.defineProperty(navigator, "languages", { value: locale ? [locale] : [], configurable: true });
  vi.resetModules();
}

describe("startup", () => {
  it.each(["C", "POSIX", "", "en_US", "de-DE", "de_DE.UTF-8"])(
    "opens the app when the WebView reports navigator.language %j",
    async (locale) => {
      reportLocale(locale);
      const { started } = await import("./main");
      expect(await started).toBe(true);
      expect(await screen.findByRole("heading", { name: "Opening OMD", level: 1 })).toBeVisible();
      expect(screen.queryByRole("alert")).toBeNull();
    },
    120_000, // The first transform of the whole app graph is slow on cold caches.
  );

  it("shows plain text instead of a blank window when an app module throws while loading", async () => {
    vi.doMock("./App.svelte", () => {
      throw new RangeError("invalid language tag: C");
    });
    const { started } = await import("./main");
    expect(await started).toBe(false);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { name: "OMD couldn’t start", level: 1 })).toBeVisible();
    expect(alert).toHaveTextContent("Quit OMD and open it again. If this keeps happening, reinstall OMD.");
    expect(alert.querySelector("pre")!.textContent).toMatch(/^Error: /);
    expect(document.getElementById("app")!.children).toHaveLength(1);
  });

  it("names the error that stopped the app", async () => {
    vi.doMock("./App.svelte", () => ({
      get default() {
        throw new RangeError("invalid language tag: C");
      },
    }));
    const { started } = await import("./main");
    expect(await started).toBe(false);
    expect(screen.getByRole("alert").querySelector("pre")).toHaveTextContent("RangeError: invalid language tag: C");
  });

  it("replaces a partly mounted app with the message when mounting throws", async () => {
    vi.doMock("./App.svelte", () => ({
      default: () => {
        document.getElementById("app")!.append("partial");
        throw new Error("mount failed");
      },
    }));
    const { started } = await import("./main");
    expect(await started).toBe(false);
    expect(document.getElementById("app")).not.toHaveTextContent("partial");
    expect(screen.getByRole("alert")).toHaveTextContent("Error: mount failed");
  });

  // The app chunk with the probe in place of App, which fails as asked.
  function probe(fail: "onMount" | "effect" | "none") {
    vi.doMock("./boot", async () => {
      const { default: Probe } = await import("./StartupProbeHarness.svelte");
      return { default: (anchor: unknown, props: Record<string, unknown>) => (Probe as any)(anchor, { ...props, fail }) };
    });
  }

  it.each(["onMount", "effect"] as const)("shows the message when the app's first %s throws", async (fail) => {
    probe(fail);
    const { started } = await import("./main");
    expect(await started).toBe(false);
    expect(screen.queryByRole("heading", { name: "Opening OMD" })).toBeNull();
    expect(screen.getByRole("alert").querySelector("pre")).toHaveTextContent(`Error: ${fail} failed`);
  });

  it("shows the message for an uncaught error or unhandled rejection while startup is still running", async () => {
    probe("none");
    let { started } = await import("./main");
    expect(await started).toBe(true);
    expect(screen.getByRole("heading", { name: "Opening OMD" })).toBeVisible();
    // An ErrorEvent without an error object (a ResizeObserver loop notice) is not a failure.
    window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop completed with undelivered notifications." }));
    expect(screen.queryByRole("alert")).toBeNull();
    window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("startup failed later") }));
    expect(screen.getByRole("alert").querySelector("pre")).toHaveTextContent("TypeError: startup failed later");
    expect(screen.queryByRole("heading", { name: "Opening OMD" })).toBeNull();

    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
    probe("none");
    ({ started } = await import("./main"));
    expect(await started).toBe(true);
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new Error("engine request failed") }));
    expect(screen.getByRole("alert").querySelector("pre")).toHaveTextContent("Error: engine request failed");
  });

  it("leaves errors after startup settled to the app", async () => {
    probe("none");
    const { started } = await import("./main");
    expect(await started).toBe(true);
    window.dispatchEvent(new Event(STARTUP_SETTLED));
    // Later errors still reach every other listener (here, the test's own).
    const seen: string[] = [];
    const record = (event: Event) => {
      event.preventDefault();
      seen.push(String((event as ErrorEvent).error ?? (event as PromiseRejectionEvent).reason));
    };
    window.addEventListener("error", record);
    window.addEventListener("unhandledrejection", record);
    try {
      window.dispatchEvent(new ErrorEvent("error", { error: new Error("later runtime error"), cancelable: true }));
      window.dispatchEvent(Object.assign(new Event("unhandledrejection", { cancelable: true }), { reason: new Error("later rejection") }));
    } finally {
      window.removeEventListener("error", record);
      window.removeEventListener("unhandledrejection", record);
    }
    expect(seen).toEqual(["Error: later runtime error", "Error: later rejection"]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { name: "Opening OMD" })).toBeVisible();
  });

  it("applies a saved Light or Dark choice before the app loads", async () => {
    localStorage.setItem("omd.theme", "dark");
    try {
      vi.doMock("./boot", () => new Promise(() => {})); // The app chunk is still loading.
      void import("./main");
      await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
      expect(document.documentElement.dataset.platform).toBeTruthy();
    } finally {
      localStorage.removeItem("omd.theme");
      delete document.documentElement.dataset.theme;
    }
  });
});
