/**
 * dsh-whale-swap — node half.
 *
 * The browser half (lib/client.js) hides the whale mark above the composer
 * (`[data-slot="conversation.hero.brand.mark"]`) and shows a user-picked icon
 * instead. This node half serves and persists the config document:
 *
 *   GET/HEAD   /plugins/dsh-whale-swap/config.json
 *       → effective document, layered as
 *         built-in defaults → bundled config.example.json → user store
 *         ($DSH_HOME/whale-swap/config.json, survives plugin upgrades).
 *
 *   PUT/POST   same route (application/json, same-origin only)
 *       → validate and persist the full document into the user store.
 *
 * The package directory is replaced wholesale on every plugin upgrade, so the
 * user store lives under $DSH_HOME — the same convention dsh itself uses for
 * settings.yaml.
 */
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/** Cordis plugin name. */
const name = "whale-swap";
/**
 * 不硬依赖任何服务:webServer 缺失或晚于插件激活的宿主(如 headless 测试
 * profile)也要能激活,只是不注册配置路由;就绪后轮询注册(见 apply)。
 */
const inject = [];

const here = dirname(fileURLToPath(import.meta.url));
/** config.example.json sits at the package root, one level above lib/. */
const EXAMPLE_PATH = join(here, "..", "config.example.json");
/** 用户数据目录名($DSH_HOME 之下),升级插件不会被替换。 */
const DATA_DIR = "whale-swap";
const ROUTE = "/plugins/dsh-whale-swap/config.json";

/** 请求体上限(8 MiB):几张 base64 图标足够,异常大 body 直接拒 */
const MAX_BODY_BYTES = 8 * 1024 * 1024;
/** 单个图标 src 上限(6 MiB),防误传整段视频之类 */
const MAX_ICON_SRC_BYTES = 6 * 1024 * 1024;
/** 图标数量上限,避免商店式滥用拖垮设置页 */
const MAX_ICONS = 64;

const DEFAULT_DOC = Object.freeze({
	enabled: true,
	wiggle: true,
	icons: [],
	activeId: "",
});

/** dsh 用户目录:$DSH_HOME 优先,缺省 ~/.dsh(与 dsh 本体同一约定) */
function dshHomeDirectory() {
	const fromEnv = process.env.DSH_HOME;
	if (typeof fromEnv === "string" && fromEnv.trim().length > 0) return fromEnv.trim();
	return join(homedir(), ".dsh");
}

/** 用户配置存储路径:$DSH_HOME/whale-swap/config.json */
function userConfigPath() {
	return join(dshHomeDirectory(), DATA_DIR, "config.json");
}

async function readJsonFile(path) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		return null;
	}
}

/** 生效文档:默认值 → 包内示例 → 用户存储;层内字段做最小净化 */
async function effectiveDocument() {
	const example = await readJsonFile(EXAMPLE_PATH);
	const user = await readJsonFile(userConfigPath());
	const merged = { ...DEFAULT_DOC };
	for (const layer of [example, user]) {
		if (!layer || typeof layer !== "object" || Array.isArray(layer)) continue;
		if (typeof layer.enabled === "boolean") merged.enabled = layer.enabled;
		if (typeof layer.wiggle === "boolean") merged.wiggle = layer.wiggle;
		if (Array.isArray(layer.icons)) merged.icons = layer.icons;
		if (typeof layer.activeId === "string") merged.activeId = layer.activeId;
	}
	return merged;
}

/**
 * 校验设置页提交的完整文档。只做「不会写坏运行时」的结构校验;
 * 单图标 src 过大按字节长度粗挡(不解 base64,宁松勿紧)。
 */
function validateDocument(raw) {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("配置必须是 JSON 对象");
	}
	if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
		throw new Error("enabled 必须是布尔值");
	}
	if (raw.wiggle !== undefined && typeof raw.wiggle !== "boolean") {
		throw new Error("wiggle 必须是布尔值");
	}
	if (raw.activeId !== undefined && typeof raw.activeId !== "string") {
		throw new Error("activeId 必须是字符串");
	}
	if (raw.icons !== undefined) {
		if (!Array.isArray(raw.icons)) throw new Error("icons 必须是数组");
		if (raw.icons.length > MAX_ICONS) throw new Error(`icons 最多 ${MAX_ICONS} 个`);
		const seen = new Set();
		for (const [i, icon] of raw.icons.entries()) {
			const label = `icons[${i}]`;
			if (icon === null || typeof icon !== "object" || Array.isArray(icon)) {
				throw new Error(`${label} 必须是对象`);
			}
			if (typeof icon.id !== "string" || icon.id.length === 0 || icon.id.length > 128) {
				throw new Error(`${label}.id 必须是 1-128 字符的字符串`);
			}
			if (seen.has(icon.id)) throw new Error(`${label}.id 重复`);
			seen.add(icon.id);
			if (typeof icon.name !== "string" || icon.name.length > 200) {
				throw new Error(`${label}.name 必须是 200 字符以内的字符串`);
			}
			if (typeof icon.src !== "string" || icon.src.length === 0) {
				throw new Error(`${label}.src 必须是非空字符串`);
			}
			if (icon.src.length > MAX_ICON_SRC_BYTES) {
				throw new Error(`${label}.src 过大(上限约 ${MAX_ICON_SRC_BYTES >> 20} MiB)`);
			}
			const lower = icon.src.slice(0, 32).toLowerCase();
			if (!lower.startsWith("data:image/") && !lower.startsWith("https://") && !lower.startsWith("http://")) {
				throw new Error(`${label}.src 只接受 data:image/ 或 http(s) 地址`);
			}
		}
	}
}

/** 写用户存储:先写临时文件再原子重命名,避免半截文件 */
async function writeUserDocument(doc) {
	const p = userConfigPath();
	await mkdir(dirname(p), { recursive: true });
	const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tmp, JSON.stringify(doc, null, 2) + "\n", "utf8");
	await rename(tmp, p);
}

/** Origin 头(若有)必须与请求 Host 完全同源 */
function originMatchesHost(origin, host) {
	if (!origin) return true;
	try {
		return new URL(origin).host === String(host || "");
	} catch (error) {
		return false;
	}
}

/** 读请求栅栏:挡掉跨站读取 */
function isTrustedRead(req) {
	const headers = (req && req.headers) || {};
	if (String(headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return false;
	return originMatchesHost(headers.origin, headers.host);
}

/**
 * 写请求栅栏:必须是 application/json(跨域必然触发预检、过不了),
 * sec-fetch-site 只接受 same-origin / none,带 Origin 时必须同源。
 */
function isTrustedWrite(req) {
	const headers = (req && req.headers) || {};
	const type = String(headers["content-type"] || "").toLowerCase();
	if (!type.startsWith("application/json")) return false;
	const site = String(headers["sec-fetch-site"] || "").toLowerCase();
	if (site && site !== "same-origin" && site !== "none") return false;
	return originMatchesHost(headers.origin, headers.host);
}

async function readBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) throw new Error("body too large");
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, payload) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-cache",
	});
	res.end(JSON.stringify(payload));
}

function createHandler() {
	return async function serveConfig(req, res) {
		try {
			if (req.method === "GET" || req.method === "HEAD") {
				if (!isTrustedRead(req)) {
					sendJson(res, 403, { ok: false, error: "untrusted read" });
					return;
				}
				sendJson(res, 200, await effectiveDocument());
				return;
			}
			if (req.method === "PUT" || req.method === "POST") {
				if (!isTrustedWrite(req)) {
					sendJson(res, 403, { ok: false, error: "untrusted write" });
					return;
				}
				let raw;
				try {
					raw = JSON.parse(await readBody(req));
				} catch (error) {
					sendJson(res, 413, { ok: false, error: "请求体过大或不是合法 JSON" });
					return;
				}
				try {
					validateDocument(raw);
				} catch (error) {
					sendJson(res, 400, { ok: false, error: String(error.message || error) });
					return;
				}
				// 完整文档落盘;缺省字段用当前生效值补齐,保证存储里的文档自洽
				const current = await effectiveDocument();
				const next = {
					enabled: raw.enabled !== undefined ? raw.enabled : current.enabled,
					wiggle: raw.wiggle !== undefined ? raw.wiggle : current.wiggle,
					icons: raw.icons !== undefined ? raw.icons : current.icons,
					activeId: raw.activeId !== undefined ? raw.activeId : current.activeId,
				};
				await writeUserDocument(next);
				sendJson(res, 200, { ok: true });
				return;
			}
			res.writeHead(405, { allow: "GET, HEAD, PUT, POST" });
			res.end();
		} catch (error) {
			sendJson(res, 500, { ok: false, error: String(error.message || error) });
		}
	};
}

function apply(ctx) {
	/**
	 * webServer 可能晚于插件激活:轮询等待其就绪后注册路由(500ms × 40 次);
	 * 路由 disposer 挂在 effect 清理里,卸载不留残留、重载不会重复注册。
	 */
	ctx.effect(() => {
		const handler = createHandler();
		let attempts = 0;
		let routeDisposer = null;
		let timer = null;
		const registerNow = () => {
			let ws = null;
			try {
				ws = typeof ctx.get === "function" ? ctx.get("webServer") : null;
			} catch (error) { /* ignore */ }
			if (!ws) {
				try { ws = ctx.webServer || null; } catch (error) { /* ignore */ }
			}
			if (!ws || typeof ws.register !== "function") return false;
			routeDisposer = ws.register({
				kind: "exact",
				path: ROUTE,
				handler,
			});
			return true;
		};
		if (registerNow()) {
			return () => {
				if (routeDisposer) {
					try { routeDisposer(); } catch (error) { /* ignore */ }
				}
			};
		}
		timer = setInterval(() => {
			attempts++;
			if (registerNow() || attempts >= 40) clearInterval(timer);
		}, 500);
		return () => {
			if (timer !== null) clearInterval(timer);
			if (routeDisposer) {
				try { routeDisposer(); } catch (error) { /* ignore */ }
			}
		};
	}, "whale-swap: config.json route");
}

export { apply, inject, name };
