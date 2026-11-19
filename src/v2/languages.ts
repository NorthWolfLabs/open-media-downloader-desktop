import { appLocale } from "./locale";

const codes =
  "af am ar az be bg bn bo bs ca cs cy da de el en eo es et eu fa fi fil fr ga gl gu he hi hr hu hy id is it ja ka kk km kn ko ku ky la lo lt lv mk ml mn mr ms my ne nl no pa pl ps pt pt-br ro ru si sk sl sq sr sv sw ta te th tr uk ur uz vi zh zh-hk zh-ro zh-tw".split(
    " ",
  );
// This runs while the app's modules load: a throw here would leave a blank
// window, so the locale comes from appLocale() and a missing DisplayNames only
// costs readable names (languageName then returns the code).
let names: Intl.DisplayNames | undefined;
try {
  names = new Intl.DisplayNames([appLocale()], { type: "language" });
} catch {
  // Leave names undefined.
}
export function languageName(code: string) {
  try {
    return (
      names?.of(
        (
          {
            "ja-ro": "ja-Latn",
            "ko-ro": "ko-Latn",
            "zh-ro": "zh-Latn",
            "es-la": "es-419",
            und: "und",
          } as Record<string, string>
        )[code] ?? code,
      ) || code
    );
  } catch {
    return code;
  }
}
export const languageOptions = codes
  .map((id) => ({ id, label: languageName(id) }))
  .sort((a, b) => a.label.localeCompare(b.label));
/** First-run preference only. Saved choices always win. Match regional provider codes before base language. */
export function preferredSystemLanguage(
  locales: readonly string[] = navigator.languages,
): string {
  for (const locale of locales) {
    const normalized = locale.toLowerCase().replaceAll("_", "-");
    const exact = languageOptions.find((o) => o.id === normalized);
    if (exact) return exact.id;
    const base = languageOptions.find((o) => o.id === normalized.split("-")[0]);
    if (base) return base.id;
  }
  return "";
}
export function availableLanguageOptions(available: readonly string[]) {
  return [...new Set(available.filter(Boolean))]
    .map((id) => ({ id, label: languageName(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function preferredLanguages(): string[] {
  let recent: string[] = [],
    system: string[] = [];
  try {
    recent = JSON.parse(localStorage.getItem("omd.recent-languages") ?? "[]");
    system = JSON.parse(localStorage.getItem("omd.system-languages") ?? "[]");
  } catch {}
  return [
    ...new Set([
      ...(system.length ? system : [...navigator.languages])
        .map((locale) => preferredSystemLanguage([locale]))
        .filter(Boolean),
      ...recent,
    ]),
  ];
}
export function rememberLanguages(values: string[]) {
  let recent: string[] = [];
  try {
    recent = JSON.parse(localStorage.getItem("omd.recent-languages") ?? "[]");
  } catch {}
  localStorage.setItem(
    "omd.recent-languages",
    JSON.stringify([...new Set([...values, ...recent])].slice(0, 12)),
  );
}
