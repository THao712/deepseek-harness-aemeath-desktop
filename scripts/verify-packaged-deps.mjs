import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(process.argv[2] ?? "dist/win-unpacked/resources/app");
const modules = path.join(root, "node_modules");
const missing = new Map();
for (const entry of readdirSync(modules, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
  const names = entry.name.startsWith("@")
    ? readdirSync(path.join(modules, entry.name)).map((name) => `${entry.name}/${name}`)
    : [entry.name];
  for (const name of names) {
    const manifest = path.join(modules, name, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    const require = createRequire(manifest);
    for (const [dependency, range] of Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies })) {
      if (!dependency.startsWith("@deepseek-ai/")) continue;
      if (pkg.peerDependenciesMeta?.[dependency]?.optional && !pkg.dependencies?.[dependency]) continue;
      const locations = require.resolve.paths(dependency) ?? [];
      if (!locations.some((location) => existsSync(path.join(location, dependency, "package.json")))) {
        missing.set(dependency, range);
      }
    }
  }
}
console.log(JSON.stringify({ missingRequiredPlugins: Object.fromEntries(missing) }, null, 2));
assert.equal(missing.size, 0, "The packaged runtime is missing required DeepSeek plugins.");
