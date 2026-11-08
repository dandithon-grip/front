import { config } from './config'
import type { PlaceLocation, TransitPath } from './types'

export type TransitErrorCode = 'missing_key' | 'invalid_location' | 'odsay_http' | 'odsay_auth' | 'odsay_error' | 'no_routes' | 'timeout' | 'cancelled' | 'network' | 'invalid_response'
/** Messages are fixed locally: upstream URLs, keys and exception text never reach the UI. */
export class TransitClientError extends Error {
  constructor(public readonly code: TransitErrorCode, message: string) { super(message); this.name = 'TransitClientError' }
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const coordinate = (lat: unknown, lng: unknown) => typeof lat === 'number' && typeof lng === 'number'
  && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
const naturalNumber = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0
const nullableText = (value: unknown) => value === null || typeof value === 'string'
export function transitCancelled(): TransitClientError { return new TransitClientError('cancelled', '대중교통 검색을 취소했어요.') }
export function assertTransitNotAborted(signal?: AbortSignal): void { if (signal?.aborted) throw transitCancelled() }

/** Only this public URI-key request goes directly to ODsay. It receives no app credentials. */
export async function fetchOdsayTransit(from: PlaceLocation, to: PlaceLocation, signal?: AbortSignal): Promise<Record<string, unknown>> {
  assertTransitNotAborted(signal)
  if (!coordinate(from.lat, from.lng) || !coordinate(to.lat, to.lng)) throw new TransitClientError('invalid_location', '출발지와 도착지의 올바른 위도·경도를 선택해 주세요.')
  const key = config.odsayWebKey?.trim()
  if (!key) throw new TransitClientError('missing_key', '대중교통 검색 연결이 아직 준비되지 않았어요. 잠시 후 다시 이용해 주세요.')
  const query = new URLSearchParams({ SX: String(from.lng), SY: String(from.lat), EX: String(to.lng), EY: String(to.lat), apiKey: key })
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 15_000)
  let rejectAbort: () => void = () => {}
  const interrupted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(timedOut
      ? new TransitClientError('timeout', '대중교통 검색 응답이 늦어지고 있어요. 다시 시도해 주세요.') : transitCancelled())
    controller.signal.addEventListener('abort', rejectAbort, { once: true })
  })
  const request = async () => {
    const response = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${query}`, {
      method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' }, signal: controller.signal,
    })
    if (!response.ok) throw new TransitClientError('odsay_http', response.status === 429
      ? '대중교통 검색 요청이 많아요. 잠시 후 다시 시도해 주세요.' : '대중교통 검색 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.')
    let raw: unknown
    try { raw = await response.json() } catch { throw new TransitClientError('invalid_response', '대중교통 검색 응답을 읽지 못했어요. 다시 검색해 주세요.') }
    if (!object(raw)) throw new TransitClientError('invalid_response', '대중교통 검색 응답의 형식이 올바르지 않아요. 다시 검색해 주세요.')
    if ('error' in raw) {
      const error = Array.isArray(raw.error) ? raw.error[0] : raw.error
      if (object(error) && String(error.code) === '-98') throw new TransitClientError('no_routes', '이 출발지와 도착지를 잇는 대중교통 경로가 없어요. 다른 장소로 검색해 주세요.')
      const message = object(error) && (typeof error.message === 'string' ? error.message : typeof error.msg === 'string' ? error.msg : '')
      if (object(error) && (String(error.code) === '500' || (typeof message === 'string' && /ApiKeyAuthFailed/i.test(message)))) {
        throw new TransitClientError('odsay_auth', '대중교통 검색 서비스 인증을 확인하지 못했어요. 연결 설정 확인이 필요해요.')
      }
      throw new TransitClientError('odsay_error', '대중교통 검색을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
    if (!object(raw.result) || !Array.isArray(raw.result.path)) throw new TransitClientError('invalid_response', '대중교통 검색 응답의 형식이 올바르지 않아요. 다시 검색해 주세요.')
    if (!raw.result.path.length) throw new TransitClientError('no_routes', '이 출발지와 도착지를 잇는 대중교통 경로가 없어요. 다른 장소로 검색해 주세요.')
    return raw
  }
  try { return await Promise.race([request(), interrupted]) }
  catch (error) {
    if (controller.signal.aborted) { if (timedOut) throw new TransitClientError('timeout', '대중교통 검색 응답이 늦어지고 있어요. 다시 시도해 주세요.'); throw transitCancelled() }
    if (error instanceof TransitClientError) throw error
    throw new TransitClientError('network', '대중교통 검색에 연결하지 못했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', rejectAbort) }
}

/** Check every field used by the candidate UI before accepting a parsed server response. */
export function validateTransitPaths(value: unknown): TransitPath[] {
  if (!object(value) || !Array.isArray(value.paths)) throw invalidPaths()
  if (!value.paths.length) throw new TransitClientError('no_routes', '선택할 수 있는 대중교통 경로가 없어요. 다른 장소로 검색해 주세요.')
  const indexes = new Set<number>()
  for (const path of value.paths) {
    if (!object(path) || !naturalNumber(path.index) || indexes.has(path.index as number) || typeof path.summary !== 'string' || !path.summary.trim()
      || !naturalNumber(path.total_minutes) || !naturalNumber(path.transfers) || !naturalNumber(path.walk_minutes) || !Array.isArray(path.legs) || !path.legs.length) throw invalidPaths()
    indexes.add(path.index as number)
    for (const leg of path.legs) {
      if (!object(leg) || !['walk', 'bus', 'subway'].includes(String(leg.kind)) || !nullableText(leg.line)
        || !nullableText(leg.start_name) || !nullableText(leg.end_name) || !naturalNumber(leg.minutes) || !Array.isArray(leg.stops)) throw invalidPaths()
      if (leg.kind !== 'walk' && (typeof leg.line !== 'string' || !leg.line.trim())) throw invalidPaths()
      for (const stop of leg.stops) {
        if (!object(stop) || typeof stop.name !== 'string' || !stop.name.trim() || typeof stop.external_id !== 'string' || !stop.external_id.trim() || !coordinate(stop.lat, stop.lng)) throw invalidPaths()
      }
    }
  }
  return value.paths as TransitPath[]
}
function invalidPaths(): TransitClientError { return new TransitClientError('invalid_response', '서버가 올바른 대중교통 경로를 반환하지 않았어요. 다시 검색해 주세요.') }
