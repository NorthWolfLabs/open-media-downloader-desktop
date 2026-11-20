import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";

const fixture = vi.hoisted(() => ({
  preferences: {} as Record<string, unknown>,
  patches: [] as Record<string, unknown>[],
  invoke: vi.fn(),
  operation: vi.fn(),
  artwork: vi.fn(),
  request: vi.fn(),
  open: vi.fn(),
  disconnect: () => {},
  event: (_event: { kind: string }) => {},
  sources: [] as any[],
  locales: ["en-US"] as string[],
  jobPage: null as unknown,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: fixture.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: fixture.open }));
vi.mock("./client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./client")>();
  return {
    ...original,
    EngineClient: class {
      connection: unknown;
      api = { GET: async () => ({ data: { items: [], next_cursor: null } }) };
      constructor(connection: unknown) {
        this.connection = connection;
      }
      async attach() {
        return { id: "onboarding-fixture" };
      }
      async detach() {}
      async heartbeat() {}
      events(
        _cursor: unknown,
        event: (event: { kind: string }) => void,
        resync: () => void,
      ) {
        fixture.event = event;
        fixture.disconnect = resync;
      }
      async jobs() {
        return fixture.jobPage ?? { items: [], next_cursor: null };
      }
      async artwork(provider: string, url: string) {
        return fixture.artwork(provider, url);
      }
      async operation(id: string, input: unknown) {
        return fixture.operation(id, input);
      }
      async listAll(route: string) {
        const response = await fixture.request(route);
        if (response !== undefined)
          return Array.isArray(response) ? response : response.items;
        if (route === "/v2/source-catalog")
          return [
            {
              id: "org.example.private",
              version: "0.3.0",
              name: "Example source",
              package_path: "/disposable-fixture/example-source.omdp",
            },
          ];
        if (route === "/v2/sources") return fixture.sources;
        return route === "/v2/destinations"
          ? [
              {
                id: "existing-destination",
                label: "Existing collection",
                root: "/disposable-fixture/downloads",
                available: true,
              },
            ]
          : [];
      }
      async subscribe(body: Record<string, unknown>) { return this.request("/v2/subscriptions",{method:"POST",body}); }
      async request(
        route: string,
        options?: { method?: string; body?: Record<string, unknown> },
      ) {
        const response = await fixture.request(route, options);
        if (response !== undefined) return response;
        if (route === "/v2/acquisitions/status")
          return ((options?.body?.references as any[]) ?? []).map(
            (reference) => ({
              reference,
              acquired_versions: 0,
              last_acquired_at: null,
            }),
          );
        if (route === "/v2/service") return { event_cursor: 0 };
        if (route === "/v2/summary")
          return { active_jobs: 0, acquired: 0, following: 0, attention: 0 };
        if (route === "/v2/settings") {
          if (options?.method === "PATCH") {
            const saved = { ...options.body };
            fixture.patches.push(saved);
            fixture.preferences = {
              ...saved,
              startup: { enabled: saved.background, issue: null },
            };
            // The real PATCH response is the saved preferences; GET adds status.
            return saved;
          }
          return fixture.preferences;
        }
        return { items: [], next_cursor: null };
      }
    },
  };
});
import App from "./App.svelte";

beforeEach(() => {
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
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
  fixture.preferences = {
    background: false,
    bandwidth_bytes_per_second: 0,
    languages: ["en"],
    onboarding_complete: false,
    startup: { enabled: false, issue: null },
  };
  fixture.patches = [];
  fixture.operation.mockReset();
  fixture.artwork.mockReset();
  fixture.artwork.mockImplementation(() => new Promise(() => {}));
  fixture.request.mockReset();
  fixture.open.mockReset();
  fixture.open.mockResolvedValue(null);
  fixture.sources = [];
  fixture.jobPage = null;
  fixture.locales = ["en-US"];
  fixture.invoke.mockImplementation(async (name) =>
    name === "v2_bootstrap_engine"
      ? { endpoint: "http://127.0.0.1:1", token: "local-fixture" }
      : fixture.locales,
  );
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  fixture.invoke.mockReset();
});

it("offers an explicit native update shutdown and keeps failures visible for retry", async()=>{
  fixture.preferences={...fixture.preferences,onboarding_complete:true};
  const previous=fixture.invoke.getMockImplementation()!;
  fixture.invoke.mockImplementation((name,...args)=>name==="v2_prepare_update"?Promise.reject(new Error("The engine is still stopping. Retry shortly.")):previous(name,...args));
  render(App);
  await screen.findByRole("heading",{name:"Overview",level:1});
  await fireEvent.click(screen.getByRole("button",{name:"Settings"}));
  const stop=await screen.findByRole("button",{name:"Quit to install an update"});
  await fireEvent.click(stop);
  await screen.findByText("The engine is still stopping. Retry shortly.");
  expect(fixture.invoke.mock.calls.filter(([name])=>name==="v2_prepare_update")).toHaveLength(1);
  expect(stop).not.toBeDisabled();
});

it("shows the app version and opens only OMD's own pages from About OMD", async()=>{
  fixture.preferences={...fixture.preferences,onboarding_complete:true};
  const previous=fixture.invoke.getMockImplementation()!;
  fixture.invoke.mockImplementation((name,...args)=>name==="plugin:app|version"?Promise.resolve("0.2.0"):name==="v2_open_source"?Promise.resolve():previous(name,...args));
  render(App);
  await screen.findByRole("heading",{name:"Overview",level:1});
  await fireEvent.click(screen.getByRole("button",{name:"Settings"}));
  const about=await screen.findByRole("heading",{name:"About OMD"});
  const section=about.closest("section")!;
  await within(section).findByText("0.2.0");
  const updates=within(section).getByRole("link",{name:/Check for updates/});
  expect(updates.getAttribute("href")).toBe("https://github.com/NorthWolfLabs/open-media-downloader-desktop/releases");
  await fireEvent.click(updates);
  await waitFor(()=>expect(fixture.invoke).toHaveBeenCalledWith("v2_open_source",{url:"https://github.com/NorthWolfLabs/open-media-downloader-desktop/releases"}));
  expect(within(section).getByRole("link",{name:/License/})).toBeTruthy();
  expect(within(section).getByRole("link",{name:/Project website/})).toBeTruthy();
  expect(within(section).getByRole("button",{name:"Quit to install an update"})).toBeTruthy();
});

it("continues from persisted onboarding choices to permission-reviewed source installation", async () => {
  render(App);
  await fireEvent.click(
    await screen.findByRole("button", { name: "Review included plugins" }),
  );
  await screen.findByRole("heading", { name: "Sources", level: 1 });
  expect(screen.getByRole("button", { name: "Install Example source" })).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Review included plugins" }),
  ).toBeNull();
  expect(fixture.patches).toEqual([
    {
      background: false,
      bandwidth_bytes_per_second: 0,
      languages: ["en"],
      onboarding_complete: true,
    },
  ]);
  await screen.findByText("Preferences saved.");
});

const lanternPlugin = () => ({
  id: "public.lantern",
  name: "Lantern feed",
  description: "A fictional publisher feed used for public fixtures.",
  version: "1.0.0",
  capabilities: ["browse", "details"],
  source_hosts: ["feed.lantern.example"],
  grants: [{ id: "feed", methods: ["GET"], hosts: ["feed.lantern.example"], credential: false }],
});
const pluginRequests = () => fixture.request.mock.calls.filter(([route]) => route === "/v2/sources/install");
async function emptyPublicSources() {
  fixture.request.mockImplementation(async (route) => route === "/v2/source-catalog" ? [] : undefined);
  render(App);
  const install = await screen.findByRole("button", { name: "Add a plugin file…" });
  await waitFor(() => expect(install).not.toBeDisabled());
  await fireEvent.click(install);
  // Setup's main action opens the .omdp picker; the user cancels it here.
  await waitFor(() => expect(fixture.open).toHaveBeenCalledOnce());
  fixture.open.mockClear();
  await screen.findByRole("heading", { name: "Add a source plugin" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Add a plugin file…" })).not.toBeDisabled());
}

it("guides a public first run to one plugin import action while allowing an empty app", async () => {
  await emptyPublicSources();
  expect(screen.getAllByRole("heading", { name: "Sources", level: 1 })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Add a plugin file…" })).toHaveLength(1);
  expect(screen.getByText("OMD works with source plugins you choose. Add one to start browsing.")).toBeTruthy();
  expect(screen.getByRole("link", { name: /About plugins/ })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Included with OMD" })).toBeNull();
  expect(fixture.preferences.onboarding_complete).toBe(true);
  await fireEvent.click(screen.getByRole("button", { name: "Downloads" }));
  await screen.findByRole("heading", { name: "Downloads", level: 1 });
  expect(pluginRequests()).toHaveLength(0);
});

it("cancels the native plugin picker without inspecting or installing anything", async () => {
  await emptyPublicSources();
  await fireEvent.click(screen.getByRole("button", { name: "Add a plugin file…" }));
  await waitFor(() => expect(fixture.open).toHaveBeenCalledOnce());
  expect(fixture.open).toHaveBeenCalledWith(expect.objectContaining({ multiple: false, filters: [{ name: "OMD plugin", extensions: ["omdp"] }] }));
  expect(pluginRequests()).toHaveLength(0);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Add a plugin file…" })).not.toBeDisabled();
});

it("keeps picker failures actionable and lets a second import recover", async () => {
  await emptyPublicSources();
  fixture.open.mockRejectedValueOnce(new Error("Picker unavailable"));
  await fireEvent.click(screen.getByRole("button", { name: "Add a plugin file…" }));
  await screen.findByText(/Couldn’t open the file picker/);
  expect(pluginRequests()).toHaveLength(0);
  await fireEvent.click(screen.getByRole("button", { name: "Add a plugin file…" }));
  await waitFor(() => expect(fixture.open).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("button", { name: "Add a plugin file…" })).not.toBeDisabled();
});

it("reports an invalid plugin package without offering installation", async () => {
  await emptyPublicSources();
  fixture.open.mockResolvedValue("/disposable-fixture/invalid.omdp");
  fixture.request.mockImplementation(async (route) => {
    if (route === "/v2/source-catalog") return [];
    if (route === "/v2/sources/install") throw new Error("This is not an OMD v2 package.");
  });
  await fireEvent.click(screen.getByRole("button", { name: "Add a plugin file…" }));
  await screen.findByText(/Couldn’t review this plugin package/);
  expect(pluginRequests()).toHaveLength(1);
  expect(pluginRequests()[0][1].body).toEqual({ package_path: "/disposable-fixture/invalid.omdp", approve_digest: null });
  expect(screen.queryByRole("button", { name: "Approve and install" })).toBeNull();
  expect(screen.getByRole("button", { name: "Add a plugin file…" })).not.toBeDisabled();
});

it("reviews exact plugin permissions before approval and refreshes the installed list", async () => {
  await emptyPublicSources();
  const manifest = lanternPlugin(), digest = "a".repeat(64);
  fixture.open.mockResolvedValue("/disposable-fixture/lantern.omdp");
  fixture.request.mockImplementation(async (route, options) => {
    if (route === "/v2/source-catalog") return [];
    if (route !== "/v2/sources/install") return;
    if (options.body.approve_digest === null) return { review_required: true, digest, manifest };
    fixture.sources = [{ manifest }];
    return { installed: true };
  });
  await fireEvent.click(screen.getByRole("button", { name: "Add a plugin file…" }));
  const dialog = await screen.findByRole("dialog", { name: "Install Lantern feed" });
  // Hosts are listed in plain words and again, with request types, under Details.
  expect(within(within(dialog).getByRole("region", { name: "This plugin can connect to:" })).getByText(/feed\.lantern\.example/)).toBeTruthy();
  expect(within(dialog).getAllByText(/feed\.lantern\.example/).length).toBeGreaterThanOrEqual(2);
  expect(within(dialog).getByText("Only install plugins from people you trust.")).toBeTruthy();
  expect(within(dialog).getByRole("button", { name: "Don’t install" })).toBeTruthy();
  expect(within(dialog).getByText(digest)).toBeTruthy();
  // The engine's approval digest covers the package contents, not the .omdp file bytes.
  const fingerprint = within(dialog).getByText(digest).closest("div")!;
  expect(within(fingerprint).getByText("Package fingerprint").tagName).toBe("DT");
  expect(fingerprint).toHaveTextContent("This identifies the package contents you reviewed. It isn’t the downloaded file’s checksum.");
  expect(within(dialog).queryByText(/File fingerprint|SHA-256/)).toBeNull();
  expect(pluginRequests()).toHaveLength(1);
  expect(fixture.sources).toEqual([]);
  await fireEvent.click(within(dialog).getByRole("button", { name: "Approve and install" }));
  await screen.findByText("Source installed.");
  expect(pluginRequests().map(([, options]) => options.body)).toEqual([
    { package_path: "/disposable-fixture/lantern.omdp", approve_digest: null },
    { package_path: "/disposable-fixture/lantern.omdp", approve_digest: digest },
  ]);
  expect(screen.queryByRole("dialog", { name: "Install Lantern feed" })).toBeNull();
  expect(screen.getAllByText("Lantern feed").length).toBeGreaterThan(0);
  expect(screen.queryByRole("heading", { name: "Add a source plugin", level: 2 })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Add a plugin file…" })).toHaveLength(1);
});

it("shows, for each sign-in permission, whether its hosts may receive sign-in cookies and authentication headers", async () => {
  await emptyPublicSources();
  const manifest = {
    ...lanternPlugin(),
    grants: [
      { id: "feed", methods: ["GET"], hosts: ["feed.lantern.example"], credential: true },
      { id: "art", methods: ["GET"], hosts: ["*.art.lantern.example"], credential: false },
    ],
    sign_in: {
      url: "https://accounts.lantern.example/login",
      completion_cookies: ["session"],
      grants: [
        { id: "login", methods: ["GET", "POST"], hosts: ["accounts.lantern.example", "id.lantern-auth.example"], credential: true },
        { id: "assets", methods: ["GET"], hosts: ["fonts.lantern-static.example", "*.captcha.example"], credential: false },
      ],
    },
  };
  fixture.open.mockResolvedValue("/disposable-fixture/lantern.omdp");
  fixture.request.mockImplementation(async (route, options) => {
    if (route === "/v2/source-catalog") return [];
    if (route === "/v2/sources/install" && options.body.approve_digest === null) return { review_required: true, digest: "c".repeat(64), manifest };
  });
  await fireEvent.click(screen.getByRole("button", { name: "Add a plugin file…" }));
  const dialog = await screen.findByRole("dialog", { name: "Install Lantern feed" });
  const details = dialog.querySelector("details.package-identity") as HTMLDetailsElement;
  expect(details.open).toBe(false);
  const signIn = within(dialog).getByRole("list", { name: "Sign-in window connections" });
  expect(signIn).toBeVisible();
  // Visible without opening Details, and not inside it.
  expect(details.contains(signIn)).toBe(false);
  const rows = within(signIn).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("accounts.lantern.example, id.lantern-auth.example");
  expect(within(rows[0]).getByText("May send sign-in cookies and authentication headers to these hosts.")).toBeVisible();
  expect(within(rows[0]).queryByText(/are not sent/)).toBeNull();
  expect(rows[1]).toHaveTextContent("fonts.lantern-static.example, any subdomain of captcha.example");
  expect(within(rows[1]).getByText("Sign-in cookies and authentication headers are not sent to these hosts.")).toBeVisible();
  expect(within(rows[1]).queryByText(/May send/)).toBeNull();
  expect(signIn.closest("li")!.textContent!.replace(/\s+/g, " ")).toMatch(/^It can open a sign-in window for accounts\.lantern\.example\. That window can also connect to:/);
  // Saved-account use stays its own statement, driven by the ordinary permissions.
  expect(within(dialog).getByText("It may use an account you add.")).toBeTruthy();
  expect(within(signIn).queryByText(/account you add/)).toBeNull();
  // Ordinary permissions still show their account flag in Details.
  const ordinary = within(details).getByText("feed.lantern.example").closest("div")!;
  expect(ordinary).toHaveTextContent("Request types: GET · may use your account");
  const noAccount = within(details).getByText("*.art.lantern.example").closest("div")!;
  expect(noAccount).toHaveTextContent("Request types: GET");
  expect(noAccount).not.toHaveTextContent("may use your account");
});

it("requires new explicit approval if the package changes after review", async () => {
  await emptyPublicSources();
  const manifest = lanternPlugin(), original = "a".repeat(64), updated = "b".repeat(64);
  const changed = { ...manifest, grants: [...manifest.grants, { id: "media", methods: ["GET"], hosts: ["media.lantern.example"], credential: false }] };
  fixture.open.mockResolvedValue("/disposable-fixture/lantern.omdp");
  fixture.request.mockImplementation(async (route, options) => {
    if (route === "/v2/source-catalog") return [];
    if (route !== "/v2/sources/install") return;
    const approved = options.body.approve_digest;
    if (approved === null) return { review_required: true, digest: original, manifest };
    if (approved === original) return { review_required: true, digest: updated, manifest: changed };
    fixture.sources = [{ manifest: changed }];
    return { installed: true };
  });
  await fireEvent.click(screen.getByRole("button", { name: "Add a plugin file…" }));
  let dialog = await screen.findByRole("dialog", { name: "Install Lantern feed" });
  await fireEvent.click(within(dialog).getByRole("button", { name: "Approve and install" }));
  await within(dialog).findByText(/plugin package changed/);
  expect(within(within(dialog).getByRole("region", { name: "This plugin can connect to:" })).getByText(/media\.lantern\.example/)).toBeTruthy();
  expect(within(dialog).getByText(updated)).toBeTruthy();
  expect(fixture.sources).toEqual([]);
  expect(screen.queryByText("Source installed.")).toBeNull();
  expect(pluginRequests()).toHaveLength(2);
  dialog = screen.getByRole("dialog", { name: "Install Lantern feed" });
  await fireEvent.click(within(dialog).getByRole("button", { name: "Approve and install" }));
  await screen.findByText("Source installed.");
  expect(pluginRequests().map(([, options]) => options.body.approve_digest)).toEqual([null, original, updated]);
});

it("restores the import guide on an already configured empty installation", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.request.mockImplementation(async (route) => route === "/v2/source-catalog" ? [] : undefined);
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Sources" }));
  await screen.findByRole("heading", { name: "Add a source plugin", level: 2 });
  expect(screen.getAllByRole("button", { name: "Add a plugin file…" })).toHaveLength(1);
  expect(screen.queryByRole("heading", { name: "Set up OMD" })).toBeNull();
  expect(fixture.patches).toEqual([]);
});

it("restores the import guide when the last installed source disappears", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [{ manifest: lanternPlugin() }];
  fixture.operation.mockResolvedValue({ items: [], next_cursor: null });
  fixture.request.mockImplementation(async (route) => route === "/v2/source-catalog" ? [] : undefined);
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Sources" }));
  await screen.findAllByText("Lantern feed");
  expect(screen.queryByRole("heading", { name: "Add a source plugin", level: 2 })).toBeNull();
  fixture.sources = [];
  fixture.event({ kind: "sources.removed" });
  await screen.findByRole("heading", { name: "Add a source plugin", level: 2 });
  expect(screen.getAllByRole("button", { name: "Add a plugin file…" })).toHaveLength(1);
  expect(pluginRequests()).toHaveLength(0);
});

it("distinguishes included plugins from installed sources without auto-installing them", async () => {
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Review included plugins" }));
  const included = await screen.findByRole("region", { name: "Included with OMD" });
  expect(within(included).getByRole("button", { name: "Install Example source" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Add a source plugin", level: 2 })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Add a plugin file…" })).toHaveLength(1);
  expect(pluginRequests()).toHaveLength(0);
});

it("opens setup while macOS asks about Downloads, then shows the registered default folder", async () => {
  // A first native run registers ~/Downloads/OMD. macOS holds that write until
  // the user answers its folder prompt, which may be behind or beside the window.
  let registered!: (destination: unknown) => void;
  fixture.request.mockImplementation((route) => {
    if (route === "/v2/destinations") return Promise.resolve([]);
    if (route === "/v2/destinations/default")
      return new Promise((resolve) => (registered = resolve));
    return Promise.resolve(undefined);
  });
  render(App);
  await screen.findByRole("heading", { name: "Set up OMD" });
  expect(screen.queryByRole("heading", { name: "Opening OMD" })).toBeNull();
  // While the folder is pending, setup says why its actions wait.
  expect(screen.getByText(/(Waiting for permission to use|Preparing) your Downloads folder…/)).toBeTruthy();
  expect(fixture.request).toHaveBeenCalledWith("/v2/destinations/default", { method: "POST" });
  registered({ id: "default-destination", label: "Downloads", root: "/disposable-fixture/Downloads/OMD", available: true });
  await screen.findByText("/disposable-fixture/Downloads/OMD");
  await fireEvent.click(screen.getByRole("button", { name: "Review included plugins" }));
  await screen.findByRole("heading", { name: "Sources", level: 1 });
});

it("selects the folder added through setup Change instead of keeping the old default", async () => {
  let saved = false;
  const previous = { id: "old-folder", label: "Downloads", root: "/disposable-fixture/old", available: true };
  const chosen = { id: "chosen-folder", label: "Downloads", root: "/disposable-fixture/chosen", available: true };
  fixture.request.mockImplementation(async (route, options) => {
    if (route === "/v2/destinations") {
      if (options?.method === "POST") { saved = true; return chosen; }
      return saved ? [chosen, previous] : [previous];
    }
    return undefined;
  });
  render(App);
  await screen.findByText(previous.root);
  await fireEvent.click(screen.getByRole("button", { name: "Change" }));
  const path = screen.getByLabelText("Existing folder path");
  await fireEvent.input(path, { target: { value: chosen.root } });
  await fireEvent.submit(path.closest("form")!);
  await screen.findByText(chosen.root);
  expect(screen.queryByText(previous.root)).toBeNull();
});

it("ignores a late default-folder denial after a manual folder succeeds", async () => {
  let denied!: (reason: Error) => void;
  let saved = false;
  const destination = { id: "manual-folder", label: "Downloads", root: "/disposable-fixture/manual", available: true };
  fixture.request.mockImplementation((route, options) => {
    if (route === "/v2/destinations/default")
      return new Promise((_resolve, reject) => (denied = reject));
    if (route === "/v2/destinations") {
      if (options?.method === "POST") { saved = true; return Promise.resolve(destination); }
      return Promise.resolve(saved ? [destination] : []);
    }
    return Promise.resolve(undefined);
  });
  render(App);
  await screen.findByRole("heading", { name: "Set up OMD" });
  await fireEvent.click(screen.getByRole("button", { name: "Change" }));
  await fireEvent.input(screen.getByLabelText("Existing folder path"), { target: { value: destination.root } });
  await fireEvent.submit(screen.getByLabelText("Existing folder path").closest("form")!);
  await screen.findByText(destination.root);
  await fireEvent.click(screen.getByRole("button", { name: "Review included plugins" }));
  await screen.findByRole("heading", { name: "Sources", level: 1 });
  denied(new Error("Default Downloads access denied"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByText("Default Downloads access denied")).toBeNull();
  expect(screen.getByRole("heading", { name: "Sources", level: 1 })).toBeTruthy();
});

it("opens while existing destinations wait for folder access, without creating a default folder", async () => {
  // Listing destinations checks each folder on disk; macOS can hold that
  // check behind a permission prompt for Downloads or a removable volume.
  let listed!: (destinations: unknown[]) => void;
  fixture.request.mockImplementation((route) =>
    route === "/v2/destinations"
      ? new Promise((resolve) => (listed = resolve))
      : Promise.resolve(undefined),
  );
  render(App);
  await screen.findByRole("heading", { name: "Set up OMD" });
  expect(screen.queryByRole("heading", { name: "Opening OMD" })).toBeNull();
  listed([{ id: "removable-destination", label: "Removable", root: "/Volumes/Fixture/downloads", available: true }]);
  await screen.findByText("/Volumes/Fixture/downloads");
  expect(fixture.request).not.toHaveBeenCalledWith("/v2/destinations/default", expect.anything());
});

it("keeps a startup failure actionable within focused setup without completing onboarding", async () => {
  fixture.preferences = {
    ...fixture.preferences,
    background: true,
    startup: {
      enabled: false,
      issue: {
        code: "startup_unavailable",
        message: "Login startup could not be registered.",
        actions: ["retry"],
      },
    },
  };
  render(App);
  await screen.findByText("Login startup could not be registered.");
  expect(
    screen.queryByRole("navigation", { name: "Main navigation" }),
  ).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain(
    "Login startup could not be registered.",
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "Try again" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByText("Login startup could not be registered."),
    ).toBeNull(),
  );
  expect(fixture.patches).toEqual([
    {
      background: true,
      bandwidth_bytes_per_second: 0,
      languages: ["en"],
      onboarding_complete: false,
    },
  ]);
  expect(
    screen.getByRole("button", { name: "Review included plugins" }),
  ).toBeTruthy();
});

it("blocks open dialogs during connection recovery and restores the current surface", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  render(App);
  await fireEvent.click(
    await screen.findByRole("button", { name: "Settings" }),
  );
  await fireEvent.click(
    await screen.findByRole("button", { name: "Add destination" }),
  );
  await screen.findByRole("dialog", { name: "Add destination" });
  let restored!: (connection: unknown) => void;
  fixture.invoke.mockImplementation((command: string) =>
    command === "v2_system_languages"
      ? Promise.resolve(["en-US"])
      : new Promise((resolve) => (restored = resolve)),
  );
  fixture.disconnect();
  await screen.findByRole("heading", { name: "Reconnecting" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Save preferences" })).toBeNull();
  restored({ endpoint: "http://127.0.0.1:1", token: "local-fixture" });
  await screen.findByRole("dialog", { name: "Add destination" });
  expect(
    screen.getByRole("heading", { name: "Settings", level: 1, hidden: true }),
  ).toBeTruthy();
});

it("uses one preference save action and does not repeat checkbox state as text", async () => {
  render(App);
  await fireEvent.click(await screen.findByRole("button", {name:"Review included plugins"}));
  await fireEvent.click(await screen.findByRole("button", {name:"Settings"}));
  const keep=await screen.findByRole("checkbox",{name:"Keep running when the window closes"});
  expect(keep).not.toBeChecked();
  expect(screen.queryByText(/^Off\./)).toBeNull();
  expect(screen.queryByRole("button",{name:"Save changes"})).toBeNull();
  await fireEvent.click(keep);
  await fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
  expect(fixture.patches.at(-1)?.background).toBe(true);
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Save changes"})).toBeNull());
});

it("uses OS language on first setup and retains an explicitly saved language afterward", async () => {
  fixture.locales = ["de-AT", "en-US"];
  render(App);
  await fireEvent.click(
    await screen.findByRole("button", { name: "Review included plugins" }),
  );
  expect(fixture.patches[0].languages).toEqual(["de"]);
  cleanup();
  fixture.preferences = {
    ...fixture.preferences,
    languages: ["ja"],
    onboarding_complete: true,
  };
  render(App);
  await fireEvent.click(
    await screen.findByRole("button", { name: "Settings" }),
  );
  await screen.findByRole("button", { name: "Preferred languages: Japanese" });
});
it("makes an installed older provider update visible instead of silently hiding capabilities", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [
    {
      manifest: {
        id: "org.example.private",
        name: "Example source",
        version: "0.2.4",
        capabilities: ["search", "browse"],
        source_hosts: [],
        grants: [],
      },
    },
  ];
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Sources" }));
  await screen.findByRole("button", { name: "Update Example source" });
  expect(screen.getByText("Version 0.2.4")).toBeTruthy();
  expect(screen.queryByText("Source versions")).toBeNull();
});

it("preserves search, open item and active section across navigation, and suppresses browser commands", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [
    {
      manifest: {
        id: "fixture",
        name: "Fixture source",
        version: "1.0.0",
        capabilities: ["search", "browse", "details", "artwork"],
        grants: [],
      },
    },
  ];
  const collection = {
    reference: { provider: "fixture", id: "one" },
    title: "Fixture title",
    kind: "manga",
    canonical_url: "https://example.org/one",
    artwork_url: null,
    description: "Description",
  };
  fixture.operation.mockImplementation(async (_id, input) =>
    input.operation === "collection"
      ? collection
      : input.operation === "details"
        ? {
            reference: collection.reference,
            description: "Description",
            creators: [],
            facts: [],
            tags: [],
            alternative_titles: {},
            languages: ["en"],
          }
        : input.operation === "search"
          ? { items: [collection], next_cursor: null }
          : { items: [], next_cursor: null },
  );
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await fireEvent.input(screen.getByRole("searchbox"), {
    target: { value: "remember this" },
  });
  await fireEvent.click(
    screen.getAllByRole("button", { name: "Search" }).at(-1)!,
  );
  await screen.findByRole("heading", { name: "Results" });
  expect(screen.queryByRole("searchbox")).toBeNull();
  await fireEvent.click(
    await screen.findByRole("button", { name: "Fixture title" }),
  );
  await fireEvent.click(await screen.findByRole("button", { name: "Artwork" }));
  await screen.findByText("No additional artwork");
  await fireEvent.click(screen.getByRole("button", { name: "Downloads" }));
  await screen.findByRole("heading", { name: "Downloads", level: 1 });
  await fireEvent.click(screen.getByRole("button", { name: "Explore" }));
  expect(
    screen
      .getByRole("button", { name: "Artwork" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByRole("heading", { name: "Fixture title" })).toBeTruthy();
  await fireEvent.click(
    screen.getByRole("button", { name: "Back to results" }),
  );
  await fireEvent.click(screen.getByRole("button", { name: "Back to search" }));
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
    "remember this",
  );
  const menu = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  document.body.dispatchEvent(menu);
  expect(menu.defaultPrevented).toBe(true);
  const reload = new KeyboardEvent("keydown", {
    key: "r",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(reload);
  expect(reload.defaultPrevented).toBe(true);
});

it("removes collapsed navigation from focus order and restores the same toggle on reopen and relaunch", async () => {
  fixture.preferences.onboarding_complete = true;
  localStorage.removeItem("omd.sidebar-collapsed");
  try {
    const app = render(App);
    const toggle = await screen.findByRole("button", {
      name: "Collapse sidebar",
    });
    expect(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).toBeTruthy();
    toggle.focus();
    for (let i = 0; i < 3; i++) {
      await fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(
        screen.queryByRole("navigation", { name: "Main navigation" }),
      ).toBeNull();
      expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
      expect(document.activeElement).toBe(toggle);
      expect(localStorage.getItem("omd.sidebar-collapsed")).toBe("true");
      await fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(
        screen.getByRole("navigation", { name: "Main navigation" }),
      ).toBeTruthy();
      expect(document.activeElement).toBe(toggle);
    }
    await fireEvent.click(toggle);
    app.unmount();
    render(App);
    await screen.findByRole("button", { name: "Expand sidebar" });
    expect(
      screen.queryByRole("navigation", { name: "Main navigation" }),
    ).toBeNull();
    await fireEvent.click(
      screen.getByRole("button", { name: "Expand sidebar" }),
    );
    await fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("heading", { name: "Settings", level: 1 });
  } finally {
    localStorage.removeItem("omd.sidebar-collapsed");
  }
});

it("opens each Overview destination from its whole card and updates new releases from engine events", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [{ manifest: lanternPlugin() }];
  render(App);
  await screen.findByRole("heading", { name: "Overview", level: 1 });
  for (const [card, destination] of [
    ["Active downloads 0", "Downloads"],
    ["Subscriptions 0", "Subscriptions"],
    ["Downloaded items 0", "Downloads"],
  ]) {
    const control = await screen.findByRole("button", { name: card });
    expect(control.querySelector("button, a")).toBeNull();
    await fireEvent.click(control);
    await screen.findByRole("heading", { name: destination, level: 1 });
    await fireEvent.click(screen.getByRole("button", { name: "Overview" }));
  }
  fixture.request.mockClear();
  expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  fixture.event({ kind: "inbox.changed" });
  await waitFor(() =>
    expect(
      fixture.request.mock.calls.some(([route]) =>
        route.startsWith("/v2/inbox?"),
      ),
    ).toBe(true),
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("opens details before source requests finish, then reveals releases without waiting for artwork", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [
    {
      manifest: {
        id: "fixture",
        name: "Fixture source",
        version: "1",
        capabilities: ["search", "details"],
        grants: [],
      },
    },
  ];
  const collection = {
    reference: { provider: "fixture", id: "slow" },
    title: "Slow source title",
    kind: "manga",
    canonical_url: "https://example.org/slow",
    description: "Already available from search",
    summary: {
      tags: ["Cached tag"],
      year: 2024,
      status: "ongoing",
      languages: ["en"],
    },
    artwork_url: "https://example.org/slow-cover.jpg",
  };
  const metadata = deferred<any>();
  const releases = deferred<any>();
  fixture.operation.mockImplementation(async (_id, input) => {
    if (input.operation === "search")
      return { items: [collection], next_cursor: null };
    if (input.operation === "collection") return collection;
    if (input.operation === "details") return metadata.promise;
    if (input.operation === "releases") return releases.promise;
    return { items: [], next_cursor: null };
  });
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await fireEvent.input(screen.getByRole("searchbox"), {
    target: { value: "slow" },
  });
  await fireEvent.click(
    screen.getAllByRole("button", { name: "Search" }).at(-1)!,
  );
  await fireEvent.click(
    await screen.findByRole("button", { name: collection.title }),
  );
  // No timers advanced and neither request resolved: click feedback is already visible.
  expect(screen.getByRole("heading", { name: collection.title })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Back to results" })).toBeTruthy();
  expect(screen.getByRole("status", { name: "Loading releases" })).toBeTruthy();
  expect(screen.queryByText("No matching releases")).toBeNull();
  expect(screen.getAllByText("Cached tag").length).toBeGreaterThan(0);
  expect(
    screen.getByRole("complementary", { name: "Publication details" })
      .textContent,
  ).toContain("2024");
  metadata.resolve({
    reference: collection.reference,
    description: "Full description",
    creators: [],
    facts: [],
    tags: [],
    alternative_titles: {},
    languages: ["en"],
  });
  await waitFor(() =>
    expect(
      fixture.operation.mock.calls.some(
        ([, input]) => input.operation === "releases",
      ),
    ).toBe(true),
  );
  expect(screen.getByRole("status", { name: "Loading releases" })).toBeTruthy();
  releases.resolve({
    items: [
      {
        reference: { provider: "fixture", id: "chapter" },
        collection: collection.reference,
        title: "Chapter from slow source",
        availability: "available",
        language: "en",
        group: "Example",
        chapter: "1",
      },
    ],
    next_cursor: null,
  });
  await screen.findByText("Chapter from slow source", { exact: false });
  expect(screen.queryByRole("status", { name: "Loading releases" })).toBeNull();
  expect(fixture.artwork).toHaveBeenCalled();
});

it("lets Back abandon an unresolved details request without reopening it later", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [
    {
      manifest: {
        id: "fixture",
        name: "Fixture source",
        version: "1",
        capabilities: ["search", "details"],
        grants: [],
      },
    },
  ];
  const collection = {
    reference: { provider: "fixture", id: "abandoned" },
    title: "Abandoned title",
    kind: "manga",
    canonical_url: "https://example.org/abandoned",
    artwork_url: null,
  };
  const metadata = deferred<any>();
  fixture.operation.mockImplementation(async (_id, input) =>
    input.operation === "collection"
      ? collection
      : input.operation === "details"
        ? metadata.promise
        : {
            items: input.operation === "search" ? [collection] : [],
            next_cursor: null,
          },
  );
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await fireEvent.input(screen.getByRole("searchbox"), {
    target: { value: "abandoned" },
  });
  await fireEvent.click(
    screen.getAllByRole("button", { name: "Search" }).at(-1)!,
  );
  await fireEvent.click(
    await screen.findByRole("button", { name: collection.title }),
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "Back to results" }),
  );
  expect(screen.getByRole("heading", { name: "Results" })).toBeTruthy();
  metadata.resolve({
    reference: collection.reference,
    creators: [],
    facts: [],
    tags: [],
    alternative_titles: {},
    languages: ["en"],
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getByRole("heading", { name: "Results" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: collection.title })).toBeNull();
  // Chapters now start alongside metadata; completing stale metadata must not start another fetch.
  expect(
    fixture.operation.mock.calls.filter(
      ([, input]) => input.operation === "releases",
    ),
  ).toHaveLength(1);
});
it("restarts chapter pagination at the source when descending order is selected", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [
    {
      manifest: {
        id: "fixture",
        name: "Fixture",
        version: "1",
        capabilities: ["search", "details"],
        grants: [],
      },
    },
  ];
  const collection = {
    reference: { provider: "fixture", id: "ordered" },
    title: "Long series",
    kind: "manga",
    canonical_url: "https://example.org/ordered",
    description: null,
    artwork_url: null,
    summary: { languages: ["en"] },
  };
  fixture.operation.mockImplementation(async (_id, input) => {
    if (input.operation === "search")
      return { items: [collection], next_cursor: null };
    if (input.operation === "collection") return collection;
    if (input.operation === "details")
      return {
        reference: collection.reference,
        description: null,
        creators: [],
        facts: [],
        tags: [],
        alternative_titles: {},
        languages: ["en"],
      };
    if (input.operation === "releases")
      return {
        items: [
          {
            reference: {
              provider: "fixture",
              id: input.release_order === "desc" ? "3900" : "1",
            },
            collection: collection.reference,
            title:
              input.release_order === "desc"
                ? "Final chapter 3900"
                : "First chapter 1",
            chapter: input.release_order === "desc" ? "3900" : "1",
            language: "en",
            availability: "available",
            position: 0,
          },
        ],
        next_cursor: null,
      };
    return { items: [], next_cursor: null };
  });
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await fireEvent.input(screen.getByRole("searchbox"), {
    target: { value: "long" },
  });
  await fireEvent.click(
    screen.getAllByRole("button", { name: "Search" }).at(-1)!,
  );
  await fireEvent.click(
    await screen.findByRole("button", { name: "Long series" }),
  );
  await screen.findByText(/First chapter 1/);
  await fireEvent.click(
    screen.getByRole("button", { name: "Chapter order: Ascending" }),
  );
  await fireEvent.click(screen.getByRole("button", { name: "Descending" }));
  await screen.findByText(/Final chapter 3900/);
  expect(screen.queryByText(/First chapter 1/)).toBeNull();
  expect(fixture.operation).toHaveBeenCalledWith(
    "fixture",
    expect.objectContaining({
      operation: "releases",
      release_order: "desc",
      cursor: null,
    }),
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "Chapter order: Descending" }),
  );
  await fireEvent.click(screen.getByRole("button", { name: "Ascending" }));
  await screen.findByText(/First chapter 1/);
  expect(screen.queryByText(/Final chapter 3900/)).toBeNull();
});

it("commits navigation with existing subscription and download data without intermediate empty states or busy popups", async () => {
  fixture.preferences.onboarding_complete = true;
  const items = [
    {
      id: "sub",
      title: "Subscribed series",
      enabled: true,
      request: {
        target: { provider: "p", id: "series" },
        action: "notify",
        interval_minutes: 60,
      },
    },
  ];
  let finishRefresh!: (value: unknown) => void;
  let refreshPending = false;
  fixture.request.mockImplementation((route: string) => {
    if (route === "/v2/subscriptions")
      return refreshPending
        ? new Promise((resolve) => (finishRefresh = resolve))
        : items;
  });
  render(App);
  await screen.findByRole("heading", { name: "Overview", level: 1 });
  const frames: string[] = [];
  const observer = new MutationObserver(() =>
    frames.push(document.querySelector("main")?.textContent ?? ""),
  );
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  const nav = within(
    screen.getByRole("navigation", { name: "Main navigation" }),
  );
  for (let i = 0; i < 3; i++) {
    await fireEvent.click(nav.getByRole("button", { name: "Subscriptions" }));
    expect(screen.getByText("Subscribed series")).toBeTruthy();
    expect(
      nav
        .getByRole("button", { name: "Subscriptions" })
        .getAttribute("aria-current"),
    ).toBe("page");
    await fireEvent.click(nav.getByRole("button", { name: "Downloads" }));
    // Without a source, Downloads shows the shared plugin prerequisite.
    expect(screen.getByRole("heading", { name: "Add a source plugin" })).toBeTruthy();
    expect(
      nav
        .getByRole("button", { name: "Downloads" })
        .getAttribute("aria-current"),
    ).toBe("page");
  }
  expect(
    fixture.request.mock.calls.filter(
      ([route]) => route === "/v2/subscriptions",
    ),
  ).toHaveLength(1);
  refreshPending = true;
  fixture.event({ kind: "subscriptions.changed" });
  await waitFor(() => expect(finishRefresh).toBeTypeOf("function"));
  await fireEvent.click(nav.getByRole("button", { name: "Subscriptions" }));
  expect(screen.getByText("Subscribed series")).toBeTruthy();
  finishRefresh([{ ...items[0], title: "Updated series" }]);
  await screen.findByText("Updated series");
  expect(
    frames.some(
      (text) =>
        text.includes("No subscriptions yet") ||
        text.includes("Loading saved downloads"),
    ),
  ).toBe(false);
  observer.disconnect();
});

it("returns through related and recommended items, restoring the parent tab, gallery position and scroll, then the original results", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [
    {
      manifest: {
        id: "fixture",
        name: "Fixture source",
        version: "1.0.0",
        capabilities: [
          "search",
          "browse",
          "details",
          "related",
          "recommendations",
        ],
        grants: [],
      },
    },
  ];
  const titles = [
    "Parent title",
    "First related title",
    "Second related title",
    "Recommended title",
  ];
  const items = titles.map((title, id) => ({
    reference: { provider: "fixture", id: String(id) },
    title,
    kind: "manga",
    canonical_url: `https://example.org/${id}`,
    artwork_url: null,
  }));
  const lateChild = deferred<any>();
  fixture.operation.mockImplementation(async (_id, input) => {
    const index = Number(input.reference?.id ?? 0);
    if (input.operation === "search")
      return { items: [items[0]], next_cursor: null };
    if (input.operation === "collection")
      return index === 3 ? lateChild.promise : items[index];
    if (input.operation === "details")
      return {
        reference: items[index].reference,
        description: "Description",
        creators: [],
        facts: [],
        tags: [],
        alternative_titles: {},
        languages: ["en"],
      };
    if (input.operation === "related")
      return { items: [items[1], items[2]], next_cursor: null };
    if (input.operation === "recommendations")
      return { items: [items[3]], next_cursor: null };
    return { items: [], next_cursor: null };
  });
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await fireEvent.input(screen.getByRole("searchbox"), {
    target: { value: "remember the results" },
  });
  await fireEvent.click(
    screen.getAllByRole("button", { name: "Search" }).at(-1)!,
  );
  await fireEvent.click(await screen.findByRole("button", { name: titles[0] }));
  await fireEvent.click(
    await screen.findByRole("button", { name: "Related titles" }),
  );
  await screen.findByRole("button", { name: titles[1] });
  await fireEvent.click(screen.getByRole("button", { name: "Gallery view" }));
  await fireEvent.click(
    await screen.findByRole("button", { name: "Next item" }),
  );
  const gallery = document.querySelector<HTMLElement>(
    ".collection-info .gallery",
  )!;
  Object.defineProperty(gallery, "clientWidth", {
    configurable: true,
    value: 900,
  });
  gallery.scrollLeft = 900;
  await fireEvent.scroll(gallery);
  await screen.findByText("2 of 2");
  await screen.findByRole("heading", { name: titles[2] });
  const main = document.querySelector<HTMLElement>(".v2-main")!;
  main.scrollTop = 420;
  await fireEvent.click(
    within(screen.getByLabelText(`2: ${titles[2]}`)).getByRole("button", {
      name: "View details",
    }),
  );
  await screen.findByRole("button", { name: `Back to ${titles[0]}` });
  await fireEvent.click(
    screen.getByRole("button", { name: "Recommendations" }),
  );
  await fireEvent.click(await screen.findByRole("button", { name: titles[3] }));
  await fireEvent.click(
    screen.getByRole("button", { name: `Back to ${titles[2]}` }),
  );
  expect(
    screen
      .getByRole("button", { name: "Recommendations" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  lateChild.resolve(items[3]);
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: titles[2], level: 1 }),
    ).toBeTruthy(),
  );
  await fireEvent.click(
    screen.getByRole("button", { name: `Back to ${titles[0]}` }),
  );
  expect(
    screen
      .getByRole("button", { name: "Related titles" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByText("2 of 2")).toBeTruthy();
  await waitFor(() => expect(main.scrollTop).toBe(420));
  expect(
    fixture.operation.mock.calls.filter(
      ([, input]) => input.operation === "related",
    ),
  ).toHaveLength(1);
  await fireEvent.click(
    screen.getByRole("button", { name: "Back to results" }),
  );
  await screen.findByRole("heading", { name: "Results" });
  await fireEvent.click(screen.getByRole("button", { name: "Back to search" }));
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
    "remember the results",
  );
});

it("keeps a pasted title as the parent of related navigation and returns to the original search form", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [
    {
      manifest: {
        id: "fixture",
        name: "Fixture source",
        version: "1.0.0",
        source_hosts: ["example.org"],
        capabilities: [
          "identify",
          "collection",
          "search",
          "details",
          "related",
        ],
        grants: [],
      },
    },
  ];
  const parent = {
    reference: { provider: "fixture", id: "linked" },
    title: "Linked parent",
    kind: "manga",
    canonical_url: "https://example.org/linked",
    artwork_url: null,
  };
  const child = {
    ...parent,
    reference: { provider: "fixture", id: "child" },
    title: "Related child",
  };
  fixture.operation.mockImplementation(async (_id, input) => {
    if (input.operation === "identify")
      return { kind: "collection", reference: parent.reference };
    if (input.operation === "collection")
      return input.reference.id === "linked" ? parent : child;
    if (input.operation === "details")
      return {
        reference: input.reference,
        description: "Description",
        creators: [],
        facts: [],
        tags: [],
        alternative_titles: {},
        languages: ["en"],
      };
    if (input.operation === "related")
      return { items: [parent, child], next_cursor: null };
    return { items: [], next_cursor: null };
  });
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await fireEvent.input(screen.getByRole("searchbox"), {
    target: { value: parent.canonical_url },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Open link" }));
  await screen.findByRole("heading", { name: parent.title, level: 1 });
  await fireEvent.click(screen.getByRole("button", { name: "Related titles" }));
  // A source linking to the same title must not create a duplicate history entry.
  await fireEvent.click(
    await screen.findByRole("button", { name: parent.title }),
  );
  expect(screen.getByRole("button", { name: "Back to search" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: child.title }));
  await fireEvent.click(
    screen.getByRole("button", { name: `Back to ${parent.title}` }),
  );
  expect(
    screen
      .getByRole("button", { name: "Related titles" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await fireEvent.click(screen.getByRole("button", { name: "Back to search" }));
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
    parent.canonical_url,
  );
  const identify = deferred<any>();
  const original = fixture.operation.getMockImplementation()!;
  fixture.operation.mockImplementation((id, input) =>
    input.operation === "identify" ? identify.promise : original(id, input),
  );
  await fireEvent.click(screen.getByRole("button", { name: "Open link" }));
  await fireEvent.click(screen.getByRole("button", { name: "Downloads" }));
  identify.resolve({ kind: "collection", reference: parent.reference });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(
    screen.getByRole("heading", { name: "Downloads", level: 1 }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: parent.title, level: 1 }),
  ).toBeNull();
});

async function bulkFixture(
  config: {
    secondPage?: Promise<any>;
    statusFail?: boolean;
    jobsFail?: boolean;
    startFail?: boolean;
    submitFail?: boolean;
    large?: number;
    hiddenFirst?: boolean;
    unavailableOnly?: boolean;
    visibilityCases?: boolean;
    statusDelay?: Promise<void>;
  } = {},
) {
  localStorage.clear();
  fixture.preferences.onboarding_complete = true;
  fixture.sources = [
    {
      manifest: {
        id: "fixture",
        name: "Fixture",
        version: "1",
        capabilities: ["search", "details", "releases"],
        grants: [],
      },
    },
  ];
  const collection = {
    reference: { provider: "fixture", id: "bulk" },
    title: "Bulk series",
    kind: "manga",
    summary: { languages: ["en"] },
  };
  const release = (id: string, extra = {}) => ({
    reference: { provider: "fixture", id },
    collection: collection.reference,
    title: id,
    chapter: id,
    position: 1,
    availability: "available",
    language: "en",
    group: "Group A",
    ...extra,
  });
  let first = config.large
    ? Array.from({ length: 100 }, (_, i) => release(`new-${i}`))
    : [
        release("new"),
        release("present"),
        release("missing"),
        release("partial"),
        release("offline"),
        release("unknown"),
        release("modified"),
        release("queued"),
        release("removed", { availability: "unavailable" }),
      ];
  let second = config.large
    ? Array.from({ length: config.large - 100 }, (_, i) =>
        release(`new-${100 + i}`),
      )
    : [release("next-page"), release("other-language", { language: "ja" })];
  if (config.hiddenFirst || config.unavailableOnly)
    first = [release("removed", { availability: "unavailable" })];
  if (config.unavailableOnly) second = [];
  if (config.visibilityCases)
    first.push(
      release("saved-removed", { availability: "unavailable" }),
      release("unknown-availability", { availability: "unknown" }),
      release("sign-in-required", { availability: "authentication_required" }),
      release("publisher-only", {
        availability: "external",
        canonical_url: "https://publisher.example/chapter",
      }),
    );
  const statuses = (references: any[]) =>
    references.map((reference) => ({
      reference,
      acquired_versions: [
        "present",
        "missing",
        "partial",
        "offline",
        "unknown",
        "modified",
        "saved-removed",
      ].includes(reference.id)
        ? 1
        : 0,
      file_state:
        (
          {
            offline: "destination_unavailable",
            unknown: "unavailable",
            "saved-removed": "present",
          } as any
        )[reference.id] ?? reference.id,
      last_acquired_at: null,
    }));
  let tasks: any[] = [];
  const batches: any[] = [];
  const snapshot: any = {
    id: "bulk-snapshot",
    kind: "snapshot",
    state: "ready",
    processed: first.length + second.length,
    total: first.length + second.length,
    request: { reference: collection.reference },
    expires_at: "2099-01-01T00:00:00Z",
  };
  fixture.operation.mockImplementation(async (_provider, input) => {
    if (input.operation === "search")
      return { items: [collection], next_cursor: null };
    if (input.operation === "collection") return collection;
    if (input.operation === "details")
      return {
        reference: collection.reference,
        creators: [],
        facts: [],
        tags: [],
        alternative_titles: {},
        languages: ["en"],
      };
    if (input.operation === "releases")
      return input.cursor
        ? (config.secondPage ?? { items: second, next_cursor: null })
        : { items: first, next_cursor: "next" };
    return { items: [], next_cursor: null };
  });
  fixture.request.mockImplementation(async (route, options) => {
    if (route === "/v2/acquisitions/status") {
      if (config.statusDelay) await config.statusDelay;
      if (config.statusFail) throw new Error("Status lookup failed");
      return statuses(options.body.references);
    }
    if (route === "/v2/jobs?state=active" && config.jobsFail)
      throw new Error("Download activity could not be checked");
    if (route === "/v2/jobs?state=active")
      return {
        items: [
          {
            id: "queued-job",
            state: "queued",
            plan: { release: release("queued") },
          },
        ],
        next_cursor: null,
      };
    if (route === "/v2/snapshots") {
      if (config.startFail) throw new Error("Source is unavailable");
      tasks = [snapshot];
      return snapshot;
    }
    if (route === "/v2/batches") {
      const batch = {
        id: `bulk-batch-${batches.length}`,
        kind: "batch",
        state: "working",
        processed: 0,
        total: options.body.releases.length,
        request: JSON.parse(JSON.stringify(options.body)),
        expires_at: snapshot.expires_at,
        outcomes: {},
      };
      batches.push(batch);
      tasks = [snapshot, ...batches];
      return structuredClone(batch);
    }
    if (route.startsWith("/v2/selections?"))
      return {
        items: tasks.map((t) => ({ ...t, outcomes: {} })),
        next_cursor: null,
      };
    if (route.startsWith("/v2/selections/")) {
      const task = tasks.find((t) =>
        route.startsWith(`/v2/selections/${t.id}`),
      );
      if (route.endsWith("/cancel")) task.state = "canceled";
      return structuredClone(task);
    }
    if (route === "/v2/jobs") {
      if (config.submitFail) throw new Error("Destination disconnected");
      const batch = batches.find((t) => t.id === options.body.preparation_id);
      batch.state = "submitted";
      return { group_id: "bulk-group", created: ["job"], existing: [] };
    }
    if (route === "/v2/groups/bulk-group")
      return {
        id: "bulk-group",
        title: "Bulk series",
        total: 1,
        completed: 0,
        failed: 0,
      };
  });
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await fireEvent.input(screen.getByRole("searchbox"), {
    target: { value: "bulk" },
  });
  await fireEvent.click(
    screen.getAllByRole("button", { name: "Search" }).at(-1)!,
  );
  await fireEvent.click(
    await screen.findByRole("button", { name: collection.title }),
  );
  if (config.unavailableOnly)
    await screen.findByText("No downloadable chapters match these filters");
  else
    await screen.findByRole("checkbox", {
      name: config.hiddenFirst
        ? "Select next-page"
        : "Select new" + (config.large ? "-0" : ""),
    });
  return {
    batches,
    complete(outcomes = { download: 1 }) {
      for (const batch of batches) {
        batch.state = "ready";
        batch.processed = batch.total;
        batch.outcomes = outcomes;
      }
      fixture.event({ kind: "selections.updated" });
    },
    fail() {
      batches[0].state = "failed";
      batches[0].issue = {
        code: "source_unavailable",
        message: "Source returned HTTP 404.",
        retryable: true,
      };
      fixture.event({ kind: "selections.updated" });
    },
    progress() {
      batches[0].processed = 1;
      fixture.event({ kind: "selections.updated" });
    },
  };
}
async function bulkChoose(label: string) {
  await fireEvent.click(screen.getByRole("button", { name: "Select" }));
  await fireEvent.click(screen.getByRole("button", { name: label }));
}

it.each([
  [
    "All available",
    [
      "new",
      "present",
      "missing",
      "partial",
      "offline",
      "unknown",
      "modified",
      "next-page",
    ],
  ],
  ["Not downloaded", ["new", "next-page"]],
  [
    "Not downloaded + missing files",
    ["new", "missing", "partial", "next-page"],
  ],
] as const)(
  "selects %s across filtered pages without resolving downloads",
  async (label, expected) => {
    await bulkFixture();
    await bulkChoose(label);
    await screen.findByRole("button", {
      name: `Download ${expected.length} selected`,
    });
    for (const id of [
      "new",
      "present",
      "missing",
      "partial",
      "offline",
      "unknown",
      "modified",
    ])
      expect(
        (
          screen.getByRole("checkbox", {
            name: `Select ${id}`,
          }) as HTMLInputElement
        ).checked,
      ).toBe(expected.includes(id as never));
    expect(
      fixture.request.mock.calls.some(([r]) =>
        [
          "/v2/snapshots",
          "/v2/batches",
          "/v2/preparations",
          "/v2/jobs",
        ].includes(r),
      ),
    ).toBe(false);
    expect(
      fixture.operation.mock.calls.some(
        ([, input]) => input.operation === "resolve",
      ),
    ).toBe(false);
    expect(screen.queryByText("Download automatically when ready")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Review downloads" }),
    ).toBeNull();
    await fireEvent.click(
      screen.getByRole("button", { name: "Clear selection" }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Download selected",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  },
);

it("does not interpret failed status lookups as never downloaded", async () => {
  await bulkFixture({ statusFail: true });
  await bulkChoose("Not downloaded");
  await screen.findByRole("alert");
  expect(
    (
      screen.getByRole("button", {
        name: "Download selected",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(fixture.request.mock.calls.some(([r]) => r === "/v2/snapshots")).toBe(
    false,
  );
});

it("does not apply a late bulk selection after clearing it", async () => {
  let resolve!: (value: any) => void;
  await bulkFixture({ secondPage: new Promise((r) => (resolve = r)) });
  await bulkChoose("Not downloaded");
  await fireEvent.click(
    await screen.findByRole("button", { name: "Clear selection" }),
  );
  resolve({ items: [], next_cursor: null });
  await new Promise((r) => setTimeout(r, 0));
  expect(
    (
      screen.getByRole("button", {
        name: "Download selected",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

it.each([
  "complete",
  "failure",
  "start-failure",
  "submit-failure",
  "cancel",
  "continue",
  "already-saved",
])(
  "prepares exact table membership in the background: %s",
  async (scenario) => {
    const flow = await bulkFixture({
      startFail: scenario === "start-failure",
      submitFail: scenario === "submit-failure",
    });
    await bulkChoose("Not downloaded + missing files");
    await screen.findByRole("button", { name: "Download 4 selected" });
    // Individual deselection must also affect the frozen selection on later pages.
    await fireEvent.click(
      screen.getByRole("checkbox", { name: "Select partial" }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "Download 3 selected" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    if (scenario === "start-failure") {
      await screen.findByText(/Source is unavailable/);
      expect(
        screen.getByRole("button", { name: "Download 3 selected" }),
      ).toBeTruthy();
      return;
    }
    await screen.findByRole("button", { name: "View progress" });
    await waitFor(() => expect(flow.batches).toHaveLength(1));
    expect(flow.batches[0].request.releases.map((r: any) => r.id)).toEqual([
      "new",
      "missing",
      "next-page",
    ]);
    expect(flow.batches[0].request.duplicate_behavior).not.toBe("new_version");
    flow.progress();
    await screen.findByRole("progressbar", { name: "1 of 3 prepared" });
    if (scenario === "cancel" || scenario === "continue") {
      await fireEvent.click(
        screen.getByRole("button", { name: "View progress" }),
      );
      await screen.findByRole("dialog", { name: "Preparing downloads" });
      await fireEvent.click(
        screen.getByRole("button", {
          name: scenario === "cancel" ? "Cancel check" : "Continue browsing",
        }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      if (scenario === "cancel") {
        expect(fixture.request.mock.calls.some(([r]) => r === "/v2/jobs")).toBe(
          false,
        );
        return;
      }
      expect(
        fixture.request.mock.calls.some(([r]) => r.endsWith("/cancel")),
      ).toBe(false);
    }
    if (scenario === "failure") {
      flow.fail();
      await screen.findByRole("button", { name: "View issue" });
      expect(screen.getByRole("alert").textContent).toContain(
        "Source returned HTTP 404",
      );
      return;
    }
    if (scenario === "already-saved") {
      flow.complete({ already_acquired: 3 } as any);
      await screen.findByText(
        "No new missing items: Bulk series",
      );
      expect(fixture.request.mock.calls.some(([r]) => r === "/v2/jobs")).toBe(
        false,
      );
      return;
    }
    flow.complete();
    if (scenario === "submit-failure") {
      await screen.findByRole("button", { name: "View issue" });
      expect(screen.getByRole("alert").textContent).toContain(
        "Destination disconnected",
      );
      return;
    }
    await screen.findByRole("button", { name: "View downloads" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Bulk series" })).toBeTruthy();
    fixture.event({ kind: "selections.updated" });
    await new Promise((r) => setTimeout(r, 0));
    expect(
      fixture.request.mock.calls.filter(([r]) => r === "/v2/jobs"),
    ).toHaveLength(1);
  },
);

it("preserves more than 2000 explicit selections across bounded batches", async () => {
  const flow = await bulkFixture({ large: 2001 });
  await bulkChoose("Not downloaded");
  await fireEvent.click(
    await screen.findByRole("button", { name: "Download 2001 selected" }),
  );
  await waitFor(() => expect(flow.batches).toHaveLength(2));
  expect(flow.batches.map((b) => b.request.releases.length)).toEqual([2000, 1]);
  expect(
    new Set(
      flow.batches.flatMap((b) => b.request.releases.map((r: any) => r.id)),
    ).size,
  ).toBe(2001);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("hides unavailable rows by default and reveals them without selection controls", async () => {
  await bulkFixture({ visibilityCases: true });
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Show unavailable",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(screen.queryByText("removed", { exact: true })).toBeNull();
  expect(screen.queryByText("publisher-only", { exact: true })).toBeNull();
  expect(screen.getByText("saved-removed", { exact: true })).toBeTruthy();
  expect(
    within(
      screen.getByText("saved-removed", { exact: true }).closest("tr")!,
    ).getByRole("button", { name: "Open files" }),
  ).toBeTruthy();
  for (const id of [
    "saved-removed",
    "unknown-availability",
    "sign-in-required",
  ])
    expect(screen.queryByRole("checkbox", { name: `Select ${id}` })).toBeNull();
  expect(
    screen.getByText("unknown-availability", { exact: true }),
  ).toBeTruthy();
  expect(screen.getByText("sign-in-required", { exact: true })).toBeTruthy();
  await fireEvent.click(
    screen.getByRole("checkbox", { name: "Show unavailable" }),
  );
  expect(screen.getByText("removed", { exact: true })).toBeTruthy();
  expect(screen.getByText("publisher-only", { exact: true })).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: "Select removed" })).toBeNull();
  expect(
    screen.queryByRole("checkbox", { name: "Select publisher-only" }),
  ).toBeNull();
  await fireEvent.click(
    within(screen.getByText("publisher-only").closest("tr")!).getByRole(
      "button",
      { name: "View on source" },
    ),
  );
  expect(fixture.invoke).toHaveBeenCalledWith("v2_open_source", {
    url: "https://publisher.example/chapter",
  });
  expect(localStorage.getItem("omd.show-unavailable")).toBe("true");
  await bulkChoose("All available");
  await screen.findByRole("button", { name: "Download 8 selected" });
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Select all available releases",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  await fireEvent.click(
    screen.getByRole("checkbox", { name: "Show unavailable" }),
  );
  expect(
    screen.getByRole("button", { name: "Download 8 selected" }),
  ).toBeTruthy();
});

it("finds downloadable releases after an entirely unavailable first page", async () => {
  await bulkFixture({ hiddenFirst: true });
  expect(
    screen.getByRole("checkbox", { name: "Select next-page" }),
  ).toBeTruthy();
  expect(
    screen.queryByText("No downloadable chapters match these filters"),
  ).toBeNull();
  expect(screen.queryByText("removed", { exact: true })).toBeNull();
  expect(
    fixture.operation.mock.calls
      .filter(([, input]) => input.operation === "releases")
      .map(([, input]) => input.cursor),
  ).toEqual([null, "next"]);
});

it("offers unavailable chapters when the complete filtered catalog has no downloads", async () => {
  await bulkFixture({ unavailableOnly: true });
  await fireEvent.click(
    screen.getByRole("button", { name: "Show unavailable" }),
  );
  expect(screen.getByText("removed", { exact: true })).toBeTruthy();
  expect(
    screen.queryByText("No downloadable chapters match these filters"),
  ).toBeNull();
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Select all available releases",
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);
});

it("does not flash unavailable rows before their local-file lookup resolves", async () => {
  let resolve!: () => void;
  const opening = bulkFixture({
    visibilityCases: true,
    statusDelay: new Promise<void>((r) => (resolve = r)),
  });
  await screen.findByRole("heading", { name: "Bulk series" });
  expect(screen.queryByText("removed", { exact: true })).toBeNull();
  expect(
    screen.queryByText("No downloadable chapters match these filters"),
  ).toBeNull();
  resolve();
  await opening;
  expect(screen.queryByText("removed", { exact: true })).toBeNull();
  expect(screen.getByText("saved-removed", { exact: true })).toBeTruthy();
});

it("keeps source releases visible when download activity status fails", async () => {
  await bulkFixture({ jobsFail: true });
  expect(screen.getByRole("checkbox", { name: "Select new" })).toBeTruthy();
  expect(
    screen.getByText("Download activity could not be checked"),
  ).toBeTruthy();
  expect(
    screen.queryByText("No downloadable chapters match these filters"),
  ).toBeNull();
});

async function reviewActivityFixture(states = ["ready"], empty = false) {
  localStorage.clear();
  fixture.preferences.onboarding_complete = true;
  fixture.sources = [{ manifest: { id: "fixture", name: "Fixture", version: "1", capabilities: ["collection", "details", "releases"], grants: [] } }];
  const reference = { provider: "fixture", id: "review-title" };
  const tasks = states.map((state, i) => ({ id: `review-${i}`, kind: "snapshot", state, processed: 643, total: 643, issue: state === "failed" ? { message: "Source is temporarily offline", retryable: true } : null, expires_at: "2099-01-01T00:00:00Z", request: { reference, policy: { languages: ["ja"], groups: ["Saved group"] } } }));
  const context = { reference, title: "Saved review", destination_id: "existing-destination", recipe: "image_folder", policy: { languages: ["ja"], groups: ["Saved group"] }, empty, automatic: false };
  localStorage.setItem("omd.download-checks", JSON.stringify(Object.fromEntries(tasks.map(task => [task.id, context]))));
  fixture.request.mockImplementation(async (route, options) => {
    if (route.startsWith("/v2/selections?")) return { items: tasks, next_cursor: null };
    if (route.endsWith("/cancel") || route.endsWith("/retry")) {
      const task = tasks.find(t => route.includes(t.id))!;
      task.state = route.endsWith("/cancel") ? "canceled" : "working";
      task.issue = null;
      return task;
    }
    if (route.startsWith("/v2/selections/")) return tasks.find(t => route.endsWith(t.id));
    if (options?.method === "POST" && route !== "/v2/acquisitions/status" && route !== "/v2/jobs/matching") throw new Error(`Unexpected mutation: ${route}`);
  });
  fixture.operation.mockImplementation(async (_provider, input) => {
    if (input.operation === "collection") return { reference, title: context.title, kind: "manga", canonical_url: "https://example.org/title" };
    if (input.operation === "details") return { reference, languages: ["en", "ja"], tags: [], facts: [], creators: [], alternative_titles: {} };
    if (input.operation === "releases") return { items: [{ reference: { provider: "fixture", id: "chapter" }, collection: reference, title: "Japanese chapter", language: "ja", group: "Saved group", availability: "available", position: 0 }], next_cursor: null };
    return { items: [], next_cursor: null };
  });
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Downloads" }));
  return { tasks, context };
}

it("opens an actionable saved review directly in chapters with its saved filters and output options", async () => {
  await reviewActivityFixture();
  await screen.findByRole("heading", { name: "Needs attention" });
  expect(screen.queryByRole("button", { name: /^Reviews/ })).toBeNull();
  expect(screen.queryByText("No active downloads")).toBeNull();
  await fireEvent.click(await screen.findByRole("button", { name: "Choose chapters" }));
  await screen.findByRole("checkbox", { name: "Select Japanese chapter" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Language: Japanese" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Translator / group: Saved group" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save as: Chapter folder" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Destination: Existing collection" })).toBeTruthy();
  const releaseCalls = fixture.operation.mock.calls.filter(([, input]) => input.operation === "releases");
  expect(releaseCalls.length).toBeGreaterThan(0);
  expect(releaseCalls.every(([, input]) => input.policy.languages[0] === "ja" && input.policy.groups[0] === "Saved group")).toBe(true);
  expect(fixture.request.mock.calls.some(([route, opts]) => ["/v2/batches", "/v2/snapshots", "/v2/jobs"].includes(route) && opts?.method === "POST")).toBe(false);
});

it("dismisses a review in one click and restores it with Undo without canceling or deleting it", async () => {
  await reviewActivityFixture();
  await fireEvent.click(await screen.findByRole("button", { name: "Dismiss review for Saved review" }));
  await screen.findByRole("button", { name: "Undo" });
  expect(screen.queryByRole("button", { name: "Choose chapters" })).toBeNull();
  expect(JSON.parse(localStorage.getItem("omd.dismissed-checks")!)).toEqual(["review-0"]);
  await fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  await screen.findByRole("button", { name: "Choose chapters" });
  expect(JSON.parse(localStorage.getItem("omd.dismissed-checks")!)).toEqual([]);
  expect(fixture.request.mock.calls.some(([route]) => route.endsWith("/cancel") || route.endsWith("/retry"))).toBe(false);
});

it("retries failed checks and cancels running checks directly in Activity", async () => {
  await reviewActivityFixture(["failed"]);
  await screen.findByText("Source is temporarily offline");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("button", { name: "Cancel" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Dismiss review for Saved review" })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull());
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  expect(fixture.request.mock.calls.filter(([route]) => route.endsWith("/retry"))).toHaveLength(1);
  expect(fixture.request.mock.calls.filter(([route]) => route.endsWith("/cancel"))).toHaveLength(1);
});


it("restores every consecutively dismissed review from a single Undo", async () => {
  await reviewActivityFixture(["ready", "ready"]);
  await screen.findAllByRole("button", { name: "Dismiss review for Saved review" });
  await fireEvent.click(screen.getAllByRole("button", { name: "Dismiss review for Saved review" })[0]);
  await fireEvent.click(screen.getByRole("button", { name: "Dismiss review for Saved review" }));
  await screen.findByText("2 reviews dismissed");
  await fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(await screen.findAllByRole("button", { name: "Choose chapters" })).toHaveLength(2);
  await waitFor(() => expect(document.activeElement?.textContent).toBe("Choose chapters"));
});

it("opens ready reviews directly at table selection without starting downloads", async () => {
  await reviewActivityFixture(["ready"], false);
  await fireEvent.click(await screen.findByRole("button", { name: "Choose chapters" }));
  await screen.findByRole("checkbox", { name: "Select Japanese chapter" });
  await waitFor(() => expect(document.activeElement?.id).toBe("release-selection"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fixture.request.mock.calls.some(([route, opts]) => ["/v2/batches", "/v2/snapshots", "/v2/jobs"].includes(route) && opts?.method === "POST")).toBe(false);
});


it("retires an existing empty result with a plain toast and does not announce it again on refresh", async () => {
  await reviewActivityFixture(["ready"], true);
  await screen.findByText("No new missing items: Saved review");
  expect(screen.queryByRole("heading", { name: "Needs attention" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Adjust filters" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Choose chapters" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
  fixture.event({ kind: "selections.changed" });
  await new Promise(r => setTimeout(r, 400));
  expect(screen.queryByText("No new missing items: Saved review")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Needs attention" })).toBeNull();
  expect(fixture.request.mock.calls.some(([, opts]) => opts?.method === "POST")).toBe(false);
});

it("finishes a running empty check without leaving an attention item or offering filter changes", async () => {
  const { tasks } = await reviewActivityFixture(["working"], true);
  await screen.findByRole("button", { name: "Cancel" });
  tasks[0] = { ...tasks[0], state: "ready" };
  fixture.event({ kind: "selections.changed" });
  await screen.findByText("No new missing items: Saved review");
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Needs attention" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Adjust filters" })).toBeNull();
  expect(fixture.request.mock.calls.some(([, opts]) => opts?.method === "POST")).toBe(false);
});

it("does not treat a failed check with an older empty result as successful", async () => {
  await reviewActivityFixture(["failed"], true);
  await screen.findByRole("button", { name: "Retry" });
  expect(screen.queryByText("No new missing items: Saved review")).toBeNull();
  expect(screen.getByText("Source is temporarily offline")).toBeTruthy();
});

it.each([['item', null], ['channel', 'Follow channel'], ['playlist', 'Follow playlist']] as const)(
  'offers only meaningful subscription actions for a media %s', async (kind, label) => {
    fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
    fixture.sources = [{manifest:{id:'fixture',name:'Example Video',version:'1.0.0',media_tools:true,capabilities:['search','collection','releases'],grants:[]}}];
    const collection={reference:{provider:'fixture',id:'media'},kind,title:'A media result',canonical_url:'https://example.org/video',artwork_url:null,description:'A description',summary:{duration_seconds:748,view_count:140000}};
    fixture.operation.mockImplementation(async (_provider,input) => input.operation === 'collection' ? collection : input.operation === 'search' ? {items:[collection],next_cursor:null} : {items:[],next_cursor:null});
    render(App);
    await fireEvent.click(await screen.findByRole('button',{name:'Explore'}));
    await fireEvent.input(screen.getByRole('searchbox'),{target:{value:'media'}});
    await fireEvent.click(screen.getAllByRole('button',{name:'Search'}).at(-1)!);
    await fireEvent.click(await screen.findByRole('button',{name:collection.title}));
    await screen.findByRole('heading',{name:collection.title});
    expect(screen.queryByRole('button',{name:'Subscribe'})).toBeNull();
    if (label) {
      await fireEvent.click(screen.getByRole('button',{name:label}));
      expect(await screen.findByText(/This does not change your subscriptions on Example Video/)).toBeTruthy();
    } else expect(screen.queryByRole('button',{name:/Follow channel|Follow playlist/})).toBeNull();
  }
);


it("opens a video's channel for following and returns to the video", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [{manifest:{id:'fixture',name:'Example Video',version:'1.0.0',media_tools:true,capabilities:['search','collection','releases'],grants:[]}}];
  const parent={reference:{provider:'fixture',id:'channel:owner'},kind:'channel',title:'Fixture channel',canonical_url:'https://example.org/channel'};
  const video={reference:{provider:'fixture',id:'video:one'},kind:'item',title:'Channel navigation video',canonical_url:'https://example.org/video',artwork_url:null,description:'Video description',summary:{creators:['Fixture channel'],parent}};
  fixture.operation.mockImplementation(async (_provider,input) => input.operation === 'collection' ? input.reference.id === parent.reference.id ? {...parent,description:'Channel description'} : video : input.operation === 'search' ? {items:[video],next_cursor:null} : {items:[],next_cursor:null});
  render(App);
  await fireEvent.click(await screen.findByRole('button',{name:'Explore'}));
  await fireEvent.input(screen.getByRole('searchbox'),{target:{value:'video'}});
  await fireEvent.click(screen.getAllByRole('button',{name:'Search'}).at(-1)!);
  await fireEvent.click(await screen.findByRole('button',{name:video.title}));
  await screen.findByRole('heading',{name:video.title});
  expect(screen.queryByRole('button',{name:'Follow channel'})).toBeNull();
  await fireEvent.click(screen.getByRole('button',{name:'View channel Fixture channel'}));
  await screen.findByRole('heading',{name:parent.title});
  await fireEvent.click(screen.getByRole('button',{name:'Follow channel'}));
  await screen.findByText(/This does not change your subscriptions on Example Video/);
  await fireEvent.click(screen.getByRole('button',{name:'Close dialog'}));
  await fireEvent.click(screen.getByRole('button',{name:'Back to '+video.title}));
  await screen.findByRole('heading',{name:video.title});
  expect(screen.getByRole('button',{name:'View channel Fixture channel'})).toBeTruthy();
});

async function channelBrowserFixture() {
  fixture.preferences = {...fixture.preferences,onboarding_complete:true};
  fixture.sources=[{manifest:{id:'fixture',name:'Example Video',version:'1.0.0',media_tools:true,capabilities:['search','collection','releases','browse'],grants:[]}}];
  const ref=(id:string)=>({provider:'fixture',id});
  const channel={reference:ref('channel:owner'),kind:'channel',title:'A channel',canonical_url:'https://example.org/channel',description:'Channel description',artwork_url:'https://example.org/banner.jpg',summary:{artwork_layout:'banner',banner_url:'https://example.org/banner.jpg',avatar_url:'https://example.org/avatar.jpg',handle:'@channel',followers:12000,sections:[{reference:ref('channel:owner'),label:'Videos',kind:'releases'},{reference:ref('channel:owner:shorts'),label:'Shorts',kind:'releases'},{reference:ref('channel:owner:playlists'),label:'Playlists',kind:'collections'}]}};
  const videos=[1,2].map(i=>({reference:ref('video:'+i),kind:'item',title:'Channel video '+i,canonical_url:'https://example.org/video/'+i,artwork_url:'https://example.org/video.jpg',description:null,summary:{duration_seconds:120+i,view_count:1000,published_label:'2 days ago',parent:{reference:channel.reference,kind:'channel',title:channel.title,canonical_url:channel.canonical_url}}}));
  fixture.operation.mockImplementation(async (_provider,input)=>{
    const requestReference=input.reference?{provider:input.reference.provider,id:input.reference.id}:null;
    if(input.operation==='search')return{items:[channel],next_cursor:null};
    if(input.operation==='collection')return input.reference.id.startsWith('channel:')?{...channel,reference:requestReference}:{...videos.find(v=>v.reference.id===input.reference.id),description:'Full video description'};
    if(input.operation==='browse')return{items:[{reference:ref('playlist:one'),kind:'playlist',title:'Channel playlist',canonical_url:'https://example.org/playlist',artwork_url:null,description:null}],next_cursor:null};
    if(input.operation==='releases')return{items:(input.reference.id.endsWith(':shorts')?videos.slice(1):videos).map((v,i)=>({reference:v.reference,collection:requestReference,title:v.title,canonical_url:v.canonical_url,availability:'available',position:i,preview:v})),next_cursor:null};
    return{items:[],next_cursor:null};
  });
  render(App);
  await fireEvent.click(await screen.findByRole('button',{name:'Explore'}));
  await fireEvent.input(screen.getByRole('searchbox'),{target:{value:'channel'}});
  await fireEvent.click(screen.getAllByRole('button',{name:'Search'}).at(-1)!);
  await fireEvent.click(await screen.findByRole('button',{name:channel.title}));
  await screen.findByRole('heading',{name:channel.title});
  await screen.findByRole('checkbox',{name:'Select Channel video 1'});
  return{channel,videos};
}

it('keeps video bulk selection across channel layouts and restores it after video details',async()=>{
  await channelBrowserFixture();
  expect(document.querySelector('.channel-banner')).toBeTruthy();
  expect(document.querySelector('.channel-avatar')).toBeTruthy();
  expect(screen.getByText('@channel')).toBeTruthy();
  await fireEvent.click(screen.getByRole('checkbox',{name:'Select Channel video 1'}));
  await fireEvent.click(screen.getByRole('button',{name:'List view'}));
  expect((screen.getByRole('checkbox',{name:'Select Channel video 1'}) as HTMLInputElement).checked).toBe(true);
  await fireEvent.click(screen.getByRole('button',{name:'Compact view'}));
  await fireEvent.click(screen.getByRole('checkbox',{name:'Select Channel video 2'}));
  expect(screen.getByRole('button',{name:'Download 2 selected'})).toBeTruthy();
  await fireEvent.click(screen.getByRole('button',{name:'Table view'}));
  expect((screen.getByRole('checkbox',{name:'Select Channel video 2'}) as HTMLInputElement).checked).toBe(true);
  await fireEvent.click(screen.getByRole('button',{name:'Channel video 1'}));
  await screen.findByRole('heading',{name:'Channel video 1'});
  await screen.findByText('Full video description');
  await fireEvent.click(screen.getByRole('button',{name:'Back to A channel'}));
  await screen.findByRole('button',{name:'Download 2 selected'});
  expect(screen.getByRole('button',{name:'Table view'}).getAttribute('aria-pressed')).toBe('true');
  expect((screen.getByRole('checkbox',{name:'Select Channel video 1'}) as HTMLInputElement).checked).toBe(true);
  await fireEvent.click(screen.getByRole('button',{name:'Gallery view'}));
  await within(document.querySelector('.gallery-item:not([inert])') as HTMLElement).findByRole('button',{name:'View details'});
  expect((screen.getByRole('checkbox',{name:'Select Channel video 1'}) as HTMLInputElement).checked).toBe(true);
  await fireEvent.click(screen.getByRole('button',{name:'Grid view'}));
  expect(screen.getByRole('button',{name:'Download 2 selected'})).toBeTruthy();
});

it('routes channel sections to their own content and opens playlists without download controls',async()=>{
  await channelBrowserFixture();
  await fireEvent.click(screen.getByRole('button',{name:'Shorts'}));
  await screen.findByRole('checkbox',{name:'Select Channel video 2'});
  await waitFor(()=>expect(screen.queryByRole('checkbox',{name:'Select Channel video 1'})).toBeNull());
  await fireEvent.click(screen.getByRole('button',{name:'Playlists'}));
  await screen.findByRole('button',{name:'Channel playlist'});
  expect(screen.queryByRole('button',{name:'Download selected'})).toBeNull();
  expect(fixture.operation.mock.calls.some(([,input])=>input.operation==='browse'&&input.reference?.id==='channel:owner:playlists')).toBe(true);
});


it('subscribes to an empty search and restores its exact query from subscriptions',async()=>{
  fixture.preferences={...fixture.preferences,onboarding_complete:true};
  fixture.sources=[{manifest:{id:'fixture',name:'A source',version:'1.0',media_tools:false,capabilities:['search'],grants:[]}}];
  fixture.operation.mockResolvedValue({items:[],next_cursor:null});
  let saved:any=null;
  fixture.request.mockImplementation(async(route,options)=>{
    if(route==='/v2/subscriptions') {
      if(options?.method==='POST') {saved={id:'saved-search',title:options.body.search.query,request:JSON.parse(JSON.stringify(options.body)),enabled:true,initialized:false,next_check:'2026-09-12T12:00:00Z'};return saved;}
      return {items:saved?[saved]:[],next_cursor:null};
    }
  });
  render(App);
  await fireEvent.click(await screen.findByRole('button',{name:'Explore'}));
  await fireEvent.input(screen.getByRole('searchbox'),{target:{value:'my future result'}});
  await fireEvent.click(screen.getAllByRole('button',{name:'Search'}).at(-1)!);
  await fireEvent.click(await screen.findByRole('button',{name:'Subscribe'}));
  await fireEvent.click(screen.getByRole('button',{name:'Subscribe'}));
  await screen.findByRole('button',{name:'Subscribed'});
  expect(saved.request).toMatchObject({search:{query:'my future result'},policy:{languages:['en']},include_existing:false,action:'notify'});
  await fireEvent.click(screen.getByRole('button',{name:'Subscriptions'}));
  await fireEvent.click(await screen.findByRole('button',{name:/^my future result A source/}));
  await screen.findByRole('heading',{name:'Results'});
  await waitFor(()=>expect(fixture.operation.mock.calls.filter(([,input])=>input.operation==='search')).toHaveLength(1));
  const input=fixture.operation.mock.calls.filter(([,input])=>input.operation==='search').at(-1)![1];
  expect(input.query).toBe('my future result');expect(input.policy.languages).toEqual(['en']);
});

function mockPluginInstall(manifest: ReturnType<typeof lanternPlugin>, digest: string) {
  fixture.open.mockResolvedValue("/disposable-fixture/lantern.omdp");
  fixture.request.mockImplementation(async (route, options) => {
    if (route === "/v2/source-catalog") return [];
    if (route !== "/v2/sources/install") return;
    if (options.body.approve_digest === null) return { review_required: true, digest, manifest };
    fixture.sources = [{ manifest }];
    return { installed: true, digest, manifest };
  });
}

it("keeps keyboard focus on the page after the first install from the empty guide", async () => {
  await emptyPublicSources();
  mockPluginInstall(lanternPlugin(), "a".repeat(64));
  const trigger = screen.getByRole("button", { name: "Add a plugin file…" });
  trigger.focus();
  await fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Install Lantern feed" });
  await fireEvent.click(within(dialog).getByRole("button", { name: "Approve and install" }));
  await screen.findByText("Source installed.");
  expect(trigger.isConnected).toBe(false);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", {name:"Sources", level:1})));
});

it("re-importing a source removed from its settings view returns to the list", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [{ manifest: lanternPlugin() }];
  mockPluginInstall(lanternPlugin(), "a".repeat(64));
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Sources" }));
  await fireEvent.click(within(await screen.findByLabelText("Installed sources")).getByRole("button", { name: /Lantern feed/ }));
  await screen.findByRole("heading", { name: "Lantern feed", level: 1 });
  fixture.sources = [];
  fixture.event({ kind: "sources.changed" });
  await screen.findByRole("heading", { name: "Add a source plugin", level: 2 });
  await fireEvent.click(screen.getByRole("button", { name: "Add a plugin file…" }));
  const dialog = await screen.findByRole("dialog", { name: "Install Lantern feed" });
  await fireEvent.click(within(dialog).getByRole("button", { name: "Approve and install" }));
  await screen.findByText("Source installed.");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sources");
  expect(screen.getByLabelText("Installed sources")).toBeTruthy();
});

// Source prerequisite: OMD ships without sources. Each empty surface must say so
// and route to the reviewed .omdp import instead of offering inert discovery.
const noIncludedPlugins = () =>
  fixture.request.mockImplementation(async (route) => (route === "/v2/source-catalog" ? [] : undefined));
const omdpPicker = expect.objectContaining({ multiple: false, filters: [{ name: "OMD plugin", extensions: ["omdp"] }] });

it("source prerequisite: setup states that no sources are included and makes the first plugin import the main action", async () => {
  noIncludedPlugins();
  render(App);
  await screen.findByRole("heading", { name: "Set up OMD", level: 1 });
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByText("OMD works with source plugins you choose. Add one to start browsing.")).toBeTruthy();
  expect(screen.getAllByText(/\.omdp/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/review/i).length).toBeGreaterThan(0);
  const install = screen.getByRole("button", { name: "Add a plugin file…" });
  await waitFor(() => expect(install).not.toBeDisabled());
  await fireEvent.click(install);
  await waitFor(() => expect(fixture.open).toHaveBeenCalledOnce());
  expect(fixture.open).toHaveBeenCalledWith(omdpPicker);
  expect(fixture.patches).toEqual([{ background: false, bandwidth_bytes_per_second: 0, languages: ["en"], onboarding_complete: true }]);
  await screen.findByRole("heading", { name: "Sources", level: 1 });
  // A canceled picker leaves the same prerequisite and a single import action.
  expect(screen.getByRole("heading", { name: "Add a source plugin" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Add a plugin file…" })).toHaveLength(1);
  expect(pluginRequests()).toHaveLength(0);
});

it("source prerequisite: an empty Overview leads with plugin import instead of discovery", async () => {
  noIncludedPlugins();
  render(App);
  const skip = await screen.findByRole("button", { name: "Continue without a plugin" });
  await waitFor(() => expect(skip).not.toBeDisabled());
  await fireEvent.click(skip);
  await screen.findByRole("heading", { name: "Overview", level: 1 });
  const prerequisite = await screen.findByRole("region", { name: "Add a source plugin" });
  expect(within(prerequisite).getByText("OMD works with source plugins you choose. Add one to start browsing.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Explore sources" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Active downloads/ })).toBeNull();
  expect(fixture.open).not.toHaveBeenCalled();
  await fireEvent.click(within(prerequisite).getByRole("button", { name: "Add a plugin file…" }));
  await waitFor(() => expect(fixture.open).toHaveBeenCalledWith(omdpPicker));
  expect(pluginRequests()).toHaveLength(0);
});

it("source prerequisite: Search offers plugin import instead of an inert search field", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  noIncludedPlugins();
  render(App);
  const navigation = await screen.findByRole("navigation", { name: "Main navigation" });
  await fireEvent.click(within(navigation).getByRole("button", { name: "Explore" }));
  await screen.findByRole("heading", { name: "Explore", level: 1 });
  await screen.findByRole("heading", { name: "Add a source plugin" });
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Find sources" })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Add a plugin file…" }));
  await waitFor(() => expect(fixture.open).toHaveBeenCalledWith(omdpPicker));
});

it("source prerequisite: download history stays reachable after the last source is removed", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.request.mockImplementation(async (route) =>
    route === "/v2/source-catalog" ? [] : route === "/v2/summary" ? { active_jobs: 0, acquired: 3, following: 0, attention: 0 } : undefined,
  );
  render(App);
  await screen.findByRole("region", { name: "Add a source plugin" });
  await fireEvent.click(await screen.findByRole("button", { name: "Downloaded items 3" }));
  await screen.findByRole("heading", { name: "Downloads", level: 1 });
  expect(screen.getByRole("button", { name: "History" }).getAttribute("aria-pressed")).toBe("true");
});

it("opens podcast episodes with audio download controls and returns to the episode list",async()=>{
 fixture.preferences={...fixture.preferences,onboarding_complete:true};
 fixture.sources=[{manifest:{id:'fixture',name:'Podcast source',version:'1',media_tools:true,capabilities:['browse','collection','releases'],grants:[]}}];
 const show={reference:{provider:'fixture',id:'show'},kind:'playlist',title:'A podcast',description:'Show description',canonical_url:'https://example.org/show',artwork_url:null,summary:{tags:['Podcast'],video_count_label:'1 episode'}};
 const episode={...show,reference:{provider:'fixture',id:'episode'},kind:'item',title:'An episode',summary:{tags:['Podcast'],duration_seconds:1234,published_label:'2026-11-01T12:00:00Z'}};
 const release={reference:episode.reference,collection:show.reference,title:episode.title,position:1,availability:'available',preview:episode,published_at:'2026-11-01T12:00:00Z',language:'en',revision:'1',chapter:null,volume:null,group:null,canonical_url:episode.canonical_url,unavailable_reason:null};
 fixture.operation.mockImplementation(async(_id,input)=>input.operation==='collection'?input.reference.id==='show'?show:episode:input.operation==='releases'?{items:[release],next_cursor:null}:{items:[show],next_cursor:null});
 render(App);await fireEvent.click(await screen.findByRole('button',{name:'Explore'}));await fireEvent.click(await screen.findByRole('button',{name:/A podcast Podcast/}));
 await screen.findByRole('heading',{name:'Episodes'});await fireEvent.click(await screen.findByRole('button',{name:'An episode'}));
 const button=await screen.findByRole('button',{name:'Download episode'});await waitFor(()=>expect(button).not.toBeDisabled());
 expect(screen.queryByRole('heading',{name:'Episodes'})).toBeNull();expect(screen.queryByRole('button',{name:'Download selected'})).toBeNull();
 expect(screen.getByRole('button',{name:'Save as: MP3 audio'})).toBeTruthy();expect(screen.queryByText('Subtitles')).toBeNull();expect(fixture.operation.mock.calls.some(([,input])=>input.operation==='releases'&&input.reference.id==='episode')).toBe(false);
 await fireEvent.click(screen.getByRole('button',{name:'Back to A podcast'}));await screen.findByRole('heading',{name:'Episodes'});expect(screen.getByRole('button',{name:'Order: Newest first'})).toBeTruthy();
});

it("asks before canceling a download and does nothing when the user keeps it", async () => {
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [{ manifest: lanternPlugin() }];
  const job = { id: "j1", state: "queued", title: "Episode 1", destination_id: "existing-destination", bytes_done: 0, bytes_total: 0, issue: null,
    plan: { recipe: "mp3", collection: { title: "Show", reference: { provider: "public.lantern", id: "c" } }, release: { reference: { provider: "public.lantern", id: "r" } } } };
  fixture.jobPage = { items: [job], next_cursor: null };
  fixture.request.mockImplementation(async (route) => route === "/v2/source-catalog" ? [] : undefined);
  render(App);
  await screen.findByRole("heading", { name: "Overview", level: 1 });
  await fireEvent.click(screen.getByRole("button", { name: "Downloads" }));
  await fireEvent.click(await screen.findByRole("button", { name: /^Show:/ }));
  await fireEvent.click(await screen.findByRole("button", { name: "Individual downloads" }));
  const cancel = async () => {
    await fireEvent.click(await screen.findByRole("button", { name: "Actions for Episode 1" }));
    await fireEvent.click(screen.getByRole("button", { name: "Cancel download" }));
    return screen.findByRole("dialog", { name: "Cancel this download?" });
  };
  let dialog = await cancel();
  expect(within(dialog).getByText(/Partly downloaded data will be deleted/)).toBeTruthy();
  await fireEvent.click(within(dialog).getByRole("button", { name: "Keep download" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(fixture.request.mock.calls.some(([route]) => route === "/v2/jobs/j1/cancel")).toBe(false);
  dialog = await cancel();
  await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel download" }));
  await waitFor(() => expect(fixture.request).toHaveBeenCalledWith("/v2/jobs/j1/cancel", { method: "POST" }));
});
it("keeps the spaces around separators in a podcast header and its follow dialog", async () => {
  // Svelte drops whitespace at the edges of {#if} blocks; these strings once rendered as
  // "Podcast· 447 episodes" and "…for new additions.This does not change…".
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [
    {
      manifest: {
        id: "harbor",
        name: "Harbor Radio",
        version: "1",
        capabilities: ["search", "details", "releases"],
        grants: [],
        media_tools: true,
      },
    },
  ];
  const show = {
    reference: { provider: "harbor", id: "lectures" },
    title: "Evening Lectures",
    kind: "playlist",
    canonical_url: "https://harbor-radio.example/lectures",
    artwork_url: null,
    description: null,
    summary: { tags: ["Podcast"], video_count_label: "447 episodes" },
  };
  fixture.operation.mockImplementation(async (_id, input) =>
    input.operation === "collection"
      ? show
      : input.operation === "details"
        ? { reference: show.reference, creators: [], facts: [], tags: [], alternative_titles: {}, languages: [] }
        : { items: input.operation === "search" ? [show] : [], next_cursor: null },
  );
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "lectures" } });
  await fireEvent.click(screen.getAllByRole("button", { name: "Search" }).at(-1)!);
  await fireEvent.click(await screen.findByRole("button", { name: show.title }));
  const header = await waitFor(() => {
    const element = document.querySelector(".podcast-type");
    expect(element).toBeTruthy();
    return element!;
  });
  expect(header.textContent).toBe("Podcast · 447 episodes");
  await fireEvent.click(await screen.findByRole("button", { name: "Follow podcast" }));
  const dialog = await screen.findByRole("dialog", { name: "Follow podcast" });
  expect(within(dialog).getByText(/^OMD checks this/).textContent).toBe(
    "OMD checks this playlist for new additions. This does not change your subscriptions on Harbor Radio.",
  );
});

it("keeps an earlier item's Downloaded marker after another item's download finishes on its own page", async () => {
  localStorage.clear();
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [{ manifest: { id: "fixture", name: "Example Video", version: "1.0.0", media_tools: true, capabilities: ["search", "collection", "releases"], grants: [] } }];
  const ref = (id: string) => ({ provider: "fixture", id });
  const channel = { reference: ref("channel:owner"), kind: "channel", title: "A channel", canonical_url: "https://example.org/channel", artwork_url: null, description: null };
  const videos = [1, 2].map((i) => ({ reference: ref("video:" + i), kind: "item", title: "Channel video " + i, canonical_url: "https://example.org/video/" + i, artwork_url: null, description: null, summary: { duration_seconds: 120 } }));
  const downloaded = new Set(["video:1"]);
  const statusRequests: string[][] = [];
  let holdStatus = false;
  fixture.operation.mockImplementation(async (_provider, input) => {
    if (input.operation === "search") return { items: [channel], next_cursor: null };
    if (input.operation === "collection") return input.reference.id.startsWith("channel:") ? channel : videos.find((v) => v.reference.id === input.reference.id);
    if (input.operation === "releases") {
      const list = input.reference.id.startsWith("channel:") ? videos : videos.filter((v) => v.reference.id === input.reference.id);
      const collection = { provider: input.reference.provider, id: input.reference.id };
      return { items: list.map((v, i) => ({ reference: v.reference, collection, title: v.title, canonical_url: v.canonical_url, availability: "available", position: i, preview: v })), next_cursor: null };
    }
    return { items: [], next_cursor: null };
  });
  fixture.request.mockImplementation(async (route, options) => {
    if (route !== "/v2/acquisitions/status") return undefined;
    const references = options.body.references as { provider: string; id: string }[];
    statusRequests.push(references.map((r) => r.id));
    // Later lookups never answer: what the list shows then is the state the app kept.
    if (holdStatus) return new Promise(() => {});
    return references.map((reference) => ({
      reference,
      acquired_versions: downloaded.has(reference.id) ? 1 : 0,
      last_acquired_at: downloaded.has(reference.id) ? "2026-11-18T00:00:00Z" : null,
      file_state: downloaded.has(reference.id) ? "present" : null,
    }));
  });
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "channel" } });
  await fireEvent.click(screen.getAllByRole("button", { name: "Search" }).at(-1)!);
  await fireEvent.click(await screen.findByRole("button", { name: channel.title }));
  await screen.findByRole("checkbox", { name: "Select Channel video 2" });
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Downloaded" })).toHaveLength(1));
  await fireEvent.click(screen.getByRole("button", { name: "Channel video 2" }));
  await screen.findByRole("heading", { name: "Channel video 2" });
  await screen.findByText("Not downloaded");
  // The second download finishes while its own page is open; only the engine
  // event's status refresh can mark it.
  downloaded.add("video:2");
  statusRequests.length = 0;
  fixture.event({ kind: "jobs.changed" });
  await screen.findByRole("button", { name: "Open files" });
  expect(statusRequests).toContainEqual(["video:2"]);
  holdStatus = true;
  await fireEvent.click(screen.getByRole("button", { name: "Back to A channel" }));
  await screen.findByRole("checkbox", { name: "Select Channel video 1" });
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Downloaded" })).toHaveLength(2));
  // Returning also asks for the list's current state.
  await waitFor(() => expect(statusRequests).toContainEqual(["video:1", "video:2"]));
});

it("opens a source's catalog in Explore from its Sources page", async () => {
  localStorage.clear();
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [
    { manifest: { id: "first", name: "First Source", version: "1", capabilities: ["browse", "search"], grants: [] } },
    { manifest: { id: "second", name: "Second Source", version: "1", description: "A second example catalog", capabilities: ["browse", "search"], grants: [] } },
    { manifest: { id: "lookup", name: "Lookup Source", version: "1", capabilities: ["search"], grants: [] } },
  ];
  fixture.operation.mockImplementation(async (provider, input) =>
    input.operation === "browse"
      ? { items: [{ reference: { provider, id: "item" }, kind: "manga", title: `Catalog item from ${provider}`, canonical_url: "https://example.org/item", artwork_url: null, description: null }], next_cursor: null }
      : { items: [], next_cursor: null },
  );
  // The person's own multi-source search choice.
  localStorage.setItem("omd.search-sources", '["first","lookup"]');
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Sources" }));
  await fireEvent.click(await screen.findByRole("button", { name: /Lookup Source/ }));
  expect(screen.getByRole("button", { name: "Search in Explore" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Browse in Explore" })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "All sources" }));
  await fireEvent.click(await screen.findByRole("button", { name: /Second Source/ }));
  expect(screen.getByText("Sources manages installed plugins. Their catalogs and search are in Explore.")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Browse in Explore" }));
  expect(await screen.findByRole("button", { name: /Catalog item from second/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Explore" }).getAttribute("aria-current")).toBe("page");
  expect(within(screen.getByRole("navigation", { name: "Source catalogs" })).getByRole("button", { name: "Second Source" }).getAttribute("aria-current")).toBe("page");
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  // Browsing is navigation: the saved choice is not replaced by the one source.
  expect(localStorage.getItem("omd.search-sources")).toBe('["first","lookup"]');
  await fireEvent.click(screen.getByRole("button", { name: "Sources" }));
  await fireEvent.click(await screen.findByRole("button", { name: /Lookup Source/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Search in Explore" }));
  await screen.findByRole("searchbox");
  expect(localStorage.getItem("omd.search-sources")).toBe('["first","lookup"]');
});

it("clears a returned search so Explore shows the catalog again", async () => {
  localStorage.clear();
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [{ manifest: { id: "fixture", name: "Example Source", version: "1", capabilities: ["browse", "search"], grants: [] } }];
  const item = (title: string) => ({ reference: { provider: "fixture", id: title }, kind: "manga", title, canonical_url: "https://example.org/item", artwork_url: null, description: null });
  fixture.operation.mockImplementation(async (_provider, input) =>
    input.operation === "browse" ? { items: [item("Catalog entry")], next_cursor: null }
      : input.operation === "search" ? { items: [item("Search match")], next_cursor: null }
      : { items: [], next_cursor: null },
  );
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await screen.findByRole("button", { name: /Catalog entry/ });
  expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  const field = screen.getByRole("searchbox") as HTMLInputElement;
  await fireEvent.input(field, { target: { value: "match" } });
  await fireEvent.click(screen.getAllByRole("button", { name: "Search" }).at(-1)!);
  await screen.findByRole("button", { name: /Search match/ });
  await fireEvent.click(screen.getByRole("button", { name: "Back to search" }));
  // The query stays for refining; one obvious control brings the catalog back.
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("match");
  expect(screen.queryByRole("button", { name: /Catalog entry/ })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  expect(await screen.findByRole("button", { name: /Catalog entry/ })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "again" } });
  await fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  expect(await screen.findByRole("button", { name: /Catalog entry/ })).toBeTruthy();
});

it("hides output choices for an item that needs an account and defaults video to a video format", async () => {
  localStorage.clear();
  // 0.2.1 kept podcast choices in the video record.
  localStorage.setItem("omd.media-options", JSON.stringify({ recipe: "mp3", maxHeight: 720, subtitles: "", automaticSubtitles: false }));
  fixture.preferences = { ...fixture.preferences, onboarding_complete: true };
  fixture.sources = [{ manifest: { id: "fixture", name: "Example Video", version: "1.0.0", media_tools: true, capabilities: ["search", "collection", "releases"], grants: [] } }];
  const video = (id: string, title: string) => ({ reference: { provider: "fixture", id }, kind: "item", title, canonical_url: `https://example.org/${id}`, artwork_url: null, description: null, summary: { duration_seconds: 90 } });
  const open = video("open", "Open video"), locked = video("locked", "Account video");
  const reason = "Connect an Example Video account to use the site's download panel.";
  fixture.operation.mockImplementation(async (_provider, input) => {
    if (input.operation === "search") return { items: [open, locked], next_cursor: null };
    if (input.operation === "collection") return input.reference.id === "open" ? open : locked;
    if (input.operation === "releases") {
      const item = input.reference.id === "open" ? open : locked;
      return { items: [{ reference: item.reference, collection: item.reference, title: item.title, canonical_url: item.canonical_url, position: 0, preview: item, ...(item === open ? { availability: "available" } : { availability: "authentication_required", unavailable_reason: reason }) }], next_cursor: null };
    }
    return { items: [], next_cursor: null };
  });
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Explore" }));
  await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "video" } });
  await fireEvent.click(screen.getAllByRole("button", { name: "Search" }).at(-1)!);
  await fireEvent.click(await screen.findByRole("button", { name: open.title }));
  await screen.findByRole("heading", { name: open.title });
  expect(await screen.findByRole("button", { name: "Save as: MP4 video" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Maximum resolution: 720p" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
  await fireEvent.click(await screen.findByRole("button", { name: locked.title }));
  await screen.findByRole("heading", { name: locked.title });
  await screen.findByText(reason);
  expect(screen.queryByRole("button", { name: /^Save as:/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Destination:/ })).toBeNull();
});

function changedCheck(listed: { id: string; availability?: string }[]) {
  localStorage.clear();
  fixture.preferences.onboarding_complete = true;
  fixture.sources = [{ manifest: { id: "fixture", name: "Example Source", version: "1", capabilities: ["collection", "releases", "resolve"], grants: [] } }];
  // A list the person picked from; the items also belong to another (canonical) collection.
  const reference = { provider: "fixture", id: "reading-list" };
  const chapters = [{ provider: "fixture", id: "chapter-2" }, { provider: "fixture", id: "chapter-5" }];
  const policy = { languages: ["en"], groups: [], max_height: 1080, subtitle_languages: [], automatic_subtitles: false };
  const snapshot = { id: "snapshot-1", kind: "snapshot", state: "ready", processed: 3, total: 3, issue: null, expires_at: "2099-01-01T00:00:00Z", request: { reference, credential_profile: null } };
  const batch = { id: "batch-1", kind: "batch", state: "failed", processed: 0, total: 2, expires_at: "2099-01-01T00:00:00Z",
    issue: { code: "selection_changed", message: "A selected release changed since enumeration. Create a new snapshot and review the new selection.", retryable: false, actions: [] },
    request: { snapshot_id: snapshot.id, releases: chapters, destination_id: "existing-destination", recipe: "cbz", policy } };
  const fresh = { ...snapshot, id: "snapshot-2", created_at: new Date().toISOString(), request: { reference, credential_profile: null, policy } };
  const tasks: any[] = [snapshot, batch];
  localStorage.setItem("omd.download-checks", JSON.stringify({ [batch.id]: { reference, title: "Reading list", destination_id: "existing-destination", recipe: "cbz", policy, selectedReleases: chapters, automatic: false, autoDownload: true } }));
  const release = ({ id, availability = "available" }: { id: string; availability?: string }) =>
    ({ reference: { provider: "fixture", id }, collection: reference, title: id, canonical_url: `https://example.org/${id}`, position: 0, language: "en", availability });
  fixture.request.mockImplementation(async (route, options) => {
    if (route.startsWith("/v2/selections?")) return { items: tasks, next_cursor: null };
    if (route.startsWith("/v2/selections/")) return tasks.find((t) => route.endsWith(t.id));
    if (route === "/v2/snapshots" && options?.method === "POST") { tasks.push(fresh); return fresh; }
    if (route.startsWith(`/v2/snapshots/${fresh.id}/releases`)) return { items: listed.map(release), next_cursor: null };
    if (route === "/v2/batches" && options?.method === "POST") {
      const next = { id: "batch-2", kind: "batch", state: "working", processed: 0, total: options.body.releases.length, issue: null, expires_at: null, request: options.body };
      tasks.push(next);
      return next;
    }
    if (options?.method === "POST" && route !== "/v2/acquisitions/status" && route !== "/v2/jobs/matching") throw new Error(`Unexpected mutation: ${route}`);
  });
  return { reference, chapters, policy, batch, fresh };
}
async function refreshChangedCheck() {
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Downloads" }));
  const row = (await screen.findByText("A selected item changed on the source since it was listed. Refresh and try again.")).closest(".check-row") as HTMLElement;
  expect(screen.queryByText(/enumeration/)).toBeNull();
  // The failure toast leads to the same action.
  expect(screen.getByText(/Download check needs attention: Reading list\. A selected item changed/)).toBeTruthy();
  await fireEvent.click(within(row).getByRole("button", { name: "Refresh" }));
}
const posts = (route: string) => fixture.request.mock.calls.filter(([r, o]) => r === route && o?.method === "POST").map(([, o]) => o.body);

it("refreshes a check whose items changed by listing the same collection again and batching only those items", async () => {
  const { reference, chapters, policy, batch, fresh } = changedCheck([{ id: "chapter-1" }, { id: "chapter-2" }, { id: "chapter-5" }]);
  await refreshChangedCheck();
  await waitFor(() => expect(posts("/v2/batches")).toHaveLength(1));
  // The selection's own collection is listed afresh, never resolved per item.
  expect(posts("/v2/snapshots")).toEqual([{ reference, credential_profile: null, policy }]);
  expect(posts("/v2/batches")[0]).toEqual({ snapshot_id: fresh.id, releases: chapters, destination_id: "existing-destination", recipe: "cbz", policy });
  expect(posts("/v2/preparations")).toEqual([]);
  expect(JSON.parse(localStorage.getItem("omd.dismissed-checks")!)).toContain(batch.id);
  expect(screen.queryByText(/no longer in/)).toBeNull();
});

it("tells the person which refreshed items left the collection and batches the rest", async () => {
  const { chapters, fresh } = changedCheck([{ id: "chapter-1" }, { id: "chapter-5" }]);
  await refreshChangedCheck();
  await waitFor(() => expect(posts("/v2/batches")).toHaveLength(1));
  expect(posts("/v2/batches")[0]).toMatchObject({ snapshot_id: fresh.id, releases: [chapters[1]] });
  const leftOut = "1 selected item is no longer in Reading list. It was left out; the other item is being checked.";
  // The check's own toast and row say what was left out.
  expect(await screen.findByText(`Preparing downloads: Reading list. ${leftOut}`)).toBeTruthy();
  expect(JSON.parse(localStorage.getItem("omd.download-checks")!)["batch-2"]).toMatchObject({ leftOut, selectedReleases: [chapters[1]] });
  expect(posts("/v2/preparations")).toEqual([]);
});

it("reports a refreshed selection whose items all left the collection instead of batching", async () => {
  changedCheck([{ id: "chapter-1" }, { id: "chapter-5", availability: "authentication_required" }]);
  await refreshChangedCheck();
  const gone = "1 selected item is no longer in Reading list, and 1 can’t be downloaded right now. Nothing from this selection can be downloaded now. Open Reading list to choose again.";
  expect(await screen.findByText(`Download check needs attention: Reading list. ${gone}`)).toBeTruthy();
  // The listed check stays on Downloads with the explanation, for choosing again.
  const row = screen.getByText(gone).closest(".check-row") as HTMLElement;
  expect(within(row).getByRole("button", { name: "Choose chapters" })).toBeTruthy();
  expect(posts("/v2/batches")).toEqual([]);
  expect(posts("/v2/preparations")).toEqual([]);
  const saved = JSON.parse(localStorage.getItem("omd.download-checks")!)["snapshot-2"];
  expect(saved).toMatchObject({ automatic: false, reconcile: false });
  expect(saved.selectedReleases).toBeUndefined();
});