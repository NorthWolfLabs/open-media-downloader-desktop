import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/svelte";
import { preferredSystemLanguage, availableLanguageOptions } from "./languages";
import { mergeSourcePages } from "./discoveryState";
import InfiniteHarness from "./InfiniteHarness.svelte";
import { intersectionFixture } from "./intersectionFixture";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("seeds a regional OS language, falls back to its base, and never guesses English", () => {
  expect(preferredSystemLanguage(["pt-BR", "en-US"])).toBe("pt-br");
  expect(preferredSystemLanguage(["de-AT", "en-US"])).toBe("de");
  expect(preferredSystemLanguage(["xx-YY"])).toBe("");
  expect(
    availableLanguageOptions(["ja", "de", "ja"])
      .map((o) => o.id)
      .sort(),
  ).toEqual(["de", "ja"]);
});
it("balances provider results without conflating matching titles or changing provider ranking", () => {
  const item = (provider: string, id: string) =>
    ({ reference: { provider, id }, title: "Same title" }) as any;
  const result = mergeSourcePages(
    [],
    [
      {
        provider: "a",
        items: [item("a", "1"), item("a", "2"), item("a", "3")],
      },
      { provider: "b", items: [item("b", "1"), item("b", "2")] },
    ],
  );
  expect(result.map((i) => i.reference.provider + i.reference.id)).toEqual([
    "a1",
    "b1",
    "a2",
    "b2",
    "a3",
  ]);
  expect(
    mergeSourcePages(result, [
      { provider: "a", items: [item("a", "1"), item("a", "4")] },
    ]),
  ).toHaveLength(6);
});
it("prefetches serially, advances its cursor, and does not duplicate overlapping triggers", async () => {
  const intersect = intersectionFixture();
  let resolve!: (value: string | null) => void;
  const request = vi.fn(() => new Promise<string | null>((r) => (resolve = r)));
  render(InfiniteHarness, { request });
  intersect();
  intersect();
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  resolve("second");
  await waitFor(() =>
    expect(
      document.querySelector(".continuation")?.getAttribute("aria-busy"),
    ).toBe("false"),
  );
  intersect();
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1]).toEqual(["second"]);
  resolve(null);
});
it("stops failed prefetch loops and offers an explicit retry", async () => {
  const intersect = intersectionFixture(),
    request = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue(null);
  render(InfiniteHarness, { request });
  intersect();
  await screen.findByRole("alert");
  intersect();
  expect(request).toHaveBeenCalledTimes(1);
  await fireEvent.click(
    screen.getByRole("button", { name: "Retry loading test items" }),
  );
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
});
