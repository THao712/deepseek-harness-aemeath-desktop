import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const manifestPath = require.resolve(
  "@deepseek-ai/dsh-host-directory-picker-native/package.json",
);
const workerPath = path.join(path.dirname(manifestPath), "lib", "worker.cjs");
const source = readFileSync(workerPath, "utf8");
const fixedImplementation = "return koffi.decode.string16(address);";

if (source.includes(fixedImplementation)) {
  console.log("DeepSeek native directory picker patch is already applied.");
  process.exit(0);
}

const brokenBlock = /\/\*\*\r?\n\* Read a NUL-terminated UTF-16 string[\s\S]*?\*\/\r?\nfunction readUtf16\(koffi, address\) \{\r?\n\tconst bytes = Buffer\.from\(koffi\.view\(address, 32768\)\);\r?\n\tlet end = 0;\r?\n\twhile \(end \+ 1 < bytes\.length && bytes\[end\] !== 0\) end \+= 2;\r?\n\treturn bytes\.toString\("utf16le", 0, end\);\r?\n\}/;
const replacement = `/**
* Read a NUL-terminated UTF-16 string at a native address. Koffi documents
* that Electron forbids the external ArrayBuffer created by \`view()\`;
* \`decode.string16()\` reads the same address without an external buffer.
*/
function readUtf16(koffi, address) {
\t${fixedImplementation}
}`;

if (!brokenBlock.test(source)) {
  throw new Error(
    `Unsupported @deepseek-ai/dsh-host-directory-picker-native worker: ${workerPath}`,
  );
}

writeFileSync(workerPath, source.replace(brokenBlock, replacement), "utf8");
console.log(`Patched DeepSeek native directory picker: ${workerPath}`);
