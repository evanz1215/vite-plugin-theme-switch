import { defineConfig } from "vitest/config";

// 沒有這個檔案時 vitest 會往上層找到 frontend-dev 的 vite.config.ts
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
