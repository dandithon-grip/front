// Figma 에셋을 public/assets 로 내려받는 스크립트.
// 사용: npm run fetch-assets  (인터넷이 되는 본인 PC 터미널에서 실행)
// 주의: manifest 의 URL 은 Figma 가 발급한 임시 주소라 발급 후 7일(2026-11-12경)까지만 유효합니다.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'scripts/assets.manifest.json'), 'utf8'))

let ok = 0
const failed = []
for (const { path, url } of manifest) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const dest = join(root, 'public/assets', path)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, Buffer.from(await res.arrayBuffer()))
    ok++
  } catch (e) {
    failed.push(`${path} (${e.message})`)
  }
}
console.log(`다운로드 ${ok}/${manifest.length}`)
if (failed.length) {
  console.log('실패:\n - ' + failed.join('\n - '))
  process.exitCode = 1
}
