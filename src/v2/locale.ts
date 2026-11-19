// The one place the UI picks a locale for Intl formatting.
//
// WebKitGTK passes the POSIX locale through: under LANG=C.UTF-8, LANG=C, POSIX
// or no LANG, navigator.language is "C". Intl constructors throw a RangeError for
// that, and for tags such as "en_US". A throw while modules load leaves a blank
// window, so every Intl call goes through here. POSIX-style names keep their
// language ("de_DE.UTF-8" is German); anything else falls back to English.

/** POSIX locale names to BCP 47: "de_DE.UTF-8" and "sr_RS@latin" become "de-DE" and
 * "sr-RS". The codeset and modifier are dropped; "C" stays invalid. */
export function bcp47(locale: string): string {
  return locale.replace(/[.@].*$/, "").replaceAll("_", "-");
}

/** A locale every Intl constructor accepts: the first valid candidate, else "en". */
export function safeLocale(...candidates: readonly (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const [tag] = Intl.getCanonicalLocales(bcp47(candidate));
      // "POSIX" is well-formed but names no language; Intl would quietly use
      // the runtime default for it.
      if (tag && !/^posix\b/i.test(tag)) return tag;
    } catch {
      // Not a language ("C", "C.UTF-8", "*"): try the next one.
    }
  }
  return "en";
}

/** The WebView's language when Intl accepts it, else English. */
export function appLocale(): string {
  return safeLocale(typeof navigator === "undefined" ? undefined : navigator.language);
}
