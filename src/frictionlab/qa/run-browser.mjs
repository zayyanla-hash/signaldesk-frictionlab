// Local runner: inject explicit paths because Ego executes in its own runtime.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
const root = fileURLToPath(new URL("../../..", import.meta.url));
const config = {
  root,
  base: process.env.FRICTIONLAB_BASE || "http://127.0.0.1:5193",
  out:
    process.env.FRICTIONLAB_QA_OUT || path.join(root, ".local/frictionlab-qa"),
  space: process.env.FRICTIONLAB_SPACE
    ? Number(process.env.FRICTIONLAB_SPACE)
    : null,
};
const body = await readFile(
  new URL("./browser-checks.mjs", import.meta.url),
  "utf8",
);
const child = spawn("ego-browser", ["nodejs"], {
  stdio: ["pipe", "inherit", "inherit"],
});
child.stdin.end(
  `globalThis.FRICTIONLAB_QA_CONFIG=${JSON.stringify(config)};\n${body}`,
);
child.on("error", (error) => {
  process.stderr.write(`Browser QA could not start: ${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
