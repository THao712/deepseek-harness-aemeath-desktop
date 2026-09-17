import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

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
const original = readFileSync(presetPath, "utf8");
const originalMetadata = readFileSync(presetMetadataPath, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
const persistentShellGate = "  disabled: !!js process.platform === 'win32'";
const pwshRow = [
  "- id: tool-pwsh",
  "  name: '@deepseek-ai/dsh-tool-pwsh'",
  "  disabled: !!js process.platform !== 'win32'",
].join(eol);
const legacyDescription =
  "description: 仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。";
const legacyDescriptionV2 =
  "description: 仅提供持久 shell 的单工具编码 Agent。";
const platformDescription =
  "description: 提供系统 Shell（Windows 为 PowerShell，Linux/macOS 为持久 bash）与 str_replace_editor 的双工具编码 Agent。";
const officialPlatformShellMarkers = [
  "- id: terminal-pwsh",
  "name: '@deepseek-ai/dsh-tool-pwsh-persistent'",
  "shellDialect: pwsh",
  "disabled: !!js process.platform === 'win32'",
  "disabled: !!js process.platform !== 'win32'",
];
const hasPersistentShellGate = original.includes(persistentShellGate);
const hasPwshRow = original.includes(pwshRow);

// dsh 0.1.1-rc.2 ships the platform-specific persistent PowerShell stack.
// Accept that upstream implementation instead of adding the legacy one-shot row.
const hasOfficialPlatformShell = officialPlatformShellMarkers.every((marker) =>
  original.includes(marker),
);

if (hasOfficialPlatformShell) {
  let patchedMetadata = originalMetadata;
  const upstreamDescription = originalMetadata.includes(legacyDescriptionV2);
  if (!originalMetadata.includes(platformDescription)) {
    if (!originalMetadata.includes(legacyDescription) && !upstreamDescription) {
      throw new Error(`Unsupported DeepSeek minimal metadata: ${presetMetadataPath}`);
    }
    if (!upstreamDescription) patchedMetadata = originalMetadata.replace(legacyDescription, platformDescription);
  }

  if (patchedMetadata === originalMetadata) {
    console.log(
      "DeepSeek minimal Windows PowerShell support is already provided by upstream.",
    );
  } else {
    writeFileSync(presetMetadataPath, patchedMetadata, "utf8");
    console.log(
      `Updated minimal mode metadata for upstream Windows PowerShell support: ${presetMetadataPath}`,
    );
  }
  process.exit(0);
}

if (hasPersistentShellGate !== hasPwshRow) {
  throw new Error(`Incomplete minimal Windows patch: ${presetPath}`);
}

let patched = original;
if (!hasPersistentShellGate) {
  const persistentShellPattern = /(- id: persistent-shell\r?\n  name: cordis:group\r?\n  group: true\r?\n)(  isolate:)/;
  if (!persistentShellPattern.test(original)) {
    throw new Error(`Unsupported DeepSeek minimal preset: ${presetPath}`);
  }

  const filesystemAnchor = [
    "# The bare local filesystem shadows the host's sandboxed provider only for this",
    "# preset. The editor shares that realm and requires absolute paths.",
  ].join(eol);
  if (!original.includes(filesystemAnchor)) {
    throw new Error(`Missing filesystem anchor in DeepSeek minimal preset: ${presetPath}`);
  }

  patched = original.replace(
    persistentShellPattern,
    `$1${persistentShellGate}${eol}$2`,
  );
  patched = patched.replace(
    filesystemAnchor,
    [
      "# Windows uses the shipped one-shot PowerShell tool because persistent terminal",
      "# process inspection is implemented only for Linux and macOS.",
      pwshRow,
      "",
      filesystemAnchor,
    ].join(eol),
  );
}

if (!patched.includes(persistentShellGate) || !patched.includes(pwshRow)) {
  throw new Error(`Failed to patch DeepSeek minimal preset: ${presetPath}`);
}

let patchedMetadata = originalMetadata;
if (!originalMetadata.includes(platformDescription)) {
  if (!originalMetadata.includes(legacyDescription) && !originalMetadata.includes(legacyDescriptionV2)) {
    throw new Error(`Unsupported DeepSeek minimal metadata: ${presetMetadataPath}`);
  }
  patchedMetadata = originalMetadata.replace(
    originalMetadata.includes(legacyDescription) ? legacyDescription : legacyDescriptionV2,
    platformDescription,
  );
}

if (patched === original && patchedMetadata === originalMetadata) {
  console.log("DeepSeek minimal Windows PowerShell patch is already applied.");
  process.exit(0);
}

if (patched !== original) writeFileSync(presetPath, patched, "utf8");
if (patchedMetadata !== originalMetadata) {
  writeFileSync(presetMetadataPath, patchedMetadata, "utf8");
}
console.log(`Patched DeepSeek minimal mode for Windows PowerShell: ${presetPath}`);
