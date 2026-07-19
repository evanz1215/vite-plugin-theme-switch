import path from "path";
import { existsSync, readFileSync } from "fs";
import json5 from "json5";
import type { ResolvedBrandOptions, BrandConfig, BrandOptions } from "./types";

export const DEFAULT_IGNORE = [".DS_Store", "public/"];

export const resolveOptions = (
  options: BrandOptions,
  env: Record<string, string>,
  root = process.cwd(),
): ResolvedBrandOptions => {
  const envKey = options.envKey ?? "VITE_BRAND";

  return {
    brandsDir: path.resolve(root, options.brandsDir ?? "./brands"),
    runtimeDir: path.resolve(root, options.runtimeDir ?? "./.runtime/brand"),
    brand: env[envKey] ?? options.defaultBrand ?? "default",
    ignore: options.ignore ?? DEFAULT_IGNORE,
    tailwind: options.tailwind
      ? {
          presetPath: path.resolve(
            root,
            (typeof options.tailwind === "object" &&
              options.tailwind.presetPath) ||
              "./.brand-env/tailwind.preset.ts",
          ),
        }
      : false,
    aliases: options.aliases ?? {},
  };
};

/** 讀取 brands/<brand>/config.jsonc(或 config.json),不存在則回傳 {} */
export const readBrandConfig = (
  brandsDir: string,
  brand: string,
): BrandConfig => {
  for (const file of ["config.jsonc", "config.json"]) {
    const p = path.join(brandsDir, brand, file);
    if (existsSync(p)) {
      return json5.parse(readFileSync(p, "utf8"));
    }
  }
  return {};
};

/** 統一使用 posix 分隔符,修掉 Windows 上 watcher 回傳 `\` 造成 replace 失效的問題 */
export const normalizePath = (p: string) => p.replaceAll("\\", "/");
