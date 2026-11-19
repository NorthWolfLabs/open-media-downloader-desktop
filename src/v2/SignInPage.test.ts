import { afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import SignInPage from "./SignInPage.svelte";
import type { EngineClient } from "./client";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("waits for verified browser authentication and automatically saves without app credential fields", async () => {
  let resolve!: (status: { ready: boolean }) => void;
  const request = vi.fn(() => new Promise((r) => (resolve = r)));
  const POST = vi.fn(async () => ({ data: { profile: "account" } }));
  const saved = vi.fn();
  const view = render(SignInPage, {
    client: { request, api: { POST } } as unknown as EngineClient,
    lease: "lease",
    session: {
      id: "sign",
      source_id: "org.example.source",
      profile: "account",
      label: "Account",
      window: "native",
      expires_at: "2030-01-01T00:00:00Z",
    },
    startUrl: "https://login.example.org",
    onsaved: saved,
  });
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(document.querySelector("input[type=password]")).toBeNull();
  await view.component.save();
  expect(POST).not.toHaveBeenCalled();
  resolve({ ready: true });
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(POST).toHaveBeenCalledWith("/v2/sign-ins/{id}/complete", {
    params: { path: { id: "sign" } },
    body: { client: "lease" },
  });
});

it("can retry an interrupted readiness check without exposing a premature save action", async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error("Connection interrupted"))
    .mockResolvedValue({ ready: true });
  const POST = vi.fn(async () => ({ data: { profile: "account" } })),
    saved = vi.fn();
  render(SignInPage, {
    client: { request, api: { POST } } as unknown as EngineClient,
    lease: "lease",
    session: {
      id: "sign",
      source_id: "org.example.source",
      profile: "account",
      label: "Account",
      window: "native",
      expires_at: "2030-01-01T00:00:00Z",
    },
    onsaved: saved,
  });
  await fireEvent.click(
    await screen.findByRole("button", { name: "Retry connection check" }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(POST).toHaveBeenCalledOnce();
});

it("never saves or reports connection after a late readiness result on close", async () => {
  let resolve!: (value: {ready: boolean}) => void;
  const POST = vi.fn(), saved = vi.fn();
  const view = render(SignInPage, {client:{request:()=>new Promise(r=>resolve=r),api:{POST}} as any,
    lease:"lease",session:{id:"sign",source_id:"org.example.source",profile:"account",label:"Example",window:"native",expires_at:"2030-01-01"},onsaved:saved});
  view.unmount();resolve({ready:true});await new Promise(r=>setTimeout(r,0));
  expect(POST).not.toHaveBeenCalled();expect(saved).not.toHaveBeenCalled();
});
it("ignores late completion after close", async () => {
  let resolve!: (value: any) => void;
  const POST = vi.fn(()=>new Promise(r=>resolve=r)), saved=vi.fn();
  const view=render(SignInPage,{client:{request:async()=>({ready:true}),api:{POST}} as any,
    lease:"lease",session:{id:"sign",source_id:"org.example.source",profile:"account",label:"Example",window:"native",expires_at:"2030-01-01"},onsaved:saved});
  await waitFor(()=>expect(POST).toHaveBeenCalledOnce());view.unmount();resolve({data:{profile:"account"}});
  await new Promise(r=>setTimeout(r,0));expect(saved).not.toHaveBeenCalled();
});
it("reports an explicit completion failure without publishing a connected profile", async () => {
  const saved=vi.fn();
  render(SignInPage,{client:{request:async()=>({ready:true}),api:{POST:async()=>{throw new Error("Synthetic completion rejected")}}} as any,
    lease:"lease",session:{id:"sign",source_id:"org.example.source",profile:"account",label:"Example",window:"native",expires_at:"2030-01-01"},onsaved:saved});
  await screen.findByText("Connection needs attention.");expect(saved).not.toHaveBeenCalled();
});
