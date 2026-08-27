// Minimal inlined replacement for `github-slugger`.
// The char class includes an invisible ZWJ for emoji sequences.
const INVALID_SLUG_CHARS = /[^\p{L}\p{M}\p{N}\p{Pc}\p{Extended_Pictographic}‍\- ]/gu;

export class Slugger {
  private occurrences = new Map<string, number>();

  slug(value: string): string {
    const base = value.trim().toLowerCase().replace(INVALID_SLUG_CHARS, '').replace(/ /g, '-');
    let result = base;
    while (this.occurrences.has(result)) {
      const count = this.occurrences.get(base)! + 1;
      this.occurrences.set(base, count);
      result = `${base}-${count}`;
    }
    this.occurrences.set(result, 0);
    return result;
  }
}
