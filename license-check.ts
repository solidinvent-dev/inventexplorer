/**
 * Daily licence revocation check. The plugin never asks "does this email have a
 * license" (activation stays fully offline) — it asks the vendor endpoint
 * whether the activated email has been REVOKED (e.g. a key leaked publicly).
 *
 * Trust model: each request proves possession of the deterministic license via
 * a short-lived HMAC. The endpoint's answer is a nonce-bound statement
 * `IE1S2|<emailHash>|ok|<ts>|<nonce>` (or `rev`), Ed25519-SIGNED with the same
 * vendor key that signs license keys and verified locally against the embedded
 * reference. Stored V1 statements remain readable. No network / unreachable
 * endpoint = no change: the newest locally
 * stored statement (plus the ordinary offline key check) stands.
 *
 * The newest statement is persisted in the plugin's own data.json and in
 * localStorage, and self-heals across them. Re-activating a revoked email is
 * refused while the newest statement for it says "rev"; a newer signed "ok"
 * (support resolved the case) lifts the hold the same way.
 *
 * NOTE: none of this ever reaches the vault config file — the license belongs
 * to the device, not to the synced icon configuration.
 */

import { Notice, requestUrl } from "obsidian";
import { LICENSE_STATUS_URL, verifyVendorSignature, canonicalKey, isRevoked, setRevoked, keyValid, sealEmail, setLicense } from "./licensing";

// Storage names for the newest signed licence status. "seed" is a historical
// name kept so existing installs keep their stored status across the update;
// it holds a vendor-signed "ok"/"rev" statement, nothing else.
const LS_SEED = "inventexplorer:seed";
const LS_CHECKED = "inventexplorer:seed-sync";
const CHECK_EVERY_MS = 24 * 3600_000;
const TICK_MS = 60 * 60_000;
const FIRST_TICK_MS = 90_000;
// An activation the endpoint could not confirm leaves the device running on
// key validity alone. It is asked again shortly, then every half hour, until
// one answer gets through — see scheduleConfirmation().
const FIRST_RETRY_MS = 60_000;
const RETRY_EVERY_MS = 30 * 60_000;

/** Licence email + key, and the newest signed licence status (`seed`). Lives in data.json only. */
export interface LicenseState {
	email?: string;
	key?: string;
	seed?: string;
}

/** What license-check needs from the plugin (avoids importing main.ts). */
export interface LicenseHost {
	license: LicenseState;
	saveLicense(): Promise<void>;
	refreshAll(): void;
	/** Per-device, per-vault storage (Obsidian's App.loadLocalStorage). */
	loadLocal(key: string): string | null;
	saveLocal(key: string, value: string): void;
}

export interface Stamp {
	/** Full signed payload (`IE1S|eh|st|ts` or nonce-bound `IE1S2|eh|st|ts|nonce`). */
	p: string;
	/** Signature (b64u). */
	s: string;
	eh: string;
	st: "ok" | "rev";
	ts: number;
	v: 1 | 2;
	n?: string;
}

const STAMP_V1_RE = /^IE1S\|([0-9a-f]{64})\|(ok|rev)\|(\d{1,12})$/;
const STAMP_V2_RE = /^IE1S2\|([0-9a-f]{64})\|(ok|rev)\|(\d{1,12})\|([0-9a-f]{64})$/;
const STATUS_PROOF_PREFIX = "IE1P";
const ENC = new TextEncoder();

/** Parse+verify one stored/received statement. `verify` injectable for tests. */
export function parseStamp(
	raw: unknown,
	verify: (p: string, s: string) => boolean = verifyVendorSignature,
): Stamp | null {
	try {
		const obj = (typeof raw === "string" ? JSON.parse(atob(raw)) : raw) as { p?: unknown; s?: unknown } | null;
		if (!obj || typeof obj.p !== "string" || typeof obj.s !== "string") return null;
		const m2 = STAMP_V2_RE.exec(obj.p);
		const m1 = m2 ? null : STAMP_V1_RE.exec(obj.p);
		const m = m2 || m1;
		if (!m) return null;
		if (!verify(obj.p, obj.s)) return null;
		return {
			p: obj.p,
			s: obj.s,
			eh: m[1],
			st: m[2] as "ok" | "rev",
			ts: parseInt(m[3], 10),
			v: m2 ? 2 : 1,
			...(m2 ? { n: m2[4] } : {}),
		};
	} catch {
		return null;
	}
}

export function encodeStamp(stamp: Pick<Stamp, "p" | "s">): string {
	return btoa(JSON.stringify({ p: stamp.p, s: stamp.s }));
}

/** Total order for equal-time stamps: V2 beats V1, then rev beats ok. */
export function stampWins(candidate: Stamp, current: Stamp): boolean {
	if (candidate.ts !== current.ts) return candidate.ts > current.ts;
	if (candidate.v !== current.v) return candidate.v > current.v;
	return candidate.st === "rev" && current.st === "ok";
}

export async function emailHash(email: string): Promise<string> {
	const norm = String(email || "").trim().toLowerCase();
	const digest = await crypto.subtle.digest("SHA-256", ENC.encode(norm));
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function bytesHex(bytes: Uint8Array): string {
	return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fresh, cryptographically random request nonce (32 bytes, lowercase hex). */
export function statusNonce(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return bytesHex(bytes);
}

/** Proof that the caller possesses the deterministic license for `email`. */
export async function statusProof(email: string, key: string, ts: number, nonce: string): Promise<string> {
	const norm = String(email || "").trim().toLowerCase();
	const proofKey = canonicalKey(String(key || "").trim());
	if (!proofKey) throw new Error("invalid license key");
	const hmacKey = await crypto.subtle.importKey(
		"raw",
		ENC.encode(proofKey),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		hmacKey,
		ENC.encode(`${STATUS_PROOF_PREFIX}|${norm}|${ts}|${nonce}`),
	);
	return bytesHex(new Uint8Array(signature));
}

function storedRaws(host: LicenseHost): string[] {
	const out: string[] = [];
	if (host.license.seed) out.push(host.license.seed);
	try {
		const ls = host.loadLocal(LS_SEED);
		if (ls) out.push(ls);
	} catch {
		/* storage unavailable */
	}
	return out;
}

/** Newest valid statement for an email hash across every storage location. */
export function newestStamp(
	host: LicenseHost,
	eh: string,
	verify?: (p: string, s: string) => boolean,
): Stamp | null {
	let best: Stamp | null = null;
	for (const raw of storedRaws(host)) {
		const st = parseStamp(raw, verify);
		if (!st || st.eh !== eh) continue;
		if (!best || stampWins(st, best)) best = st;
	}
	return best;
}

/** Persist a statement everywhere (self-healing copies; newest always wins). */
async function storeStamp(host: LicenseHost, stamp: Stamp): Promise<void> {
	const raw = encodeStamp(stamp);
	host.license.seed = raw;
	try {
		host.saveLocal(LS_SEED, raw);
	} catch {
		/* storage unavailable */
	}
	try {
		await host.saveLicense();
	} catch {
		/* persisted on the next natural save */
	}
}

/**
 * Derive the runtime hold from the newest stored statement for the ACTIVE
 * account, and self-heal missing copies. Safe to call repeatedly.
 */
export async function applyLocalLicenseState(host: LicenseHost): Promise<void> {
	const email = host.license.email;
	if (!email) {
		setRevoked(false);
		return;
	}
	setLicense(host.license.email, host.license.key);
	const eh = await emailHash(email);
	const best = newestStamp(host, eh);
	const wasHeld = isRevoked();
	setRevoked(best?.st === "rev");
	if (best) await storeStamp(host, best);
	if (wasHeld !== isRevoked()) host.refreshAll();
}

/** Activation guard: true when the newest statement for this email says "rev". */
export async function isEmailRevoked(host: LicenseHost, email: string): Promise<boolean> {
	const eh = await emailHash(email);
	return newestStamp(host, eh)?.st === "rev";
}

/**
 * One status round-trip: fetch + persist the fresh signed statement, returning
 * the resulting standing for `email` (newest-wins across storage). Returns
 * "offline" when the endpoint gives no usable answer — the caller then keeps
 * the local state. No UI side effects.
 */
export async function fetchStanding(
	host: LicenseHost,
	email: string,
): Promise<"ok" | "rev" | "offline"> {
	const norm = String(email || "").trim().toLowerCase();
	const key = host.license.key;
	if (!key || !keyValid(norm, key)) return "offline";
	const eh = await emailHash(norm);
	const ts = Math.floor(Date.now() / 1000);
	const nonce = statusNonce();
	const proof = await statusProof(norm, key, ts, nonce);
	// The address is sealed to the vendor key — it never leaves the device in
	// readable form. Only the holder of the private half can open the envelope.
	const sealed = await sealEmail(norm, ts, nonce);
	let body: { p?: string; s?: string } | null = null;
	try {
		const res = await requestUrl({
			url: LICENSE_STATUS_URL,
			method: "POST",
			contentType: "application/json",
			body: JSON.stringify({ ...sealed, ts, n: nonce, p: proof }),
			throw: false,
		});
		if (res.status !== 200) return "offline";
		body = res.json as { p?: string; s?: string };
	} catch {
		return "offline"; // offline / blocked / misconfigured endpoint
	}
	const stamp = parseStamp(body);
	// Network answers must use the nonce-bound V2 format. V1 remains accepted
	// only when reading already-persisted statements from older plugin builds.
	if (!stamp || stamp.v !== 2 || stamp.eh !== eh || stamp.n !== nonce) return "offline";
	// The request proof and its nonce-bound network answer share the same short
	// freshness window. Legacy V1 is only read from local storage above.
	if (Math.abs(Math.floor(Date.now() / 1000) - stamp.ts) > 300) return "offline";
	try {
		host.saveLocal(LS_CHECKED, String(Date.now()));
	} catch {
		/* ignore */
	}
	const current = newestStamp(host, eh);
	if (!current || stampWins(stamp, current)) await storeStamp(host, stamp);
	return newestStamp(host, eh)?.st ?? "ok";
}

/** Daily background check: apply the fresh standing, with a notice on change. */
export async function checkLicenseNow(host: LicenseHost): Promise<void> {
	const email = host.license.email;
	if (!email) return;
	const before = isRevoked();
	const standing = await fetchStanding(host, email);
	if (standing === "offline") return; // local state stands
	setRevoked(standing === "rev");
	if (isRevoked() !== before) {
		new Notice(
			isRevoked()
				? "InventExplorer: this license has been put on hold — the free-tier limits apply again. Contact contact@solidinvent.pl."
				: "InventExplorer: license restored — thank you!",
			isRevoked() ? 15000 : 10000,
		);
		host.refreshAll();
	}
}

/**
 * Manual activation. The key is validated offline (authenticity is separate
 * from revocation); then, WHEN ONLINE, the vendor's fresh signed standing is
 * authoritative and can both apply AND immediately LIFT a hold — a re-activate
 * with the server saying active=1 clears a stale block without waiting for the
 * daily check. Offline falls back to the newest local statement.
 */
export async function activateAccount(
	host: LicenseHost,
	email: string,
	key: string,
): Promise<"ok" | "invalid" | "revoked"> {
	const normEmail = email.trim().toLowerCase();
	const normKey = key.trim();
	if (!keyValid(normEmail, normKey)) return "invalid";
	const prev = { ...host.license };
	// Adopt tentatively so the status check reads this account.
	host.license.email = normEmail;
	host.license.key = normKey;
	setLicense(normEmail, normKey);

	// Ask whatever navigator.onLine claims: fetchStanding() already answers
	// "offline" when no usable reply comes back, and that flag is not
	// trustworthy enough to skip the one authoritative question.
	const standing = await fetchStanding(host, normEmail);
	// Server "rev" → refuse. Server unreachable → trust the newest local mark.
	const localRev = standing === "offline" && (await isEmailRevoked(host, normEmail));
	if (standing === "rev" || localRev) {
		host.license.email = prev.email;
		host.license.key = prev.key;
		setLicense(prev.email, prev.key);
		await applyLocalLicenseState(host);
		return "revoked";
	}
	setRevoked(false); // server said ok (or offline + not locally revoked)
	await host.saveLicense();
	host.refreshAll();
	// An online activation IS the check — there is nothing left to ask. One
	// that never reached the endpoint activated on key validity alone, so
	// chase a real answer rather than wait for tomorrow.
	if (standing === "offline") scheduleConfirmation(host);
	else stopConfirmation();
	return "ok";
}

/** Clear the registered account (Deactivate button). */
export async function deactivateAccount(host: LicenseHost): Promise<void> {
	host.license.email = undefined;
	host.license.key = undefined;
	setLicense(undefined, undefined);
	setRevoked(false);
	await host.saveLicense();
	host.refreshAll();
}

function lastCheckedAt(host: LicenseHost): number {
	try {
		return parseInt(host.loadLocal(LS_CHECKED) || "0", 10) || 0;
	} catch {
		return 0; // unreadable storage reads as "never checked", so a check is due
	}
}

let confirmTimer: number | null = null;

/** Cancel the confirmation chain — an answer got through, or we are unloading. */
function stopConfirmation(): void {
	if (confirmTimer !== null) {
		window.clearTimeout(confirmTimer);
		confirmTimer = null;
	}
}

/**
 * Chase a real answer for an activation that could NOT be verified at the time.
 * Such a device is running on key validity alone, so it asks again after a
 * minute and then every half hour; once one answer gets through, the ordinary
 * daily rhythm takes over.
 *
 * This adds nothing to steady-state request volume: with no connectivity the
 * attempt fails on the device and never reaches the endpoint, and the chain
 * stops on the first verified round trip — which is the only thing that moves
 * LS_CHECKED.
 */
function scheduleConfirmation(host: LicenseHost, delay: number = FIRST_RETRY_MS): void {
	stopConfirmation();
	confirmTimer = window.setTimeout(() => {
		confirmTimer = null;
		if (!host.license.email) return; // account removed meanwhile
		const before = lastCheckedAt(host);
		// A check that throws is a check that did not confirm — swallow it and
		// re-arm, or one bad round trip would end the chain for good.
		void checkLicenseNow(host)
			.catch(() => undefined)
			.then(() => {
				if (lastCheckedAt(host) > before) return; // confirmed
				scheduleConfirmation(host, RETRY_EVERY_MS);
			});
	}, delay);
}

/** Once-a-day scheduler (per device). Returns a stop function. */
export function startLicenseCheck(host: LicenseHost): () => void {
	const due = (): boolean => Date.now() - lastCheckedAt(host) >= CHECK_EVERY_MS;
	// No navigator.onLine gate. That flag lies in both directions — a captive
	// portal reports online, a sleep/VPN transition reports offline while the
	// network works — and skipping the tick on it is exactly how a device
	// silently misses its daily check. The request is the reliable test:
	// fetchStanding() maps any failure to "offline" and local state stands.
	const tick = (): void => {
		if (!host.license.email) return;
		if (due()) void checkLicenseNow(host);
	};
	const interval = window.setInterval(tick, TICK_MS);
	const first = window.setTimeout(tick, FIRST_TICK_MS);
	const onOnline = (): void => tick();
	window.addEventListener("online", onOnline);
	return () => {
		window.clearInterval(interval);
		window.clearTimeout(first);
		stopConfirmation();
		window.removeEventListener("online", onOnline);
	};
}
