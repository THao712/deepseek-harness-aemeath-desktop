import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const [assistantSource, iconSource, desktopOutputDirectory] = process.argv.slice(2);

if (!assistantSource || !iconSource || !desktopOutputDirectory) {
  throw new Error(
    "Usage: node scripts/process-aemeath-assets.mjs <assistant.png> <icon.png> <desktop-output-directory>",
  );
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDirectory = path.join(projectRoot, "assets");

await mkdir(assetsDirectory, { recursive: true });
await mkdir(desktopOutputDirectory, { recursive: true });

async function removeConnectedCheckerboard(sourcePath, removeEnclosed = false) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);

  function isBackground(index) {
    const offset = index * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const darkest = Math.min(red, green, blue);
    const lightest = Math.max(red, green, blue);
    return darkest >= 226 && lightest - darkest <= 24;
  }

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || !isBackground(start)) continue;

    let head = 0;
    let tail = 0;
    let touchesEdge = false;
    let lightCellCount = 0;
    let darkCellCount = 0;
    let sumX = 0;
    let sumY = 0;
    visited[start] = 1;
    queue[tail++] = start;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      const offset = index * channels;
      const brightness = (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
      sumX += x;
      sumY += y;
      if (brightness >= 251) lightCellCount += 1;
      if (brightness <= 248) darkCellCount += 1;
      if (x === 0 || x + 1 === width || y === 0 || y + 1 === height) {
        touchesEdge = true;
      }

      for (const neighbor of [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ]) {
        if (neighbor < 0 || visited[neighbor] || !isBackground(neighbor)) continue;
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }

    const centerX = sumX / tail;
    const centerY = sumY / tail;
    const eyeCenterX = width * 0.5;
    const eyeCenterY = height * 0.54;
    const eyeRadius = width * 0.28;
    const isInsideEye =
      (centerX - eyeCenterX) ** 2 + (centerY - eyeCenterY) ** 2 < eyeRadius ** 2;
    const hasCheckerboardMix =
      removeEnclosed &&
      !isInsideEye &&
      tail >= 3_000 &&
      lightCellCount / tail >= 0.12 &&
      darkCellCount / tail >= 0.12;
    if (touchesEdge || hasCheckerboardMix) {
      for (let index = 0; index < tail; index += 1) {
        data[queue[index] * channels + 3] = 0;
      }
    }
  }

  return sharp(data, { raw: info })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .png()
    .toBuffer();
}

const assistantCutout = await removeConnectedCheckerboard(assistantSource);
const iconCutout = await removeConnectedCheckerboard(iconSource, true);

const assistantDesktopPath = path.join(
  desktopOutputDirectory,
  "爱弥斯-像素助手-透明.png",
);
await writeFile(assistantDesktopPath, assistantCutout);

const assistantAssetPath = path.join(assetsDirectory, "aemeath-pixel-assistant.webp");
await sharp(assistantCutout)
  .resize({ height: 900, fit: "inside", withoutEnlargement: true, kernel: "nearest" })
  .webp({ lossless: true, alphaQuality: 100 })
  .toFile(assistantAssetPath);

const iconBackground = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <defs>
      <radialGradient id="bg" cx="46%" cy="38%" r="74%">
        <stop offset="0" stop-color="#321a3b"/>
        <stop offset="0.58" stop-color="#1b1022"/>
        <stop offset="1" stop-color="#100c15"/>
      </radialGradient>
    </defs>
    <rect x="20" y="20" width="984" height="984" rx="164" fill="url(#bg)"/>
    <rect x="21" y="21" width="982" height="982" rx="163" fill="none" stroke="#8bdcf3" stroke-opacity="0.32" stroke-width="2"/>
  </svg>
`);
const fittedIcon = await sharp(iconCutout)
  .resize(884, 884, {
    fit: "contain",
    kernel: "lanczos3",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();
const appIcon = await sharp(iconBackground)
  .composite([{ input: fittedIcon, left: 70, top: 70 }])
  .png()
  .toBuffer();

const iconDesktopPath = path.join(desktopOutputDirectory, "爱弥斯-Harness-图标.png");
const iconAssetPath = path.join(assetsDirectory, "aemeath-app-icon.png");
await Promise.all([
  writeFile(iconDesktopPath, appIcon),
  writeFile(iconAssetPath, appIcon),
]);

console.log(
  JSON.stringify(
    {
      assistantDesktopPath,
      assistantAssetPath,
      iconDesktopPath,
      iconAssetPath,
    },
    null,
    2,
  ),
);
