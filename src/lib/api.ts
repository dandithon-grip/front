import { authClient } from './auth'
import { config } from './config'
import { searchKakaoPlaces } from './map'
import type { Commute, CommuteResponse, PlaceLocation, Station, TransitPath } from './types'
import { MODE_TO_API } from './types'
import { assertTransitNotAborted, fetchOdsayTransit, transitCancelled, validateTransitPaths } from './transit'

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'ApiError' }
}
export interface RequestOptions { method?: string; body?: unknown; authenticated?: boolean; signal?: AbortSignal; expectedUserId?: string }

/** Only retry a rejected token once. A network failure never replays a write. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const authenticated = options.authenticated !== false
  const session = authenticated ? (await authClient?.auth.getSession())?.data.session : undefined
  const actor = session?.user?.id
  let token = session?.access_token
  if (authenticated && !token) throw new ApiError('로그인 후 이용할 수 있어요.', 401)
  if (options.expectedUserId && actor !== options.expectedUserId) throw new ApiError('로그인 정보가 변경됐어요. 다시 시도해 주세요.', 401)
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  const timeout = globalThis.setTimeout(abort, 25_000)
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      if (options.body !== undefined) headers['Content-Type'] = 'application/json'
      const response = await fetch(`${config.apiUrl}${path}`, {
        method: options.method ?? 'GET', headers, signal: controller.signal,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      })
      if (response.status === 401 && authenticated && attempt === 0 && authClient) {
        const { data, error } = await authClient.auth.refreshSession()
        if (!error && data.session) {
          if (actor && data.session.user?.id !== actor) throw new ApiError('로그인 정보가 변경됐어요. 다시 시도해 주세요.', 401)
          token = data.session.access_token; continue
        }
      }
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
          ? payload.message : response.status >= 500 ? '지금 길을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' : '요청을 처리하지 못했어요. 다시 확인해 주세요.'
        throw new ApiError(message, response.status)
      }
      if (response.status === 204) return undefined as T
      return await response.json() as T
    }
    throw new ApiError('로그인이 만료됐어요. 다시 로그인해 주세요.', 401)
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (controller.signal.aborted) throw new ApiError('응답이 늦어지고 있어요. 다시 시도해 주세요.', 408)
    throw new ApiError('연결을 확인한 뒤 다시 시도해 주세요.', 0)
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

export function commutePayload(commute: Commute) {
  const from = commute.fromPlace, to = commute.toPlace
  if (!from || !to || !Number.isFinite(from.lat) || !Number.isFinite(from.lng) || !Number.isFinite(to.lat) || !Number.isFinite(to.lng)) {
    throw new ApiError('검색 결과에서 출발지와 도착지를 선택해 주세요.', 422)
  }
  if ([from, to].some(p => Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) throw new ApiError('올바른 위도·경도의 장소를 선택해 주세요.', 422)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(commute.morning) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(commute.evening)) {
    throw new ApiError('출근·퇴근 시간을 확인해 주세요.', 422)
  }
  const options = commute.mode === '대중교통' ? (commute.transitOptions?.length ? commute.transitOptions : commute.transitLegs?.length ? [commute.transitLegs] : []) : []
  if (commute.mode === '대중교통' && !(options.length || commute.stationIds?.length)) {
    throw new ApiError('이용할 대중교통 경로를 선택해 주세요.', 422)
  }
  return {
    from_lat: from.lat, from_lng: from.lng, to_lat: to.lat, to_lng: to.lng,
    from_area: from.area || from.name, to_area: to.area || to.name,
    go_time: commute.morning, leave_time: commute.evening, transport_mode: MODE_TO_API[commute.mode],
    preference: commute.preference, transit_legs: options[0] ?? [], transit_options: options,
    station_ids: commute.mode === '대중교통' ? commute.stationIds ?? [] : [],
    line: commute.mode === '대중교통' ? commute.line ?? null : null,
  }
}
export const saveCommuteRequest = (commute: Commute, expectedUserId?: string) => apiRequest<CommuteResponse>('/commutes/me', { method: 'PUT', body: commutePayload(commute), expectedUserId })
let stationsPromise: Promise<Station[]> | undefined
export function getStations(): Promise<Station[]> {
  if (!stationsPromise) stationsPromise = apiRequest<Station[]>('/stations?line=2', { authenticated: false }).catch(error => { stationsPromise = undefined; throw error })
  return stationsPromise
}
export async function searchPlaces(query: string): Promise<PlaceLocation[]> {
  if (!query.trim()) return []
  if (config.kakaoKey) return searchKakaoPlaces(query)
  const stations = await getStations()
  const term = query.trim().replace(/\s|역$/g, '').toLowerCase()
  return stations.filter(s => s.name.replace(/\s|역$/g, '').toLowerCase().includes(term)).map(s => ({
    name: `${s.name.replace(/역$/, '')}역`, address: `${s.line}호선 정류장`, area: s.name, lat: s.lat, lng: s.lng,
  }))
}
export interface TransitSearchOptions { expectedUserId?: string; signal?: AbortSignal }
export async function searchTransitRoutes(from: PlaceLocation, to: PlaceLocation, options: TransitSearchOptions = {}): Promise<TransitPath[]> {
  const changedAccount = () => new ApiError('로그인 정보가 변경됐거나 만료됐어요. 다시 로그인한 뒤 검색해 주세요.', 401)
  const readActor = async (expected?: string): Promise<string> => {
    assertTransitNotAborted(options.signal)
    if (!authClient) throw changedAccount()
    try {
      const { data, error } = await authClient.auth.getSession()
      assertTransitNotAborted(options.signal)
      if (error || !data.session?.access_token || !data.session.user.id || (expected && data.session.user.id !== expected)) throw changedAccount()
      return data.session.user.id
    } catch (error) { if (options.signal?.aborted) throw transitCancelled(); throw changedAccount() }
  }
  const actor = await readActor(options.expectedUserId)
  const operation = new AbortController()
  const abort = () => operation.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) operation.abort()
  let accountChanged = false
  const { data: auth } = authClient!.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (session && session.user.id !== actor)) { accountChanged = true; operation.abort() }
  })
  try {
    const raw = await fetchOdsayTransit(from, to, operation.signal)
    if (accountChanged) throw changedAccount()
    await readActor(actor)
    assertTransitNotAborted(operation.signal)
    let parsed: unknown
    try {
      parsed = await apiRequest<unknown>('/transit/routes/parse', { method: 'POST', body: { odsay: raw }, expectedUserId: actor, signal: operation.signal })
    } catch (error) {
      if (accountChanged) throw changedAccount()
      if (operation.signal.aborted) throw transitCancelled()
      if (error instanceof ApiError && error.status === 401) throw changedAccount()
      if (error instanceof ApiError && error.status === 404) throw new ApiError('대중교통 검색 결과를 해석하는 기능이 아직 서버에 반영되지 않았어요. 잠시 후 다시 이용해 주세요.', 404)
      if (error instanceof ApiError && error.status === 422) throw new ApiError('대중교통 검색 결과를 해석하지 못했어요. 다른 장소로 다시 검색해 주세요.', 422)
      if (error instanceof ApiError && error.status === 408) throw new ApiError('대중교통 경로 분석이 늦어지고 있어요. 다시 시도해 주세요.', 408)
      throw new ApiError('대중교통 경로 분석 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', error instanceof ApiError ? error.status : 0)
    }
    await readActor(actor)
    if (accountChanged) throw changedAccount()
    assertTransitNotAborted(operation.signal)
    return validateTransitPaths(parsed)
  } catch (error) { if (accountChanged) throw changedAccount(); throw error }
  finally { auth.subscription.unsubscribe(); options.signal?.removeEventListener('abort', abort) }
}
