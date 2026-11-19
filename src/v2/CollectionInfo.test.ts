import { intersectionFixture } from "./intersectionFixture";
import { afterEach, expect, it, vi } from "vitest";
import {
  render,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/svelte";
import CollectionInfo from "./CollectionInfoHarness.svelte";
afterEach(cleanup);
const collection = {
  reference: { provider: "fixture", id: "series" },
  title: "Fixture",
  kind: "manga",
  canonical_url: "https://example.org/series",
  description: "Description",
  artwork_url: null,
};
const manifest = {
  id: "fixture",
  capabilities: ["details", "artwork", "recommendations"],
};
const details = {
  reference: collection.reference,
  description: "Full description",
  languages: ["en", "vi"],
  creators: [],
  facts: [],
  tags: [],
  alternative_titles: {},
  recommendation_basis: "Shared genres",
};
it("keeps identity information visible while switching chapter and artwork views and loads the full available-language set", async () => {
  const onlanguages = vi.fn(),
    operation = vi.fn(async (_id: string, input: any) =>
      input.operation === "details"
        ? details
        : { items: [], next_cursor: null },
    );
  render(CollectionInfo, {
    client: { operation } as any,
    collection: collection as any,
    manifest: manifest as any,
    oncollection: vi.fn(),
    onlanguages,
  });
  await waitFor(() => expect(onlanguages).toHaveBeenCalledWith(["en", "vi"]));
  expect(screen.getByTestId("releases")).toBeTruthy();
  expect(screen.getByText("Full description")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Artwork" }));
  await screen.findByText("No additional artwork");
  expect(screen.getByText("Full description")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Chapters" }));
  expect(screen.getByTestId("releases")).toBeTruthy();
});
it("obtains languages from every unfiltered release page for a source without detail metadata", async () => {
  const onlanguages = vi.fn(),
    operation = vi.fn(async (_id: string, input: any) => ({
      items: [{ language: input.cursor ? "vi" : "en" }],
      next_cursor: input.cursor ? null : "second",
    }));
  render(CollectionInfo, {
    client: { operation } as any,
    collection: collection as any,
    manifest: { ...manifest, capabilities: ["releases"] } as any,
    oncollection: vi.fn(),
    onlanguages,
  });
  await waitFor(() => expect(onlanguages).toHaveBeenCalledWith(["en", "vi"]));
  expect(operation).toHaveBeenCalledTimes(2);
  expect(operation.mock.calls[1][1]).toMatchObject({
    cursor: "second",
    policy: { languages: [] },
  });
});

it("shows the first artwork page while details and later cover pages remain pending", async () => {
  const intersect=intersectionFixture();
  let finish!: (v: unknown) => void;
  const operation = vi.fn(async (_id: string, input: any) => {
    if (input.operation === "details")
      return new Promise((resolve) => (finish = resolve));
    return {
      items: [
        {
          id: input.cursor ? "second" : "first",
          label: input.cursor ? "Volume 2" : "Volume 1",
          url: "https://example.org/cover.jpg",
          locale: input.cursor ? "fr" : "ja",
        },
      ],
      next_cursor: input.cursor ? null : "next",
    };
  });
  render(CollectionInfo, {
    client: {
      operation,
      artwork: vi.fn().mockRejectedValue(new Error("offline")),
    } as any,
    collection: collection as any,
    manifest: manifest as any,
    oncollection: vi.fn(),
    onlanguages: vi.fn(),
  });
  await fireEvent.click(screen.getByRole("button", { name: "Artwork" }));
  await screen.findByText("Volume 1");
  expect(screen.queryByText("Volume 2")).toBeNull();
  intersect();
  await screen.findByText("Volume 2");
  await fireEvent.click(
    screen.getByRole("button", { name: "Cover language: All languages" }),
  );
  await fireEvent.click(screen.getByRole("button", { name: "French" }));
  expect(screen.queryByText("Volume 1")).toBeNull();
  expect(screen.getByText("Volume 2")).toBeTruthy();
  finish(details);
});

it("loads sections independently and retains successful empty results across tab changes", async () => {
  let failArtwork!: (e: Error) => void;
  const operation = vi.fn(async (_id: string, input: any) => {
    if (input.operation === "details") return details;
    if (input.operation === "artwork")
      return new Promise((_resolve, reject) => {
        failArtwork = reject;
      });
    return { items: [], next_cursor: null };
  });
  render(CollectionInfo, {
    client: { operation } as any,
    collection: collection as any,
    manifest: {
      ...manifest,
      capabilities: [...manifest.capabilities, "related"],
    } as any,
    oncollection: vi.fn(),
    onlanguages: vi.fn(),
  });
  await fireEvent.click(screen.getByRole("button", { name: "Artwork" }));
  await fireEvent.click(screen.getByRole("button", { name: "Related titles" }));
  await screen.findByText("No related titles");
  expect(screen.queryByRole("group", {name:"Result layout"})).toBeNull();
  failArtwork(new Error("Covers unavailable"));
  await fireEvent.click(screen.getByRole("button", { name: "Chapters" }));
  await fireEvent.click(screen.getByRole("button", { name: "Related titles" }));
  expect(
    operation.mock.calls.filter(([, input]) => input.operation === "related"),
  ).toHaveLength(1);
  expect(screen.queryByText("Covers unavailable")).toBeNull();
});
