import type { Plugin } from "vite";
import path from "path";
import type { ResolvedThemeOptions } from "../types";

/**
 * 注入 @theme 系列 alias(指向 shadow 合成目錄)+ 使用者自訂 alias。
 * 移植自 .xgi/core/vite/plugins/xgi-plugin-alias。
 * 原版的專案私有 alias(@views、@stores…)不進套件,由使用者以 options.aliases 傳入。
 */
export const aliasPlugin = (ctx: ResolvedThemeOptions): Plugin => ({
  name: "vite-plugin-theme-switch:alias",
  enforce: "pre",
  config() {
    return {
      resolve: {
        alias: {
          "@theme": ctx.runtimeDir,
          "@theme-components": path.join(ctx.runtimeDir, "components"),
          "@theme-router": path.join(ctx.runtimeDir, "extra-router"),
          "@theme-assets": path.join(ctx.runtimeDir, "assets"),
          ...ctx.aliases,
        },
      },
    };
  },
});
