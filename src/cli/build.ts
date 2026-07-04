/**
 * 多主題批次打包。
 * 移植自 .xgi/core/cli/themeBuilder.ts:每個主題設 VITE_THEME 後呼叫 Vite build API,
 * 輸出到 <outDir>/<theme>/。必須依序執行(shadow 的 .runtime/theme 是全域單例)。
 */
import path from "path";
import { existsSync } from "fs";

export const buildThemes = async (opts: {
  themesDir: string;
  themes: string[];
  outDir: string;
  configFile?: string;
}) => {
  // 動態載入:switch/create/isolate 不需要 vite
  const { build } = await import("vite");

  for (const theme of opts.themes) {
    if (!existsSync(path.join(opts.themesDir, theme))) {
      throw new Error(`主題不存在:${theme}`);
    }
  }

  for (const theme of opts.themes) {
    console.log(`\n[vite-plugin-theme-switch] ======== build: ${theme} ========\n`);
    // defineThemeConfig 的 loadEnv 會讀 process.env,優先於 .env 檔
    process.env.VITE_THEME = theme;

    await build({
      configFile: opts.configFile
        ? path.resolve(process.cwd(), opts.configFile)
        : undefined,
      build: {
        outDir: path.resolve(process.cwd(), opts.outDir, theme),
        emptyOutDir: true,
      },
    });
  }

  console.log(
    `\n[vite-plugin-theme-switch] ✔ ${opts.themes.length} 個主題已打包到 ${opts.outDir}/<theme>/\n`,
  );
};
