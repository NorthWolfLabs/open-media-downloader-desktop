import { afterEach, describe, expect, it } from "vitest";
import { appLocale, bcp47, safeLocale } from "./locale";

afterEach(() => {
  // Drop the own property so jsdom's Navigator getter applies again.
  delete (navigator as { language?: string }).language;
});

function reportLocale(locale: string) {
  Object.defineProperty(navigator, "language", { value: locale, configurable: true });
}

describe("safeLocale", () => {
  it.each([
    ["C", "en"],
    ["POSIX", "en"],
    ["en_US", "en-US"],
    ["de_DE", "de-DE"],
    ["de_DE.UTF-8", "de-DE"],
    ["sr_RS@latin", "sr-RS"],
    ["C.UTF-8", "en"],
    ["", "en"],
    ["de-DE", "de-DE"],
    ["en-us", "en-US"],
  ])("turns %j into %j", (input, expected) => {
    expect(safeLocale(input)).toBe(expected);
  });

  it("uses the first candidate Intl accepts and English when none is valid", () => {
    expect(safeLocale(undefined, null, "C", "fr-CA", "de")).toBe("fr-CA");
    expect(safeLocale()).toBe("en");
    expect(safeLocale("C.UTF-8", "POSIX")).toBe("en");
  });

  // Every Intl constructor the UI uses must accept the result.
  it.each(["C", "POSIX", "en_US", "de_DE.UTF-8", "", "de-DE"])("gives a locale every Intl formatter accepts for %j", (input) => {
    const locale = safeLocale(input);
    expect(() => {
      new Intl.DisplayNames([locale], { type: "language" });
      new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(0);
      new Intl.NumberFormat(locale, { notation: "compact" }).format(1234);
      new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-1, "day");
      new Intl.Collator(locale, { numeric: true, sensitivity: "base" }).compare("a", "b");
      new Intl.PluralRules(locale).select(1);
      (1234).toLocaleString(locale);
      new Date(0).toLocaleTimeString(locale);
    }).not.toThrow();
  });
});

describe("bcp47", () => {
  it("turns POSIX locale names into BCP 47 tags and leaves tags alone", () => {
    expect(bcp47("de_DE.UTF-8")).toBe("de-DE");
    expect(bcp47("ca_ES@valencia")).toBe("ca-ES");
    expect(bcp47("C.UTF-8")).toBe("C");
    expect(bcp47("zh-Hant-TW")).toBe("zh-Hant-TW");
  });
});

describe("appLocale", () => {
  it.each([
    ["C", "en"],
    ["POSIX", "en"],
    ["", "en"],
    ["en_US", "en-US"],
    ["de_DE.UTF-8", "de-DE"],
    ["de-DE", "de-DE"],
  ])("reads navigator.language %j as %j", (input, expected) => {
    reportLocale(input);
    expect(appLocale()).toBe(expected);
  });
});
