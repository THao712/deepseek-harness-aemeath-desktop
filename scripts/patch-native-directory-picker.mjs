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
const upstreamImplementation = 'return koffi.decode(pointer.subarray(0, pointerSize), "str16");';

if (source.includes(fixedImplementation) || source.includes(upstreamImplementation)) {
  console.log("DeepSeek native directory picker patch is already applied.");
  process.exit(0);
}

const brokenBlock = /function readUtf16\(koffi, address\) \{[\s\S]*?\r?\n\}/;
const replacement = `/**
* Read a NUL-terminated UTF-16 string at a native address. Koffi documents
* that Electron forbids the external ArrayBuffer created by \`view()\`;
* \`decode.string16()\` reads the same address without an external buffer.
*/
function readUtf16(koffi, address) {
\t${fixedImplementation}
}`;

if (!source.match(brokenBlock)?.[0].includes("Buffer.from(koffi.view(address, 32768))")) {
  throw new Error(
    `Unsupported @deepseek-ai/dsh-host-directory-picker-native worker: ${workerPath}`,
  );
}

writeFileSync(workerPath, source.replace(brokenBlock, replacement), "utf8");
console.log(`Patched DeepSeek native directory picker: ${workerPath}`);
