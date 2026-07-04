#!/usr/bin/env node
/** bin 入口:解析與分派在 run.ts(可測試),這裡只負責錯誤輸出與 exit code */
import { styleText } from "node:util";
import { run } from "./run";

run(process.argv.slice(2)).catch((err: unknown) => {
  console.error(
    styleText("red", err instanceof Error ? err.message : String(err)),
  );
  process.exit(1);
});
