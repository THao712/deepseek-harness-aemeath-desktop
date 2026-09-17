import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
import { evaluate } from "@deepseek-ai/cordis-plugin-loader";
import yaml from "js-yaml";

const require = createRequire(import.meta.url);
const manifestPath = require.resolve("@deepseek-ai/dsh-agent-presets/package.json");
const presetPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(
      path.dirname(manifestPath),
      "presets",
      "minimal",
      "agent.cordis.yml",
    );
const presetMetadataPath = path.join(path.dirname(presetPath), "preset.yml");
const entries = yaml.load(readFileSync(presetPath, "utf8"), {
  schema: entryListSchema,
});
const metadata = readFileSync(presetMetadataPath, "utf8");

assert(Array.isArray(entries), "Minimal preset must parse to an entry array.");

function findEntry(candidates, id) {
  for (const candidate of candidates) {
    if (candidate?.id === id) return candidate;
    if (Array.isArray(candidate?.config)) {
      const nested = findEntry(candidate.config, id);
      if (nested) return nested;
    }
  }
}

function row(id) {
  const entry = findEntry(entries, id);
  assert(entry, `Minimal preset must contain ${id}.`);
  return entry;
}

function disabledOn(entry, platform) {
  const value = entry.disabled;
  if (value && typeof value === "object" && "__jsExpr" in value) {
    return Boolean(evaluate({ process: { platform } }, value.__jsExpr));
  }
  return value === true;
}

const persistentShell = row("persistent-shell");

const upstreamPwsh = findEntry(entries, "persistent-pwsh");
if (upstreamPwsh) {
  row("persona");
  const bash = row("persistent-bash");
  const terminalBash = row("terminal-bash");
  const terminalPwsh = row("terminal-pwsh");

  assert.equal(disabledOn(bash, "win32"), true);
  assert.equal(disabledOn(bash, "linux"), false);
  assert.equal(disabledOn(terminalBash, "win32"), true);
  assert.equal(disabledOn(terminalBash, "linux"), false);
  assert.equal(disabledOn(upstreamPwsh, "win32"), false);
  assert.equal(disabledOn(upstreamPwsh, "linux"), true);
  assert.equal(disabledOn(terminalPwsh, "win32"), false);
  assert.equal(disabledOn(terminalPwsh, "linux"), true);
  assert.equal(
    terminalPwsh.config?.shellDialect,
    "pwsh",
    "Upstream Windows terminal must use the pwsh dialect.",
  );
  assert.equal(findEntry(entries, "tool-pwsh"), undefined);
} else {
  row("str-replace-editor");
  const legacyPwsh = row("tool-pwsh");
  assert.equal(disabledOn(persistentShell, "win32"), true);
  assert.equal(disabledOn(persistentShell, "linux"), false);
  assert.equal(disabledOn(legacyPwsh, "win32"), false);
  assert.equal(disabledOn(legacyPwsh, "linux"), true);
  assert.equal(findEntry(entries, "tool-bash"), undefined);
}
assert(
  metadata.includes("description: 提供系统 Shell（Windows 为 PowerShell，Linux/macOS 为持久 bash）与 str_replace_editor 的双工具编码 Agent。") ||
    metadata.includes("description: 仅提供持久 shell 的单工具编码 Agent。"),
  "Minimal preset description must match its platform-specific shell behavior.",
);

console.log(
  JSON.stringify(
    {
      presetPath,
      implementation: upstreamPwsh ? "upstream-persistent-pwsh" : "legacy-one-shot-pwsh",
      win32: {
        persistentShell: upstreamPwsh ? "enabled" : "disabled",
        shellTool: upstreamPwsh ? "persistent-pwsh" : "pwsh",
      },
      posix: { persistentShell: "enabled", shellTool: "persistent-bash" },
    },
    null,
    2,
  ),
);
