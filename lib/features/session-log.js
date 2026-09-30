/**
 * 会话日志文件名判定（usage-daily / delete-chat 共用，单一出处）。
 *
 * 宿主 `dsh-session-persistence-jsonl` 的命名规则（实测 0.1.5-rc.1）：
 * 每个会话目录里放一个「不可变的格式世代」文件，名为
 * `session[.vN].jsonl[.zstd]`：v0 沿用最初的后缀名（无版本段），
 * 之后每一代都带小写数字版本段，例如 `session.v3.jsonl.zstd`。
 *
 * 因此只认字面量 `session.jsonl.zstd` 会漏掉全部带版本号的日志
 * （2026-09-10 实测：`session.v3.jsonl.zstd` 已经在写，旧的无版本
 * 文件停止更新）。本模块把这条口径收敛到一处。
 */

/** 规范化会话日志文件名：`session[.vN].jsonl[.zstd]`（整串匹配）。 */
export const SESSION_LOG_FILENAME_RE = /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/;

/**
 * 判断文件名是否是一个已提交的会话日志世代。
 *
 * 只接受整串等于上述规范名；迁移临时文件（`session.migration.<token>.tmp`）
 * 与任何多出尾巴的名字（`session.v3.jsonl.tmp`）都不算已提交世代。
 *
 * @param {unknown} name - 目录项名（basename，不含路径）。
 * @returns {boolean}
 */
export function isSessionLogFilename(name) {
	return SESSION_LOG_FILENAME_RE.test(String(name ?? ""));
}

/**
 * 判断文件名是否是 zstd 压缩的会话日志。应用用量只扫这一种：它的读取
 * 管线依赖 zstd 帧解析，明文日志（压缩关闭时宿主写 `.jsonl`）走不了。
 *
 * @param {unknown} name - 目录项名（basename，不含路径）。
 * @returns {boolean}
 */
export function isZstdSessionLogFilename(name) {
	const text = String(name ?? "");
	return text.endsWith(".zstd") && SESSION_LOG_FILENAME_RE.test(text);
}
