import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createShadow } from "../src/plugins/shadow";
import { resolveOptions } from "../src/options";

const setup = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vpt-"));
  const write = async (rel: string, content: string) => {
    const p = path.join(root, rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content);
  };

  await write("brands/base/components/Logo.vue", "base-logo");
  await write("brands/base/views/Home.vue", "base-home");
  await write("brands/base/public/favicon.ico", "icon");
  await write("brands/client/components/Logo.vue", "client-logo");

  const ctx = resolveOptions({}, { VITE_BRAND: "client" }, root);
  return { root, ctx };
};

describe("createShadow", () => {
  it("客戶檔案覆蓋 extends,缺檔由 extends 補上,public 不進 shadow", async () => {
    const { root, ctx } = await setup();

    await createShadow(ctx, { extends: "base" });

    const read = (rel: string) =>
      fs.readFile(path.join(ctx.runtimeDir, rel), "utf8");

    expect(await read("components/Logo.vue")).toBe("client-logo"); // 覆蓋
    expect(await read("views/Home.vue")).toBe("base-home"); // 繼承補鏈
    await expect(read("public/favicon.ico")).rejects.toThrow(); // ignore

    // hard link:同 inode,改來源內容 runtime 立即同步
    await fs.writeFile(
      path.join(root, "brands/client/components/Logo.vue"),
      "client-logo-v2",
    );
    expect(await read("components/Logo.vue")).toBe("client-logo-v2");

    await fs.rm(root, { recursive: true, force: true });
  });

  it("無 extends 時只鋪當前品牌", async () => {
    const { root, ctx } = await setup();

    await createShadow(ctx, {});

    const files = await fs.readdir(ctx.runtimeDir, { recursive: true });
    expect(files.map(String).map((f) => f.replaceAll("\\", "/"))).toEqual([
      "components",
      "components/Logo.vue",
    ]);

    await fs.rm(root, { recursive: true, force: true });
  });
});
