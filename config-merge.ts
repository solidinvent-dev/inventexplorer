/**
 * Merging two configurations — the fifth answer to "this file already exists".
 *
 * The other four answers all mean losing something: importing drops whatever
 * only this device has, overwriting drops whatever only the file has, and
 * cancelling leaves the two copies apart. In the case this plugin is built for
 * — the same vault on several devices — the honest answer is usually "keep
 * both", so it needs to exist as a button.
 *
 * One rule, stated so it can be predicted without reading this file:
 *
 *   **Merging adds what is missing and keeps what you already set.**
 *
 * Per-path entries and regex masks are unioned; where both sides describe the
 * same path or the same mask, the local one stays, because that is what the
 * user is looking at while deciding. Plain settings (sizes, colours, flags) are
 * taken from the file ONLY where this device still holds the built-in default —
 * an untouched value is not a preference, so adopting the other device's choice
 * loses nothing. Default file/folder icons merge property by property, the same
 * way the renderer already resolves them.
 *
 * Nothing here touches the licence: it lives in data.json and never travels.
 */

export interface MergeTextStyle {
	fontFamily?: string;
	fontSize?: string;
	fontWeight?: string;
	italic?: boolean;
	textColor?: string;
}

export interface MergeIconEntry {
	icon?: string;
	color?: string;
	iconExpanded?: string;
	colorExpanded?: string;
	showInTitle?: boolean;
	textStyle?: MergeTextStyle;
}

export interface MergeMask {
	id: string;
	pattern: string;
	label?: string;
	file?: MergeIconEntry;
	folder?: MergeIconEntry;
}

/** The shape both sides share: portable settings plus the per-path entries. */
export interface MergeConfig {
	iconData?: Record<string, MergeIconEntry>;
	regexMasks?: MergeMask[];
	defaultFile?: MergeIconEntry;
	defaultFolder?: MergeIconEntry;
	[key: string]: unknown;
}

export interface MergeReport {
	/** Entries only the file had, now adopted. */
	entriesAdded: number;
	/** Entries both sides had; the local one stayed. */
	entriesKept: number;
	/** Masks only the file had, appended after the local ones. */
	masksAdded: number;
	/** Plain settings taken from the file because this device never set them. */
	settingsAdopted: string[];
}

const ENTRY_KEYS = ["icon", "color", "iconExpanded", "colorExpanded", "showInTitle"] as const;

/** Local wins per property, missing properties come from the file. */
function mergeEntry(local: MergeIconEntry | undefined, incoming: MergeIconEntry | undefined): MergeIconEntry {
	const out: MergeIconEntry = { ...(incoming ?? {}), ...(local ?? {}) };
	for (const key of ENTRY_KEYS) {
		if (out[key] === undefined) delete out[key];
	}
	const localStyle = local?.textStyle;
	const incomingStyle = incoming?.textStyle;
	if (localStyle || incomingStyle) {
		const style: MergeTextStyle = { ...(incomingStyle ?? {}), ...(localStyle ?? {}) };
		for (const key of Object.keys(style) as (keyof MergeTextStyle)[]) {
			if (style[key] === undefined) delete style[key];
		}
		if (Object.keys(style).length) out.textStyle = style;
		else delete out.textStyle;
	}
	return out;
}

function isEmptyEntry(entry: MergeIconEntry | undefined): boolean {
	return !entry || Object.keys(entry).length === 0;
}

/**
 * @param local     what this device currently holds
 * @param incoming  what the file in the vault holds
 * @param defaults  the built-in defaults, used to tell "never set" from "set"
 */
export function mergeStoredConfig(
	local: MergeConfig,
	incoming: MergeConfig,
	defaults: Record<string, unknown>,
): { merged: MergeConfig; report: MergeReport } {
	const report: MergeReport = { entriesAdded: 0, entriesKept: 0, masksAdded: 0, settingsAdopted: [] };
	const merged: MergeConfig = { ...local };

	// ---- plain settings: adopt only where this device never chose ----------
	// iconData, masks and the default entries have their own rules below.
	const structural = new Set(["iconData", "regexMasks", "defaultFile", "defaultFolder"]);
	// Never portable: where the config lives is a property of THIS device.
	const local_only = new Set(["storageLocation", "vaultConfigPath"]);
	for (const [key, value] of Object.entries(incoming)) {
		if (structural.has(key) || local_only.has(key)) continue;
		if (value === undefined) continue;
		const mine = local[key];
		const untouched = mine === undefined || JSON.stringify(mine) === JSON.stringify(defaults[key]);
		if (untouched && JSON.stringify(value) !== JSON.stringify(mine)) {
			merged[key] = value;
			report.settingsAdopted.push(key);
		}
	}

	// ---- per-path entries: union, local wins a collision -------------------
	const localEntries = local.iconData ?? {};
	const incomingEntries = incoming.iconData ?? {};
	const entries: Record<string, MergeIconEntry> = {};
	for (const [path, entry] of Object.entries(localEntries)) {
		if (incomingEntries[path]) {
			entries[path] = mergeEntry(entry, incomingEntries[path]);
			report.entriesKept++;
		} else {
			entries[path] = { ...entry };
		}
	}
	for (const [path, entry] of Object.entries(incomingEntries)) {
		if (entries[path]) continue;
		entries[path] = { ...entry };
		report.entriesAdded++;
	}
	merged.iconData = entries;

	// ---- masks: local first, because the first match wins ------------------
	const localMasks = local.regexMasks ?? [];
	const incomingMasks = incoming.regexMasks ?? [];
	const seen = new Set(localMasks.map((m) => m.id));
	const seenPatterns = new Set(localMasks.map((m) => m.pattern));
	const masks = [...localMasks];
	for (const mask of incomingMasks) {
		// A mask already present by id — or one that would do the same thing —
		// must not be appended twice: duplicates are invisible in the UI but
		// change nothing, and they count against the tier ceiling.
		if (seen.has(mask.id) || seenPatterns.has(mask.pattern)) continue;
		masks.push(mask);
		seen.add(mask.id);
		seenPatterns.add(mask.pattern);
		report.masksAdded++;
	}
	merged.regexMasks = masks;

	// ---- default file/folder icons: property by property -------------------
	for (const key of ["defaultFile", "defaultFolder"] as const) {
		const mine = local[key];
		const theirs = incoming[key];
		if (isEmptyEntry(mine) && isEmptyEntry(theirs)) {
			merged[key] = {};
			continue;
		}
		const result = mergeEntry(mine, theirs);
		merged[key] = result;
		if (isEmptyEntry(mine) && !isEmptyEntry(theirs)) report.settingsAdopted.push(key);
	}

	return { merged, report };
}


/**
 * Three-way merge, for the moment a save meets a file another device wrote.
 *
 * `base` is what this device last saw in the file. It is what tells a deletion
 * apart from an absence: a path in `base` that is gone from `mine` was deleted
 * HERE and must stay deleted, while a path in `theirs` that never was in `base`
 * is something the other device added and must survive. Without the base, the
 * two look identical and every save quietly undoes the user's own deletions.
 */
export function mergeWithBase(
	base: MergeConfig | null,
	mine: MergeConfig,
	theirs: MergeConfig,
	defaults: Record<string, unknown>,
): { merged: MergeConfig; report: MergeReport } {
	if (!base) return mergeStoredConfig(mine, theirs, defaults);
	const result = mergeStoredConfig(mine, theirs, defaults);
	const baseEntries = base.iconData ?? {};
	const myEntries = mine.iconData ?? {};
	const entries = result.merged.iconData ?? {};
	for (const path of Object.keys(entries)) {
		const deletedHere = path in baseEntries && !(path in myEntries);
		if (!deletedHere) continue;
		// They may have re-created it after we deleted it; only a value that
		// differs from what we deleted counts as theirs.
		const theirEntry = (theirs.iconData ?? {})[path];
		const baseEntry = baseEntries[path];
		if (theirEntry && JSON.stringify(theirEntry) !== JSON.stringify(baseEntry)) continue;
		delete entries[path];
		result.report.entriesAdded = Math.max(0, result.report.entriesAdded - 1);
	}
	result.merged.iconData = entries;

	// The same for masks: one we removed must not come back.
	const baseMaskKeys = new Set((base.regexMasks ?? []).map((m) => m.id));
	const myMaskKeys = new Set((mine.regexMasks ?? []).map((m) => m.id));
	const kept = (result.merged.regexMasks ?? []).filter((mask) => {
		const deletedHere = baseMaskKeys.has(mask.id) && !myMaskKeys.has(mask.id);
		if (deletedHere) result.report.masksAdded = Math.max(0, result.report.masksAdded - 1);
		return !deletedHere;
	});
	result.merged.regexMasks = kept;
	return result;
}

/** One line for the Notice — says what happened, in the order it matters. */
export function describeMerge(report: MergeReport): string {
	const parts: string[] = [];
	parts.push(`${report.entriesAdded} added`);
	if (report.entriesKept) parts.push(`${report.entriesKept} already yours`);
	if (report.masksAdded) parts.push(`${report.masksAdded} mask${report.masksAdded === 1 ? "" : "s"}`);
	if (report.settingsAdopted.length) parts.push(`${report.settingsAdopted.length} setting${report.settingsAdopted.length === 1 ? "" : "s"}`);
	return parts.join(", ");
}
