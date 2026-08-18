/**
 * WeChat sender allowlist.
 *
 * 安全策略：空白名单 = 拒绝所有入站消息（fail-closed）。
 * 只有显式列出的微信用户 ID 才能驱动 DSH Agent。
 */

/** Normalize a raw allowlist value into a trimmed non-empty string array. */
export function normalizeAllowFrom(raw) {
	if (!Array.isArray(raw)) return [];
	const seen = new Set();
	const out = [];
	for (const item of raw) {
		if (typeof item !== "string") continue;
		const id = item.trim();
		if (id === "" || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
	}
	return out;
}

/** True only when userId is explicitly listed in allowFrom. */
export function isAllowed(allowFrom, userId) {
	if (!Array.isArray(allowFrom) || allowFrom.length === 0) return false;
	if (typeof userId !== "string" || userId.trim() === "") return false;
	const target = userId.trim();
	return allowFrom.some((id) => typeof id === "string" && id.trim() === target);
}
