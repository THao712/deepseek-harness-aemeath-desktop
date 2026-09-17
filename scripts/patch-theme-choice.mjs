import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dshRequire = createRequire(require.resolve("@deepseek-ai/dsh/package.json"));
const webRequire = createRequire(dshRequire.resolve("@deepseek-ai/dsh-web-app/package.json"));
const themeRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.dirname(webRequire.resolve("@deepseek-ai/dsh-client-ui-theme/package.json"));
const manifest = JSON.parse(readFileSync(path.join(themeRoot, "package.json"), "utf8"));
const supportedVersions = new Set(["0.1.2-rc.1", "0.1.5-rc.1", "0.1.5-rc.2"]);
if (!supportedVersions.has(manifest.version)) {
  throw new Error(`Review theme patch for upstream ${manifest.version} before applying it.`);
}

const marker = "// Aemeath desktop theme choice v1";
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) {
    throw new Error(`Unsupported upstream theme anchor: ${before.slice(0, 100)}`);
  }
  return source.replace(before, () => after);
}

function preferences(source) {
  const pattern = /const THEME_PREFERENCES = \[\s*"light",\s*"dark",\s*"system"\s*\];/;
  const match = source.match(pattern);
  if (!match) throw new Error("Unsupported upstream theme preferences.");
  source = replaceOnce(source, match[0], 'const THEME_PREFERENCES = ["light", "dark", "system", "aemeath"];');
  return replaceOnce(source, 'const DEFAULT_PREFERENCE = "system";', 'const DEFAULT_PREFERENCE = "aemeath";');
}

function patchHost(source) {
  source = preferences(source);
  return replaceOnce(source,
    "  const dark = preference === 'dark' || systemDark",
    "  const aemeath = preference === 'aemeath'\n" +
    "  document.documentElement.toggleAttribute('data-aemeath-theme', aemeath)\n" +
    "  document.body.toggleAttribute('data-aemeath-theme', aemeath)\n" +
    "  const dark = preference === 'dark' || aemeath || systemDark");
}

function patchClient(source) {
  source = preferences(source);
  source = replaceOnce(source, 'const CUBES = [',
    'function AemeathIcon() {\n' +
    '\t\t\treturn (0, react_jsx_runtime.jsx)("span", { "data-aemeath-choice-icon": "", "aria-hidden": true });\n' +
    '\t\t}\n\t\tconst CUBES = [');
  source = replaceOnce(source,
    '\t\t\t\tIcon: _deepseek_ai_dsh_client_ui_primitives.IconFollowsystemOutline16\n\t\t\t}',
    '\t\t\t\tIcon: _deepseek_ai_dsh_client_ui_primitives.IconFollowsystemOutline16\n\t\t\t},\n' +
    '\t\t\t{ id: "aemeath", labelKey: "appearance.aemeath", Icon: AemeathIcon }');
  source = replaceOnce(source,
    'className: AppearanceRow_module_css_default.cubeRow,',
    'className: AppearanceRow_module_css_default.cubeRow,\n\t\t\t\t\t"data-desktop-theme-options": "",');
  source = replaceOnce(source, '"aria-pressed": preference === id,',
    '"aria-pressed": preference === id,\n\t\t\t\t\t\t"data-theme-choice": id,');
  source = replaceOnce(source, '"appearance.system": "\u8ddf\u968f\u7cfb\u7edf",',
    '"appearance.system": "\u8ddf\u968f\u7cfb\u7edf",\n\t\t\t"appearance.aemeath": "\u7231\u5f25\u65af",');
  source = replaceOnce(source, '"appearance.system": "System",',
    '"appearance.system": "System",\n\t\t\t"appearance.aemeath": "Aemeath",');
  source = replaceOnce(source,
    'const BUILTIN_THEMES = Object.freeze([Object.freeze({',
    'const BUILTIN_THEMES = Object.freeze([Object.freeze({ id: "aemeath", colorScheme: "dark", tokens: Object.freeze({}) }), Object.freeze({');
  source = replaceOnce(source, 'const sync = (snapshot) => {',
    'const sync = (snapshot) => {\n' +
    '\t\t\t\tconst aemeath = snapshot.preference === "aemeath";\n' +
    '\t\t\t\tdocument.documentElement.toggleAttribute("data-aemeath-theme", aemeath);\n' +
    '\t\t\t\tdocument.body.toggleAttribute("data-aemeath-theme", aemeath);');
  return replaceOnce(source, 'ctx.on("theme/change", sync);',
    'ctx.on("theme/change", sync);\n\t\t\tsync(theme.getTheme());');
}

// Validate both runtime halves before writing either; rerunning is a no-op.
const edits = [["index.js", patchHost], ["client.js", patchClient]].map(([file, patch]) => {
  const filename = path.join(themeRoot, "lib", file);
  const original = readFileSync(filename, "utf8");
  if (original.startsWith(marker)) return { filename, original, result: original };
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const result = `${marker}\n${patch(original.replaceAll("\r\n", "\n"))}`.replaceAll("\n", eol);
  return { filename, original, result };
});
for (const { filename, original, result } of edits) {
  if (original !== result) writeFileSync(filename, result, "utf8");
}
console.log(`Verified four persisted theme choices: ${themeRoot}`);
