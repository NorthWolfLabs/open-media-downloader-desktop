import { it, expect, vi } from "vitest";
import { sectionPage, cachedSectionPage } from "./sectionCache";
import type { EngineClient } from "./client";
it("restores visited pages and separates accounts, order and source versions", async () => {
  const operation = vi.fn(async (_p: string, r: any) => ({
    items: [r.cursor ?? "first"],
    next_cursor: r.cursor ? null : "next",
  }));
  const client = { operation } as unknown as EngineClient;
  const request = {
    operation: "releases",
    reference: { provider: "p", id: "title" },
    cursor: null,
    release_order: "asc" as const,
  };
  await sectionPage(client, "p", request, "1");
  await sectionPage(client, "p", { ...request, cursor: "next" }, "1");
  const restored = await sectionPage(client, "p", request, "1");
  expect(restored.items).toEqual(["first", "next"]);
  expect(operation).toHaveBeenCalledTimes(2);
  await sectionPage(
    client,
    "p",
    { ...request, credential_profile: "private" },
    "1",
  );
  await sectionPage(client, "p", { ...request, release_order: "desc" }, "1");
  await sectionPage(client, "p", request, "2");
  expect(operation).toHaveBeenCalledTimes(5);
});
it("evicts failed reads and retains only a bounded number of titles", async () => {
  const operation = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ items: [], next_cursor: null });
  const client = { operation } as unknown as EngineClient;
  const req = {
    operation: "artwork",
    reference: { provider: "p", id: "first" },
  };
  await expect(sectionPage(client, "p", req)).rejects.toThrow("offline");
  await sectionPage(client, "p", req);
  for (let i = 0; i < 24; i++)
    await sectionPage(client, "p", {
      ...req,
      reference: { provider: "p", id: String(i) },
    });
  await sectionPage(client, "p", req);
  expect(operation).toHaveBeenCalledTimes(27);
});

it("keeps the last successful snapshot across a failed refresh and allows retry",async()=>{
 const operation=vi.fn().mockResolvedValueOnce({items:['known'],next_cursor:null}).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({items:['updated'],next_cursor:null});const client={operation} as unknown as EngineClient;const request={operation:'browse',query:'',cursor:null};
 await sectionPage(client,'p',request);await expect(sectionPage(client,'p',request,'',{refresh:true})).rejects.toThrow('offline');expect(cachedSectionPage(client,'p',request)?.items).toEqual(['known']);
 expect((await sectionPage(client,'p',request)).items).toEqual(['updated']);
});
