import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { normalizePath, readThemeConfig, resolveOptions } from "../src/options";

describe("resolveOptions", () => {
  const root = "/proj";

  it("預設值:路徑解析為絕對、theme 讀 VITE_THEME、tailwind 關閉", () => {
    const ctx = resolveOptions({}, { VITE_THEME: "client" }, root);

    expect(ctx.themesDir).toBe(path.resolve(root, "./themes"));
    expect(ctx.runtimeDir).toBe(path.resolve(root, "./.runtime/theme"));
    expect(ctx.theme).toBe("client");
    expect(ctx.ignore).toEqual([".DS_Store", "public/"]);
    expect(ctx.tailwind).toBe(false);
    expect(ctx.aliases).toEqual({});
  });

  it("自訂 envKey 與 defaultTheme fallback", () => {
    expect(
      resolveOptions({ envKey: "MY_THEME" }, { MY_THEME: "a" }, root).theme,
    ).toBe("a");
    expect(resolveOptions({ defaultTheme: "base" }, {}, root).theme).toBe(
      "base",
    );
    expect(resolveOptions({}, {}, root).theme).toBe("default");
  });

  it("tailwind:true 與空物件用預設 presetPath,presetPath 可自訂", () => {
    const preset = (tailwind: boolean | { presetPath?: string }) => {
      const tw = resolveOptions({ tailwind }, {}, root).tailwind;
      return tw ? tw.presetPath : tw;
    };

    const defaultPath = path.resolve(root, "./.theme-env/tailwind.preset.ts");
    expect(preset(true)).toBe(defaultPath);
    expect(preset({})).toBe(defaultPath);
    expect(preset({ presetPath: "./tw/preset.ts" })).toBe(
      path.resolve(root, "./tw/preset.ts"),
    );
    expect(preset(false)).toBe(false);
  });

  it("自訂 themesDir / runtimeDir / ignore / aliases", () => {
    const ctx = resolveOptions(
      {
        themesDir: "./skins",
        runtimeDir: "./.tmp/t",
        ignore: ["x/"],
        aliases: { "@stores": "./src/stores" },
      },
      {},
      root,
    );

    expect(ctx.themesDir).toBe(path.resolve(root, "./skins"));
    expect(ctx.runtimeDir).toBe(path.resolve(root, "./.tmp/t"));
    expect(ctx.ignore).toEqual(["x/"]);
    expect(ctx.aliases).toEqual({ "@stores": "./src/stores" });
  });
});

describe("readThemeConfig", () => {
  it("讀 config.jsonc(可含註解),沒有時 fallback 到 config.json,都沒有回傳 {}", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vpt-opt-"));
    const write = async (rel: string, content: string) => {
      const p = path.join(root, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    };

    await write(
      "themes/a/config.jsonc",
      `{\n  // 註解\n  "title": "A",\n  "extends": "base",\n}`,
    );
    await write("themes/a/config.json", `{ "title": "ignored" }`); // jsonc 優先
    await write("themes/b/config.json", `{ "title": "B" }`);
    await fs.mkdir(path.join(root, "themes/c"), { recursive: true });

    const themesDir = path.join(root, "themes");
    expect(readThemeConfig(themesDir, "a")).toEqual({
      title: "A",
      extends: "base",
    });
    expect(readThemeConfig(themesDir, "b")).toEqual({ title: "B" });
    expect(readThemeConfig(themesDir, "c")).toEqual({});
    expect(readThemeConfig(themesDir, "missing")).toEqual({});

    await fs.rm(root, { recursive: true, force: true });
  });
});

describe("normalizePath", () => {
  it("反斜線統一成 posix 分隔符", () => {
    expect(normalizePath("a\\b\\c.vue")).toBe("a/b/c.vue");
    expect(normalizePath("a/b/c.vue")).toBe("a/b/c.vue");
  });
});
