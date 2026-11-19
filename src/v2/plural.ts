// Counted nouns for English UI copy ("1 download", "2 downloads"). The copy is
// English, so the rules are English regardless of the system locale.
const rules = new Intl.PluralRules("en");

export function plural(count: number, one: string, other: string): string {
  return `${count} ${rules.select(count) === "one" ? one : other}`;
}
