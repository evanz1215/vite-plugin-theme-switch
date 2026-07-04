/**
 * CLI 解析與指令分派(可測試:錯誤用 throw,互動用 io 注入)。
 * switch / create / isolate / build,全用 node:util parseArgs + readline,零依賴。
 */
import path from "path";
import { existsSync, readFileSync } from "fs";
import { parseArgs, parseEnv, styleText } from "node:util";
import readline from "node:readline";
import {
  createTheme,
  isolateTheme,
  listThemes,
  switchTheme,
  type CliContext,
} from "./actions";
import { buildThemes } from "./build";

export interface RunIO {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

const HELP = `vite-theme <command>

指令:
  switch [theme]              切換主題(改寫 env 檔的主題變數)
  create [theme]              建立新主題(--from/-f 來源;--isolate/-i 完整複製不繼承)
  isolate [theme]             將繼承主題獨立成完整主題
  build <themes..>            依序打包多個主題,各自輸出到 <out-dir>/<theme>/

選項:
  --dir       themes 目錄(預設 ./themes)
  --env-file  主題環境變數檔(預設 .env.development)
  --env-key   主題環境變數名(預設 VITE_THEME)
  --out-dir, -o  build 輸出根目錄(預設 dist)
  --config, -c   build 用的 vite config 路徑(預設自動尋找)
  --help, -h     顯示說明
`;

const green = (s: string) => styleText("green", s);
const yellow = (s: string) => styleText("yellow", s);

export const run = async (argv: string[], io: RunIO = {}) => {
  const output = io.output ?? process.stdout;

  // 整個 run 共用一個 readline,行輸入自行排隊:
  // rl.question 會丟掉「沒有人在等」的行,pipe 進來的多行輸入會遺失
  let rl: readline.Interface | undefined;
  const lines: string[] = [];
  const waiters: Array<(line: string) => void> = [];
  const question = (q: string) => {
    rl ??= readline
      .createInterface({ input: io.input ?? process.stdin, output })
      .on("line", (line) => {
        const waiter = waiters.shift();
        if (waiter) waiter(line);
        else lines.push(line);
      });
    output.write(q);
    const buffered = lines.shift();
    return buffered !== undefined
      ? Promise.resolve(buffered)
      : new Promise<string>((r) => waiters.push(r));
  };

  /** 數字選單(inquirer list 的原生替代);disabled 項照列但不可選 */
  const pick = async (
    message: string,
    choices: { name: string; hint?: string; disabled?: boolean }[],
  ): Promise<string> => {
    output.write(`\n${message}\n`);
    choices.forEach((c, i) =>
      output.write(`  ${i + 1}) ${c.name}${c.hint ? ` ${c.hint}` : ""}\n`),
    );
    for (;;) {
      const answer = await question("請輸入編號: ");
      const choice = choices[Number(answer) - 1];
      if (choice && !choice.disabled) return choice.name;
      output.write(
        choice ? "該選項不可選,請重新輸入\n" : "無效的選項,請重新輸入\n",
      );
    }
  };

  /** 文字輸入 + 驗證 */
  const ask = async (
    message: string,
    validate: (input: string) => true | string,
  ): Promise<string> => {
    for (;;) {
      const answer = await question(`${message}: `);
      const result = validate(answer);
      if (result === true) return answer;
      output.write(`${result}\n`);
    }
  };
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: "string", default: "./themes" },
      "env-file": { type: "string", default: ".env.development" },
      "env-key": { type: "string", default: "VITE_THEME" },
      from: { type: "string", short: "f" },
      isolate: { type: "boolean", short: "i", default: false },
      "out-dir": { type: "string", short: "o", default: "dist" },
      config: { type: "string", short: "c" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const [command, ...args] = positionals;
  if (values.help || !command) {
    output.write(HELP);
    return;
  }

  const ctx: CliContext = {
    themesDir: path.resolve(process.cwd(), values.dir),
    envFile: path.resolve(process.cwd(), values["env-file"]),
    envKey: values["env-key"],
  };

  const requireThemes = async () => {
    const themes = await listThemes(ctx.themesDir);
    if (themes.length === 0) {
      throw new Error(`找不到任何主題(${ctx.themesDir})`);
    }
    return themes;
  };

  try {
    switch (command) {
    case "switch": {
      const themes = await requireThemes();
      const current = existsSync(ctx.envFile)
        ? parseEnv(readFileSync(ctx.envFile, "utf8"))[ctx.envKey]
        : undefined;

      const theme =
        args[0] ??
        (await pick(
          "請選擇要切換的主題",
          themes.map((t) => ({
            name: t.name,
            hint: t.name === current ? "(當前主題)" : "",
            disabled: t.name === current,
          })),
        ));

      if (!themes.some((t) => t.name === theme)) {
        throw new Error(`主題不存在:${theme}`);
      }
      switchTheme(ctx, theme);
      output.write(`\n${green("✔")} 已切換主題:${theme}\n`);
      break;
    }

    case "create": {
      const name =
        args[0] ??
        (await ask(
          "請輸入主題名稱",
          (input) =>
            /^[a-z0-9][a-z0-9-]{2,}$/.test(input) ||
            "至少 3 個字元,僅限小寫英數與 -",
        ));

      const themes = await requireThemes();
      const from =
        values.from ??
        (await pick(
          "請選擇來源主題",
          themes.map((t) => ({
            name: t.name,
            hint: t.config.extends ? `(繼承自 ${t.config.extends})` : "",
          })),
        ));

      await createTheme(ctx, name, from, values.isolate);
      output.write(`\n${green("✔")} 主題 ${name} 已建立(來源:${from})\n`);
      if (existsSync(path.join(ctx.themesDir, from, "public"))) {
        output.write(
          `${yellow("!")} 來源主題有 public 目錄,public 不會被複製/繼承,請自行處理\n`,
        );
      }
      break;
    }

    case "isolate": {
      const themes = await requireThemes();
      const candidates = themes.filter((t) => t.config.extends);
      if (args[0] === undefined && candidates.length === 0) {
        throw new Error("沒有可獨立的主題(皆無 extends 設定)");
      }

      const theme =
        args[0] ??
        (await pick(
          "請選擇要獨立的主題",
          candidates.map((t) => ({
            name: t.name,
            hint: `(繼承自 ${t.config.extends})`,
          })),
        ));

      await isolateTheme(ctx, theme);
      output.write(`\n${green("✔")} 主題 ${theme} 已獨立\n`);
      break;
    }

    case "build": {
      const themes = args.flatMap((t) => t.split(","));
      if (themes.length === 0) {
        throw new Error("build 需要至少一個主題");
      }
      await buildThemes({
        themesDir: ctx.themesDir,
        themes,
        outDir: values["out-dir"],
        configFile: values.config,
      });
      break;
    }

    default:
      throw new Error(`未知指令:${command}\n\n${HELP}`);
    }
  } finally {
    rl?.close();
  }
};
