import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

await mkdir(new URL('../public/', import.meta.url), { recursive: true })
const variants = [
  ['icon-192.png', 192], ['icon-512.png', 512],
  ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180], ['favicon.png', 48],
]
for (const [filename, size] of variants) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#101114"/><path d="M256 112V400M112 256H400" stroke="#ff579b" stroke-width="76" stroke-linecap="round"/></svg>`
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/${filename}`, import.meta.url)))
}
console.log('Generated PWA, maskable, Apple and favicon PNGs.')