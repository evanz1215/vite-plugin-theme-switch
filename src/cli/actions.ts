/**
 * CLI 核心邏輯(無互動,可單元測試)。
 * 移植自 .xgi/core/cli/theme/{switch,create,isolate}。
 */
import fs from "fs/promises";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { parseEnv } from "node:util";
import { normalizePath, readThemeConfig } from "../options";
import type { ThemeConfig } from "../types";

export interface CliContext {
  /** themes 目錄(絕對路徑) */
  themesDir: string;
  envFile: string;
  envKey: string;
}

const IGNORE = [".DS_Store", "public/"];

export const listThemes = async (themesDir: string) => {
  if (!existsSync(themesDir)) return [];
  const entries = await fs.readdir(themesDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => ({
      name: e.name,
      config: readThemeConfig(themesDir, e.name),
    }));
};

const writeThemeConfig = (
  themesDir: string,
  theme: string,
  config: ThemeConfig,
) => {
  // 注意:原檔若有註解會遺失(與原版行為一致)
  writeFileSync(
    path.join(themesDir, theme, "config.jsonc"),
    JSON.stringify(config, null, 2) + "\n",
  );
};

/** 複製 srcDir 下的檔案到 destDir;overwrite=false 時已存在的檔案跳過 */
const copyThemeFiles = (srcDir: string, destDir: string, overwrite: boolean) =>
  fs.cp(srcDir, destDir, {
    recursive: true,
    force: overwrite,
    errorOnExist: false,
    // 補尾斜線讓 "public/" 能整棵過濾掉目錄本身(不留空目錄)
    filter: (src) => {
      const p = normalizePath(src) + "/";
      return !IGNORE.some((item) => p.includes(item));
    },
  });

/** switch:改寫 env 檔的主題變數,保留其他 key */
export const switchTheme = (ctx: CliContext, theme: string) => {
  const parsed = existsSync(ctx.envFile)
    ? parseEnv(readFileSync(ctx.envFile, "utf8"))
    : {};
  parsed[ctx.envKey] = theme;
  writeFileSync(
    ctx.envFile,
    Object.entries(parsed)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );
};

/**
 * create:建立新主題。
 * - 繼承模式(預設):只建 config.jsonc { title, extends: from } 的薄主題,差異檔之後再加
 * - isolate 模式:完整複製 from 主題(含其 extends 一層的補檔),不設 extends
 */
export const createTheme = async (
  ctx: CliContext,
  name: string,
  from: string,
  isolate: boolean,
) => {
  const target = path.join(ctx.themesDir, name);
  if (existsSync(target)) {
    throw new Error(`主題已存在:${name}`);
  }
  if (!existsSync(path.join(ctx.themesDir, from))) {
    throw new Error(`來源主題不存在:${from}`);
  }

  await fs.mkdir(target, { recursive: true });

  if (!isolate) {
    writeThemeConfig(ctx.themesDir, name, { title: name, extends: from });
    return;
  }

  const fromConfig = readThemeConfig(ctx.themesDir, from);
  await copyThemeFiles(path.join(ctx.themesDir, from), target, true);
  if (fromConfig.extends) {
    await copyThemeFiles(
      path.join(ctx.themesDir, fromConfig.extends),
      target,
      false,
    );
  }

  const config: ThemeConfig = { ...fromConfig, title: name };
  delete config.extends;
  writeThemeConfig(ctx.themesDir, name, config);
};

/** isolate:把 extends 中未被覆蓋的檔案實體複製進主題,並移除 extends 設定 */
export const isolateTheme = async (ctx: CliContext, theme: string) => {
  const config = readThemeConfig(ctx.themesDir, theme);
  if (!config.extends) {
    throw new Error(`主題 ${theme} 沒有 extends 設定,毋須獨立`);
  }

  await copyThemeFiles(
    path.join(ctx.themesDir, config.extends),
    path.join(ctx.themesDir, theme),
    false,
  );

  delete config.extends;
  writeThemeConfig(ctx.themesDir, theme, config);
};
