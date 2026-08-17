/**
 * Feature: ui.appearance — 外观定制（融合自
 * https://github.com/yoli-mi/dsh-client-ui-custom，MIT，Copyright (c) 2026 Yoli-mi）。
 *
 * 独立页签「外观」：预设（6 套）、壁纸、玻璃档位、强调色（可自动从壁纸
 * 取色/随机灵感）、各表面不透明度、渐变/暗色遮罩、字体与缩放、强调色滚动条、
 * 晕影、精细项（圆角/阴影/焦点光晕/壁纸色调/暗色强调色）与 customCss /
 * customVars 逃生舱。配置存 dsh-tools featureConfig（ui.appearance），改动
 * 即时生效（主题实时重渲染，无需重启）；全部实现都在 client half
 * （--dsu-* 变量 + data-dsu-active 门控的 token 覆盖，不改 shell）。
 * host 无命令/服务——本模块只提供 feature 元数据、默认配置与空 register。
 */

export const key = "ui.appearance";
export const label = "外观";
export const description = "主题定制：预设、壁纸、玻璃档位、强调色、表面不透明度、字体与自定义 CSS（融合自 dsh-client-ui-custom）";
export const defaultEnabled = false; // 默认关：不配置时与原生界面完全一致
export const kind = "feature"; // panel 默认 true：工具箱设置页生成「外观」页签

/** 方案A 配置默认值（= 原插件的 DEFAULTS 主题部分：中性默认，开箱不改任何外观）。 */
export const defaultConfig = {
	preset: "",
	wallpaper: "",
	wallpaperBlur: 14,
	glass: "frosted",
	accent: "#4176e6",
	autoAccent: false,
	surfaceOpacity: 100,
	sidebarOpacity: 100,
	chatSurfaceOpacity: 100,
	inputOpacity: 100,
	codeBlockOpacity: 100,
	darkSurfaceOpacity: 100,
	gradient: "",
	darkScrim: 0,
	fontFamily: "",
	codeFontFamily: "",
	fontScale: 1,
	scrollbarAccent: false,
	vignette: false,
	cornerRadius: "inherit",
	surfaceShadow: "inherit",
	focusGlow: "inherit",
	wallpaperTone: "inherit",
	darkAccent: "",
	customCss: "",
	customVars: {},
};

export function register() {
	// client half 自包含；host 侧无事可做。
	return () => {};
}
