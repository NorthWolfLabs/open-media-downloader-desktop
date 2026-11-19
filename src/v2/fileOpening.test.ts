import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/svelte";

const fixture = vi.hoisted(() => ({ invoke: vi.fn(), writeText: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: fixture.invoke }));
vi.mock("./client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./client")>();
  return {
    ...original,
    EngineClient: class {
      api = { GET: async () => ({ data: { items: [], next_cursor: null } }) };
      async attach() {
        return { id: "file-fixture" };
      }
      async detach() {}
      async heartbeat() {}
      events() {}
      async jobs() {
        return {
          items: [
            {
              id: "job_fixture",
              title: "Chapter 1",
              state: "completed",
              destination_id: "destination_fixture",
              plan: {
                recipe: "cbz",
                release: {
                  reference: { provider: "fixture", id: "chapter" },
                  canonical_url: "https://example.org/chapter",
                },
                collection: {
                  title: "Fixture series",
                  reference: { provider: "fixture", id: "series" },
                },
              },
            },
          ],
          next_cursor: null,
        };
      }
      async listAll(route: string) {
        if (route.startsWith("/v2/jobs")) return (await this.jobs()).items;
        return route === "/v2/destinations"
          ? [
              {
                id: "destination_fixture",
                label: "Fixture collection",
                root: "/fixture/downloads",
                available: true,
              },
            ]
          : [];
      }
      async request(route: string) {
        if (route === "/v2/service") return { event_cursor: 0 };
        if (route === "/v2/summary")
          return { active_jobs: 0, acquired: 1, following: 0, attention: 0 };
        if (route === "/v2/settings")
          return {
            background: false,
            languages: ["en"],
            onboarding_complete: true,
            startup: { enabled: false, issue: null },
          };
        if (route === "/v2/jobs/job_fixture/files")
          return {
            items: [
              {
                id: "artifact_fixture",
                relative_path: "Chapter 1/chapter.cbz",
                size: 1024,
                status: "present",
              },
            ],
            next_cursor: null,
          };
        return { items: [], next_cursor: null };
      }
    },
  };
});
import App from "./App.svelte";
const originalDialog = Object.fromEntries(
  ["showModal", "close"].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
  ]),
);
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: fixture.writeText },
    configurable: true,
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  fixture.writeText.mockResolvedValue(undefined);
  fixture.invoke.mockImplementation(async (name) => {
    if (name === "v2_bootstrap_engine")
      return { endpoint: "http://127.0.0.1:1", token: "fixture" };
    if (name === "v2_open_artifact")
      throw "The system could not open this file. Choose a default application or use Copy path.";
    return [];
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  vi.resetAllMocks();
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  for (const [name, descriptor] of Object.entries(originalDialog)) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

it("keeps native opening failure and successful copy feedback inside the active file dialog", async () => {
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Downloads" }));
  await fireEvent.click(await screen.findByRole("button", { name: "History" }));
  await fireEvent.click(
    await screen.findByRole("button", { name: /Fixture series.*download/ }),
  );
  await fireEvent.click(
    await screen.findByRole("button", { name: /Chapter 1/ }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Download details",
  });
  await fireEvent.click(within(dialog).getByRole("button", { name: "Open" }));
  expect((await within(dialog).findByRole("alert")).textContent).toContain(
    "Choose a default application",
  );
  await fireEvent.click(
    within(dialog).getByRole("button", { name: "Copy path" }),
  );
  await within(dialog).findByText("Path copied.");
  expect(within(dialog).getByRole("status").textContent).toBe("Path copied.");
  expect(within(dialog).queryByRole("alert")).toBeNull();
  expect(fixture.writeText).toHaveBeenCalledWith(
    "/fixture/downloads/Chapter 1/chapter.cbz",
  );
  await fireEvent.click(
    within(dialog).getByRole("button", { name: "Close dialog" }),
  );
  await fireEvent.click(screen.getByRole("button", { name: /Chapter 1/ }));
  const reopened = await screen.findByRole("dialog", {
    name: "Download details",
  });
  expect(within(reopened).getByRole("status").textContent).toBe("");
});
