/**
 * dsh-whale-swap — browser half.
 *
 * Hides the whale mark above the composer — and ONLY that mark, addressed by
 * its official slot `[data-slot="conversation.hero.brand.mark"]` — and puts a
 * user-picked icon in its place. Other whale marks on the page are untouched.
 *
 * Config (icon library, active icon, switches) is served by the node half at
 * CONFIG_URL and persisted under $DSH_HOME; the settings page contributed to
 * the host settings dialog ("设置 → 鲸鱼图标替换") reads/writes the same
 * document, so changes apply live without a reload and survive upgrades.
 */
window.__ModuleLoader__.load({
	id: "dsh-whale-swap",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/** 设置页组件需要 React(DSH 模块加载器提供,与内置设置页共用同一份) */
		const react = require("react");
		const e = react.createElement;

		const name = "whale-swap";
		/** slots 服务用于把设置页挂进宿主设置弹窗 */
		const inject = ["slots"];

		const CONFIG_URL = "/plugins/dsh-whale-swap/config.json";
		const HERO_SLOT_SELECTOR = '[data-slot="conversation.hero.brand.mark"]';
		const ON_CLASS = "dfy-ws-on";
		const IMG_CLASS = "dfy-ws-logo";

		const DEFAULT_DOC = { enabled: true, wiggle: true, icons: [], activeId: "" };

		/** 替换区样式:只作用于 hero 鲸鱼的官方 slot */
		const SWAP_CSS = `
${HERO_SLOT_SELECTOR}.${ON_CLASS} :is(svg, img:not(.${IMG_CLASS}), video, canvas) {
	display: none !important;
}
.${IMG_CLASS} {
	display: inline-block;
	width: auto;
	max-width: 3.2em;
	vertical-align: middle;
	object-fit: contain;
}
${HERO_SLOT_SELECTOR}:hover .${IMG_CLASS}.dfy-ws-wiggle {
	animation: dfy-ws-wobble 0.6s ease-in-out infinite;
	transform-origin: 50% 60%;
}
@keyframes dfy-ws-wobble {
	0%, 100% { transform: rotate(0deg) scale(1); }
	25% { transform: rotate(-9deg) scale(1.1); }
	75% { transform: rotate(9deg) scale(1.1); }
}`;

		/** 设置页样式(类名全部带 dfy-ws-set- 前缀,不碰宿主样式) */
		const SETTINGS_CSS = `
.dfy-ws-set-root { max-width: 760px; font-size: 14px; }
.dfy-ws-set-desc { color: #8a8f98; margin: 4px 0 16px; }
.dfy-ws-set-toggles { display: flex; gap: 24px; margin-bottom: 16px; }
.dfy-ws-set-toggles label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.dfy-ws-set-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
.dfy-ws-set-cell {
	position: relative; height: 76px; border: 2px solid #e3e5e8; border-radius: 10px;
	background: rgba(0, 0, 0, 0.72); display: flex; align-items: center; justify-content: center;
	cursor: pointer; padding: 6px; box-sizing: border-box;
}
.dfy-ws-set-cell.active { border-color: #4d6bfe; }
.dfy-ws-set-cell img { max-width: 100%; max-height: 100%; object-fit: contain; }
.dfy-ws-set-del {
	position: absolute; top: -7px; right: -7px; width: 18px; height: 18px; border-radius: 50%;
	border: none; background: #e5484d; color: #fff; font-size: 12px; line-height: 18px;
	cursor: pointer; display: none; padding: 0;
}
.dfy-ws-set-cell:hover .dfy-ws-set-del { display: block; }
.dfy-ws-set-empty { grid-column: 1 / -1; color: #8a8f98; text-align: center; padding: 28px 0; border: 1px dashed #e3e5e8; border-radius: 10px; }
.dfy-ws-set-row { display: flex; gap: 8px; margin-bottom: 12px; }
.dfy-ws-set-row input[type="url"], .dfy-ws-set-row input[type="text"] {
	flex: 1; padding: 8px 10px; border: 1px solid #d9dce1; border-radius: 8px; font-size: 13px; min-width: 0;
}
.dfy-ws-set-btn {
	padding: 8px 16px; border: none; border-radius: 8px; background: #4d6bfe; color: #fff;
	font-size: 13px; cursor: pointer; white-space: nowrap;
}
.dfy-ws-set-btn:disabled { opacity: 0.5; cursor: default; }
.dfy-ws-set-hint { font-size: 12px; color: #8a8f98; margin-top: 14px; }
.dfy-ws-set-status { margin-left: 10px; font-size: 13px; }
.dfy-ws-set-status.ok { color: #18a058; }
.dfy-ws-set-status.err { color: #e5484d; }
`;

		function newId() {
			return `dfy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		}

		function activeIconSrc(doc) {
			if (!doc || !Array.isArray(doc.icons)) return null;
			const icon = doc.icons.find((i) => i.id === doc.activeId);
			return icon && typeof icon.src === "string" ? icon.src : null;
		}

		function apply(ctx) {
			const log = (...args) => console.log("[whale-swap]", ...args);

			// ══ 样式 ══
			const swapStyleEl = document.createElement("style");
			swapStyleEl.textContent = SWAP_CSS;
			(document.head || document.documentElement).appendChild(swapStyleEl);
			const settingsStyleEl = document.createElement("style");
			settingsStyleEl.textContent = SETTINGS_CSS;
			(document.head || document.documentElement).appendChild(settingsStyleEl);

			// ══ 配置状态(设置页与替换逻辑共享同一份) ══
			let doc = { ...DEFAULT_DOC };
			const listeners = new Set();
			const subscribe = (fn) => {
				listeners.add(fn);
				return () => listeners.delete(fn);
			};
			const setDoc = (next) => {
				doc = next;
				applySwap();
				for (const fn of listeners) fn(doc);
			};
			const reload = async () => {
				try {
					const res = await fetch(CONFIG_URL, { cache: "no-store" });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					setDoc({ ...DEFAULT_DOC, ...(await res.json()) });
				} catch (error) {
					log("读取配置失败,使用默认值:", error);
				}
			};
			const persist = async (next) => {
				const res = await fetch(CONFIG_URL, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(next),
				});
				if (!res.ok) {
					const text = await res.text().catch(() => "");
					throw new Error(`保存失败(HTTP ${res.status})${text ? `:${text.slice(0, 200)}` : ""}`);
				}
			};

			// ══ hero 鲸鱼替换 ══
			function restoreSlot(slot) {
				slot.classList.remove(ON_CLASS);
				const img = slot.querySelector(`img.${IMG_CLASS}`);
				if (img) img.remove();
			}

			function applySwap() {
				const src = doc.enabled ? activeIconSrc(doc) : null;
				const slots = document.querySelectorAll(HERO_SLOT_SELECTOR);
				for (const slot of slots) {
					if (!src) {
						restoreSlot(slot);
						continue;
					}
					if (!slot.classList.contains(ON_CLASS)) slot.classList.add(ON_CLASS);

					let img = slot.querySelector(`img.${IMG_CLASS}`);
					if (img && img.getAttribute("src") !== src) {
						img.remove();
						img = null;
					}
					if (!img) {
						img = document.createElement("img");
						img.className = IMG_CLASS;
						img.alt = "";
						img.src = src;
						const whale = slot.querySelector("svg, img, video");
						let h = 0;
						if (whale) {
							const r = whale.getBoundingClientRect();
							if (r.height > 0) h = r.height;
						}
						if (!h) h = 25;
						img.style.height = `${Math.round(h)}px`;
						if (whale && whale.parentElement) whale.parentElement.insertBefore(img, whale);
						else slot.appendChild(img);
					}
					img.classList.toggle("dfy-ws-wiggle", doc.wiggle !== false);
				}
			}

			const observer = new MutationObserver(() => applySwap());
			observer.observe(document.documentElement, { childList: true, subtree: true });
			const interval = setInterval(() => applySwap(), 2000);
			reload();

			// ══ 设置页组件 ══
			function IconCell(props) {
				const icon = props.icon;
				const isActive = icon.id === props.activeId;
				return e(
					"div",
					{
						className: `dfy-ws-set-cell${isActive ? " active" : ""}`,
						title: icon.name,
						onClick: () => props.onActivate(icon.id),
					},
					e("img", { src: icon.src, alt: icon.name }),
					e(
						"button",
						{
							className: "dfy-ws-set-del",
							title: "删除",
							onClick: (ev) => {
								ev.stopPropagation();
								props.onDelete(icon.id);
							},
						},
						"×"
					)
				);
			}

			function SettingsPanel() {
				const [state, setState] = react.useState({ ...DEFAULT_DOC });
				const [loading, setLoading] = react.useState(true);
				const [url, setUrl] = react.useState("");
				const [status, setStatus] = react.useState(null); // {kind:'ok'|'err', text}
				const fileRef = react.useRef(null);
				const statusTimer = react.useRef(null);

				react.useEffect(() => subscribe((d) => setState(d)), []);

				react.useEffect(() => {
					let cancelled = false;
					(async () => {
						try {
							const res = await fetch(CONFIG_URL, { cache: "no-store" });
							if (!res.ok) throw new Error(`HTTP ${res.status}`);
							if (!cancelled) setState({ ...DEFAULT_DOC, ...(await res.json()) });
						} catch (error) {
							log("设置页读取配置失败:", error);
						} finally {
							if (!cancelled) setLoading(false);
						}
					})();
					return () => {
						cancelled = true;
					};
				}, []);

				const flash = (kind, text) => {
					setStatus({ kind, text });
					clearTimeout(statusTimer.current);
					statusTimer.current = setTimeout(() => setStatus(null), 4000);
				};

				const save = async (patch) => {
					const next = { ...state, ...patch };
					setState(next); // 乐观更新,替换立即生效
					try {
						await persist(next);
						setDoc(next); // 同步给替换逻辑与其他打开的实例
						flash("ok", "已保存");
					} catch (error) {
						flash("err", String(error.message || error));
						reload();
					}
				};

				const addIcon = (src, nameLabel) => {
					const value = String(src || "").trim();
					if (!value) return;
					if (state.icons.some((i) => i.src === value)) {
						flash("err", "这个图标已经在库里了");
						return;
					}
					if (state.icons.length >= 64) {
						flash("err", "图标最多 64 个");
						return;
					}
					const icon = { id: newId(), name: nameLabel || "自定义图标", src: value };
					save({ icons: [...state.icons, icon], activeId: icon.id });
				};

				if (loading) return e("div", { className: "dfy-ws-set-root" }, "加载中…");

				const cells = state.icons.length
					? state.icons.map((icon) =>
							e(IconCell, {
								key: icon.id,
								icon,
								activeId: state.activeId,
								onActivate: (id) => save({ activeId: id }),
								onDelete: (id) => {
									const icons = state.icons.filter((i) => i.id !== id);
									const patch = { icons };
									if (state.activeId === id) patch.activeId = icons[0] ? icons[0].id : "";
									save(patch);
								},
							})
						)
					: e("div", { className: "dfy-ws-set-empty" }, "图标库是空的,先通过下方添加一个吧");

				return e(
					"div",
					{ className: "dfy-ws-set-root" },
					e("h2", null, "鲸鱼图标替换"),
					e(
						"p",
						{ className: "dfy-ws-set-desc" },
						"替换会话框上方的鲸鱼 Logo(只动这一处)。上传图片或填 URL 加入图标库,点选即生效,升级插件不丢配置。"
					),
					e(
						"div",
						{ className: "dfy-ws-set-toggles" },
						e(
							"label",
							null,
							e("input", {
								type: "checkbox",
								checked: state.enabled !== false,
								onChange: (ev) => save({ enabled: ev.target.checked }),
							}),
							"启用替换"
						),
						e(
							"label",
							null,
							e("input", {
								type: "checkbox",
								checked: state.wiggle !== false,
								onChange: (ev) => save({ wiggle: ev.target.checked }),
							}),
							"悬停摇摆动效"
						)
					),
					e("div", { className: "dfy-ws-set-grid" }, cells),
					e(
						"div",
						{ className: "dfy-ws-set-row" },
						e("input", {
							type: "url",
							placeholder: "图片 URL(http/https)",
							value: url,
							onChange: (ev) => setUrl(ev.target.value),
						}),
						e(
							"button",
							{
								className: "dfy-ws-set-btn",
								onClick: () => {
									addIcon(url, "URL 图片");
									setUrl("");
								},
							},
							"添加"
						),
						e(
							"button",
							{ className: "dfy-ws-set-btn", onClick: () => fileRef.current && fileRef.current.click() },
							"上传"
						),
						e("input", {
							type: "file",
							accept: "image/*",
							style: { display: "none" },
							ref: fileRef,
							onChange: (ev) => {
								const file = ev.target.files && ev.target.files[0];
								ev.target.value = "";
								if (!file) return;
								if (file.size > 4 * 1024 * 1024) {
									flash("err", "图片不能超过 4 MiB");
									return;
								}
								const reader = new FileReader();
								reader.onload = () => addIcon(reader.result, file.name.replace(/\.[^.]+$/, ""));
								reader.readAsDataURL(file);
							},
						})
					),
					status
						? e("span", { className: `dfy-ws-set-status ${status.kind}` }, status.text)
						: null,
					e(
						"p",
						{ className: "dfy-ws-set-hint" },
						"提示:上传的图片以 data: 形式存放在本地用户目录,不上传到任何服务器;GIF 图本身会动。"
					)
				);
			}

			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "whale-swap",
						order: 60,
						label: () => "鲸鱼图标替换",
					},
					SettingsPanel
				)
			);

			// ══ 卸载清理:还原鲸鱼、拆掉观察器与样式 ══
			ctx.effect(
				() => () => {
					observer.disconnect();
					clearInterval(interval);
					for (const slot of document.querySelectorAll(HERO_SLOT_SELECTOR)) {
						try {
							restoreSlot(slot);
						} catch (error) { /* ignore */ }
					}
					if (swapStyleEl.isConnected) swapStyleEl.remove();
					if (settingsStyleEl.isConnected) settingsStyleEl.remove();
				},
				"whale-swap: hero whale swap"
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	},
});
