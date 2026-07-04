import { describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import { existsSync } from "fs";
import { EventEmitter } from "events";
import os from "os";
import path from "path";
import {
  createShadow,
  createShadowHandler,
  shadowPlugin,
} from "../src/plugins/shadow";
import { resolveOptions } from "../src/options";

const setup = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vpt-watch-"));
  const write = async (rel: string, content: string) => {
    const p = path.join(root, rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content);
  };

  await write("themes/base/views/Home.vue", "base-home");
  await write(
    "themes/client/config.jsonc",
    `{ "title": "Client", "extends": "base" }`,
  );

  const ctx = resolveOptions({}, { VITE_THEME: "client" }, root);
  const themeConfig = { extends: "base" };
  await createShadow(ctx, themeConfig);

  return {
    root,
    ctx,
    write,
    handler: createShadowHandler(ctx, themeConfig),
    at: (rel: string) => path.join(root, rel),
    readRuntime: (rel: string) =>
      fs.readFile(path.join(ctx.runtimeDir, rel), "utf8"),
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
};

describe("createShadowHandler", () => {
  it("theme 新增覆蓋檔 → 補鏈;刪除 → 回退連 extends 版本", async () => {
    const { write, handler, at, readRuntime, cleanup } = await setup();

    expect(await readRuntime("views/Home.vue")).toBe("base-home");

    // 客戶新增覆蓋檔 → runtime 改連客戶版本
    await write("themes/client/views/Home.vue", "client-home");
    await handler("add", at("themes/client/views/Home.vue"));
    expect(await readRuntime("views/Home.vue")).toBe("client-home");

    // 客戶刪除覆蓋檔 → 回退連 extends 版本
    await fs.unlink(at("themes/client/views/Home.vue"));
    await handler("unlink", at("themes/client/views/Home.vue"));
    expect(await readRuntime("views/Home.vue")).toBe("base-home");

    await cleanup();
  });

  it("extends 新增/刪除:僅當 theme 沒有同名檔時才影響 runtime", async () => {
    const { ctx, write, handler, at, readRuntime, cleanup } = await setup();

    // extends 新增檔案(客戶沒有)→ 補鏈
    await write("themes/base/views/About.vue", "base-about");
    await handler("add", at("themes/base/views/About.vue"));
    expect(await readRuntime("views/About.vue")).toBe("base-about");

    // extends 刪除檔案(客戶沒有)→ 斷鏈
    await fs.unlink(at("themes/base/views/About.vue"));
    await handler("unlink", at("themes/base/views/About.vue"));
    expect(existsSync(path.join(ctx.runtimeDir, "views/About.vue"))).toBe(
      false,
    );

    // 客戶有同名檔 → extends 的變動不影響 runtime
    await write("themes/client/views/Home.vue", "client-home");
    await handler("add", at("themes/client/views/Home.vue"));
    await write("themes/base/views/Home.vue", "base-home-v2");
    await handler("add", at("themes/base/views/Home.vue"));
    expect(await readRuntime("views/Home.vue")).toBe("client-home");
    await handler("unlink", at("themes/base/views/Home.vue"));
    expect(await readRuntime("views/Home.vue")).toBe("client-home");

    await cleanup();
  });

  it("change 事件、ignore 清單、無關路徑一律 no-op", async () => {
    const { ctx, write, handler, at, readRuntime, cleanup } = await setup();

    // change:hard link 同 inode 天然同步,handler 不動作
    await handler("change", at("themes/client/views/Home.vue"));
    expect(await readRuntime("views/Home.vue")).toBe("base-home");

    // ignore 清單(.DS_Store、public/)
    await write("themes/client/.DS_Store", "junk");
    await handler("add", at("themes/client/.DS_Store"));
    await write("themes/client/public/favicon.ico", "icon");
    await handler("add", at("themes/client/public/favicon.ico"));
    expect(existsSync(path.join(ctx.runtimeDir, ".DS_Store"))).toBe(false);
    expect(
      existsSync(path.join(ctx.runtimeDir, "public/favicon.ico")),
    ).toBe(false);

    // themes 之外的路徑(server.watcher 會看到整個專案)
    await write("src/App.vue", "app");
    await handler("add", at("src/App.vue"));
    expect(existsSync(path.join(ctx.runtimeDir, "../src/App.vue"))).toBe(
      false,
    );
    const runtimeFiles = await fs.readdir(ctx.runtimeDir, { recursive: true });
    expect(runtimeFiles.map(String).map((f) => f.replaceAll("\\", "/")))
      .toEqual(["config.jsonc", "views", "views/Home.vue"]);

    await cleanup();
  });
});

describe("shadowPlugin", () => {
  it("configResolved 建 shadow 並通知 ready;configureServer 掛上 watcher 維護連結", async () => {
    const { root, ctx, write, at, readRuntime, cleanup } = await setup();

    const onReady = vi.fn();
    const plugin = shadowPlugin(ctx, onReady);

    // config:publicDir 指向當前主題的 public
    const conf = (plugin.config as Function)();
    expect(conf.publicDir).toBe(path.join(ctx.themesDir, "client", "public"));

    await fs.rm(ctx.runtimeDir, { recursive: true, force: true });
    await (plugin.configResolved as Function)({ mode: "development" });
    expect(onReady).toHaveBeenCalledOnce();
    expect(await readRuntime("views/Home.vue")).toBe("base-home");

    // transformIndexHtml:title 佔位符取代(config.jsonc 的 title)
    expect(
      (plugin.transformIndexHtml as Function)("<title>=VITE_TITLE=</title>"),
    ).toBe("<title>Client</title>");

    // configureServer:以假 watcher 模擬 Vite server.watcher 事件
    const watcher = Object.assign(new EventEmitter(), { add: vi.fn() });
    (plugin.configureServer as Function)({ watcher });
    expect(watcher.add).toHaveBeenCalledWith(ctx.themesDir);

    await write("themes/client/views/Home.vue", "client-home");
    watcher.emit("all", "add", at("themes/client/views/Home.vue"));
    await vi.waitFor(async () =>
      expect(await readRuntime("views/Home.vue")).toBe("client-home"),
    );

    await cleanup();
    void root;
  });

  it("handleHotUpdate:runtime 的 .vue 回傳 modules,themes 的 .vue 回傳 []", async () => {
    const { ctx, cleanup } = await setup();
    const plugin = shadowPlugin(ctx, () => {});
    const hot = plugin.handleHotUpdate as Function;
    const modules = [{ id: "x" }];

    const runtimeVue =
      ctx.runtimeDir.replaceAll("\\", "/") + "/components/Logo.vue";
    const themesVue =
      ctx.themesDir.replaceAll("\\", "/") + "/client/components/Logo.vue";

    expect(hot({ file: runtimeVue, modules })).toBe(modules);
    expect(hot({ file: themesVue, modules })).toEqual([]);
    expect(hot({ file: "/other/src/App.vue", modules })).toBeUndefined();

    await cleanup();
  });
});
