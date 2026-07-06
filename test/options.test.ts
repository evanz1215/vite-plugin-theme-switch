import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { normalizePath, readBrandConfig, resolveOptions } from "../src/options";

describe("resolveOptions", () => {
  const root = "/proj";

  it("預設值:路徑解析為絕對、brand 讀 VITE_BRAND、tailwind 關閉", () => {
    const ctx = resolveOptions({}, { VITE_BRAND: "client" }, root);

    expect(ctx.brandsDir).toBe(path.resolve(root, "./brands"));
    expect(ctx.runtimeDir).toBe(path.resolve(root, "./.runtime/brand"));
    expect(ctx.brand).toBe("client");
    expect(ctx.ignore).toEqual([".DS_Store", "public/"]);
    expect(ctx.tailwind).toBe(false);
    expect(ctx.aliases).toEqual({});
  });

  it("自訂 envKey 與 defaultBrand fallback", () => {
    expect(
      resolveOptions({ envKey: "MY_BRAND" }, { MY_BRAND: "a" }, root).brand,
    ).toBe("a");
    expect(resolveOptions({ defaultBrand: "base" }, {}, root).brand).toBe(
      "base",
    );
    expect(resolveOptions({}, {}, root).brand).toBe("default");
  });

  it("tailwind:true 與空物件用預設 presetPath,presetPath 可自訂", () => {
    const preset = (tailwind: boolean | { presetPath?: string }) => {
      const tw = resolveOptions({ tailwind }, {}, root).tailwind;
      return tw ? tw.presetPath : tw;
    };

    const defaultPath = path.resolve(root, "./.brand-env/tailwind.preset.ts");
    expect(preset(true)).toBe(defaultPath);
    expect(preset({})).toBe(defaultPath);
    expect(preset({ presetPath: "./tw/preset.ts" })).toBe(
      path.resolve(root, "./tw/preset.ts"),
    );
    expect(preset(false)).toBe(false);
  });

  it("自訂 brandsDir / runtimeDir / ignore / aliases", () => {
    const ctx = resolveOptions(
      {
        brandsDir: "./skins",
        runtimeDir: "./.tmp/t",
        ignore: ["x/"],
        aliases: { "@stores": "./src/stores" },
      },
      {},
      root,
    );

    expect(ctx.brandsDir).toBe(path.resolve(root, "./skins"));
    expect(ctx.runtimeDir).toBe(path.resolve(root, "./.tmp/t"));
    expect(ctx.ignore).toEqual(["x/"]);
    expect(ctx.aliases).toEqual({ "@stores": "./src/stores" });
  });
});

describe("readBrandConfig", () => {
  it("讀 config.jsonc(可含註解),沒有時 fallback 到 config.json,都沒有回傳 {}", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vpt-opt-"));
    const write = async (rel: string, content: string) => {
      const p = path.join(root, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    };

    await write(
      "brands/a/config.jsonc",
      `{\n  // 註解\n  "title": "A",\n  "extends": "base",\n}`,
    );
    await write("brands/a/config.json", `{ "title": "ignored" }`); // jsonc 優先
    await write("brands/b/config.json", `{ "title": "B" }`);
    await fs.mkdir(path.join(root, "brands/c"), { recursive: true });

    const brandsDir = path.join(root, "brands");
    expect(readBrandConfig(brandsDir, "a")).toEqual({
      title: "A",
      extends: "base",
    });
    expect(readBrandConfig(brandsDir, "b")).toEqual({ title: "B" });
    expect(readBrandConfig(brandsDir, "c")).toEqual({});
    expect(readBrandConfig(brandsDir, "missing")).toEqual({});

    await fs.rm(root, { recursive: true, force: true });
  });
});

describe("normalizePath", () => {
  it("反斜線統一成 posix 分隔符", () => {
    expect(normalizePath("a\\b\\c.vue")).toBe("a/b/c.vue");
    expect(normalizePath("a/b/c.vue")).toBe("a/b/c.vue");
  });
});
