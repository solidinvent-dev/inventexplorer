import {
	App,
	MarkdownView,
	Menu,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	SuggestModal,
	TAbstractFile,
	TFile,
	TFolder,
	WorkspaceLeaf,
	getIconIds,
	normalizePath,
	requestUrl,
	setIcon,
} from "obsidian";
import emojiNames from "./emoji-names.json";
import { describeMerge, mergeStoredConfig, mergeWithBase } from "./config-merge";
import { rankMatches } from "./search-rank";
import { MaskMatcher, describeMask } from "./mask-guard";
import {
	assignmentCeiling,
	baseAssignments,
	baseMasks,
	hasFeature,
	isRevoked,
	maskCeiling,
	setLicense,
	isLicensed,
} from "./licensing";
import {
	activateAccount,
	applyLocalLicenseState,
	deactivateAccount,
	startLicenseCheck,
	type LicenseHost,
	type LicenseState,
} from "./license-check";

interface TextStyle {
	fontFamily?: string;
	fontSize?: string;
	fontWeight?: string;
	italic?: boolean;
	textColor?: string;
}

interface IconEntry {
	icon?: string;
	color?: string;
	iconExpanded?: string;
	colorExpanded?: string;
	showInTitle?: boolean;
	textStyle?: TextStyle;
}

interface IconData {
	[path: string]: IconEntry;
}

interface StoredConfigData extends Partial<PluginSettings> {
	iconData?: IconData;
}

interface DefaultIconEntry {
	icon?: string;
	color?: string;
	iconExpanded?: string;
	colorExpanded?: string;
	textStyle?: TextStyle;
}

interface RegexMaskEntry {
	id: string;
	pattern: string;
	label?: string;
	file?: DefaultIconEntry;
	folder?: DefaultIconEntry;
}

type StorageLocation = "vault" | "plugin";
type ExistingVaultConfigChoice =
	| { type: "merge" }
	| { type: "import" }
	| { type: "select-file"; path: string }
	| { type: "overwrite" }
	| { type: "cancel" };

interface PluginSettings {
	storageLocation: StorageLocation;
	vaultConfigPath: string;
	replaceArrows: boolean;
	iconSize: number;
	inlineTitleIconSize: number;
	defaultFile: DefaultIconEntry;
	defaultFolder: DefaultIconEntry;
	regexMasks: RegexMaskEntry[];
	explorerBgColor: string;
	explorerIndentLines: boolean;
	indentLinesColor: string;
	indentLinesThickness: number;
	explorerVerticalLines: boolean;
	verticalLinesColor: string;
	verticalLinesThickness: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
	// Default to the vault: the configuration becomes an ordinary file in the
	// user's own vault, so it travels between devices with whatever sync they
	// already use (Obsidian Sync, iCloud, Syncthing, git…) instead of being
	// stranded in the per-device plugin folder.
	storageLocation: "vault",
	vaultConfigPath: "_config/inventexplorer.json",
	replaceArrows: false,
	iconSize: 16,
	inlineTitleIconSize: 28,
	defaultFile: {},
	defaultFolder: {},
	regexMasks: [],
	explorerBgColor: "",
	explorerIndentLines: false,
	indentLinesColor: "",
	indentLinesThickness: 1,
	// Off by default, like the horizontal separators above. A plugin whose job
	// is icons has no business restyling the explorer's tree the moment it is
	// installed — the guide lines are a deliberate opt-in, not a surprise.
	explorerVerticalLines: false,
	verticalLinesColor: "",
	verticalLinesThickness: 1,
};

/**
 * InventTasks' mark, in the two variants its own site uses: a dark glyph for
 * light themes and a light one for dark themes. Inlined as data URIs because a
 * plugin must not fetch anything at runtime, and a name without a mark reads
 * like a footnote rather than a product.
 */
const INVENTTASKS_LOGO_LIGHT =
	"data:image/png;base64,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";
const INVENTTASKS_LOGO_DARK =
	"data:image/png;base64,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";

const ICON_CLASS = "inventexplorer-icon";
const KEY_ATTR = "data-inventexplorer-key";

/**
 * The one upgrade nudge in the plugin. Shown ONLY at the moment a ceiling is
 * actually reached or a tiered control is used — never on a timer, never on
 * startup, never as a recurring reminder.
 */
function proNotice(what: string): void {
	new Notice(
		`InventExplorer — ${what}\n\n` +
			`A one-time Pro license lifts every limit: ` +
			`Settings → InventExplorer → Activation.`,
		9000,
	);
}

/** Small "PRO" chip appended to a tiered control's label. */
function proChip(el: HTMLElement): void {
	el.createSpan({ cls: "inventexplorer-pro-chip", text: "PRO" });
}

const PALETTE_COLORS = [
	"#e57373","#f06292","#ba68c8","#9575cd",
	"#7986cb","#64b5f6","#4dd0e1","#4db6ac",
	"#81c784","#aed581","#ffd54f","#ffb74d",
	"#a1887f","#90a4ae",
];

// Keys come from DEFAULT_SETTINGS so a newly added setting is persisted
// automatically — a hand-written list here would silently drop it.
function buildStoredConfigData(
	settings: PluginSettings,
	iconData: IconData,
): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof PluginSettings)[]) {
		data[key] = settings[key];
	}
	data.iconData = iconData;
	return data;
}

// Guards against hand-edited or partially-synced config files: a wrong type
// here would otherwise crash rendering (e.g. for...of over a non-array).
function asIconData(value: unknown): IconData {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as IconData)
		: {};
}

function asRegexMasks(value: unknown): RegexMaskEntry[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(m): m is RegexMaskEntry =>
			m !== null &&
			typeof m === "object" &&
			typeof (m as RegexMaskEntry).pattern === "string",
	);
}

function createIconPlacementDesc(): DocumentFragment {
	const fragment = document.createDocumentFragment();
	fragment.append(
		"Alongside: icon appears to the left of the name. " +
		"Replace arrows: for folders the icon takes the place of the collapse arrow — clicking it still expands/collapses the folder.",
	);
	fragment.append(document.createElement("br"));
	fragment.append(document.createElement("br"));
	fragment.append(
		"⚠️ Restart Obsidian after changing this setting to fully apply the new placement.",
	);
	return fragment;
}

/** Icon sets that exist as a downloadable file.
 *
 *  Deliberately NOT derived from ICON_SETS further down: `lucide` is built into
 *  Obsidian and has no file, and this list also decides what may be appended to
 *  a download URL and to a path on disk — so it is written out by hand and kept
 *  honest by a test (tests/icon-set-download.test.mjs) rather than inferred. */
const DOWNLOADABLE_ICON_SETS = new Set(["tabler", "boxicons", "phosphor"]);

/** Where a missing icon set is fetched from.
 *
 *  Pinned to the RUNNING version rather than `latest`: a vault that has not
 *  updated the plugin must not pull a file written for a newer format. */
const ICON_SET_RELEASE_BASE = "https://github.com/solidinvent-dev/inventexplorer/releases/download";

export default class InventExplorerPlugin extends Plugin implements LicenseHost {
	settings: PluginSettings = { ...DEFAULT_SETTINGS };
	iconData: IconData = {};
	// Credentials + newest signed standing. Deliberately NOT part of
	// PluginSettings: settings are mirrored into the vault config file, and a
	// license key has no business travelling into a synced (or published,
	// or git-committed) vault. This lives in data.json only.
	license: LicenseState = {};
	private stopLicenseCheck: (() => void) | null = null;
	private refreshTimer: number | null = null;
	private settleTimer: number | null = null;
	private configReloadTimer: number | null = null;
	/** Masks already reported as too slow, so the notice fires once each. */
	private reportedSlowMasks = new Set<string>();
	/** Exact bytes of the vault config as this device last saw them. */
	private lastKnownFileContent: string | null = null;
	/** Masks proven ruinous, remembered across refreshes (id + pattern). */
	private disabledMaskKeys = new Set<string>();
	private saveSettingsTimer: number | null = null;
	private saveIconDataTimer: number | null = null;
	private lastConfigNoticeAt = 0;
	private observers: MutationObserver[] = [];
	private refreshing = false;
	readonly iconSetCache: Map<string, Record<string, string>> = new Map();
	private iconSetPending: Map<string, Promise<Record<string, string> | null>> = new Map();

	async onload() {
		await this.loadAll();
		// Derive the runtime tier from the stored account + newest signed
		// standing before anything renders, then start the daily check.
		await applyLocalLicenseState(this);
		this.stopLicenseCheck = startLicenseCheck(this);
		this.applyIconSize();
		this.applyInlineTitleIconSize();
		this.applyExplorerBgColor();
		this.applyExplorerIndentLines();
		this.applyIndentLinesStyle();
		this.applyExplorerVerticalLines();
		this.applyVerticalLinesStyle();

		this.addSettingTab(new InventExplorerSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				this.addFileMenuItems(menu, file);
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", async (file, oldPath) => {
				if (this.isVaultConfigPath(file.path)) {
					this.scheduleVaultConfigReload();
					return;
				}
				if (this.isVaultConfigPath(oldPath)) {
					this.scheduleVaultConfigReload();
					return;
				}
				let changed = false;
				if (this.iconData[oldPath]) {
					this.iconData[file.path] = this.iconData[oldPath];
					delete this.iconData[oldPath];
					changed = true;
				}
				// Move entries of all descendants when a folder is renamed.
				if (file instanceof TFolder) {
					const oldPrefix = oldPath + "/";
					for (const key of Object.keys(this.iconData)) {
						if (key.startsWith(oldPrefix)) {
							const newKey = file.path + "/" + key.slice(oldPrefix.length);
							this.iconData[newKey] = this.iconData[key];
							delete this.iconData[key];
							changed = true;
						}
					}
				}
				if (changed) this.saveIconDataDebounced();
				this.scheduleRefresh();
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", async (file) => {
				if (this.isVaultConfigPath(file.path)) {
					this.scheduleVaultConfigReload();
					return;
				}
				let changed = false;
				if (this.iconData[file.path]) {
					delete this.iconData[file.path];
					changed = true;
				}
				// Drop entries of all descendants when a folder is deleted.
				if (file instanceof TFolder) {
					const prefix = file.path + "/";
					for (const key of Object.keys(this.iconData)) {
						if (key.startsWith(prefix)) {
							delete this.iconData[key];
							changed = true;
						}
					}
				}
				if (changed) this.saveIconDataDebounced();
				this.scheduleRefresh();
			}),
		);

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (this.isVaultConfigPath(file.path)) {
					this.scheduleVaultConfigReload();
					return;
				}
				this.scheduleRefresh();
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (this.isVaultConfigPath(file.path)) {
					this.scheduleVaultConfigReload();
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.attachObservers();
				this.scheduleRefresh();
				this.refreshInlineTitleIcons();
			}),
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.refreshInlineTitleIcons();
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.attachObservers();
			this.applyReplaceArrowsClass();
			this.preloadUsedIconSets().then(() => {
				this.refresh();
				this.settleFileExplorerLayout();
				this.refreshInlineTitleIcons();
			});
		});

		this.addCommand({
			id: "reload-config",
			name: "Reload icon config from file",
			callback: async () => {
				await this.loadIconData();
				this.applyAllSettings();
				this.refresh();
				new Notice("InventExplorer: config reloaded");
			},
		});
	}

	onunload() {
		this.stopLicenseCheck?.();
		this.stopLicenseCheck = null;
		for (const obs of this.observers) obs.disconnect();
		this.observers = [];
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		if (this.settleTimer !== null) {
			window.clearTimeout(this.settleTimer);
			this.settleTimer = null;
		}
		if (this.configReloadTimer !== null) {
			window.clearTimeout(this.configReloadTimer);
			this.configReloadTimer = null;
		}
		// Flush a pending debounced save so the last change isn't lost.
		// A save still waiting out its debounce must not die with the plugin:
		// flush it, or the last change of a session is lost on disable/quit.
		if (this.saveIconDataTimer !== null) {
			window.clearTimeout(this.saveIconDataTimer);
			this.saveIconDataTimer = null;
			void this.persist();
		}
		if (this.saveSettingsTimer !== null) {
			window.clearTimeout(this.saveSettingsTimer);
			this.saveSettingsTimer = null;
			void this.persist();
			void this.persist();
		}
		this.removeAllDecorations();
		document.documentElement.style.removeProperty("--inventexplorer-size");
		document.documentElement.style.removeProperty("--inventexplorer-inline-size");
		document.documentElement.style.removeProperty("--inventexplorer-explorer-bg");
		document.documentElement.style.removeProperty("--inventexplorer-indent-color");
		document.documentElement.style.removeProperty("--inventexplorer-indent-thickness");
		document.documentElement.style.removeProperty("--inventexplorer-vertical-color");
		document.documentElement.style.removeProperty("--inventexplorer-vertical-thickness");
		document.body.removeClass("inventexplorer-indent-lines");
		document.body.removeClass("inventexplorer-hide-vertical-lines");
		document.querySelectorAll(".inventexplorer-inline-icon").forEach((el) => el.remove());
		// Remove the replace-arrows layout class from all explorer leaves.
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");
		for (const leaf of leaves) {
			const containerEl = (
				leaf.view as unknown as { containerEl?: HTMLElement }
			).containerEl;
			containerEl?.removeClass("inventexplorer-replace-arrows");
		}
	}

	// ---------- Loading & saving ----------

	async loadAll() {
		const rawStored = await this.loadData();
		// null/undefined means no data.json yet — a genuine first run.
		const stored = rawStored ?? {};
		this.license = {
			email: typeof stored.license?.email === "string" ? stored.license.email : undefined,
			key: typeof stored.license?.key === "string" ? stored.license.key : undefined,
			seed: typeof stored.license?.seed === "string" ? stored.license.seed : undefined,
		};
		setLicense(this.license.email, this.license.key);
		this.settings = {
			...DEFAULT_SETTINGS,
			storageLocation:
				stored.storageLocation ?? DEFAULT_SETTINGS.storageLocation,
			vaultConfigPath:
				stored.vaultConfigPath ?? DEFAULT_SETTINGS.vaultConfigPath,
			replaceArrows:
				stored.replaceArrows ?? DEFAULT_SETTINGS.replaceArrows,
			iconSize:
				stored.iconSize ?? DEFAULT_SETTINGS.iconSize,
			inlineTitleIconSize:
				stored.inlineTitleIconSize ?? DEFAULT_SETTINGS.inlineTitleIconSize,
			defaultFile: stored.defaultFile ?? {},
			defaultFolder: stored.defaultFolder ?? {},
			regexMasks: asRegexMasks(stored.regexMasks),
			explorerBgColor: stored.explorerBgColor ?? DEFAULT_SETTINGS.explorerBgColor,
			explorerIndentLines: stored.explorerIndentLines ?? DEFAULT_SETTINGS.explorerIndentLines,
			indentLinesColor: stored.indentLinesColor ?? DEFAULT_SETTINGS.indentLinesColor,
			indentLinesThickness: stored.indentLinesThickness ?? DEFAULT_SETTINGS.indentLinesThickness,
			explorerVerticalLines: stored.explorerVerticalLines ?? DEFAULT_SETTINGS.explorerVerticalLines,
			verticalLinesColor: stored.verticalLinesColor ?? DEFAULT_SETTINGS.verticalLinesColor,
			verticalLinesThickness: stored.verticalLinesThickness ?? DEFAULT_SETTINGS.verticalLinesThickness,
		};
		if (this.settings.storageLocation === "plugin") {
			this.iconData = asIconData(stored.iconData);
		} else {
			const vaultConfig = await this.readVaultConfig(
				this.settings.vaultConfigPath,
			);
			if (vaultConfig) {
				this.applyVaultConfig(vaultConfig);
			} else {
				// Config file missing or unreadable (e.g. not synced yet on a
				// new device) — fall back to the mirror kept in data.json so
				// existing assignments are never wiped.
				this.iconData = asIconData(stored.iconData);
			}
		}
	}

	async loadIconData() {
		const stored = (await this.loadData()) ?? {};
		if (this.settings.storageLocation === "plugin") {
			this.iconData = stored.iconData ?? {};
			return;
		}
		const vaultConfig = await this.readVaultConfig(
			this.settings.vaultConfigPath,
		);
		if (vaultConfig) {
			this.applyVaultConfig(vaultConfig);
		} else {
			this.iconData = stored.iconData ?? {};
		}
	}

	private isVaultConfigPath(path: string): boolean {
		return (
			this.settings.storageLocation === "vault" &&
			normalizePath(path) === normalizePath(this.settings.vaultConfigPath)
		);
	}

	private scheduleVaultConfigReload() {
		if (this.configReloadTimer !== null) {
			window.clearTimeout(this.configReloadTimer);
		}
		this.configReloadTimer = window.setTimeout(async () => {
			this.configReloadTimer = null;
			await this.reloadVaultConfigFromDisk();
		}, 250);
	}

	/**
	 * React to the config file changing underneath us — a sync client landing
	 * another device's edit, or the user editing the JSON by hand.
	 *
	 * The mirror in data.json is a safety net for STARTUP, when there is
	 * nothing in memory yet. It must NOT be used here: a file caught
	 * mid-write parses as garbage for a moment, and falling back to the mirror
	 * then would roll memory back to whatever this device last wrote itself —
	 * silently dropping entries that had already arrived from elsewhere. If the
	 * user changed anything during that window, the rolled-back state would be
	 * written out and the loss would spread to every device.
	 *
	 * So: an unreadable file changes nothing. What is on screen stays on
	 * screen, and the next readable version of the file wins.
	 */
	private async reloadVaultConfigFromDisk() {
		if (this.settings.storageLocation !== "vault") return;
		const path = normalizePath(this.settings.vaultConfigPath);
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(path))) {
			// Missing is not the same as changed: keep what we have and wait
			// for the file to arrive (its `create` event brings us back here).
			return;
		}
		// Skip when the file matches the in-memory state — that's the
		// modify event echoing back our own write. Comparing content
		// (instead of a one-shot suppress flag) can't swallow a genuine
		// external change by accident.
		try {
			const onDisk = await adapter.read(path);
			const current = JSON.stringify(
				buildStoredConfigData(this.settings, this.iconData),
				null,
				2,
			);
			if (onDisk === current) return;
		} catch { /* unreadable — readVaultConfig below reports it */ }

		const incoming = await this.readVaultConfig(path);
		if (!incoming) return; // corrupt or unreadable: keep memory as it is
		this.applyVaultConfig(incoming);
		// Keep the startup safety net current, so a later cold start cannot
		// fall back to a state older than what this device is showing. Only
		// data.json is written — writing the vault file would echo back.
		await this.persistMirrorOnly();
		this.applyAllSettings();
		this.refresh();
		this.refreshInlineTitleIcons();
	}

	async saveSettings() {
		await this.persist();
	}

	// Coalesces rapid-fire changes (slider drags, color-picker drags,
	// per-keystroke text input) into a single disk write.
	/**
	 * Coalesce saves triggered by vault events. Obsidian reports a deleted or
	 * renamed folder as one event PER FILE, so saving on each one wrote the
	 * whole config file once per note — a storm of versions for every device to
	 * sync through. One quiet moment, one write.
	 */
	saveIconDataDebounced(delay = 250) {
		if (this.saveIconDataTimer !== null) {
			window.clearTimeout(this.saveIconDataTimer);
		}
		this.saveIconDataTimer = window.setTimeout(() => {
			this.saveIconDataTimer = null;
			void this.persist();
		}, delay);
	}

	saveSettingsDebounced(delay = 500) {
		if (this.saveSettingsTimer !== null) {
			window.clearTimeout(this.saveSettingsTimer);
		}
		this.saveSettingsTimer = window.setTimeout(() => {
			this.saveSettingsTimer = null;
			void this.persist();
		}, delay);
	}

	applyIconSize() {
		document.documentElement.style.setProperty(
			"--inventexplorer-size",
			`${this.settings.iconSize}px`,
		);
	}

	applyInlineTitleIconSize() {
		document.documentElement.style.setProperty(
			"--inventexplorer-inline-size",
			`${this.settings.inlineTitleIconSize}px`,
		);
	}

	applyExplorerBgColor() {
		if (this.settings.explorerBgColor) {
			document.documentElement.style.setProperty(
				"--inventexplorer-explorer-bg",
				this.settings.explorerBgColor,
			);
		} else {
			document.documentElement.style.removeProperty("--inventexplorer-explorer-bg");
		}
	}

	applyExplorerIndentLines() {
		document.body.toggleClass("inventexplorer-indent-lines", this.settings.explorerIndentLines);
	}

	applyIndentLinesStyle() {
		const el = document.documentElement;
		if (this.settings.indentLinesColor) {
			el.style.setProperty("--inventexplorer-indent-color", this.settings.indentLinesColor);
		} else {
			el.style.removeProperty("--inventexplorer-indent-color");
		}
		el.style.setProperty("--inventexplorer-indent-thickness", `${this.settings.indentLinesThickness}px`);
	}

	applyExplorerVerticalLines() {
		document.body.toggleClass("inventexplorer-hide-vertical-lines", !this.settings.explorerVerticalLines);
	}

	applyVerticalLinesStyle() {
		const el = document.documentElement;
		if (this.settings.verticalLinesColor) {
			el.style.setProperty("--inventexplorer-vertical-color", this.settings.verticalLinesColor);
		} else {
			el.style.removeProperty("--inventexplorer-vertical-color");
		}
		el.style.setProperty("--inventexplorer-vertical-thickness", `${this.settings.verticalLinesThickness}px`);
	}

	refreshInlineTitleIcons() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			this.applyInlineTitleToLeaf(leaf);
		}
	}

	private applyInlineTitleToLeaf(leaf: WorkspaceLeaf) {
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		const file = view.file;
		if (!file) return;

		const entry = this.iconData[file.path];

		view.containerEl
			.querySelectorAll<HTMLElement>(".inline-title")
			.forEach((titleEl) => {
				// Remove any previous injection and check if key changed
				const existing = titleEl.querySelector(".inventexplorer-inline-icon");
				const desiredKey =
					entry?.showInTitle && entry.icon
						? `${entry.icon}|${entry.color ?? ""}`
						: "";
				if (existing) {
					if (existing.getAttribute("data-inventexplorer-key") === desiredKey) return;
					existing.remove();
				}
				if (!desiredKey) return;

				const iconEl = document.createElement("span");
				iconEl.className = "inventexplorer-inline-icon";
				iconEl.contentEditable = "false";
				iconEl.setAttribute("data-inventexplorer-key", desiredKey);

				const result = renderIconToEl(
					iconEl,
					entry!.icon!,
					this.iconSetCache,
					entry!.color,
				);
				if (result === "missing-set") {
					const setId = entry!.icon!.split(":")[0];
					this.getIconSet(setId).then(() => this.refreshInlineTitleIcons());
					return;
				}
				titleEl.prepend(iconEl);
			});
	}

	async saveIconData() {
		await this.persist();
	}

	/**
	 * Tell the user WHICH mask is the problem, once per mask. Silence would
	 * leave them with an explorer where some icons simply never appear.
	 */
	private reportSlowMasks(slow: { mask: RegexMaskEntry; ms: number }[]): void {
		for (const { mask, ms } of slow) {
			if (this.reportedSlowMasks.has(mask.id)) continue;
			this.reportedSlowMasks.add(mask.id);
			new Notice(
				`InventExplorer: the regex mask ${describeMask(mask)} takes ${ms} ms on a single path, ` +
					"so it is being skipped — it would slow the file explorer down on every scroll. " +
					"Simplify the pattern (nested quantifiers like (a+)+ are the usual cause).",
				12000,
			);
		}
	}

	// Throttled: a corrupt file kept in the vault (e.g. mid-sync) fires a
	// modify event on every sync pass — without this the user gets a Notice
	// each time.
	private showConfigNotice(message: string) {
		const now = Date.now();
		if (now - this.lastConfigNoticeAt < 10_000) return;
		this.lastConfigNoticeAt = now;
		new Notice(message);
	}

	// Returns null when the file is missing, unreadable, or not a JSON
	// object — callers decide how to fall back (never wipe data blindly).
	private async readVaultConfig(path: string): Promise<StoredConfigData | null> {
		const normalizedPath = normalizePath(path);
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(normalizedPath))) return null;
		try {
			const text = await adapter.read(normalizedPath);
			const parsed = JSON.parse(text);
			this.lastKnownFileContent = text;
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				this.showConfigNotice(
					`InventExplorer: ${normalizedPath} is not a valid config file`,
				);
				return null;
			}
			return parsed as StoredConfigData;
		} catch (e) {
			console.error("inventexplorer: failed to read config", e);
			this.showConfigNotice(
				`InventExplorer: failed to read ${normalizedPath}, see console`,
			);
			return null;
		}
	}

	private applyVaultConfig(config: StoredConfigData) {
		const { iconData, ...syncedSettings } = config;
		if ("regexMasks" in syncedSettings) {
			syncedSettings.regexMasks = asRegexMasks(syncedSettings.regexMasks);
		}
		this.settings = {
			...this.settings,
			...syncedSettings,
			storageLocation: "vault",
			vaultConfigPath: this.settings.vaultConfigPath,
		};
		this.iconData = asIconData(iconData);
	}

	/** LicenseHost: persist credentials + standing (data.json only). */
	async saveLicense(): Promise<void> {
		await this.persist();
	}

	/** LicenseHost: re-render everything after a tier change. */
	refreshAll(): void {
		this.applyAllSettings();
		this.refresh();
		this.refreshInlineTitleIcons();
	}

	// ---------- Tier ceilings ----------
	//
	// Rendering is NEVER gated: a configuration that exceeds the free ceiling
	// (edited by hand, synced in from a device that had a license, or left
	// behind after a hold) keeps displaying every icon it defines. Ceilings
	// only ever refuse to create something NEW, so nobody's vault can end up
	// looking broken.

	/** Number of stored per-path assignments. */
	assignmentCount(): number {
		return Object.keys(this.iconData).length;
	}

	/**
	 * True when `path` may be customized. Editing (or clearing) an entry that
	 * already exists is ALWAYS allowed — the ceiling blocks new entries only,
	 * so hitting it can never strand a user with icons they cannot manage.
	 */
	canAssign(path: string): boolean {
		if (this.iconData[path]) return true;
		return this.assignmentCount() < assignmentCeiling();
	}

	/** True when another regex mask may be added. */
	canAddMask(): boolean {
		return this.settings.regexMasks.length < maskCeiling();
	}

	/** data.json only: the mirror plus the licence, never the vault file. */
	private async persistMirrorOnly(): Promise<void> {
		const dataJson = buildStoredConfigData(this.settings, this.iconData);
		await this.saveData({ ...dataJson, license: this.license });
	}

	private async persist() {
		const dataJson = buildStoredConfigData(this.settings, this.iconData);
		// The license rides along in data.json but NEVER in the vault config
		// below — that file syncs, and may end up in a shared or published
		// vault. `buildStoredConfigData` only ever emits settings + iconData,
		// so the vault copy stays free of credentials by construction.
		await this.saveData({ ...dataJson, license: this.license });

		if (this.settings.storageLocation === "vault") {
			const path = normalizePath(this.settings.vaultConfigPath);
			const adapter = this.app.vault.adapter;
			const dir = path.includes("/")
				? path.substring(0, path.lastIndexOf("/"))
				: "";
			if (dir && !(await adapter.exists(dir))) {
				await adapter.mkdir(dir);
			}
			// The file is written whole. If another device wrote to it since we
			// last looked — a sync landing inside our own debounce window — then
			// writing now would erase that work with nothing on screen to show
			// for it. Merge instead, by the same rule the collision dialog
			// offers: add what is missing, keep what this device set.
			const merged = await this.mergeIfChangedUnderneath(path, dataJson);
			const text = JSON.stringify(merged, null, 2);
			try {
				await adapter.write(path, text);
				this.lastKnownFileContent = text;
			} catch (e) {
				// The mirror in data.json was written above, so nothing is lost
				// on THIS device — but the file other devices read did not
				// change, and silence would let the user believe it did.
				console.error("inventexplorer: cannot write the config file", e);
				this.showConfigNotice(
					`InventExplorer: cannot write ${path} (${e instanceof Error ? e.message : String(e)}). ` +
						"Your change is kept on this device, but it will not reach other devices until the file is writable again.",
				);
			}
		}
	}

	/** Returns what to write: our own data, or a merge when the file moved. */
	private async mergeIfChangedUnderneath(
		path: string,
		mine: StoredConfigData,
	): Promise<StoredConfigData> {
		const adapter = this.app.vault.adapter;
		if (this.lastKnownFileContent === null) return mine;
		let onDisk: string;
		try {
			if (!(await adapter.exists(path))) return mine;
			onDisk = await adapter.read(path);
		} catch {
			return mine;
		}
		if (onDisk === this.lastKnownFileContent) return mine;
		let incoming: StoredConfigData;
		try {
			const parsed = JSON.parse(onDisk);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return mine;
			incoming = parsed as StoredConfigData;
		} catch {
			// Half-written by a sync client: our own copy is the sane one.
			return mine;
		}
		// Three-way: what we last saw is the base, so a deletion made here is
		// not undone by the copy that still has it.
		let base: StoredConfigData | null = null;
		try {
			base = this.lastKnownFileContent ? JSON.parse(this.lastKnownFileContent) : null;
		} catch { base = null; }
		const { merged, report } = mergeWithBase(
			base as never,
			mine as never,
			incoming as never,
			DEFAULT_SETTINGS as unknown as Record<string, unknown>,
		);
		if (report.entriesAdded || report.masksAdded || report.settingsAdopted.length) {
			this.iconData = asIconData((merged as StoredConfigData).iconData);
			const { iconData: _drop, ...settings } = merged as StoredConfigData;
			this.settings = {
				...this.settings,
				...settings,
				storageLocation: "vault",
				vaultConfigPath: this.settings.vaultConfigPath,
			};
			this.showConfigNotice(
				`InventExplorer: another device changed the icon config while you were editing — ` +
					`merged (${describeMerge(report)}).`,
			);
		}
		return merged as StoredConfigData;
	}

	// ---------- External icon sets ----------

	/** Fetch an icon set that is not on disk and keep it where a zip install
	 *  would have put it.
	 *
	 *  Why this exists: the zip ships all three sets, but BRAT — the way this
	 *  community installs plugins that are not in the store — only ever writes
	 *  manifest.json, main.js and styles.css. Without this, a BRAT install
	 *  silently loses three quarters of the icons.
	 *
	 *  It turns out better than the zip rather than merely equal: 10 MB of sets
	 *  are no longer forced on someone who only wanted Tabler. Only the set
	 *  actually asked for is fetched, once.
	 *
	 *  Returns null on any failure, which lands on the existing "reinstall so the
	 *  icon-sets folder sits next to main.js" path. Lucide and emoji never depend
	 *  on this and keep working regardless.
	 */
	private async downloadIconSet(setId: string, path: string): Promise<string | null> {
		// setId reaches here from icon ids in the user's own config, and is about
		// to be concatenated into a URL and a filesystem path. Anything not on the
		// list is refused rather than escaped.
		if (!DOWNLOADABLE_ICON_SETS.has(setId)) return null;

		const url = `${ICON_SET_RELEASE_BASE}/${this.manifest.version}/${setId}.json`;
		const notice = new Notice(`InventExplorer: downloading the ${setId} icon set…`, 0);
		try {
			// requestUrl, not fetch: Obsidian routes it outside the browser's CORS
			// rules, and GitHub's release downloads redirect to a different host.
			const response = await requestUrl({ url, throw: false });
			if (response.status !== 200) {
				console.error(`inventexplorer: icon set "${setId}" download failed, HTTP ${response.status}`);
				return null;
			}
			const text = response.text;
			// Parse before writing: half a file on disk would be read as present
			// forever after, and the failure would look like corruption instead of
			// a bad download.
			JSON.parse(text);

			const dir = `${path.slice(0, path.lastIndexOf("/"))}`;
			if (!(await this.app.vault.adapter.exists(dir))) {
				await this.app.vault.adapter.mkdir(dir);
			}
			await this.app.vault.adapter.write(path, text);
			return text;
		} catch (e) {
			console.error(`inventexplorer: could not fetch icon set "${setId}"`, e);
			return null;
		} finally {
			notice.hide();
		}
	}

	getIconSet(setId: string): Promise<Record<string, string> | null> {
		if (this.iconSetCache.has(setId)) {
			return Promise.resolve(this.iconSetCache.get(setId)!);
		}
		if (this.iconSetPending.has(setId)) {
			return this.iconSetPending.get(setId)!;
		}
		const promise = (async () => {
			// manifest.dir is the actual install folder (survives folder renames);
			// fall back to the conventional path just in case.
			const baseDir =
				this.manifest.dir ??
				`${this.app.vault.configDir}/plugins/${this.manifest.id}`;
			const path = `${baseDir}/icon-sets/${setId}.json`;
			try {
				const text = (await this.app.vault.adapter.exists(path))
					? await this.app.vault.adapter.read(path)
					: await this.downloadIconSet(setId, path);
				if (text === null) return null;
				const data = JSON.parse(text) as { icons: Record<string, string> };
				this.iconSetCache.set(setId, data.icons);
				return data.icons;
			} catch (e) {
				console.error(`inventexplorer: failed to load set "${setId}"`, e);
				return null;
			} finally {
				this.iconSetPending.delete(setId);
			}
		})();
		this.iconSetPending.set(setId, promise);
		return promise;
	}

	async preloadUsedIconSets() {
		const needed = new Set<string>();
		const addIconId = (icon: string | undefined) => {
			if (!icon || icon.startsWith("emoji:")) return;
			const colon = icon.indexOf(":");
			if (colon > 0) needed.add(icon.slice(0, colon));
		};
		for (const entry of Object.values(this.iconData)) {
			addIconId(entry.icon);
			addIconId(entry.iconExpanded);
		}
		addIconId(this.settings.defaultFile.icon);
		addIconId(this.settings.defaultFolder.icon);
		addIconId(this.settings.defaultFolder.iconExpanded);
		for (const mask of this.settings.regexMasks) {
			addIconId(mask.file?.icon);
			addIconId(mask.folder?.icon);
			addIconId(mask.folder?.iconExpanded);
		}
		await Promise.all([...needed].map((id) => this.getIconSet(id)));
	}

	async changeStorage(
		newLocation: StorageLocation,
		newVaultPath?: string,
	) {
		this.settings.storageLocation = newLocation;
		if (newVaultPath !== undefined) {
			this.settings.vaultConfigPath =
				newVaultPath || DEFAULT_SETTINGS.vaultConfigPath;
		}
		await this.persist();
	}

	async vaultConfigExists(path: string): Promise<boolean> {
		return this.app.vault.adapter.exists(normalizePath(path));
	}

	// Returns false (and changes nothing) when the file can't be read.
	async importVaultConfig(path: string): Promise<boolean> {
		const normalizedPath = normalizePath(path);
		const config = await this.readVaultConfig(normalizedPath);
		if (!config) {
			new Notice(`InventExplorer: cannot import ${normalizedPath}`);
			return false;
		}
		this.settings.storageLocation = "vault";
		this.settings.vaultConfigPath = normalizedPath;
		this.applyVaultConfig(config);
		this.applyAllSettings();
		await this.persist();
		this.refresh();
		this.refreshInlineTitleIcons();
		return true;
	}

	/**
	 * Keep both copies. Returns null when the file can't be read — the caller
	 * then changes nothing, exactly like a failed import.
	 */
	async mergeVaultConfig(path: string): Promise<string | null> {
		const normalizedPath = normalizePath(path);
		const incoming = await this.readVaultConfig(normalizedPath);
		if (!incoming) {
			new Notice(`InventExplorer: cannot read ${normalizedPath}, nothing merged`);
			return null;
		}
		const local = buildStoredConfigData(this.settings, this.iconData);
		const { merged, report } = mergeStoredConfig(
			local as never,
			incoming as never,
			DEFAULT_SETTINGS as unknown as Record<string, unknown>,
		);
		this.settings.storageLocation = "vault";
		this.settings.vaultConfigPath = normalizedPath;
		this.applyVaultConfig(merged as StoredConfigData);
		this.applyAllSettings();
		// The merged result is written back, so the file gains what only this
		// device had — that is the half of the merge the other device sees.
		await this.persist();
		this.refresh();
		this.refreshInlineTitleIcons();
		return describeMerge(report);
	}

	applyAllSettings() {
		this.applyIconSize();
		this.applyInlineTitleIconSize();
		this.applyExplorerBgColor();
		this.applyExplorerIndentLines();
		this.applyIndentLinesStyle();
		this.applyExplorerVerticalLines();
		this.applyVerticalLinesStyle();
	}

	// ---------- File menu ----------

	private addFileMenuItems(menu: Menu, file: TAbstractFile) {
		const entry = this.iconData[file.path];
		menu.addItem((item) => {
			item.setTitle("InventExplorer: customize icon")
				.setIcon("image")
				.onClick(() => {
					if (!this.canAssign(file.path)) {
						proNotice(
							`the free tier covers ${baseAssignments()} customized files and folders, ` +
								`and all of them are in use. The ones you already have keep working ` +
								`and can still be edited or removed.`,
						);
						return;
					}
					new CustomizeIconModal(this.app, this, file).open();
				});
		});
		if (entry && Object.keys(entry).length > 0) {
			menu.addItem((item) => {
				item.setTitle("InventExplorer: remove")
					.setIcon("trash")
					.onClick(async () => {
						delete this.iconData[file.path];
						await this.saveIconData();
						this.refresh();
					});
			});
		}
	}

	// ---------- Rendering ----------

	scheduleRefresh() {
		if (this.refreshing) return;
		if (this.refreshTimer !== null) return;
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			this.refresh();
		}, 75);
	}

	refresh() {
		if (this.refreshing) return;
		this.refreshing = true;
		// Pause observers while we mutate the DOM ourselves, otherwise
		// our own writes would re-trigger scheduleRefresh in a loop.
		for (const obs of this.observers) obs.disconnect();
		this.observers = [];
		try {
			this.applyReplaceArrowsClass();
			const leaves =
				this.app.workspace.getLeavesOfType("file-explorer");
			for (const leaf of leaves) this.applyToLeaf(leaf);
			this.refreshInlineTitleIcons();
		} finally {
			this.attachObservers();
			this.refreshing = false;
		}
	}

	setReplaceArrowsMode(replaceArrows: boolean) {
		this.settings.replaceArrows = replaceArrows;
		this.applyReplaceArrowsClass();
		this.refresh();
		this.settleFileExplorerLayout();
	}

	private settleFileExplorerLayout() {
		if (!this.settings.replaceArrows) return;
		if (this.settleTimer !== null) {
			window.clearTimeout(this.settleTimer);
		}
		this.settleTimer = window.setTimeout(() => {
			this.settleTimer = null;
			this.requestFileExplorerSort();
			this.refresh();
		}, 0);
	}

	private requestFileExplorerSort() {
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");
		for (const leaf of leaves) {
			const view = leaf.view as unknown as {
				requestSort?: () => void;
				sort?: () => void;
			};
			if (typeof view.requestSort === "function") {
				view.requestSort();
			} else if (typeof view.sort === "function") {
				view.sort();
			}
		}
	}

	// Adds/removes a CSS class on each file-explorer leaf container so that
	// the stylesheet can shift .nav-file-title padding in replace-arrows mode.
	private applyReplaceArrowsClass() {
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");
		for (const leaf of leaves) {
			const containerEl = (
				leaf.view as unknown as { containerEl?: HTMLElement }
			).containerEl;
			if (!containerEl) continue;
			containerEl.toggleClass(
				"inventexplorer-replace-arrows",
				this.settings.replaceArrows,
			);
		}
	}

	private applyToLeaf(leaf: WorkspaceLeaf) {
		const view = leaf.view as unknown as {
			fileItems?: Record<string, FileItem>;
		};
		const fileItems = view.fileItems;
		if (!fileItems) return;
		const modeTag = this.settings.replaceArrows ? "R" : "A";

		// Compile mask patterns once per refresh, not once per item. The matcher
		// keeps each mask on a time budget while it runs, so one pathological
		// pattern cannot make every scroll of the explorer cost a fifth of a
		// second — it is switched off and named instead.
		const matcher = new MaskMatcher(
			this.settings.regexMasks,
			undefined,
			undefined,
			this.disabledMaskKeys,
		);

		for (const path of Object.keys(fileItems)) {
			const item = fileItems[path];
			const target = pickItemEl(item);
			if (!target) continue;

			// Collapse state — only meaningful for folders (which have the
			// collapse-icon element). Files always treat this as "expanded".
			const collapseEl = target.querySelector<HTMLElement>(
				".tree-item-icon.collapse-icon",
			);
			const isFolder = !!collapseEl;
			const isCollapsed = isFolder
				? collapseEl!.classList.contains("is-collapsed")
				: false;

			// Resolve each property independently through the priority chain:
			//   specific path entry  →  first matching regex mask  →  global default
			// Every property falls through to the next level only when undefined at
			// the current level, so e.g. a mask can set only the color while the
			// default icon still shows through, and a specific entry can override
			// just italic while inheriting everything else from a mask or default.
			const specificEntry = this.iconData[path];

			// Find the first matching regex mask entry for this path
			const hitMask = matcher.match(path);
			const matchedMask: DefaultIconEntry | undefined = hitMask
				? (isFolder ? hitMask.folder : hitMask.file)
				: undefined;

			const def = isFolder
				? (this.settings.defaultFolder ?? {})
				: (this.settings.defaultFile ?? {});

			// Per-property three-level fallback
			const effectiveIcon          = specificEntry?.icon          ?? matchedMask?.icon          ?? def.icon;
			const effectiveColor         = specificEntry?.color         ?? matchedMask?.color         ?? def.color;
			// Expanded state falls back to the SAME LEVEL's collapsed value before
			// dropping to the next level. Without that, a folder that sets only an
			// icon would lose it the moment you expand it — the global default
			// expanded icon would win over the folder's own choice, which reads as
			// a bug. Setting `iconExpanded` explicitly still overrides everything.
			const effectiveIconExpanded  = isFolder
				? ((specificEntry?.iconExpanded  ?? specificEntry?.icon)
					?? (matchedMask?.iconExpanded  ?? matchedMask?.icon)
					?? (def.iconExpanded  ?? def.icon))
				: undefined;
			const effectiveColorExpanded = isFolder
				? ((specificEntry?.colorExpanded ?? specificEntry?.color)
					?? (matchedMask?.colorExpanded ?? matchedMask?.color)
					?? (def.colorExpanded ?? def.color))
				: undefined;

			// TextStyle: merge per-field so each property falls through independently
			const sTs = specificEntry?.textStyle;
			const mTs = matchedMask?.textStyle;
			const dTs = def.textStyle;
			const effectiveTextStyle: TextStyle = {
				fontFamily: sTs?.fontFamily ?? mTs?.fontFamily ?? dTs?.fontFamily,
				fontSize:   sTs?.fontSize   ?? mTs?.fontSize   ?? dTs?.fontSize,
				fontWeight: sTs?.fontWeight ?? mTs?.fontWeight ?? dTs?.fontWeight,
				italic:     sTs?.italic     ?? mTs?.italic     ?? dTs?.italic,
				textColor:  sTs?.textColor  ?? mTs?.textColor  ?? dTs?.textColor,
			};
			const hasTextStyle = Object.values(effectiveTextStyle).some((v) => v !== undefined);

			const hasExpandedIcon = isFolder && !!effectiveIconExpanded;

			// Pick which icon/color is active for the current state.
			const useExpanded = hasExpandedIcon && !isCollapsed;
			const activeIcon  = useExpanded ? effectiveIconExpanded : effectiveIcon;
			const activeColor = useExpanded ? effectiveColorExpanded : effectiveColor;
			const ts = hasTextStyle ? effectiveTextStyle : undefined;
			const tsKey = ts
				? `${ts.fontFamily ?? ""}|${ts.fontSize ?? ""}|${ts.fontWeight ?? ""}|${ts.italic ?? ""}|${ts.textColor ?? ""}`
				: "";

			// State suffix is only added when a two-icon setup is in use, so
			// the key changes when the folder is toggled.
			const stateTag =
				hasExpandedIcon ? (isCollapsed ? "C" : "E") : "";
			const desired = `${activeIcon ?? ""}|${activeColor ?? ""}|${modeTag}|${stateTag}|${tsKey}`;

			const current = target.getAttribute(KEY_ATTR) ?? "";
			if (current === desired) continue;

			// Remove any previous icon decoration
			target.querySelectorAll(`.${ICON_CLASS}`).forEach((el) => el.remove());

			// Apply / remove text style on the inner text element
			const innerEl = target.querySelector<HTMLElement>(".tree-item-inner");
			applyTextStyle(innerEl, ts);

			if (!activeIcon) {
				target.removeAttribute(KEY_ATTR);
				target.setAttribute(KEY_ATTR, desired);
				continue;
			}

			const node = document.createElement("div");
			node.className = ICON_CLASS;
			node.setAttr("aria-label", activeIcon!);
			const result = renderIconToEl(
				node,
				activeIcon!,
				this.iconSetCache,
				activeColor,
			);
			if (result === "missing-set") {
				const setId = activeIcon!.split(":")[0];
				this.getIconSet(setId).then(() => this.scheduleRefresh());
				target.removeAttribute(KEY_ATTR);
				continue;
			}

			if (this.settings.replaceArrows && collapseEl) {
				// Place icon INSIDE the collapse indicator so it occupies
				// the exact same space as the arrow.
				// Obsidian CSS rotates `.collapse-icon svg` and may force its
				// own color/stroke on the SVG — we override everything with
				// !important inline styles on both the wrapper and the SVG.
				node.addClass("inventexplorer-replaces-arrow");
				if (activeColor) {
					node.style.setProperty("color", activeColor, "important");
					const svgEl = node.querySelector("svg") as HTMLElement | null;
					if (svgEl) {
						svgEl.style.setProperty("color", activeColor, "important");
					}
				}
				collapseEl.prepend(node);
			} else {
				target.prepend(node);
			}
			target.setAttribute(KEY_ATTR, desired);
		}
		const slow = matcher.takeSlow();
		if (slow.length) this.reportSlowMasks(slow);
	}

	private removeAllDecorations() {
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");
		for (const leaf of leaves) {
			const containerEl = (
				leaf.view as unknown as { containerEl?: HTMLElement }
			).containerEl;
			if (!containerEl) continue;
			containerEl
				.querySelectorAll(`.${ICON_CLASS}`)
				.forEach((el) => el.remove());
			containerEl
				.querySelectorAll<HTMLElement>(`[${KEY_ATTR}]`)
				.forEach((el) => {
					el.removeAttribute(KEY_ATTR);
					const inner = el.querySelector<HTMLElement>(".tree-item-inner");
					applyTextStyle(inner, undefined);
				});
		}
	}

	private attachObservers() {
		for (const obs of this.observers) obs.disconnect();
		this.observers = [];
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");
		for (const leaf of leaves) {
			const containerEl = (
				leaf.view as unknown as { containerEl?: HTMLElement }
			).containerEl;
			if (!containerEl) continue;
			const observer = new MutationObserver((mutations) => {
				if (this.refreshing) return;
				// Ignore mutations we caused ourselves: the only DOM
				// changes we make are inside .inventexplorer-icon spans or
				// adding/removing such spans. If every mutation target
				// is one of our decorations, skip the refresh.
				let hasForeignMutation = false;
				for (const m of mutations) {
					if (mutationIsOurs(m)) continue;
					if (m.type === "attributes") {
						// Only care about class changes on .tree-item and
						// .collapse-icon (where is-collapsed lives).
						// Ignore hover/active/focus changes on other elements.
						const el = m.target as HTMLElement;
						if (
							!el.classList.contains("tree-item") &&
							!el.classList.contains("collapse-icon")
						) {
							continue;
						}
					}
					hasForeignMutation = true;
					break;
				}
				if (!hasForeignMutation) return;
				this.scheduleRefresh();
			});
			observer.observe(containerEl, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["class"],
			});
			this.observers.push(observer);
		}
	}
}

function mutationIsOurs(m: MutationRecord): boolean {
	const target = m.target as HTMLElement | null;
	if (target?.classList?.contains(ICON_CLASS)) return true;
	if (target?.closest?.(`.${ICON_CLASS}`)) return true;
	const touchesOnlyOurs = (nodes: NodeList) => {
		for (let i = 0; i < nodes.length; i++) {
			const n = nodes[i] as HTMLElement;
			if (
				!(n instanceof HTMLElement) ||
				!n.classList?.contains(ICON_CLASS)
			) {
				return false;
			}
		}
		return nodes.length > 0;
	};
	if (
		m.type === "childList" &&
		(m.addedNodes.length > 0 || m.removedNodes.length > 0)
	) {
		const addedOurs =
			m.addedNodes.length === 0 || touchesOnlyOurs(m.addedNodes);
		const removedOurs =
			m.removedNodes.length === 0 ||
			touchesOnlyOurs(m.removedNodes);
		if (addedOurs && removedOurs) return true;
	}
	return false;
}

interface FileItem {
	file?: TAbstractFile;
	selfEl?: HTMLElement;
	innerEl?: HTMLElement;
	titleEl?: HTMLElement;
	titleInnerEl?: HTMLElement;
	el?: HTMLElement;
}

function pickItemEl(item: FileItem): HTMLElement | null {
	return (
		item.selfEl ||
		item.titleEl ||
		item.innerEl ||
		item.titleInnerEl ||
		item.el ||
		null
	);
}

type RenderResult = "ok" | "missing-set";

function applyTextStyle(el: HTMLElement | null, ts: TextStyle | undefined) {
	if (!el) return;
	el.style.fontFamily = ts?.fontFamily ?? "";
	el.style.fontSize = ts?.fontSize ?? "";
	el.style.fontWeight = ts?.fontWeight ?? "";
	el.style.fontStyle = ts?.italic ? "italic" : "";
	el.style.color = ts?.textColor ?? "";
}

function renderIconToEl(
	el: HTMLElement,
	iconId: string,
	cache: Map<string, Record<string, string>>,
	color?: string,
): RenderResult {
	if (iconId.startsWith("emoji:")) {
		el.addClass("inventexplorer-is-emoji");
		el.createSpan({ cls: "inventexplorer-emoji-glyph", text: iconId.slice(6) });
		return "ok";
	}
	const colon = iconId.indexOf(":");
	if (colon > 0) {
		const setId = iconId.slice(0, colon);
		const iconName = iconId.slice(colon + 1);
		const setData = cache.get(setId);
		if (!setData) return "missing-set";
		const svg = setData[iconName];
		if (svg) {
			el.innerHTML = svg; // safe: our own generated SVG from known icon libraries
			const svgEl = el.querySelector("svg");
			if (svgEl) (svgEl as unknown as HTMLElement).style.display = "block";
		}
		if (color) el.style.color = color;
		return "ok";
	}
	// Lucide
	setIcon(el, iconId);
	if (color) el.style.color = color;
	return "ok";
}

// ---------- Color helpers ----------

function isValidCssColor(color: string): boolean {
	const el = document.createElement("span");
	el.style.color = color;
	return el.style.color !== "";
}

// Converts any CSS color string to a 6-digit hex understood by <input type="color">.
// Returns null when conversion isn't possible (e.g. browser gives "rgba(…)" back).
function cssColorToHex(color: string): string | null {
	if (!color) return null;
	if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
	// Use canvas to let the browser normalise to hex
	try {
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.fillStyle = color;
		const computed = ctx.fillStyle; // browser normalises to "#rrggbb" or "rgba(…)"
		return /^#[0-9a-fA-F]{6}$/.test(computed) ? computed : null;
	} catch {
		return null;
	}
}

// ---------- Customize modal ----------

class CustomizeIconModal extends Modal {
	plugin: InventExplorerPlugin;
	file: TAbstractFile;
	current: IconEntry;

	constructor(app: App, plugin: InventExplorerPlugin, file: TAbstractFile) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.current = { ...(plugin.iconData[file.path] ?? {}) };
	}

	onOpen() {
		this.render();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("inventexplorer-modal");

		contentEl.createEl("h3", {
			text: `Customize: ${this.file.path}`,
			cls: "inventexplorer-title",
		});

		const preview = contentEl.createDiv({ cls: "inventexplorer-preview" });
		this.renderPreview(preview);

		const isFolder = this.file instanceof TFolder;

		// ── Collapsed / single icon block ───────────────────────────────
		this.renderIconColorBlock(
			contentEl, preview,
			isFolder ? "Icon (collapsed)" : "Icon",
			isFolder ? "Color (collapsed)" : "Color",
			() => this.current.icon,
			(v) => { this.current.icon = v; },
			() => this.current.color,
			(v) => { this.current.color = v; },
		);

		// ── Expanded icon block (folders only) ──────────────────────────
		if (isFolder) {
			contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
			this.renderIconColorBlock(
				contentEl, preview,
				"Icon (expanded)",
				"Color (expanded)",
				() => this.current.iconExpanded,
				(v) => { this.current.iconExpanded = v; },
				() => this.current.colorExpanded,
				(v) => { this.current.colorExpanded = v; },
			);
		}

		// ── Show in note title (files only) ─────────────────────────────
		if (!isFolder) {
			contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
			new Setting(contentEl)
				.setName("Show icon in note title")
				.setDesc("Display this icon next to the inline title in the editor.")
				.addToggle((t) =>
					t
						.setValue(this.current.showInTitle ?? false)
						.onChange((v) => {
							this.current.showInTitle = v || undefined;
						}),
				);
		}

		// ── Text style ───────────────────────────────────────────────────
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "Text style" });
		renderSharedTextStyleBlock(
			contentEl,
			() => this.current.textStyle,
			(ts) => { this.current.textStyle = Object.keys(ts).length ? ts : undefined; },
		);

		const buttons = contentEl.createDiv({ cls: "inventexplorer-buttons" });
		const applyBtn = buttons.createEl("button", { text: "Apply" });
		applyBtn.addEventListener("click", async () => {
			await this.applyChanges();
			new Notice("InventExplorer: changes applied");
		});
		const saveBtn = buttons.createEl("button", {
			text: "Save",
			cls: "mod-cta",
		});
		saveBtn.addEventListener("click", async () => {
			await this.applyChanges();
			this.close();
		});
		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
	}

	private async applyChanges() {
		const { icon, color, iconExpanded, colorExpanded, showInTitle, textStyle } = this.current;
		const hasTextStyle = textStyle && Object.keys(textStyle).length > 0;
		if (!icon && !color && !iconExpanded && !colorExpanded && !showInTitle && !hasTextStyle) {
			delete this.plugin.iconData[this.file.path];
		} else {
			// Second guard behind the menu check: the modal may have been open
			// while other entries were added elsewhere.
			if (!this.plugin.canAssign(this.file.path)) {
				proNotice(
					`the free tier covers ${baseAssignments()} customized files and folders, ` +
						`and all of them are in use.`,
				);
				return;
			}
			const entry: IconEntry = {};
			if (icon) entry.icon = icon;
			if (color) entry.color = color;
			if (iconExpanded) entry.iconExpanded = iconExpanded;
			if (colorExpanded) entry.colorExpanded = colorExpanded;
			if (showInTitle) entry.showInTitle = showInTitle;
			if (hasTextStyle) entry.textStyle = textStyle;
			this.plugin.iconData[this.file.path] = entry;
		}
		await this.plugin.saveIconData();
		this.plugin.refresh();
	}

	// Renders one icon-pick row + one color row (with palette) into contentEl.
	// Getters/setters allow the same code to serve both the collapsed and
	// expanded sections without any shared mutable state between them.
	private renderIconColorBlock(
		contentEl: HTMLElement,
		preview: HTMLElement,
		iconLabel: string,
		colorLabel: string,
		getIcon: () => string | undefined,
		setIcon: (v: string | undefined) => void,
		getColor: () => string | undefined,
		setColor: (v: string | undefined) => void,
	) {
		new Setting(contentEl)
			.setName(iconLabel)
			.setDesc(getIcon() ? `Current: ${getIcon()}` : "No icon")
			.addButton((b) =>
				b
					.setButtonText("Choose…")
					.setCta()
					.onClick(() => {
						new IconPickerModal(
							this.app,
							this.plugin,
							getIcon(),
							(icon) => {
								setIcon(icon ?? undefined);
								this.render();
							},
						).open();
					}),
			)
			.addButton((b) =>
				b.setButtonText("Clear icon").onClick(() => {
					setIcon(undefined);
					this.render();
				}),
			);

		const isEmoji = getIcon()?.startsWith("emoji:") ?? false;
		if (isEmoji) {
			contentEl.createEl("p", {
				text: "Emoji are always their native color — color picker is not applicable.",
				cls: "inventexplorer-info",
			});
		} else {
			let pickerSetValue: (hex: string) => void = () => {};
			let textSetValue: (v: string) => void = () => {};

			const applyColor = (raw: string) => {
				setColor(raw || undefined);
				this.renderPreview(preview);
				if (!raw) {
					textSetValue("");
					pickerSetValue("#888888");
					return;
				}
				textSetValue(raw);
				const hex = cssColorToHex(raw);
				if (hex) pickerSetValue(hex);
			};

			// Free tier gets the preset palette below; the free-form picker and
			// the CSS colour field are tiered.
			const colorSetting = new Setting(contentEl).setName(colorLabel);
			if (hasFeature("customColor")) {
				colorSetting
					.addColorPicker((c) => {
						c.setValue(cssColorToHex(getColor() ?? "") ?? "#888888");
						pickerSetValue = (hex) => c.setValue(hex);
						c.onChange((hex) => {
							setColor(hex);
							textSetValue(hex);
							this.renderPreview(preview);
						});
					})
					.addText((t) => {
						t.inputEl.addClass("inventexplorer-color-text");
						t.setPlaceholder("#rrggbb · red · rgb(…) · hsl(…)");
						t.setValue(getColor() ?? "");
						textSetValue = (v) => { t.inputEl.value = v; };
						t.onChange((v) => {
							const trimmed = v.trim();
							if (!trimmed) { applyColor(""); return; }
							if (isValidCssColor(trimmed)) applyColor(trimmed);
						});
					});
			} else {
				proChip(colorSetting.nameEl);
				colorSetting.setDesc("Pick from the palette below, or unlock any CSS colour with Pro.");
			}
			colorSetting.addButton((b) =>
				b.setButtonText("Clear").onClick(() => applyColor("")),
			);

			const palette = contentEl.createDiv({ cls: "inventexplorer-palette" });
			for (const color of PALETTE_COLORS) {
				const swatch = palette.createDiv({ cls: "inventexplorer-swatch" });
				swatch.style.backgroundColor = color;
				swatch.setAttr("aria-label", color);
				if (color === getColor()) swatch.addClass("is-active");
				swatch.addEventListener("click", () => {
					palette.querySelectorAll(".inventexplorer-swatch").forEach(
						(s) => s.removeClass("is-active"),
					);
					swatch.addClass("is-active");
					applyColor(color);
				});
			}
		}

		if (isEmoji) contentEl.createDiv({ cls: "inventexplorer-palette" });
	}

	private renderPreview(el: HTMLElement) {
		el.empty();

		const addIcon = (iconId: string | undefined, color: string | undefined, label: string) => {
			const wrap = el.createSpan({ cls: "inventexplorer-preview-slot" });
			const iconEl = wrap.createSpan({ cls: "inventexplorer-preview-icon" });
			if (iconId) {
				const result = renderIconToEl(iconEl, iconId, this.plugin.iconSetCache, color);
				if (result === "missing-set") {
					iconEl.setText("…");
					const setId = iconId.split(":")[0];
					this.plugin.getIconSet(setId).then(() => this.renderPreview(el));
				}
			} else {
				iconEl.setText("·");
			}
			wrap.createSpan({ cls: "inventexplorer-preview-kind", text: label });
		};

		const isFolder = this.file instanceof TFolder;
		if (isFolder && this.current.iconExpanded) {
			addIcon(this.current.icon, this.current.color, "▶");
			addIcon(this.current.iconExpanded, this.current.colorExpanded, "▼");
		} else {
			addIcon(this.current.icon, this.current.color, "");
		}

		el.createSpan({ text: ` ${this.file.name}`, cls: "inventexplorer-preview-name" });
		el.createSpan({
			text: isFolder ? " (folder)" : this.file instanceof TFile ? " (file)" : "",
			cls: "inventexplorer-preview-kind",
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---------- Emoji data ----------

const EMOJI_CATEGORIES: { name: string; items: string[] }[] = [
	{
		name: "Smiley & Emotion",
		items: [
			"😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃",
			"😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜",
			"🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔",
			"😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤",
			"😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓",
			"🤗","🤔","🤭","🤫","🤥","😶","😑","😬","🙄","😯","😦","😧",
			"😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧",
			"😷","🤒","🤕","🤑","🤠","😈","👿","👹","👺","💀","☠️","👻",
			"👽","🤖","💩","😺","😸","😹","😻","😼","😽","🙀","😿","😾",
			"❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕",
			"💞","💓","💗","💖","💘","💝","💟","💋","💥","💢","💦","💨",
			"💫","💤","🔥","✨","⭐","🌟","💯","🎉","🎊",
		],
	},
	{
		name: "People & Body",
		items: [
			"👋","🤚","🖐️","✋","🖖","👌","🤌","✌️","🤞","🤟","🤘","🤙",
			"👈","👉","👆","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏",
			"🙌","👐","🤲","🤝","🙏","✍️","💅","💪","👀","👁️","👅","👄",
			"👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵",
			"🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷",
			"👮","🕵️","💂","🥷","👷","👸","🧝","🧙","🧛","🧟","🧞",
			"🧜","🧚","👼","🤶","🎅","🦸","🦹",
		],
	},
	{
		name: "Animals & Nature",
		items: [
			"🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮",
			"🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🦆",
			"🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞",
			"🐜","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑",
			"🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅",
			"🐆","🦓","🦍","🦧","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬",
			"🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩",
			"🦮","🐈","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊️","🐇","🦝",
			"🦨","🦡","🦦","🦥","🐁","🐀","🐿️","🦔",
			"🌱","🌿","☘️","🍀","🎋","🎍","🍃","🍂","🍁","🍄","🌾","💐",
			"🌷","🌹","🥀","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌚",
			"🌕","🌑","🌙","🌟","⭐","🌠","✨","⚡","🔥","💥","☄️","☀️",
			"⛅","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","💨","💧","💦",
			"🌊","🌈","🌋","🗻","🏔️","⛰️","🌄","🌅",
		],
	},
	{
		name: "Food & Drink",
		items: [
			"🍎","🍊","🍋","🍌","🍍","🥭","🍇","🍓","🫐","🍈","🍒","🍑",
			"🥝","🍅","🫒","🥥","🥑","🍆","🥔","🥕","🌽","🌶️","🫑","🥒",
			"🥬","🥦","🧄","🧅","🍞","🥐","🥖","🫓","🥨","🧀","🥚","🍳",
			"🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫔",
			"🌮","🌯","🥙","🧆","🍿","🧂","🥫","🍱","🍘","🍙","🍚","🍛",
			"🍜","🍝","🍣","🍤","🥮","🍡","🧁","🍰","🎂","🍮","🍭","🍬",
			"🍫","🍩","🍪","🌰","🥜","🍯","🧃","🥤","🧋","☕","🫖","🍵",
			"🍺","🍻","🥂","🍷","🥃","🍸","🍹","🍾","🫗",
		],
	},
	{
		name: "Activities",
		items: [
			"⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓",
			"🏸","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂",
			"🪂","🏋️","🤼","🤸","🤺","⛹️","🤾","🏌️","🏇","🧘","🧗","🏄",
			"🚣","🏊","🤽","🚴","🏆","🥇","🥈","🥉","🏅","🎖️","🎗️","🎫",
			"🎟️","🎪","🤹","🎭","🎨","🎬","🎤","🎧","🎵","🎶","🎸","🎹",
			"🎺","🎻","🥁","🪘","🎷","🎲","🎯","🎳","🎰","🎮","🎊","🎉",
			"🎈","🎀","🎁","🎗️","🎑","🎃","🎄","🎆","🎇",
		],
	},
	{
		name: "Travel & Places",
		items: [
			"🚗","🚕","🚙","🚌","🚎","🚓","🚑","🚒","🚐","🚚","🚛","🚜",
			"🏎️","🏍️","🛵","🛺","🚲","🛴","🚁","🛸","🚀","✈️","🛶","⛵",
			"🚤","🛥️","🛳️","⛴️","🚢","🚂","🚄","🚅","🚇","🚉","🚊","🚝",
			"🚞","🚋","🚌","🚍","🚎","🏠","🏡","🏢","🏣","🏤","🏥","🏦",
			"🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","🗼","🗽","⛪","🕌",
			"🛕","⛩️","🕍","🗺️","🏞️","🌁","🌃","🏙️","🌄","🌅","🌆","🌇",
			"🌉","🗾","🎑","⛽","🚦","🚥","🚧","⚓","🛟","⛵","🚏","🛣️",
			"🗺️","🌐","🧭","⏱️","⏰","⌛","⏳","📅","📆","🗓️",
		],
	},
	{
		name: "Objects",
		items: [
			"💡","🔦","🕯️","🧯","💊","💉","🩹","🩺","🩻","🔬","🔭","📡",
			"⚗️","🧪","🧫","🧬","🔮","⚖️","🔧","🔨","⚒️","🛠️","⛏️","🔩",
			"🪛","🔑","🗝️","🔒","🔓","🚪","🪞","🪟","🛋️","🪑","🚽","🚿",
			"🛁","🧴","🧷","🧹","🧺","🧻","🪣","🧼","🪥","🧽","💰","💳",
			"💵","🧾","📱","💻","🖥️","🖨️","⌨️","🖱️","📷","📸","📹","📺",
			"📻","☎️","📞","📟","📠","🔋","🔌","📖","📚","📝","✏️","🖊️",
			"🖋️","📋","📌","📍","🗂️","📅","📆","📇","📈","📉","📊","📁",
			"📂","🗃️","🗄️","🗑️","📦","📫","📬","📭","📮","📯","📢","📣",
			"📤","📥","📧","💬","💭","🗯️","📎","🖇️","✂️","🗃️","🗄️","🔍",
			"🔎","🔐","🔏","🔓","🔒","🏮","🔖","🏷️","💈","⚗️","🔭","🔬",
			"🩺","🩻","🩼","🩹","💊","💉","🧬","🧫","🧪","⏱️","⏰","⌛",
		],
	},
	{
		name: "Symbols",
		items: [
			"❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💯",
			"✅","❌","⭕","🛑","⛔","📛","🚫","♻️","✔️","☑️","⚠️","🔱",
			"⚜️","🔰","ℹ️","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤",
			"🔶","🔷","🔸","🔹","🔺","🔻","💠","🔲","🔳","⬛","⬜","🟥",
			"🟧","🟨","🟩","🟦","🟪","🟫","▪️","▫️","◾","◽","◼️","◻️",
			"➡️","⬅️","⬆️","⬇️","↗️","↘️","↙️","↖️","↕️","↔️","↩️","↪️",
			"⤴️","⤵️","🔀","🔁","🔂","🔄","🔃","▶️","⏸️","⏹️","⏭️","⏮️",
			"⏩","⏪","⏫","⏬","◀️","🔼","🔽","➕","➖","➗","✖️","♾️",
			"💲","💱","™️","©️","®️","〰️","🔚","🔙","🔛","🔝","🔜",
			"🏧","♿","🚾","🛗","🚹","🚺","🚻","🚮","🎦","📶","🔣","🔤",
			"🔡","🔠","🆖","🆗","🆙","🆒","🆕","🆓","🆔","🆚","🆎","🆑",
			"🅰️","🅱️","🅾️","🆘","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣",
			"6️⃣","7️⃣","8️⃣","9️⃣","🔟","#️⃣","*️⃣",
			"☮️","✝️","☪️","🕉️","✡️","🔯","🕎","☯️","☦️","🛐","⛎",
			"♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓",
		],
	},
];

// ---------- Emoji name search ----------

// Lazily built lookup: emoji → space-separated English keywords. Entries are
// stored both as-is and with the VS16 variation selector stripped, because
// the picker's emoji list and emojilib's keys are not always byte-identical.
const EMOJI_NAME_LOOKUP: Map<string, string> = new Map();

function emojiKeywords(emoji: string): string {
	if (EMOJI_NAME_LOOKUP.size === 0) {
		for (const [em, words] of Object.entries(
			emojiNames as Record<string, string>,
		)) {
			EMOJI_NAME_LOOKUP.set(em, words);
			const stripped = em.replace(/\uFE0F/g, "");
			if (!EMOJI_NAME_LOOKUP.has(stripped)) {
				EMOJI_NAME_LOOKUP.set(stripped, words);
			}
		}
	}
	return (
		EMOJI_NAME_LOOKUP.get(emoji) ??
		EMOJI_NAME_LOOKUP.get(emoji.replace(/\uFE0F/g, "")) ??
		""
	);
}

// ---------- Icon picker ----------

const ICON_SETS = [
	{ id: "lucide",   label: "Lucide" },
	{ id: "tabler",   label: "Tabler" },
	{ id: "boxicons", label: "Boxicons" },
	{ id: "phosphor", label: "Phosphor" },
] as const;

type IconSetId = typeof ICON_SETS[number]["id"];

class IconPickerModal extends Modal {
	plugin: InventExplorerPlugin;
	currentIcon: string | undefined;
	onChoose: (icon: string | null) => void;

	allLucideIds: string[] = [];
	searchEl!: HTMLInputElement;
	gridEl!: HTMLElement;
	statusEl!: HTMLElement;
	setRowEl!: HTMLElement;
	catRowEl!: HTMLElement;

	activeTab: "icons" | "emoji" = "icons";
	activeIconSet: IconSetId = "lucide";
	activeCategoryIdx = 0;

	// external set state
	extData: Record<string, string> | null = null;
	extLoading = false;
	extMissing = false;

	readonly pageSize = 300;

	constructor(
		app: App,
		plugin: InventExplorerPlugin,
		currentIcon: string | undefined,
		onChoose: (icon: string | null) => void,
	) {
		super(app);
		this.plugin = plugin;
		this.currentIcon = currentIcon;
		this.onChoose = onChoose;

		if (currentIcon?.startsWith("emoji:")) {
			this.activeTab = "emoji";
		} else if (currentIcon && currentIcon.includes(":")) {
			const setId = currentIcon.split(":")[0] as IconSetId;
			if (ICON_SETS.some((s) => s.id === setId)) {
				this.activeIconSet = setId;
			}
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("inventexplorer-picker");
		contentEl.createEl("h3", { text: "Choose an icon" });

		// ── Tab bar ──────────────────────────────────────────────
		const tabBar = contentEl.createDiv({ cls: "inventexplorer-tabbar" });
		const tabIcons = tabBar.createEl("button", { text: "Icons", cls: "inventexplorer-tab" });
		const tabEmoji = tabBar.createEl("button", { text: "Emoji", cls: "inventexplorer-tab" });

		// ── Icon-set selector (icons tab only) ───────────────────
		this.setRowEl = contentEl.createDiv({ cls: "inventexplorer-catrow inventexplorer-setrow" });
		const setButtons: Map<IconSetId, HTMLButtonElement> = new Map();
		for (const { id, label } of ICON_SETS) {
			const btn = this.setRowEl.createEl("button", { text: label, cls: "inventexplorer-catbtn" });
			// Lucide ships with Obsidian and is always available; the bundled
			// sets are tiered. Browsing them stays open on purpose — seeing the
			// icons is the point — only picking one is gated (see renderIconGrid).
			if (id !== "lucide" && !hasFeature("iconSets")) {
				btn.addClass("inventexplorer-catbtn-pro");
				proChip(btn);
			}
			setButtons.set(id, btn);
			btn.addEventListener("click", () => {
				if (this.activeIconSet === id && !this.extLoading) return;
				setButtons.forEach((b) => b.removeClass("is-active"));
				btn.addClass("is-active");
				this.switchToIconSet(id);
			});
		}

		// ── Emoji category row ────────────────────────────────────
		this.catRowEl = contentEl.createDiv({ cls: "inventexplorer-catrow" });
		for (let i = 0; i < EMOJI_CATEGORIES.length; i++) {
			const btn = this.catRowEl.createEl("button", {
				text: EMOJI_CATEGORIES[i].name,
				cls: "inventexplorer-catbtn",
			});
			btn.addEventListener("click", () => {
				this.activeCategoryIdx = i;
				this.searchEl.value = "";
				this.renderGrid();
			});
		}

		// ── Search ────────────────────────────────────────────────
		this.searchEl = contentEl.createEl("input", { type: "text" });
		this.searchEl.addClass("inventexplorer-search");
		this.searchEl.addEventListener("input", () => this.renderGrid());

		// ── Status + grid ─────────────────────────────────────────
		this.statusEl = contentEl.createDiv({ cls: "inventexplorer-status" });
		this.gridEl = contentEl.createDiv({ cls: "inventexplorer-grid" });

		// ── Bottom buttons ────────────────────────────────────────
		const buttons = contentEl.createDiv({ cls: "inventexplorer-buttons" });
		buttons.createEl("button", { text: "No icon" })
			.addEventListener("click", () => { this.onChoose(null); this.close(); });
		buttons.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => this.close());

		// ── Lucide IDs ────────────────────────────────────────────
		try {
			this.allLucideIds = (typeof getIconIds === "function" ? getIconIds() : []) as string[];
			this.allLucideIds.sort();
		} catch {
			this.allLucideIds = [];
		}

		// ── Tab switching ─────────────────────────────────────────
		const switchTab = (tab: "icons" | "emoji") => {
			this.activeTab = tab;
			this.searchEl.value = "";
			tabIcons.toggleClass("is-active", tab === "icons");
			tabEmoji.toggleClass("is-active", tab === "emoji");
			this.setRowEl.style.display = tab === "icons" ? "flex" : "none";
			this.catRowEl.style.display = tab === "emoji" ? "flex" : "none";
			this.searchEl.placeholder = tab === "icons" ? "Search icons…" : "Search emoji…";
			this.renderGrid();
			this.searchEl.focus();
		};

		tabIcons.addEventListener("click", () => switchTab("icons"));
		tabEmoji.addEventListener("click", () => switchTab("emoji"));

		// Mark active set button
		setButtons.get(this.activeIconSet)?.addClass("is-active");

		// If opened with an external icon already set, prepare that set's
		// state (cache lookup or async load) BEFORE the first render —
		// otherwise renderIconGrid would hit a null extData.
		if (this.activeIconSet !== "lucide") {
			this.switchToIconSet(this.activeIconSet);
		}

		switchTab(this.activeTab);
	}

	// ── Async set loading ─────────────────────────────────────────

	private switchToIconSet(setId: IconSetId) {
		this.activeIconSet = setId;
		this.searchEl.value = "";

		if (setId === "lucide") {
			this.extData = null;
			this.extLoading = false;
			this.extMissing = false;
			this.renderGrid();
			return;
		}

		// Already cached?
		const cached = this.plugin.iconSetCache.get(setId);
		if (cached) {
			this.extData = cached;
			this.extLoading = false;
			this.extMissing = false;
			this.renderGrid();
			return;
		}

		this.extLoading = true;
		this.extData = null;
		this.extMissing = false;
		this.renderGrid(); // shows spinner

		this.plugin.getIconSet(setId).then((data) => {
			if (!this.isOpen) return; // modal closed while loading
			this.extLoading = false;
			if (data) {
				this.extData = data;
				this.extMissing = false;
			} else {
				this.extMissing = true;
			}
			this.renderGrid();
		});
	}

	// ── Rendering ─────────────────────────────────────────────────

	private renderGrid() {
		this.gridEl.empty();
		if (this.activeTab === "icons") {
			this.renderIconGrid();
		} else {
			this.renderEmojiGrid();
		}
	}

	private renderIconGrid() {
		if (this.extLoading) {
			this.statusEl.setText("Loading…");
			const wrap = this.gridEl.createDiv({ cls: "inventexplorer-loading-wrap" });
			wrap.createDiv({ cls: "inventexplorer-spinner" });
			wrap.createDiv({ text: "Loading icon set…", cls: "inventexplorer-loading-text" });
			return;
		}
		if (this.extMissing) {
			this.statusEl.setText("Not found");
			this.gridEl.createDiv({
				cls: "inventexplorer-empty",
				// Written for whoever actually sees it: someone who installed a zip,
				// not someone with a checkout and npm. The sets ship next to main.js,
				// so a missing one means an incomplete copy of the plugin folder.
				text:
					"This icon set is missing from the plugin folder. Reinstall InventExplorer " +
					"so that the icon-sets folder sits next to main.js, then reload Obsidian. " +
					"Lucide and emoji keep working meanwhile.",
			});
			return;
		}

		const q = this.searchEl.value.trim().toLowerCase();

		if (this.activeIconSet === "lucide") {
			const filtered = q
				? this.allLucideIds.filter((id) => id.includes(q))
				: this.allLucideIds;
			const slice = filtered.slice(0, this.pageSize);
			this.statusEl.setText(
				`${filtered.length} icon${filtered.length === 1 ? "" : "s"}` +
				(filtered.length > slice.length ? ` — first ${slice.length} shown` : ""),
			);
			for (const id of slice) {
				const cell = this.makeCell(id, id === this.currentIcon);
				setIcon(cell.createDiv({ cls: "inventexplorer-cell-inner" }), id);
				cell.createDiv({ cls: "inventexplorer-cell-name", text: id });
				cell.addEventListener("click", () => { this.onChoose(id); this.close(); });
			}
			if (slice.length === 0) this.gridEl.createDiv({ cls: "inventexplorer-empty", text: "No icons match." });
			return;
		}

		// External set — extData may still be null if the set was never
		// loaded (defensive: treat as a load trigger instead of crashing).
		if (!this.extData) {
			this.switchToIconSet(this.activeIconSet);
			return;
		}
		const entries = Object.entries(this.extData);
		// Ranked, not merely filtered: a name that IS the query comes before one
		// that merely contains it somewhere in the middle.
		const filtered = q
			? rankMatches(entries, q, ([name]) => name)
			: entries;
		const slice = filtered.slice(0, this.pageSize);
		// Bundled sets are tiered. The grid still renders in full — browsing is
		// the whole point — but a pick nudges instead of applying.
		const locked = !hasFeature("iconSets");
		this.statusEl.setText(
			`${filtered.length} icon${filtered.length === 1 ? "" : "s"}` +
			(filtered.length > slice.length ? ` — first ${slice.length} shown` : "") +
			(locked ? " · Pro set (browsing is free)" : ""),
		);
		for (const [name, svg] of slice) {
			const key = `${this.activeIconSet}:${name}`;
			const cell = this.makeCell(name, key === this.currentIcon);
			const inner = cell.createDiv({ cls: "inventexplorer-cell-inner" });
			inner.innerHTML = svg; // safe: our own generated SVG
			const svgEl = inner.querySelector("svg");
			if (svgEl) (svgEl as unknown as HTMLElement).style.display = "block";
			cell.createDiv({ cls: "inventexplorer-cell-name", text: name });
			if (locked) cell.addClass("inventexplorer-cell-pro");
			cell.addEventListener("click", () => {
				if (locked) {
					proNotice(
						"Tabler, Boxicons and Phosphor (19,290 icons) are part of Pro. " +
							"Lucide and the full emoji set are always free.",
					);
					return;
				}
				this.onChoose(key);
				this.close();
			});
		}
		if (slice.length === 0) this.gridEl.createDiv({ cls: "inventexplorer-empty", text: "No icons match." });
	}

	private renderEmojiGrid() {
		const q = this.searchEl.value.trim().toLowerCase();
		let items: string[];
		if (q) {
			// Match by pasted emoji OR by English name/keyword ("dog", "heart").
			// Deduplicate — some emoji appear in more than one category.
			const seen = new Set<string>();
			const candidates: string[] = [];
			for (const cat of EMOJI_CATEGORIES) {
				for (const em of cat.items) {
					if (seen.has(em)) continue;
					seen.add(em);
					candidates.push(em);
				}
			}
			// A pasted emoji matches itself; otherwise rank by keyword, so
			// "cat" leads with cats rather than with "intoxicated".
			items = rankMatches(candidates, q, (em) =>
				em.includes(q) ? q : emojiKeywords(em));
			this.statusEl.setText(`${items.length} result${items.length === 1 ? "" : "s"}`);
		} else {
			const cat = EMOJI_CATEGORIES[this.activeCategoryIdx];
			items = cat.items;
			this.statusEl.setText(`${cat.name} — ${items.length} emoji`);
		}
		for (const em of items) {
			const key = `emoji:${em}`;
			const cell = this.makeCell(em, key === this.currentIcon);
			cell.addClass("inventexplorer-emoji-cell");
			const inner = cell.createDiv({ cls: "inventexplorer-cell-inner inventexplorer-is-emoji" });
			inner.createSpan({ cls: "inventexplorer-emoji-glyph", text: em });
			cell.addEventListener("click", () => { this.onChoose(key); this.close(); });
		}
		if (items.length === 0) this.gridEl.createDiv({ cls: "inventexplorer-empty", text: "No emoji match." });
	}

	private makeCell(title: string, selected: boolean): HTMLDivElement {
		const cell = this.gridEl.createDiv({ cls: "inventexplorer-cell" });
		cell.setAttr("title", title);
		if (selected) cell.addClass("is-selected");
		return cell;
	}

	get isOpen(): boolean {
		return this.contentEl.isConnected;
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---------- Shared icon/color block renderer ----------

function renderSharedIconColorBlock(
	contentEl: HTMLElement,
	iconLabel: string,
	colorLabel: string,
	getIcon: () => string | undefined,
	setIconFn: (v: string | undefined) => void,
	getColor: () => string | undefined,
	setColorFn: (v: string | undefined) => void,
	plugin: InventExplorerPlugin,
	onRerender: () => void,
) {
	new Setting(contentEl)
		.setName(iconLabel)
		.setDesc(getIcon() ? `Current: ${getIcon()}` : "No icon")
		.addButton((b) =>
			b.setButtonText("Choose…").setCta().onClick(() => {
				new IconPickerModal(plugin.app, plugin, getIcon(), (icon) => {
					setIconFn(icon ?? undefined);
					onRerender();
				}).open();
			}),
		)
		.addButton((b) =>
			b.setButtonText("Clear icon").onClick(() => {
				setIconFn(undefined);
				onRerender();
			}),
		);

	const isEmoji = getIcon()?.startsWith("emoji:") ?? false;
	if (!isEmoji) {
		let pickerSetValue: (hex: string) => void = () => {};
		let textSetValue: (v: string) => void = () => {};

		const applyColor = (raw: string) => {
			setColorFn(raw || undefined);
			if (!raw) {
				textSetValue("");
				pickerSetValue("#888888");
				return;
			}
			textSetValue(raw);
			const hex = cssColorToHex(raw);
			if (hex) pickerSetValue(hex);
		};

		// Same split as the per-item colour row: palette free, free-form Pro.
		const colorSetting = new Setting(contentEl).setName(colorLabel);
		if (hasFeature("customColor")) {
			colorSetting
				.addColorPicker((c) => {
					c.setValue(cssColorToHex(getColor() ?? "") ?? "#888888");
					pickerSetValue = (hex) => c.setValue(hex);
					c.onChange((hex) => {
						setColorFn(hex);
						textSetValue(hex);
					});
				})
				.addText((t) => {
					t.inputEl.addClass("inventexplorer-color-text");
					t.setPlaceholder("#rrggbb · red · rgb(…) · hsl(…)");
					t.setValue(getColor() ?? "");
					textSetValue = (v) => { t.inputEl.value = v; };
					t.onChange((v) => {
						const trimmed = v.trim();
						if (!trimmed) { applyColor(""); return; }
						if (isValidCssColor(trimmed)) applyColor(trimmed);
					});
				});
		} else {
			proChip(colorSetting.nameEl);
			colorSetting.setDesc("Pick from the palette below, or unlock any CSS colour with Pro.");
		}
		colorSetting.addButton((b) =>
			b.setButtonText("Clear").onClick(() => applyColor("")),
		);

		const palette = contentEl.createDiv({ cls: "inventexplorer-palette" });
		for (const color of PALETTE_COLORS) {
			const swatch = palette.createDiv({ cls: "inventexplorer-swatch" });
			swatch.style.backgroundColor = color;
			swatch.setAttr("aria-label", color);
			if (color === getColor()) swatch.addClass("is-active");
			swatch.addEventListener("click", () => {
				palette.querySelectorAll(".inventexplorer-swatch").forEach(
					(s) => s.removeClass("is-active"),
				);
				swatch.addClass("is-active");
				applyColor(color);
			});
		}
	}
}

// ---------- Text style block renderer ----------

const FONT_WEIGHT_OPTIONS = [
	{ value: "", label: "Default" },
	{ value: "100", label: "100 – Thin" },
	{ value: "200", label: "200 – Extra Light" },
	{ value: "300", label: "300 – Light" },
	{ value: "400", label: "400 – Regular" },
	{ value: "500", label: "500 – Medium" },
	{ value: "600", label: "600 – Semi Bold" },
	{ value: "700", label: "700 – Bold" },
	{ value: "800", label: "800 – Extra Bold" },
	{ value: "900", label: "900 – Black" },
];

function renderSharedTextStyleBlock(
	contentEl: HTMLElement,
	getStyle: () => TextStyle | undefined,
	setStyle: (ts: TextStyle) => void,
) {
	// Single choke point for every text-style surface (per item, per mask and
	// the global defaults). The heading its callers render stays visible, so
	// the feature is discoverable rather than hidden.
	if (!hasFeature("textStyle")) {
		const panel = new Setting(contentEl)
			.setName("Text styling")
			.setDesc(
				"Font family, size, weight, italic and colour for file and folder names. " +
					"Part of Pro — a one-time license unlocks it.",
			);
		proChip(panel.nameEl);
		return;
	}

	const get = (): TextStyle => getStyle() ?? {};
	const update = (partial: Partial<TextStyle>) => {
		const current = get();
		const merged: TextStyle = { ...current, ...partial };
		// Clean out empty/falsy values so we don't store blanks
		if (!merged.fontFamily) delete merged.fontFamily;
		if (!merged.fontSize) delete merged.fontSize;
		if (!merged.fontWeight) delete merged.fontWeight;
		if (merged.italic === false || merged.italic === undefined) delete merged.italic;
		if (!merged.textColor) delete merged.textColor;
		setStyle(merged);
	};

	// Font family
	let ffSetValue: (v: string) => void = () => {};
	new Setting(contentEl)
		.setName("Font family")
		.setDesc("CSS font-family value, e.g. \"Georgia\" or \"var(--font-monospace)\"")
		.addText((t) => {
			t.inputEl.addClass("inventexplorer-text-wide");
			t.setPlaceholder("default");
			t.setValue(get().fontFamily ?? "");
			ffSetValue = (v) => { t.inputEl.value = v; };
			t.onChange((v) => update({ fontFamily: v.trim() || undefined }));
		})
		.addButton((b) =>
			b.setButtonText("Clear").onClick(() => {
				update({ fontFamily: undefined });
				ffSetValue("");
			}),
		);

	// Font size
	new Setting(contentEl)
		.setName("Font size")
		.setDesc("CSS font-size value, e.g. \"13px\" or \"0.9em\"")
		.addText((t) => {
			t.inputEl.addClass("inventexplorer-text-narrow");
			t.setPlaceholder("default");
			t.setValue(get().fontSize ?? "");
			t.onChange((v) => update({ fontSize: v.trim() || undefined }));
		});

	// Font weight
	new Setting(contentEl)
		.setName("Font weight")
		.addDropdown((d) => {
			for (const opt of FONT_WEIGHT_OPTIONS) {
				d.addOption(opt.value, opt.label);
			}
			d.setValue(get().fontWeight ?? "");
			d.onChange((v) => update({ fontWeight: v || undefined }));
		});

	// Italic
	new Setting(contentEl)
		.setName("Italic")
		.addToggle((t) => {
			t.setValue(get().italic ?? false);
			t.onChange((v) => update({ italic: v || undefined }));
		});

	// Text color
	let tcPickerSet: (hex: string) => void = () => {};
	let tcTextSet: (v: string) => void = () => {};

	const applyTextColor = (raw: string) => {
		update({ textColor: raw || undefined });
		if (!raw) {
			tcTextSet("");
			tcPickerSet("#888888");
			return;
		}
		tcTextSet(raw);
		const hex = cssColorToHex(raw);
		if (hex) tcPickerSet(hex);
	};

	new Setting(contentEl)
		.setName("Text color")
		.addColorPicker((c) => {
			c.setValue(cssColorToHex(get().textColor ?? "") ?? "#888888");
			tcPickerSet = (hex) => c.setValue(hex);
			c.onChange((hex) => {
				update({ textColor: hex });
				tcTextSet(hex);
			});
		})
		.addText((t) => {
			t.inputEl.addClass("inventexplorer-color-text");
			t.setPlaceholder("#rrggbb · red · rgb(…)");
			t.setValue(get().textColor ?? "");
			tcTextSet = (v) => { t.inputEl.value = v; };
			t.onChange((v) => {
				const trimmed = v.trim();
				if (!trimmed) { applyTextColor(""); return; }
				if (isValidCssColor(trimmed)) applyTextColor(trimmed);
			});
		})
		.addButton((b) =>
			b.setButtonText("Clear").onClick(() => applyTextColor("")),
		);

	const palette = contentEl.createDiv({ cls: "inventexplorer-palette" });
	for (const color of PALETTE_COLORS) {
		const swatch = palette.createDiv({ cls: "inventexplorer-swatch" });
		swatch.style.backgroundColor = color;
		swatch.setAttr("aria-label", color);
		if (color === get().textColor) swatch.addClass("is-active");
		swatch.addEventListener("click", () => {
			palette.querySelectorAll(".inventexplorer-swatch").forEach((s) => s.removeClass("is-active"));
			swatch.addClass("is-active");
			applyTextColor(color);
		});
	}
}

// ---------- Regex mask edit modal ----------

class RegexMaskEditModal extends Modal {
	plugin: InventExplorerPlugin;
	mask: RegexMaskEntry;
	onSave: (mask: RegexMaskEntry) => void | Promise<void>;
	private patternError = false;

	constructor(
		app: App,
		plugin: InventExplorerPlugin,
		mask: RegexMaskEntry,
		onSave: (mask: RegexMaskEntry) => void | Promise<void>,
	) {
		super(app);
		this.plugin = plugin;
		this.mask = mask;
		this.onSave = onSave;
	}

	onOpen() {
		this.render();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("inventexplorer-modal");

		contentEl.createEl("h3", { text: "Edit regex mask", cls: "inventexplorer-title" });

		// ── Label ────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName("Label (optional)")
			.setDesc("Human-readable name for this mask.")
			.addText((t) =>
				t.setValue(this.mask.label ?? "").onChange((v) => {
					this.mask.label = v.trim() || undefined;
				}),
			);

		// ── Pattern ──────────────────────────────────────────────────
		let patternErrorEl: HTMLElement | null = null;
		const patternSetting = new Setting(contentEl)
			.setName("Regex pattern")
			.setDesc("Regular expression matched against the full file/folder path.")
			.addText((t) => {
				t.setPlaceholder("e.g. ^projects/.*\\.md$");
				t.setValue(this.mask.pattern ?? "");
				t.onChange((v) => {
					this.mask.pattern = v;
					try {
						new RegExp(v);
						patternErrorEl?.remove();
						patternErrorEl = null;
						this.patternError = false;
					} catch {
						this.patternError = true;
						if (!patternErrorEl?.isConnected) {
							patternErrorEl = contentEl.createEl("p", {
								text: "⚠ Invalid regex pattern",
								cls: "inventexplorer-mask-error",
							});
							patternSetting.settingEl.after(patternErrorEl);
						}
					}
				});
			});

		// ── File icon ────────────────────────────────────────────────
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "File icon" });
		if (!this.mask.file) this.mask.file = {};
		renderSharedIconColorBlock(
			contentEl,
			"Icon",
			"Color",
			() => this.mask.file!.icon,
			(v) => { this.mask.file!.icon = v; },
			() => this.mask.file!.color,
			(v) => { this.mask.file!.color = v; },
			this.plugin,
			() => this.render(),
		);

		// ── Folder icon ──────────────────────────────────────────────
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "Folder icon (collapsed)" });
		if (!this.mask.folder) this.mask.folder = {};
		renderSharedIconColorBlock(
			contentEl,
			"Icon (collapsed)",
			"Color (collapsed)",
			() => this.mask.folder!.icon,
			(v) => { this.mask.folder!.icon = v; },
			() => this.mask.folder!.color,
			(v) => { this.mask.folder!.color = v; },
			this.plugin,
			() => this.render(),
		);

		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "Folder icon (expanded)" });
		renderSharedIconColorBlock(
			contentEl,
			"Icon (expanded)",
			"Color (expanded)",
			() => this.mask.folder!.iconExpanded,
			(v) => { this.mask.folder!.iconExpanded = v; },
			() => this.mask.folder!.colorExpanded,
			(v) => { this.mask.folder!.colorExpanded = v; },
			this.plugin,
			() => this.render(),
		);

		// ── File text style ───────────────────────────────────────────
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "File text style" });
		renderSharedTextStyleBlock(
			contentEl,
			() => this.mask.file!.textStyle,
			(ts) => { this.mask.file!.textStyle = Object.keys(ts).length ? ts : undefined; },
		);

		// ── Folder text style ─────────────────────────────────────────
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "Folder text style" });
		renderSharedTextStyleBlock(
			contentEl,
			() => this.mask.folder!.textStyle,
			(ts) => { this.mask.folder!.textStyle = Object.keys(ts).length ? ts : undefined; },
		);

		// ── Buttons ──────────────────────────────────────────────────
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		const buttons = contentEl.createDiv({ cls: "inventexplorer-buttons" });
		const applyBtn = buttons.createEl("button", { text: "Apply" });
		applyBtn.addEventListener("click", async () => {
			if (await this.applyChanges()) {
				new Notice("InventExplorer: changes applied");
			}
		});
		const saveBtn = buttons.createEl("button", { text: "Save", cls: "mod-cta" });
		saveBtn.addEventListener("click", async () => {
			if (await this.applyChanges()) this.close();
		});
		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
	}

	private async applyChanges(): Promise<boolean> {
		if (!this.mask.pattern.trim()) {
			new Notice("InventExplorer: pattern cannot be empty");
			return false;
		}
		try {
			new RegExp(this.mask.pattern);
		} catch {
			new Notice("InventExplorer: invalid regex pattern");
			return false;
		}
		await this.onSave(this.mask);
		return true;
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---------- Default icons & regex masks modal ----------

class DefaultIconsAndMasksModal extends Modal {
	plugin: InventExplorerPlugin;
	private defaultFile: DefaultIconEntry;
	private defaultFolder: DefaultIconEntry;
	private masks: RegexMaskEntry[];

	constructor(app: App, plugin: InventExplorerPlugin) {
		super(app);
		this.plugin = plugin;
		this.defaultFile = { ...plugin.settings.defaultFile };
		this.defaultFolder = { ...plugin.settings.defaultFolder };
		this.masks = plugin.settings.regexMasks.map((m) => ({
			...m,
			file: { ...(m.file ?? {}) },
			folder: { ...(m.folder ?? {}) },
		}));
	}

	onOpen() {
		this.render();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("inventexplorer-modal");

		contentEl.createEl("h3", { text: "Default icons & regex masks", cls: "inventexplorer-title" });

		// Global defaults are the automation half of the plugin (one setting
		// styling every file or folder at once) and are tiered as a block.
		if (!hasFeature("defaults")) {
			const panel = new Setting(contentEl)
				.setName("Global default icons")
				.setDesc(
					"One icon, colour and text style applied to every file and every folder " +
						"that has no setting of its own. Part of Pro — a one-time license unlocks it. " +
						"Regex masks below stay usable.",
				);
			proChip(panel.nameEl);
			this.renderMasksSection(contentEl);
			this.renderModalButtons(contentEl);
			return;
		}

		// ── Default file icon ────────────────────────────────────────
		contentEl.createEl("h4", { text: "Default file icon" });
		renderSharedIconColorBlock(
			contentEl,
			"Icon",
			"Color",
			() => this.defaultFile.icon,
			(v) => { this.defaultFile.icon = v; },
			() => this.defaultFile.color,
			(v) => { this.defaultFile.color = v; },
			this.plugin,
			() => this.render(),
		);

		// ── Default folder icon ──────────────────────────────────────
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "Default folder icon (collapsed)" });
		renderSharedIconColorBlock(
			contentEl,
			"Icon (collapsed)",
			"Color (collapsed)",
			() => this.defaultFolder.icon,
			(v) => { this.defaultFolder.icon = v; },
			() => this.defaultFolder.color,
			(v) => { this.defaultFolder.color = v; },
			this.plugin,
			() => this.render(),
		);

		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "Default folder icon (expanded)" });
		renderSharedIconColorBlock(
			contentEl,
			"Icon (expanded)",
			"Color (expanded)",
			() => this.defaultFolder.iconExpanded,
			(v) => { this.defaultFolder.iconExpanded = v; },
			() => this.defaultFolder.colorExpanded,
			(v) => { this.defaultFolder.colorExpanded = v; },
			this.plugin,
			() => this.render(),
		);

		// ── Default file text style ──────────────────────────────────
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "Default file text style" });
		renderSharedTextStyleBlock(
			contentEl,
			() => this.defaultFile.textStyle,
			(ts) => { this.defaultFile.textStyle = Object.keys(ts).length ? ts : undefined; },
		);

		// ── Default folder text style ────────────────────────────────
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "Default folder text style" });
		renderSharedTextStyleBlock(
			contentEl,
			() => this.defaultFolder.textStyle,
			(ts) => { this.defaultFolder.textStyle = Object.keys(ts).length ? ts : undefined; },
		);

		this.renderMasksSection(contentEl);
		this.renderModalButtons(contentEl);
	}

	/** Regex masks — shared by the full and the defaults-locked layout. */
	private renderMasksSection(contentEl: HTMLElement) {
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		contentEl.createEl("h4", { text: "Regex path masks" });
		contentEl.createEl("p", {
			text: "Masks override global defaults. Each mask can assign separate icons for files and folders. Masks are evaluated in order — first match wins. Specific per-file/folder settings always take priority over masks.",
			cls: "inventexplorer-info",
		});

		const masksContainer = contentEl.createDiv({ cls: "inventexplorer-masks-list" });
		this.renderMasksList(masksContainer);

		const addBtn = contentEl.createEl("button", {
			text: "+ Add mask",
			cls: "mod-cta inventexplorer-add-mask-btn",
		});
		addBtn.addEventListener("click", () => {
			// Count the modal's working copy, not the saved settings — masks
			// added in this session are not persisted until Apply/Save.
			if (this.masks.length >= maskCeiling()) {
				proNotice(
					`the free tier includes ${baseMasks()} regex mask` +
						`${baseMasks() === 1 ? "" : "s"} — enough to see what they do. ` +
						`Pro removes the limit.`,
				);
				return;
			}
			const newMask: RegexMaskEntry = {
				id: Date.now().toString(),
				pattern: "",
				label: undefined,
				file: {},
				folder: {},
			};
			let maskIndex: number | null = null;
			new RegexMaskEditModal(this.app, this.plugin, newMask, async (saved) => {
				if (maskIndex === null) {
					this.masks.push(saved);
					maskIndex = this.masks.length - 1;
				} else {
					this.masks[maskIndex] = saved;
				}
				await this.applyChanges();
				this.render();
			}).open();
		});
	}

	/** Apply / Save / Cancel row. */
	private renderModalButtons(contentEl: HTMLElement) {
		contentEl.createEl("hr", { cls: "inventexplorer-section-sep" });
		const buttons = contentEl.createDiv({ cls: "inventexplorer-buttons" });
		const applyBtn = buttons.createEl("button", { text: "Apply" });
		applyBtn.addEventListener("click", async () => {
			await this.applyChanges();
			new Notice("InventExplorer: changes applied");
		});
		const saveBtn = buttons.createEl("button", { text: "Save", cls: "mod-cta" });
		saveBtn.addEventListener("click", async () => {
			await this.applyChanges();
			this.close();
		});
		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
	}

	private async applyChanges() {
		this.plugin.settings.defaultFile = this.defaultFile;
		this.plugin.settings.defaultFolder = this.defaultFolder;
		this.plugin.settings.regexMasks = this.masks;
		await this.plugin.saveSettings();
		this.plugin.refresh();
	}

	private renderMasksList(container: HTMLElement) {
		container.empty();
		if (this.masks.length === 0) {
			container.createEl("p", { text: "No masks defined.", cls: "inventexplorer-info" });
			return;
		}

		for (let i = 0; i < this.masks.length; i++) {
			const mask = this.masks[i];
			const row = container.createDiv({ cls: "inventexplorer-mask-row" });

			// Info
			const info = row.createDiv({ cls: "inventexplorer-mask-info" });
			info.createEl("strong", {
				text: mask.label || mask.pattern || "(no pattern)",
				cls: "inventexplorer-mask-name",
			});
			if (mask.label && mask.pattern) {
				info.createEl("code", { text: mask.pattern, cls: "inventexplorer-mask-pattern" });
			}

			// Icon previews
			const previews = row.createDiv({ cls: "inventexplorer-mask-previews" });
			this.renderMiniPreview(previews, mask.file, "file");
			this.renderMiniPreview(previews, mask.folder, "folder");

			// Actions
			const actions = row.createDiv({ cls: "inventexplorer-mask-actions" });

			if (i > 0) {
				const upBtn = actions.createEl("button", { text: "↑", cls: "inventexplorer-mask-move" });
				upBtn.setAttr("aria-label", "Move up");
				upBtn.addEventListener("click", async () => {
					[this.masks[i - 1], this.masks[i]] = [this.masks[i], this.masks[i - 1]];
					await this.applyChanges();
					this.render();
				});
			}

			if (i < this.masks.length - 1) {
				const downBtn = actions.createEl("button", { text: "↓", cls: "inventexplorer-mask-move" });
				downBtn.setAttr("aria-label", "Move down");
				downBtn.addEventListener("click", async () => {
					[this.masks[i], this.masks[i + 1]] = [this.masks[i + 1], this.masks[i]];
					await this.applyChanges();
					this.render();
				});
			}

			const editBtn = actions.createEl("button", { text: "Edit" });
			editBtn.addEventListener("click", () => {
				const copy: RegexMaskEntry = {
					...mask,
					file: { ...(mask.file ?? {}) },
					folder: { ...(mask.folder ?? {}) },
				};
				new RegexMaskEditModal(this.app, this.plugin, copy, async (saved) => {
					this.masks[i] = saved;
					await this.applyChanges();
					this.render();
				}).open();
			});

			const deleteBtn = actions.createEl("button", {
				text: "Delete",
				cls: "mod-warning",
			});
			deleteBtn.addEventListener("click", async () => {
				this.masks.splice(i, 1);
				await this.applyChanges();
				this.render();
			});
		}
	}

	private renderMiniPreview(
		container: HTMLElement,
		entry: DefaultIconEntry | undefined,
		type: "file" | "folder",
	) {
		const wrap = container.createSpan({ cls: "inventexplorer-mini-preview" });
		wrap.createSpan({
			cls: "inventexplorer-mini-label",
			text: type === "file" ? "file" : "folder",
		});
		const iconEl = wrap.createSpan({ cls: "inventexplorer-preview-icon" });
		if (entry?.icon) {
			const result = renderIconToEl(iconEl, entry.icon, this.plugin.iconSetCache, entry.color);
			if (result === "missing-set") {
				iconEl.setText("…");
				const setId = entry.icon.split(":")[0];
				this.plugin.getIconSet(setId).then(() => this.render());
			}
		} else {
			iconEl.setText("·");
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---------- Settings tab ----------

function chooseExistingVaultConfig(
	app: App,
	path: string,
): Promise<ExistingVaultConfigChoice> {
	return new Promise((resolve) => {
		new ExistingVaultConfigModal(app, path, resolve).open();
	});
}

class ExistingVaultConfigModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private path: string,
		private resolveChoice: (choice: ExistingVaultConfigChoice) => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("inventexplorer-modal");
		contentEl.createEl("h3", {
			text: "Config file already exists",
			cls: "inventexplorer-title",
		});
		contentEl.createEl("p", {
			text:
				`The file ${this.path} already exists. ` +
				"Merge keeps both — it adds everything the file has that you don't, " +
				"and where you both customized the same file or folder, yours stays. " +
				"Import takes the file as it is; Overwrite replaces it with what this device has.",
			cls: "inventexplorer-info",
		});

		const buttons = contentEl.createDiv({ cls: "inventexplorer-buttons" });
		buttons.createEl("button", { text: "Merge", cls: "mod-cta" })
			.addEventListener("click", () => this.choose({ type: "merge" }));
		buttons.createEl("button", { text: "Import" })
			.addEventListener("click", () => this.choose({ type: "import" }));
		buttons.createEl("button", { text: "Select file to import" })
			.addEventListener("click", () => this.openFilePicker());
		buttons.createEl("button", { text: "Overwrite", cls: "mod-warning" })
			.addEventListener("click", () => this.choose({ type: "overwrite" }));
		buttons.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => this.choose({ type: "cancel" }));
	}

	onClose() {
		this.contentEl.empty();
		if (!this.resolved) this.resolveChoice({ type: "cancel" });
	}

	private choose(choice: ExistingVaultConfigChoice) {
		this.resolved = true;
		this.close();
		window.setTimeout(() => {
			this.resolveChoice(choice);
		}, 0);
	}

	private openFilePicker() {
		this.resolved = true;
		this.close();
		window.setTimeout(() => {
			new VaultConfigSuggestModal(
				this.app,
				(file) => {
					this.resolveChoice({
						type: "select-file",
						path: file.path,
					});
				},
				() => this.resolveChoice({ type: "cancel" }),
			).open();
		}, 0);
	}
}

class VaultConfigSuggestModal extends SuggestModal<TFile> {
	private chosen = false;

	constructor(
		app: App,
		private onChoose: (file: TFile) => void | Promise<void>,
		private onCancel?: () => void,
	) {
		super(app);
		this.setPlaceholder("Choose InventExplorer JSON config");
		this.emptyStateText = "No JSON files found";
	}

	getSuggestions(query: string): TFile[] {
		const lower = query.toLowerCase();
		return this.app.vault
			.getFiles()
			.filter((file) => file.extension === "json")
			.filter((file) => !lower || file.path.toLowerCase().includes(lower));
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		el.createEl("div", { text: file.path });
	}

	onChooseSuggestion(file: TFile) {
		this.chosen = true;
		void this.onChoose(file);
		this.close();
	}

	onClose() {
		// Defer so the flag is final regardless of whether Obsidian calls
		// onChooseSuggestion before or after closing the modal.
		window.setTimeout(() => {
			if (!this.chosen) this.onCancel?.();
		}, 0);
	}
}

class InventExplorerSettingTab extends PluginSettingTab {
	plugin: InventExplorerPlugin;

	constructor(app: App, plugin: InventExplorerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private async applyVaultConfigPath(path: string): Promise<boolean> {
		const normalizedPath = normalizePath(path);
		// Files inside hidden (dot) folders are invisible to vault events, so
		// external edits and sync would never trigger a config reload.
		if (normalizedPath.split("/").some((part) => part.startsWith("."))) {
			new Notice(
				"InventExplorer: config path cannot be inside a hidden (dot) folder — " +
				"Obsidian cannot watch such files for changes",
			);
			return false;
		}
		if (await this.plugin.vaultConfigExists(normalizedPath)) {
			const choice = await chooseExistingVaultConfig(
				this.app,
				normalizedPath,
			);
			if (choice.type === "cancel") return false;
			if (choice.type === "merge") {
				const summary = await this.plugin.mergeVaultConfig(normalizedPath);
				if (summary === null) return false;
				new Notice(`InventExplorer: merged with ${normalizedPath} — ${summary}`, 8000);
				return true;
			}
			if (choice.type === "select-file") {
				if (!(await this.plugin.importVaultConfig(choice.path))) {
					return false;
				}
				new Notice(`InventExplorer: imported ${choice.path}`);
				return true;
			}
			if (choice.type === "import") {
				if (!(await this.plugin.importVaultConfig(normalizedPath))) {
					return false;
				}
				new Notice(`InventExplorer: imported ${normalizedPath}`);
				return true;
			}
		}
		await this.plugin.changeStorage("vault", normalizedPath);
		new Notice(`InventExplorer: now saving to ${normalizedPath}`);
		return true;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "InventExplorer" });

		this.renderSyncBanner(containerEl);
		this.renderActivation(containerEl);

		new Setting(containerEl)
			.setName("Default icons & regex masks")
			.setDesc(
				"Configure default icons for all files and folders, and define regex-based path masks that override those defaults.",
			)
			.addButton((b) =>
				b.setButtonText("Configure…").setCta().onClick(() => {
					new DefaultIconsAndMasksModal(this.app, this.plugin).open();
				}),
			);

		new Setting(containerEl)
			.setName("Storage location")
			.setDesc(
				"Where to keep icon assignments and portable InventExplorer settings. Switching copies current data to the new location.",
			)
			.addDropdown((d) =>
				d
					.addOption("vault", "Inside vault (with notes)")
					.addOption(
						"plugin",
						"Plugin folder (.obsidian/plugins/inventexplorer/data.json)",
					)
					.setValue(this.plugin.settings.storageLocation)
					.onChange(async (v) => {
						if (v === "vault") {
							await this.applyVaultConfigPath(
								this.plugin.settings.vaultConfigPath,
							);
						} else {
							await this.plugin.changeStorage("plugin");
						}
						this.display();
					}),
			);

		if (this.plugin.settings.storageLocation === "vault") {
			let pendingPath = this.plugin.settings.vaultConfigPath;
			new Setting(containerEl)
				.setName("Config file path")
				.setDesc(
					"Path inside vault. Stores icon assignments, defaults, regex masks, icon sizes, placement, and explorer styling. Default: _config/inventexplorer.json",
				)
				.addText((t) =>
					t
						.setPlaceholder("_config/inventexplorer.json")
						.setValue(this.plugin.settings.vaultConfigPath)
						.onChange((v) => {
							pendingPath = v;
						}),
				)
				.addButton((b) =>
					b
						.setButtonText("Apply")
						.setCta()
						.onClick(async () => {
							const cleaned = pendingPath.trim();
							if (!cleaned) {
								new Notice("Path cannot be empty");
								return;
							}
							if (!cleaned.toLowerCase().endsWith(".json")) {
								new Notice("Path must end with .json");
								return;
							}
							// Obsidian does not index dot-folders, so vault events
							// (create/modify/rename/delete) never fire for anything
							// inside one. Reading and writing would still work, but a
							// change synced in from another device would go unnoticed
							// until the next restart — the exact thing vault storage
							// exists to avoid. Refuse it up front.
							const hidden = normalizePath(cleaned)
								.split("/")
								.find((seg) => seg.startsWith("."));
							if (hidden) {
								new Notice(
									`InventExplorer: "${hidden}" is a hidden folder. Obsidian doesn't ` +
										`watch those, so a change synced from another device would ` +
										`not be picked up until a restart. Use a normal folder, ` +
										`e.g. _config/inventexplorer.json`,
									12000,
								);
								return;
							}
							if (await this.applyVaultConfigPath(cleaned)) {
								this.display();
							}
						}),
				)
				.addButton((b) =>
					b
						.setButtonText("Import…")
						.onClick(() => {
							new VaultConfigSuggestModal(
								this.app,
								async (file) => {
									if (await this.plugin.importVaultConfig(file.path)) {
										new Notice(`InventExplorer: imported ${file.path}`);
									}
									this.display();
								},
							).open();
						}),
				);
		}

		new Setting(containerEl)
			.setName("Icon placement")
			.setDesc(createIconPlacementDesc())
			.addDropdown((d) =>
				d
					.addOption("alongside", "Alongside name")
					.addOption("replace", "Replace folder arrows")
					.setValue(
						this.plugin.settings.replaceArrows ? "replace" : "alongside",
					)
					.onChange(async (v) => {
						this.plugin.setReplaceArrowsMode(v === "replace");
						await this.plugin.saveSettings();
						new Notice(
							"InventExplorer: restart Obsidian to fully apply icon placement changes",
						);
					}),
			);

		new Setting(containerEl)
			.setName("Icon size")
			.setDesc("Size of icons shown in the file explorer (px).")
			.addSlider((s) =>
				s
					.setLimits(10, 28, 1)
					.setValue(this.plugin.settings.iconSize)
					.setDynamicTooltip()
					.onChange((v) => {
						this.plugin.settings.iconSize = v;
						this.plugin.applyIconSize();
						this.plugin.saveSettingsDebounced();
					}),
			);

		new Setting(containerEl)
			.setName("Note title icon size")
			.setDesc("Size of the icon shown next to the inline title in notes (px).")
			.addSlider((s) =>
				s
					.setLimits(16, 48, 2)
					.setValue(this.plugin.settings.inlineTitleIconSize)
					.setDynamicTooltip()
					.onChange((v) => {
						this.plugin.settings.inlineTitleIconSize = v;
						this.plugin.applyInlineTitleIconSize();
						this.plugin.saveSettingsDebounced();
					}),
			);

		// ── Explorer styling (tiered as one block) ───────────────────────
		this.renderExplorerStyling(containerEl);

		new Setting(containerEl)
			.setName("Reload from file")
			.setDesc(
				"Re-read icon data from the current storage location (use after editing the JSON manually).",
			)
			.addButton((b) =>
				b.setButtonText("Reload").onClick(async () => {
					await this.plugin.loadIconData();
					this.plugin.applyAllSettings();
					this.plugin.refresh();
					new Notice("InventExplorer: reloaded");
				}),
			);

		new Setting(containerEl)
			.setName("Refresh file explorer")
			.setDesc("Re-render decorations in the file explorer.")
			.addButton((b) =>
				b.setButtonText("Refresh").onClick(() => {
					this.plugin.refresh();
				}),
			);

		const count = this.plugin.assignmentCount();
		containerEl.createEl("p", {
			text: isLicensed()
				? `Currently customizing ${count} item${count === 1 ? "" : "s"}.`
				: `Currently customizing ${count} of ${baseAssignments()} items.`,
			cls: "inventexplorer-status",
		});

		// --- More from the same developer ------------------------------------
		// Obsidian's policy forbids inserting ads *outside* a plugin's own
		// interface; a plain mention inside our own settings tab is allowed, and
		// it is disclosed in the README as the policy also requires.
		//
		// Deliberately last on the page and built from ordinary Setting rows.
		// The one coloured card on this page is the sync banner at the top,
		// which answers a question this plugin genuinely raises (its config
		// only travels if something syncs the vault); this section is the plain
		// "what else I make" note. No popups, no notices, nothing on startup.
		//
		// It used to live at the end of renderExplorerStyling(), which returns
		// early on the free tier — so the only people who never saw it were the
		// ones who had not bought anything yet.
		new Setting(containerEl).setName("More from the same developer").setHeading();

		new Setting(containerEl)
			.setName("InventTasks — a task manager inside Obsidian")
			.setDesc(
				"Six views over the same data (List, Board, Calendar, Table, Gantt, " +
					"Timeline), 24 custom field types and task dependencies — all stored " +
					"as plain Markdown in your own vault. Free tier, one-time lifetime " +
					"licence for Pro.",
			)
			.addButton((b) =>
				b.setButtonText("Open site").onClick(() => {
					window.open("https://inventtasks.solidinvent.pl/?ref=inventexplorer", "_blank");
				}),
			);
	}

	/**
	 * Activation. Deliberately the first thing in the settings tab: it is what
	 * a buyer opens the settings to find, and what the license email, the
	 * website and every in-app notice point at.
	 */
	private renderActivation(containerEl: HTMLElement) {
		containerEl.createEl("h3", { text: "Activation" });

		if (isLicensed()) {
			new Setting(containerEl)
				.setName("Pro — active")
				.setDesc(
					`Licensed to ${this.plugin.license.email}. Lifetime, all your vaults and devices.`,
				)
				.addButton((b) =>
					b.setButtonText("Deactivate").onClick(async () => {
						await deactivateAccount(this.plugin);
						new Notice("InventExplorer: license removed from this device.");
						this.display();
					}),
				);
			return;
		}

		if (isRevoked()) {
			const onHold = new Setting(containerEl)
				.setName("License on hold")
				.setDesc(
					"This license has been put on hold and the free-tier limits apply. " +
						"Nothing you configured was deleted. Contact contact@solidinvent.pl.",
				);
			onHold.nameEl.addClass("inventexplorer-hold");
		}

		const used = this.plugin.assignmentCount();
		containerEl.createEl("p", {
			cls: "inventexplorer-info",
			text:
				`Free tier — ${used} of ${baseAssignments()} customized items in use, ` +
				`${baseMasks()} regex mask, Lucide + all emoji, the preset colour palette. ` +
				`A one-time Pro license removes every limit and adds Tabler, Boxicons and ` +
				`Phosphor (19,290 icons), any CSS colour, global defaults, text styling ` +
				`and explorer styling.`,
		});

		let email = "";
		let key = "";
		new Setting(containerEl)
			.setName("Email")
			.setDesc("The address you bought with.")
			.addText((t) =>
				t.setPlaceholder("you@example.com").onChange((v) => { email = v; }),
			);
		new Setting(containerEl)
			.setName("License key")
			.setDesc("Starts with IE1. — from your purchase email.")
			.addText((t) => {
				t.inputEl.addClass("inventexplorer-text-wide");
				t.setPlaceholder("IE1.…").onChange((v) => { key = v; });
			});
		new Setting(containerEl).addButton((b) =>
			b.setButtonText("Activate").setCta().onClick(async () => {
				const result = await activateAccount(this.plugin, email, key);
				if (result === "ok") {
					new Notice("InventExplorer: Pro activated — thank you!");
					this.display();
				} else if (result === "revoked") {
					new Notice(
						"InventExplorer: this license is on hold. Contact contact@solidinvent.pl.",
						12000,
					);
				} else {
					new Notice(
						"InventExplorer: that email and key don't match. Check both — the email must be the one you bought with.",
						10000,
					);
				}
			}),
		);
	}

	/**
	 * Panel background, horizontal separators and vertical indent guides.
	 * Tiered as one block: re-styling the explorer chrome is a distinct
	 * capability from putting icons on files.
	 */
	/**
	 * One banner, at the top, about the thing this plugin cannot do on its own.
	 *
	 * InventExplorer keeps its configuration in an ordinary file in the vault
	 * precisely so that ANY sync carries it. Someone without sync gets none of
	 * that, and the honest answer — a free server you host yourself, with a
	 * free client — happens to be ours. So it is stated once, in our own
	 * settings tab, with the mark rather than only the name, and it is
	 * disclosed in the README as Obsidian's policy requires.
	 *
	 * Kept to three lines and two links on purpose: visible, not a landing page.
	 */
	private renderSyncBanner(containerEl: HTMLElement): void {
		const promo = containerEl.createDiv({ cls: "inventexplorer-promo" });
		const logo = promo.createEl("img", { cls: "inventexplorer-promo-logo" });
		logo.src = document.body.classList.contains("theme-dark")
			? INVENTTASKS_LOGO_DARK
			: INVENTTASKS_LOGO_LIGHT;
		logo.alt = "InventTasks";
		logo.width = 30;
		logo.height = 30;

		const body = promo.createDiv({ cls: "inventexplorer-promo-body" });
		body.createDiv({
			cls: "inventexplorer-promo-title",
			text: "Sync these icons across your devices — for free",
		});
		const desc = body.createDiv({ cls: "inventexplorer-promo-text" });
		desc.appendText("Your icons live in a normal file in this vault, so any sync carries them. ");
		desc.createEl("strong", { text: "InventTasks" });
		desc.appendText(
			" syncs the whole vault — this configuration included — to a server you host yourself. " +
				"The server is free and open to self-host, and syncing is in the plugin's free tier.",
		);

		const links = body.createDiv({ cls: "inventexplorer-promo-links" });
		const open = (url: string) => window.open(url, "_blank");
		links
			.createEl("a", { cls: "inventexplorer-promo-cta", text: "Get InventTasks" })
			.addEventListener("click", (e) => {
				e.preventDefault();
				open("https://inventtasks.solidinvent.pl/?ref=inventexplorer");
			});
		links
			.createEl("a", { cls: "inventexplorer-promo-link", text: "How the free server works" })
			.addEventListener("click", (e) => {
				e.preventDefault();
				open("https://inventtasks.solidinvent.pl/sync?ref=inventexplorer");
			});
	}

	private renderExplorerStyling(containerEl: HTMLElement) {
		if (!hasFeature("explorerStyle")) {
			const panel = new Setting(containerEl)
				.setName("Explorer styling")
				.setDesc(
					"Panel background colour, horizontal separator lines and vertical indent " +
						"guides — with their own colours and thickness. Part of Pro.",
				);
			proChip(panel.nameEl);
			return;
		}

		// ── Explorer background color ────────────────────────────────────
		let bgPickerSet: (hex: string) => void = () => {};
		let bgTextSet: (v: string) => void = () => {};

		const applyBg = (raw: string) => {
			this.plugin.settings.explorerBgColor = raw;
			this.plugin.applyExplorerBgColor();
			this.plugin.saveSettingsDebounced();
			if (!raw) {
				bgTextSet("");
				bgPickerSet("#1e1e1e");
				return;
			}
			bgTextSet(raw);
			const hex = cssColorToHex(raw);
			if (hex) bgPickerSet(hex);
		};

		new Setting(containerEl)
			.setName("File explorer background")
			.setDesc("Custom background color for the file explorer panel.")
			.addColorPicker((c) => {
				c.setValue(
					cssColorToHex(this.plugin.settings.explorerBgColor) ?? "#1e1e1e",
				);
				bgPickerSet = (hex) => c.setValue(hex);
				c.onChange((hex) => {
					this.plugin.settings.explorerBgColor = hex;
					this.plugin.applyExplorerBgColor();
					this.plugin.saveSettingsDebounced();
					bgTextSet(hex);
				});
			})
			.addText((t) => {
				t.inputEl.addClass("inventexplorer-color-text");
				t.setPlaceholder("#rrggbb · rgba(…) · default");
				t.setValue(this.plugin.settings.explorerBgColor);
				bgTextSet = (v) => { t.inputEl.value = v; };
				t.onChange((v) => {
					const trimmed = v.trim();
					if (!trimmed || trimmed.toLowerCase() === "default") { applyBg(""); return; }
					if (isValidCssColor(trimmed)) applyBg(trimmed);
				});
			})
			.addButton((b) =>
				b.setButtonText("Clear").onClick(() => applyBg("")),
			);

		// ── Explorer indent lines ────────────────────────────────────────
		new Setting(containerEl)
			.setName("Indent guide lines")
			.setDesc(
				"Show horizontal separator lines between items in the file explorer to visually group items at the same level.",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.explorerIndentLines)
					.onChange(async (v) => {
						this.plugin.settings.explorerIndentLines = v;
						this.plugin.applyExplorerIndentLines();
						await this.plugin.saveSettings();
					}),
				);

		let indentColorPickerSet: (hex: string) => void = () => {};
		let indentColorTextSet: (v: string) => void = () => {};
		const applyIndentColor = async (raw: string) => {
			this.plugin.settings.indentLinesColor = raw;
			this.plugin.applyIndentLinesStyle();
			this.plugin.saveSettingsDebounced();
			indentColorTextSet(raw);
			if (!raw) { indentColorPickerSet("#808080"); return; }
			const hex = cssColorToHex(raw);
			if (hex) indentColorPickerSet(hex);
		};
		new Setting(containerEl)
			.setName("Indent guide lines color")
			.setDesc("Color of the horizontal separator lines. Leave empty for the default gray.")
			.addColorPicker((c) => {
				c.setValue(cssColorToHex(this.plugin.settings.indentLinesColor) ?? "#808080");
				indentColorPickerSet = (hex) => c.setValue(hex);
				c.onChange((hex) => {
					this.plugin.settings.indentLinesColor = hex;
					this.plugin.applyIndentLinesStyle();
					this.plugin.saveSettingsDebounced();
					indentColorTextSet(hex);
				});
			})
			.addText((t) => {
				t.inputEl.addClass("inventexplorer-color-text");
				t.setPlaceholder("rgba(…) · #rrggbb · default");
				t.setValue(this.plugin.settings.indentLinesColor);
				indentColorTextSet = (v) => { t.inputEl.value = v; };
				t.onChange((v) => {
					const trimmed = v.trim();
					if (!trimmed || trimmed.toLowerCase() === "default") { applyIndentColor(""); return; }
					if (isValidCssColor(trimmed)) applyIndentColor(trimmed);
				});
			})
			.addButton((b) => b.setButtonText("Clear").onClick(() => applyIndentColor("")));

		new Setting(containerEl)
			.setName("Indent guide lines thickness")
			.setDesc("Thickness of the horizontal separator lines (px).")
			.addSlider((s) =>
				s.setLimits(1, 5, 1)
					.setValue(this.plugin.settings.indentLinesThickness)
					.setDynamicTooltip()
					.onChange((v) => {
						this.plugin.settings.indentLinesThickness = v;
						this.plugin.applyIndentLinesStyle();
						this.plugin.saveSettingsDebounced();
					}),
			);

		// ── Explorer vertical indent lines ───────────────────────────────
		new Setting(containerEl)
			.setName("Vertical indent guide lines")
			.setDesc(
				"Show vertical lines along the left edge of nested folders in the file explorer to visualize the tree hierarchy.",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.explorerVerticalLines)
					.onChange(async (v) => {
						this.plugin.settings.explorerVerticalLines = v;
						this.plugin.applyExplorerVerticalLines();
						await this.plugin.saveSettings();
					}),
			);

		let vertColorPickerSet: (hex: string) => void = () => {};
		let vertColorTextSet: (v: string) => void = () => {};
		const applyVertColor = async (raw: string) => {
			this.plugin.settings.verticalLinesColor = raw;
			this.plugin.applyVerticalLinesStyle();
			this.plugin.saveSettingsDebounced();
			vertColorTextSet(raw);
			if (!raw) { vertColorPickerSet("#808080"); return; }
			const hex = cssColorToHex(raw);
			if (hex) vertColorPickerSet(hex);
		};
		new Setting(containerEl)
			.setName("Vertical indent guide lines color")
			.setDesc("Color of the vertical indent lines. Leave empty to inherit the theme color.")
			.addColorPicker((c) => {
				c.setValue(cssColorToHex(this.plugin.settings.verticalLinesColor) ?? "#808080");
				vertColorPickerSet = (hex) => c.setValue(hex);
				c.onChange((hex) => {
					this.plugin.settings.verticalLinesColor = hex;
					this.plugin.applyVerticalLinesStyle();
					this.plugin.saveSettingsDebounced();
					vertColorTextSet(hex);
				});
			})
			.addText((t) => {
				t.inputEl.addClass("inventexplorer-color-text");
				t.setPlaceholder("rgba(…) · #rrggbb · default");
				t.setValue(this.plugin.settings.verticalLinesColor);
				vertColorTextSet = (v) => { t.inputEl.value = v; };
				t.onChange((v) => {
					const trimmed = v.trim();
					if (!trimmed || trimmed.toLowerCase() === "default") { applyVertColor(""); return; }
					if (isValidCssColor(trimmed)) applyVertColor(trimmed);
				});
			})
			.addButton((b) => b.setButtonText("Clear").onClick(() => applyVertColor("")));

		new Setting(containerEl)
			.setName("Vertical indent guide lines thickness")
			.setDesc("Thickness of the vertical indent lines (px).")
			.addSlider((s) =>
				s.setLimits(1, 5, 1)
					.setValue(this.plugin.settings.verticalLinesThickness)
					.setDynamicTooltip()
					.onChange((v) => {
						this.plugin.settings.verticalLinesThickness = v;
						this.plugin.applyVerticalLinesStyle();
						this.plugin.saveSettingsDebounced();
					}),
			);

	}
}
