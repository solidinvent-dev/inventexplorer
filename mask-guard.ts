/**
 * Compiling regex masks without letting one of them freeze the explorer.
 *
 * Masks are user-written regexes, and a regex can be pathologically slow:
 * `^(a+)+b$` against a 26-character name costs ~200 ms — per refresh, and the
 * explorer refreshes on every scroll, rename and collapse. Worse, the mask
 * travels in the vault config, so it would freeze every device the vault is
 * open on, with nothing on screen to explain why.
 *
 * Rather than trying to recognise dangerous patterns (which is its own
 * unwinnable game), every mask is TIMED while it runs. A mask that spends more
 * than its budget across one refresh is switched off and reported by name, so
 * the user learns which of their masks is the problem instead of concluding the
 * plugin is broken.
 *
 * What this cannot do is interrupt a single regex call: JavaScript has no way
 * to abort one. So the first pathological match still costs what it costs —
 * once. Every refresh after that is free of it.
 */

export interface GuardMask {
	id: string;
	pattern: string;
	label?: string;
}

export interface SlowMask<M> { mask: M; ms: number }

/** A mask is not worth more than this across one refresh of the explorer. */
export const MASK_BUDGET_MS = 30;

/**
 * Matches paths against the user's masks, keeping each one on a time budget.
 * `now` is injected so the behaviour is testable without a stopwatch.
 */
export class MaskMatcher<M extends GuardMask> {
	private readonly compiled: { re: RegExp; mask: M; spent: number }[] = [];
	/** Patterns that did not compile at all. */
	readonly invalid: M[] = [];
	private readonly disabled: SlowMask<M>[] = [];
	private reported = 0;

	constructor(
		masks: M[],
		private readonly budgetMs: number = MASK_BUDGET_MS,
		private readonly now: () => number = () => performance.now(),
		/**
		 * Shared across refreshes, so a mask proven ruinous is not re-tried on
		 * every scroll. Keyed by id AND pattern: editing the pattern is a new
		 * mask as far as this is concerned, so a fixed one starts working again
		 * with no reset button to find.
		 */
		private readonly disabledKeys: Set<string> = new Set(),
	) {
		for (const mask of masks) {
			if (!mask.pattern) continue;
			if (disabledKeys.has(maskKey(mask))) continue;
			try {
				this.compiled.push({ re: new RegExp(mask.pattern), mask, spent: 0 });
			} catch {
				this.invalid.push(mask);
			}
		}
	}

	/** The first mask that matches, or undefined. Over-budget masks are gone. */
	match(path: string): M | undefined {
		for (const entry of this.compiled) {
			if (entry.spent > this.budgetMs) continue;
			const started = this.now();
			let hit = false;
			try {
				entry.re.lastIndex = 0;
				hit = entry.re.test(path);
			} catch {
				entry.spent = Infinity;
				this.disabledKeys.add(maskKey(entry.mask));
				this.disabled.push({ mask: entry.mask, ms: 0 });
				continue;
			}
			entry.spent += this.now() - started;
			if (entry.spent > this.budgetMs) {
				this.disabledKeys.add(maskKey(entry.mask));
				this.disabled.push({ mask: entry.mask, ms: Math.round(entry.spent) });
				// A mask that blew the budget must not decide anything, even if
				// this very call matched: its answers cost more than they help.
				continue;
			}
			if (hit) return entry.mask;
		}
		return undefined;
	}

	/** Masks switched off since the last call, for reporting. */
	takeSlow(): SlowMask<M>[] {
		const fresh = this.disabled.slice(this.reported);
		this.reported = this.disabled.length;
		return fresh;
	}

	/** True while at least one mask is still usable. */
	get usableCount(): number {
		return this.compiled.filter((e) => e.spent <= this.budgetMs).length;
	}
}

/** Identity for the disabled set: a changed pattern is a different mask. */
export function maskKey(mask: GuardMask): string {
	return `${mask.id}\u0000${mask.pattern}`;
}

/** Names a mask the way its author will recognise it. */
export function describeMask(mask: GuardMask): string {
	return mask.label ? `${mask.label} (${mask.pattern})` : mask.pattern;
}
