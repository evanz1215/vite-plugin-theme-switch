import path from "path";
import { existsSync, readFileSync } from "fs";
import json5 from "json5";
import type { ResolvedThemeOptions, ThemeConfig, ThemeOptions } from "./types";

export const resolveOptions = (
  options: ThemeOptions,
  env: Record<string, string>,
  root = process.cwd(),
): ResolvedThemeOptions => {
  const envKey = options.envKey ?? "VITE_THEME";

  return {
    themesDir: path.resolve(root, options.themesDir ?? "./themes"),
    runtimeDir: path.resolve(root, options.runtimeDir ?? "./.runtime/theme"),
    theme: env[envKey] ?? options.defaultTheme ?? "default",
    ignore: options.ignore ?? [".DS_Store", "public/"],
    tailwind: options.tailwind
      ? {
          presetPath: path.resolve(
            root,
            (typeof options.tailwind === "object" &&
              options.tailwind.presetPath) ||
              "./.theme-env/tailwind.preset.ts",
          ),
        }
      : false,
    aliases: options.aliases ?? {},
  };
};

/** 讀取 themes/<theme>/config.jsonc(或 config.json),不存在則回傳 {} */
export const readThemeConfig = (
  themesDir: string,
  theme: string,
): ThemeConfig => {
  for (const file of ["config.jsonc", "config.json"]) {
    const p = path.join(themesDir, theme, file);
    if (existsSync(p)) {
      return json5.parse(readFileSync(p, "utf8"));
    }
  }
  return {};
};

/** 統一使用 posix 分隔符,修掉 Windows 上 watcher 回傳 `\` 造成 replace 失效的問題 */
export const normalizePath = (p: string) => p.replaceAll("\\", "/");
