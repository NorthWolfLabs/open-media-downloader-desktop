import { afterEach, describe, expect, it, vi } from "vitest";

// WebKitGTK passes the POSIX locale through: under LANG=C.UTF-8 or no LANG,
// navigator.language is "C". Every module the window loads must accept that.
const webViewLocales = ["C", "POSIX", "en_US", "", "de-DE", "de_DE.UTF-8"];

afterEach(() => {
  // Drop the own properties so jsdom's Navigator getters apply again.
  delete (navigator as { language?: string }).language;
  delete (navigator as { languages?: readonly string[] }).languages;
  vi.resetModules();
});

function reportLocale(locale: string) {
  Object.defineProperty(navigator, "language", { value: locale, configurable: true });
  Object.defineProperty(navigator, "languages", { value: locale ? [locale] : [], configurable: true });
  vi.resetModules();
}

describe("WebView locales, including ones that are not BCP 47 tags", () => {
  it.each(webViewLocales)("languages load when navigator.language is %j", async (locale) => {
    reportLocale(locale);
    const languages = await import("./languages");
    // Names follow a valid WebView locale and fall back to English otherwise.
    expect(languages.languageName("de")).toBe(locale.startsWith("de") ? "Deutsch" : "German");
    expect(languages.languageOptions.length).toBeGreaterThan(50);
    expect(languages.preferredSystemLanguage()).toBe(
      locale === "en_US" ? "en" : locale.startsWith("de") ? "de" : "",
    );
  });

  it.each(webViewLocales)("the app module graph loads when navigator.language is %j", async (locale) => {
    reportLocale(locale);
    await expect(import("./App.svelte")).resolves.toHaveProperty("default");
  }, 120_000); // The first transform of the whole app graph is slow on cold caches.
});
