import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { Plugin } from "vite";
import type { ResolvedThemeOptions, ThemeConfig } from "../types";
import { normalizePath, readThemeConfig } from "../options";

/**
 * Shadow plugin:建立並維護 .runtime/theme 硬連結合成目錄。
 * 移植自 .xgi/core/vite/plugins/xgi-plugin-shadow;
 * dev 監聽改用 Vite 自帶的 server.watcher(生命週期由 Vite 管理),不另起 chokidar。
 */

const ignored = (ctx: ResolvedThemeOptions, target: string) => {
  const p = normalizePath(target);
  return ctx.ignore.some((item) => p.includes(item));
};

/** hard link,跨分割區時 fallback 為 copy */
const linkFile = async (src: string, dest: string) => {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (existsSync(dest)) {
    await fs.unlink(dest);
  }
  try {
    await fs.link(src, dest);
  } catch (err: any) {
    if (err?.code === "EXDEV") {
      // ponytail: 跨 volume 無法 hard link,copy fallback(此模式下內容修改不會自動同步)
      console.warn(
        `[vite-plugin-theme-switch] hard link failed (cross-device), copied instead: ${dest}`,
      );
      await fs.copyFile(src, dest);
    } else {
      throw err;
    }
  }
};

/**
 * 重建 shadow 目錄:
 * 1. 清空 runtimeDir 後重建
 * 2. 連結當前主題所有檔案
 * 3. 若 config.extends 存在,補連結「當前主題沒有覆蓋」的繼承主題檔案
 */
export const createShadow = async (
  ctx: ResolvedThemeOptions,
  themeConfig: ThemeConfig,
) => {
  await fs.rm(ctx.runtimeDir, { recursive: true, force: true });
  await fs.mkdir(ctx.runtimeDir, { recursive: true });

  const linkTheme = async (theme: string) => {
    const dir = path.join(ctx.themesDir, theme);
    if (!existsSync(dir)) return;

    const files = await fs.readdir(dir, {
      recursive: true,
      withFileTypes: true,
    });

    for (const f of files) {
      if (!f.isFile()) continue;
      const src = path.join(f.parentPath, f.name);
      if (ignored(ctx, src)) continue;
      await linkFile(
        src,
        path.join(ctx.runtimeDir, path.relative(dir, src)),
      );
    }
  };

  // 先鋪繼承主題,再讓當前主題覆蓋 —— 順序即優先級
  if (themeConfig.extends) {
    await linkTheme(themeConfig.extends);
  }
  await linkTheme(ctx.theme);
};

/**
 * dev 模式:處理 themes/<theme> 與 themes/<extends> 的檔案新增/刪除,維護 runtime 連結。
 * 內容變更(change)因 hard link 同 inode 天然生效,毋須處理。
 * 回傳的 handler 掛在 Vite server.watcher 的 "all" 事件上,非相關路徑一律 no-op。
 *
 * 事件對應:
 * - theme add      → 直接 link(蓋掉原本連到 extends 的檔)
 * - theme unlink   → 移除 runtime 檔;若 extends 有同名檔則回退連 extends 版本
 * - extends add    → 僅當 theme 沒有同名檔時才 link
 * - extends unlink → 僅當 theme 沒有同名檔時才移除 runtime 檔
 */
export const createShadowHandler = (
  ctx: ResolvedThemeOptions,
  themeConfig: ThemeConfig,
) => {
  const themeDir = path.join(ctx.themesDir, ctx.theme);
  const extendsDir = themeConfig.extends
    ? path.join(ctx.themesDir, themeConfig.extends)
    : null;

  /** file 在 dir 之下時回傳相對路徑,否則 null */
  const relIn = (dir: string, file: string) => {
    const rel = path.relative(dir, file);
    return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : null;
  };

  return async (evt: string, file: string) => {
    if (evt !== "add" && evt !== "unlink") return;
    if (ignored(ctx, file)) return;

    const themeRel = relIn(themeDir, file);
    if (themeRel) {
      const runtimeFile = path.join(ctx.runtimeDir, themeRel);
      if (evt === "add") {
        await linkFile(file, runtimeFile);
      } else {
        if (existsSync(runtimeFile)) await fs.unlink(runtimeFile);
        const extendsFile = extendsDir && path.join(extendsDir, themeRel);
        if (extendsFile && existsSync(extendsFile)) {
          await linkFile(extendsFile, runtimeFile);
        }
      }
      return;
    }

    const extRel = extendsDir && relIn(extendsDir, file);
    if (!extRel) return;
    // 當前主題有同名檔 → runtime 連的是 theme 版本,extends 的變動不影響
    if (existsSync(path.join(themeDir, extRel))) return;

    const runtimeFile = path.join(ctx.runtimeDir, extRel);
    if (evt === "add") {
      await linkFile(file, runtimeFile);
    } else if (existsSync(runtimeFile)) {
      await fs.unlink(runtimeFile);
    }
  };
};

export const shadowPlugin = (
  ctx: ResolvedThemeOptions,
  onReady: () => void,
): Plugin => {
  let themeConfig: ThemeConfig = {};

  return {
    name: "vite-plugin-theme-switch:shadow",
    enforce: "pre",

    config() {
      return {
        publicDir: path.join(ctx.themesDir, ctx.theme, "public"),
      };
    },

    async configResolved() {
      themeConfig = readThemeConfig(ctx.themesDir, ctx.theme);
      await createShadow(ctx, themeConfig);
      onReady();
    },

    configureServer(server) {
      server.watcher.add(ctx.themesDir);
      const handler = createShadowHandler(ctx, themeConfig);
      server.watcher.on("all", (evt, file) => {
        handler(evt, file).catch((err) =>
          console.error("[vite-plugin-theme-switch]", err),
        );
      });
    },

    /** 以主題 config.jsonc 的 title 取代 index.html 中的 =VITE_TITLE= 佔位符 */
    transformIndexHtml(html) {
      return themeConfig.title
        ? html.replace("=VITE_TITLE=", themeConfig.title)
        : html;
    },

    /**
     * HMR 規則:
     * - .runtime/theme 下的 .vue → 回傳 modules,只重跑該模組不整頁 reload
     * - themes/ 下的 .vue → 回傳 [],忽略(同一 inode,避免雙重觸發)
     */
    handleHotUpdate({ file, modules }) {
      const fromRuntime = file.includes(
        normalizePath(ctx.runtimeDir).split("/").slice(-2).join("/"),
      );
      const fromThemes = file.includes(path.basename(ctx.themesDir) + "/");
      const isVue = file.endsWith(".vue");

      if (fromRuntime && isVue) return modules;
      if (fromThemes && isVue) return [];
    },
  };
};
