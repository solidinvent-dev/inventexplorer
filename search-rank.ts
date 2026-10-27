/**
 * Ranking for the icon and emoji pickers.
 *
 * Both grids used to filter with a bare `includes`, which is correct but reads
 * as broken: searching "cat" put 🥴 first, because "cat" hides inside
 * "intoxicated". Of 73 emoji whose keywords contain those three letters, 13
 * are actually about cats — and the user sees the other 60 first.
 *
 * So matches are scored rather than merely kept. A whole word beats a word that
 * merely starts with the query, which beats a match buried inside a word. Ties
 * keep the order the source gave them, so an equally good match never jumps
 * around between keystrokes.
 */

export const EXACT_TEXT = 5;
export const TEXT_PREFIX = 4;
export const EXACT_WORD = 3;
export const WORD_PREFIX = 2;
export const SUBSTRING = 1;

/** null when the text does not match at all. */
export function matchScore(text: string, query: string): number | null {
	if (!query) return SUBSTRING;
	const haystack = text.toLowerCase();
	const needle = query.toLowerCase();
	if (!haystack.includes(needle)) return null;
	// The thing you typed, exactly: searching "book" in an icon set has to lead
	// with `book`, not with `address-book`, which is what a word-level score
	// alone gave us.
	if (haystack === needle) return EXACT_TEXT;
	if (haystack.startsWith(needle)) return TEXT_PREFIX;
	// Split on anything that is not a letter or digit: icon names are
	// kebab-case ("book-open"), emoji keywords are space-separated.
	const words = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
	if (words.includes(needle)) return EXACT_WORD;
	if (words.some((word) => word.startsWith(needle))) return WORD_PREFIX;
	return SUBSTRING;
}

/**
 * Filter + rank in one pass, preserving input order within a score.
 * `textOf` supplies the searchable text for an item.
 */
export function rankMatches<T>(items: T[], query: string, textOf: (item: T) => string): T[] {
	if (!query) return items.slice();
	const scored: { item: T; score: number; index: number }[] = [];
	for (let index = 0; index < items.length; index++) {
		const score = matchScore(textOf(items[index]), query);
		if (score !== null) scored.push({ item: items[index], score, index });
	}
	scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
	return scored.map((entry) => entry.item);
}
