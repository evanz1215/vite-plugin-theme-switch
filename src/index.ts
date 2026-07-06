import {
  defineConfig,
  loadEnv,
  mergeConfig,
  type ConfigEnv,
  type UserConfig,
  type UserConfigExport,
} from "vite";
import { resolveOptions } from "./options";
import { aliasPlugin } from "./plugins/alias";
import { shadowPlugin } from "./plugins/shadow";
import { tailwindPlugin } from "./plugins/tailwind";
import type { BrandOptions } from "./types";

export type { BrandOptions, BrandConfig } from "./types";

/**
 * 包裝 Vite defineConfig:解析當前品牌、注入 white-label plugins。
 * 移植自 .xgi/core/vite/index.ts 的 useXgiDefineConfig
 * (原版 config 函式會被執行兩次的問題在此已修正:只 resolve 一次)。
 *
 * 使用方式:
 * ```ts
 * // vite.config.ts
 * export default defineBrandConfig(
 *   { aliases: { "@stores": "./src/stores" } },
 *   ({ mode }) => ({ plugins: [vue()] }),
 * );
 * ```
 */
export const defineBrandConfig = (
  options: BrandOptions = {},
  config: UserConfigExport = {},
) =>
  defineConfig(async (confEnv: ConfigEnv) => {
    const env = loadEnv(confEnv.mode, process.cwd());
    const ctx = resolveOptions(options, env);

    // shadow 建好後 resolve,tailwind plugin 以此排序(取代原本的輪詢 queue)
    let onShadowReady!: () => void;
    const shadowReady = new Promise<void>((r) => (onShadowReady = r));

    const userConfig: UserConfig =
      typeof config === "function" ? await config(confEnv) : await config;

    return mergeConfig(userConfig, {
      define: { DEV: confEnv.mode === "development" },
      plugins: [
        aliasPlugin(ctx),
        shadowPlugin(ctx, onShadowReady),
        tailwindPlugin(ctx, shadowReady),
      ],
    });
  });
