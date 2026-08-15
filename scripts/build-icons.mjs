import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDirectory = path.join(projectRoot, "build");
const iconSource = path.join(projectRoot, "assets", "aemeath-app-icon.png");

await mkdir(buildDirectory, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngFiles = [];

for (const size of [...sizes, 512]) {
  const output = path.join(buildDirectory, `icon-${size}.png`);
  await sharp(iconSource).resize(size, size, { fit: "cover" }).png().toFile(output);
  if (size <= 256) pngFiles.push(output);
  if (size === 512) await writeFile(path.join(buildDirectory, "icon.png"), await readFile(output));
}

await writeFile(path.join(buildDirectory, "icon.ico"), await pngToIco(pngFiles));
