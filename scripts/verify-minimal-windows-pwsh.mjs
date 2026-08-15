import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
import { evaluate } from "@deepseek-ai/cordis-plugin-loader";
import yaml from "js-yaml";

const require = createRequire(import.meta.url);
const manifestPath = require.resolve("@deepseek-ai/dsh/package.json");
const presetPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(
      path.dirname(manifestPath),
      "config",
      "agent-presets",
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
const pwsh = row("tool-pwsh");
row("str-replace-editor");

assert.equal(disabledOn(persistentShell, "win32"), true);
assert.equal(disabledOn(persistentShell, "linux"), false);
assert.equal(disabledOn(pwsh, "win32"), false);
assert.equal(disabledOn(pwsh, "linux"), true);
assert.equal(findEntry(entries, "tool-bash"), undefined);
assert(
  metadata.includes(
    "description: 提供系统 Shell（Windows 为 PowerShell，Linux/macOS 为持久 bash）与 str_replace_editor 的双工具编码 Agent。",
  ),
  "Minimal preset description must match its platform-specific shell behavior.",
);

console.log(
  JSON.stringify(
    {
      presetPath,
      win32: { persistentShell: "disabled", shellTool: "pwsh" },
      posix: { persistentShell: "enabled", shellTool: "persistent-bash" },
    },
    null,
    2,
  ),
);
