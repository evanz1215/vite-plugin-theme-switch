import type { Plugin } from "vite";
import path from "path";
import type { ResolvedBrandOptions } from "../types";

/**
 * 注入 @brand 系列 alias(指向 shadow 合成目錄)+ 使用者自訂 alias。
 * 移植自 .xgi/core/vite/plugins/xgi-plugin-alias。
 * 原版的專案私有 alias(@views、@stores…)不進套件,由使用者以 options.aliases 傳入。
 */
export const aliasPlugin = (ctx: ResolvedBrandOptions): Plugin => ({
  name: "vite-plugin-white-label:alias",
  enforce: "pre",
  config() {
    return {
      resolve: {
        alias: {
          "@brand": ctx.runtimeDir,
          "@brand-components": path.join(ctx.runtimeDir, "components"),
          "@brand-router": path.join(ctx.runtimeDir, "extra-router"),
          "@brand-assets": path.join(ctx.runtimeDir, "assets"),
          ...ctx.aliases,
        },
      },
    };
  },
});
