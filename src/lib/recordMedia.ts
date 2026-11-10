/** Record photo helpers: a small thumbnail is stored next to the full photo so lists stay light. */
export const THUMB_MAX_EDGE = 320
export const thumbPathOf = (path: string) => path.replace(/(\.[a-z0-9]+)?$/i, '_thumb.jpg')

const SIGNED_TTL_S = 3600
const signedCache = new Map<string, { url: string; expiresAt: number }>()
/** Signed URLs are re-created at most once per hour per path within this tab. */
export function cachedSignedUrls(paths: string[]): { hit: Map<string, string>; missing: string[] } {
  const now = Date.now(), hit = new Map<string, string>(), missing: string[] = []
  for (const path of paths) {
    const entry = signedCache.get(path)
    if (entry && entry.expiresAt > now + 60_000) hit.set(path, entry.url)
    else missing.push(path)
  }
  return { hit, missing }
}
export function rememberSignedUrl(path: string, url: string): void {
  signedCache.set(path, { url, expiresAt: Date.now() + SIGNED_TTL_S * 1000 })
}
export const signedTtlSeconds = SIGNED_TTL_S
