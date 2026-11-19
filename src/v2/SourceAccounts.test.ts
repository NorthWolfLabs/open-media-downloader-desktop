import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import SourceAccounts from "./SourceAccounts.svelte";
vi.mock("@tauri-apps/api/core", () => ({invoke: vi.fn(async () => ({executable:"/OMD/yt-dlp",output:"/Downloads/omd-cookies-test.txt",windows:false}))}));
afterEach(cleanup);
it("opens browser sign-in without showing credential or account-name fields", async () => {
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
  let finish!: (v: unknown) => void;
  const post = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const source = {
    id: "org.example.source",
    name: "Example",
    grants: [{ credential: true, hosts: ["media.example.org"] }],
    sign_in: { url: "https://login.example.org" },
  };
  render(SourceAccounts, {
    client: {
      request: async () => ({ ready: false }),
      api: {
        GET: async () => ({ data: { items: [], next_cursor: null } }),
        POST: post,
      },
    } as any,
    source: source as any,
    lease: "lease",
    onclose: vi.fn(),
    onchange: vi.fn(),
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Connect account" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "Connect account" }),
  );
  expect(screen.queryByLabelText("Account name")).toBeNull();
  expect(screen.getByText("Opening sign-in in the browser…")).toBeTruthy();
  expect(post).toHaveBeenCalledOnce();
  finish({
    data: {
      id: "signin",
      source_id: "org.example.source",
      profile: "profile",
      label: "Example account 1",
      expires_at: "2030-01-01",
    },
  });
  await screen.findByText("Waiting for you to finish signing in…");
  expect(
    screen.queryByRole("button", { name: "Save connected account" }),
  ).toBeNull();
  expect(document.querySelector("input")).toBeNull();
});

function cookieFixture(mode: string | null = "cookies", put?: ReturnType<typeof vi.fn>) {
  let accounts: any[] = [];
  const PUT = put ?? vi.fn(async (_route: string, request: any) => {
    accounts = [{profile:request.params.path.profile,label:request.body.label,issue:null}];
    return {data:{saved:true}};
  });
  const operation = vi.fn();
  const POST = vi.fn();
  const changed = vi.fn();
  const view=render(SourceAccounts, {client:{operation,api:{GET:async()=>({data:{items:accounts}}),PUT,POST}} as any,
    source:{id:"org.example.source",name:"Example",...(mode ? {account_mode:mode,sign_in:{url:"https://login.example.org",completion_cookies:["required_by_browser"]}} : {}),media_tools:true,grants:[{credential:true,hosts:["example.org"]}]} as any,
    lease:"lease",onclose:vi.fn(),onchange:changed});
  return {PUT,POST,changed,operation,view};
}
async function openImport() {
  await waitFor(()=>expect(screen.getByRole("button",{name:"Connect account"})).not.toBeDisabled());
  await fireEvent.click(screen.getByRole("button",{name:"Connect account"}));
}
async function chooseCookies(text=".example.org\tTRUE\t/\tTRUE\t0\tsession\tFIXTURE\n.unrelated.example.org\tTRUE\t/\tTRUE\t0\tother\tUNRELATED") {
  await fireEvent.change(screen.getByLabelText("Cookie file"),{target:{files:[{size:text.length,text:async()=>text}]}});
  await fireEvent.submit(screen.getByLabelText("Account name").closest("form")!);
}
it("uses the declared cookie preference without opening a browser", async()=>{
  const {POST}=cookieFixture();await openImport();
  expect(screen.getByLabelText("Cookie file")).toBeTruthy();
  expect(screen.getByRole("button", {name:"Create one…"})).toBeTruthy();
  expect(screen.getByRole("button",{name:"Import credentials"})).toBeDisabled();
  expect(POST).not.toHaveBeenCalled();
});
it("imports only exact granted domains and never treats import or browse as authentication",async()=>{
  let captured: any;
  const put=vi.fn(async (_route, request)=>{captured=structuredClone(request);return {data:{saved:true}}});
  const {changed,operation}=cookieFixture("cookies",put);await openImport();await chooseCookies();
  await screen.findByText("Account saved. OMD will check it the next time it’s used.");
  expect(captured.body.session.cookies).toEqual([expect.objectContaining({domain:"example.org",name:"session"})]);
  expect(changed).toHaveBeenCalledWith();
  expect(operation).not.toHaveBeenCalled();
});
it("does not require browser completion cookie names for unverified imports",async()=>{
  const {PUT,operation}=cookieFixture();await openImport();await chooseCookies("example.org\tFALSE\t/\tTRUE\t0\tpreference\tFIXTURE");
  await screen.findByText("Account saved. OMD will check it the next time it’s used.");
  expect(PUT).toHaveBeenCalledOnce();expect(operation).not.toHaveBeenCalled();
  expect(screen.getByText("Saved. OMD will check it the next time it’s used.")).toBeVisible();
});
it("keeps save failure actionable without claiming verification",async()=>{
  const {changed}=cookieFixture("cookies",vi.fn().mockRejectedValue(new Error("Synthetic store failure")));
  await openImport();await chooseCookies();await screen.findByText("Synthetic store failure");
  expect(changed).not.toHaveBeenCalled();
  expect(screen.queryByText(/Connection verified/)).toBeNull();
});
it("ignores an import finishing after unmount",async()=>{
  let resolve!:(value:any)=>void;
  const put=vi.fn(()=>new Promise(r=>resolve=r));
  const {view,changed}=cookieFixture("cookies",put);await openImport();await chooseCookies();
  await waitFor(()=>expect(put).toHaveBeenCalledOnce());view.unmount();resolve({data:{saved:true}});
  await new Promise(r=>setTimeout(r,0));expect(changed).not.toHaveBeenCalled();
});
it("defaults legacy manifests to header import regardless of media tools",async()=>{
  cookieFixture(null);await openImport();
  expect(screen.getByLabelText("API key or token")).toBeVisible();
  expect(screen.queryByLabelText("Cookie file")).toBeNull();
});

it("publishes the connected profile only after verified sign-in completes", async () => {
  const source = {
    id: "org.example.source",
    name: "Example",
    grants: [{ credential: true, hosts: ["media.example.org"] }],
    sign_in: { url: "https://login.example.org" },
  };
  const changed = vi.fn();
  const POST = vi.fn(async (route: string) =>
    route === "/v2/sources/{id}/sign-ins"
      ? {
          data: {
            id: "signin",
            source_id: "org.example.source",
            profile: "connected-profile",
            label: "Example account 1",
            expires_at: "2030-01-01",
          },
        }
      : { data: { profile: "connected-profile" } },
  );
  render(SourceAccounts, {
    client: {
      request: async () => ({ ready: true }),
      api: {
        GET: async () => ({ data: { items: [], next_cursor: null } }),
        POST,
      },
    } as any,
    source: source as any,
    lease: "lease",
    onclose: vi.fn(),
    onchange: changed,
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Connect account" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "Connect account" }),
  );
  await waitFor(() =>
    expect(changed).toHaveBeenCalledWith("connected-profile"),
  );
  expect(POST).toHaveBeenCalledWith("/v2/sources/{id}/sign-ins", {
    params: { path: { id: "org.example.source" } },
    body: expect.objectContaining({ client: "lease", window: "native" }),
  });
  expect(POST).toHaveBeenCalledWith("/v2/sign-ins/{id}/complete", {
    params: { path: { id: "signin" } },
    body: { client: "lease" },
  });
});

it("cancels completion immediately while browser cleanup is still pending", async () => {
  let complete!: (value: any) => void, close!: (value: any) => void;
  const changed = vi.fn();
  const POST = vi.fn((route: string) => {
    if (route.endsWith("/sign-ins")) return Promise.resolve({data:{id:"signin",profile:"saved-profile",expires_at:"2030-01-01"}});
    if (route.endsWith("/complete")) return new Promise(resolve => complete=resolve);
    if (route.endsWith("/close")) return new Promise(resolve => close=resolve);
    throw new Error("Unexpected fixture route");
  });
  render(SourceAccounts,{client:{request:async()=>({ready:true}),api:{GET:async()=>({data:{items:[]}}),POST}} as any,
    source:{id:"org.example.source",name:"Example",account_mode:"browser",sign_in:{url:"https://login.example.org"},grants:[{credential:true,hosts:["example.org"]}]} as any,
    lease:"lease",onclose:vi.fn(),onchange:changed});
  await openImport();
  await waitFor(()=>expect(complete).toBeTypeOf("function"));
  await fireEvent.click(screen.getByRole("button",{name:"Close dialog"}));
  await waitFor(()=>expect(close).toBeTypeOf("function"));
  complete({data:{profile:"saved-profile"}});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(changed).not.toHaveBeenCalled();
  close({data:{closed:true}});
  await screen.findByRole("button",{name:"Connect account"});
  expect(changed).not.toHaveBeenCalled();
});

it("allows a browser-preferred source to fall back to imported credentials", async () => {
  const POST=vi.fn(async (route:string)=>route.endsWith("/sign-ins")
    ? {data:{id:"signin",profile:"new-profile",expires_at:"2030-01-01"}} : {data:{closed:true}});
  render(SourceAccounts,{client:{request:async()=>({ready:false}),api:{GET:async()=>({data:{items:[]}}),POST}} as any,
    source:{id:"org.example.source",name:"Example",account_mode:"browser",sign_in:{url:"https://login.example.org"},grants:[{credential:true,hosts:["example.org"]}]} as any,
    lease:"lease",onclose:vi.fn(),onchange:vi.fn()});
  await openImport();
  await fireEvent.click(await screen.findByRole("button",{name:"Change connection method"}));
  expect(await screen.findByLabelText("API key or token")).toBeVisible();
  expect(POST).toHaveBeenCalledWith("/v2/sign-ins/{id}/close",expect.objectContaining({params:{path:{id:"signin"}}}));
  expect(screen.getByLabelText("Account name")).toHaveValue("Example account 1");
});

it("retains canceled session cleanup for retry after a close failure", async () => {
  let attempts=0;
  const POST=vi.fn(async (route:string)=>{
    if(route.endsWith("/sign-ins")) return {data:{id:"signin",profile:"new-profile",expires_at:"2030-01-01"}};
    if(++attempts===1) throw new Error("Synthetic close failure");
    return {data:{closed:true}};
  });
  const changed=vi.fn();
  render(SourceAccounts,{client:{request:async()=>({ready:false}),api:{GET:async()=>({data:{items:[]}}),POST}} as any,
    source:{id:"org.example.source",name:"Example",sign_in:{url:"https://login.example.org"},grants:[{credential:true,hosts:["example.org"]}]} as any,
    lease:"lease",onclose:vi.fn(),onchange:changed});
  await openImport();
  await screen.findByText("Waiting for you to finish signing in…");
  await fireEvent.click(screen.getByRole("button",{name:"Close dialog"}));
  await screen.findByText("Synthetic close failure");
  expect(screen.queryByText("Waiting for you to finish signing in…")).toBeNull();
  await fireEvent.click(screen.getByRole("button",{name:"Retry closing sign-in"}));
  await screen.findByRole("button",{name:"Connect account"});
  expect(attempts).toBe(2);expect(changed).not.toHaveBeenCalled();
});

it("preserves the existing account when changing its connection method", async () => {
  const POST=vi.fn(async (route:string)=>route.endsWith("/sign-ins")
    ? {data:{id:"signin",profile:"existing-profile",expires_at:"2030-01-01"}} : {data:{closed:true}});
  let captured: any;
  const PUT=vi.fn(async (_route,request)=>{captured=structuredClone(request);return {data:{saved:true}}});
  render(SourceAccounts,{client:{request:async()=>({ready:false}),api:{GET:async()=>({data:{items:[{profile:"existing-profile",label:"Saved example",issue:null}]}}),POST,PUT}} as any,
    source:{id:"org.example.source",name:"Example",sign_in:{url:"https://login.example.org"},grants:[{credential:true,hosts:["example.org"]}]} as any,
    lease:"lease",onclose:vi.fn(),onchange:vi.fn()});
  await fireEvent.click(await screen.findByRole("button",{name:"Sign in again for Saved example"}));
  await fireEvent.click(await screen.findByRole("button",{name:"Change connection method"}));
  await fireEvent.input(await screen.findByLabelText("API key or token"),{target:{value:"SYNTHETIC"}});
  await fireEvent.submit(screen.getByLabelText("Account name").closest("form")!);
  await screen.findByText("Account saved. OMD will check it the next time it’s used.");
  expect(captured.params.path).toEqual({id:"org.example.source",profile:"existing-profile"});
  expect(captured.body.label).toBe("Saved example");
});

function headerAccountFixture(hosts: string[]) {
  render(SourceAccounts,{client:{api:{GET:async()=>({data:{items:[],next_cursor:null}})}} as any,
    source:{id:"org.example.source",name:"Example",account_mode:"header",grants:[{credential:true,hosts}]} as any,
    lease:"lease",onclose:vi.fn(),onchange:vi.fn()});
}
async function toggleAdvanced(disclosure: HTMLDetailsElement) {
  // A person clicking the summary: the element flips `open` and fires `toggle`.
  disclosure.open = !disclosure.open;
  await fireEvent(disclosure, new Event("toggle"));
}
it("keeps Advanced open while the origin is typed, cleared and entered again when no origin can be prefilled", async()=>{
  // From the review's reproduction: wildcard-only credential hosts give no exact origin.
  headerAccountFixture(["*.example.org"]);await openImport();
  const input=screen.getByLabelText("HTTPS origin") as HTMLInputElement;
  const disclosure=input.closest("details")!;
  expect(input.value).toBe("");
  expect(disclosure.open).toBe(true);expect(input).toBeVisible();
  await fireEvent.input(input,{target:{value:"h"}});
  expect(disclosure.open).toBe(true);expect(input).toBeVisible();
  await fireEvent.input(input,{target:{value:"https://api.example.org"}});
  expect(disclosure.open).toBe(true);
  await fireEvent.input(input,{target:{value:""}});
  expect(disclosure.open).toBe(true);
  await fireEvent.input(input,{target:{value:"h"}});
  expect(disclosure.open).toBe(true);expect(input).toBeVisible();
  expect(input.value).toBe("h");
});
it("starts Advanced closed with a prefilled origin and leaves it as the person sets it while editing", async()=>{
  headerAccountFixture(["*.cdn.example.org","media.example.org"]);await openImport();
  const input=screen.getByLabelText("HTTPS origin") as HTMLInputElement;
  const disclosure=input.closest("details")!;
  expect(input.value).toBe("https://media.example.org");
  expect(disclosure.open).toBe(false);expect(input).not.toBeVisible();
  await toggleAdvanced(disclosure);
  expect(disclosure.open).toBe(true);
  await fireEvent.input(input,{target:{value:""}});
  expect(disclosure.open).toBe(true);
  await fireEvent.input(input,{target:{value:"h"}});
  expect(disclosure.open).toBe(true);expect(input).toBeVisible();
  await fireEvent.input(input,{target:{value:"https://api.example.org"}});
  expect(disclosure.open).toBe(true);
  await toggleAdvanced(disclosure);
  expect(disclosure.open).toBe(false);
  await fireEvent.input(input,{target:{value:"https://media.example.org"}});
  expect(disclosure.open).toBe(false);
});
it("reopens Advanced when the API key method is chosen again with no origin", async()=>{
  headerAccountFixture(["*.example.org"]);await openImport();
  const disclosure=screen.getByLabelText("HTTPS origin").closest("details")!;
  await toggleAdvanced(disclosure);
  expect(disclosure.open).toBe(false);
  await fireEvent.click(screen.getByRole("button",{name:"Connection method: API key (advanced)"}));
  await fireEvent.click(await screen.findByRole("button",{name:"Import a cookie export"}));
  expect(screen.queryByLabelText("HTTPS origin")).toBeNull();
  await fireEvent.click(screen.getByRole("button",{name:"Connection method: Import a cookie export"}));
  await fireEvent.click(await screen.findByRole("button",{name:"API key (advanced)"}));
  const input=screen.getByLabelText("HTTPS origin");
  expect(input.closest("details")!.open).toBe(true);expect(input).toBeVisible();
});
