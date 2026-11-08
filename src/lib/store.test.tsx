import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { ApiError, type RequestOptions } from './api'
import type { Commute, CommuteResponse, OneTimeTrip, TagWeights } from './types'

const sdk = vi.hoisted(() => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn(),
  signInWithPassword: vi.fn(), signUp: vi.fn(), updateUser: vi.fn(), refreshSession: vi.fn(),
}))
const requests = vi.hoisted(() => ({ apiRequest: vi.fn(), saveCommuteRequest: vi.fn() }))
const notifications = vi.hoisted(() => ({ cleanupNotificationsForSignOut: vi.fn() }))

vi.mock('./auth', () => ({ authClient: { auth: sdk } }))
vi.mock('./notifications', () => notifications)
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return { ...actual, apiRequest: requests.apiRequest, saveCommuteRequest: requests.saveCommuteRequest }
})

import { StoreProvider, useStore } from './store'
import { createPreviewJourney, PREVIEW_COMMUTE } from './preview'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

function session(id: string): Session {
  return {
    access_token: `token-${id}`, refresh_token: `refresh-${id}`, expires_in: 3600, token_type: 'bearer',
    user: { id, email: `${id}@example.test`, aud: 'authenticated', created_at: '2026-11-08T00:00:00Z', app_metadata: {}, user_metadata: { nickname: `local-${id}` } },
  }
}

function serverCommute(id: string): CommuteResponse {
  return {
    id: `commute-${id}`, from_lat: id === 'account-A' ? 35.85 : 35.86, from_lng: 128.63,
    to_lat: 35.87, to_lng: 128.59, from_area: `${id}의 집`, to_area: `${id}의 회사`,
    go_time: '08:05:00', leave_time: '18:30:00', transport_mode: 'walk', line: null, station_ids: [], preference: 'full',
  }
}

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value) },
    removeItem: (key) => { items.delete(key) }, clear: () => items.clear(),
    key: (index) => [...items.keys()][index] ?? null, get length() { return items.size },
  }
}

describe('StoreProvider account and preview scenarios', () => {
  let renderer: ReactTestRenderer | undefined
  let store: ReturnType<typeof useStore>
  let authListener: ((event: AuthChangeEvent, next: Session | null) => void) | undefined
  let storage: Storage
  const unsubscribe = vi.fn()
  const fetchGuard = vi.fn(() => { throw new Error('A store scenario attempted a real fetch') })

  function Probe() { store = useStore(); return null }
  async function mount() {
    await act(async () => { renderer = create(<StoreProvider><Probe /></StoreProvider>); await Promise.resolve() })
  }
  async function switchAccount(id: string) {
    await act(async () => {
      authListener?.('SIGNED_IN', session(id))
      await vi.runOnlyPendingTimersAsync()
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { location: { origin: 'https://store.example.test' } })
    vi.stubGlobal('fetch', fetchGuard)
    authListener = undefined
    sdk.getSession.mockResolvedValue({ data: { session: session('account-A') }, error: null })
    sdk.signOut.mockResolvedValue({ error: null })
    notifications.cleanupNotificationsForSignOut.mockResolvedValue({ serverRemoved: true, deviceRevoked: true })
    sdk.onAuthStateChange.mockImplementation((listener: typeof authListener) => {
      authListener = listener
      return { data: { subscription: { unsubscribe } } }
    })
    requests.apiRequest.mockImplementation(async (path: string, options: RequestOptions = {}) => {
      const actor = options.expectedUserId || 'account-A'
      if (path === '/users/me') return { nickname: `server-${actor}` }
      if (path === '/commutes/me') return serverCommute(actor)
      if (path === '/users/me/tag-weights') return { weights: { river: .3 }, hint: null }
      if (path === '/feedback') return { weights: { river: .2 } }
      const data = createPreviewJourney(PREVIEW_COMMUTE)
      if (path.startsWith('/cards/')) return data.card
      if (path.startsWith('/commutes/me/routes')) return data.routes
      throw new Error(`Unexpected mocked API path: ${path}`)
    })
    requests.saveCommuteRequest.mockResolvedValue(serverCommute('account-A'))
  })

  afterEach(async () => {
    if (renderer) await act(async () => { renderer!.unmount() })
    renderer = undefined
    expect(fetchGuard).not.toHaveBeenCalled()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('removes device notifications before invalidating the authenticated session', async () => {
    await mount()
    const cleanup = deferred<{ serverRemoved: boolean; deviceRevoked: boolean }>()
    notifications.cleanupNotificationsForSignOut.mockReturnValueOnce(cleanup.promise)
    let signingOut!: Promise<void>
    await act(async () => { signingOut = store!.signOut() })
    expect(notifications.cleanupNotificationsForSignOut).toHaveBeenCalledWith('account-A')
    expect(sdk.signOut).not.toHaveBeenCalled()
    await act(async () => { cleanup.resolve({ serverRemoved: true, deviceRevoked: true }); await signingOut })
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(store!.profile.loggedIn).toBe(false)
  })

  it('keeps the session available to retry when both device and server push removal fail', async () => {
    await mount()
    notifications.cleanupNotificationsForSignOut.mockRejectedValueOnce(new Error('알림 해제를 완료하지 못했어요.'))
    await act(async () => { await expect(store!.signOut()).rejects.toThrow('알림 해제를 완료하지 못했어요.') })
    expect(sdk.signOut).not.toHaveBeenCalled()
    expect(store!.profile.authId).toBe('account-A')
  })

  it('finishes restoring an existing session even when refresh is requested during hydration', async () => {
    const user = deferred<{ nickname: string }>()
    const saved = deferred<CommuteResponse>()
    requests.apiRequest.mockImplementation((path: string) => {
      if (path === '/users/me') return user.promise
      if (path === '/commutes/me') return saved.promise
      throw new Error(`A journey was requested before session hydration: ${path}`)
    })
    await mount()
    expect(store!.sessionReady).toBe(false)
    await act(async () => { await store!.refreshJourney() })
    expect(requests.apiRequest).toHaveBeenCalledTimes(2)
    await act(async () => {
      user.resolve({ nickname: '복원된 이름' })
      saved.resolve(serverCommute('account-A'))
      await Promise.all([user.promise, saved.promise])
    })
    expect(store!.sessionReady).toBe(true)
    expect(store!.profile).toMatchObject({ authId: 'account-A', nickname: '복원된 이름', loggedIn: true })
    expect(store!.commute).toMatchObject({ configured: true, from: 'account-A의 집', to: 'account-A의 회사', morning: '08:05', evening: '18:30' })
    expect(store!.commute.fromPlace).toMatchObject({ lat: 35.85, lng: 128.63 })
  })

  it('does not apply a late A-account preference response after B signs in', async () => {
    const lateWeights = deferred<TagWeights>()
    const defaultRequest = requests.apiRequest.getMockImplementation()!
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) =>
      path === '/users/me/tag-weights' && options?.expectedUserId === 'account-A'
        ? lateWeights.promise : defaultRequest(path, options))
    await mount()
    let pending!: Promise<unknown>
    await act(async () => { pending = store!.readTagWeights().catch((error: unknown) => error) })
    await switchAccount('account-B')
    expect(store!.profile.authId).toBe('account-B')
    expect(store!.sessionReady).toBe(true)
    await act(async () => { lateWeights.resolve({ weights: { river: .9 }, hint: { tag: 'river', message: 'A-only preference' } }); await pending })
    expect(await pending).toMatchObject({ status: 401 })
    expect(store!.tagWeights).toBeNull()
    expect(store!.commute.from).toBe('account-B의 집')
  })

  it('does not generate routes for B when an A-account commute PUT finishes after an account switch', async () => {
    const lateSave = deferred<CommuteResponse>()
    requests.saveCommuteRequest.mockReturnValueOnce(lateSave.promise)
    await mount()
    const draft: Commute = { ...PREVIEW_COMMUTE, from: 'A가 수정한 집', morning: '07:15' }
    let pending!: Promise<unknown>
    await act(async () => { pending = store!.saveCommute(draft).catch((error: unknown) => error) })
    expect(requests.saveCommuteRequest).toHaveBeenCalledWith(draft, 'account-A')
    await switchAccount('account-B')
    await act(async () => { lateSave.resolve({ ...serverCommute('account-A'), go_time: '07:15:00' }); await pending })
    expect(await pending).toMatchObject({ status: 401 })
    expect(store!.profile.authId).toBe('account-B')
    expect(store!.commute).toMatchObject({ from: 'account-B의 집', morning: '08:05' })
    expect(requests.apiRequest.mock.calls.some(([path, options]) => path === '/commutes/me/routes' && options?.method === 'POST')).toBe(false)
  })

  it('enters preview explicitly, keeps ratings through route changes, and persists only the preview scenario', async () => {
    sdk.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    await mount()
    expect(store!.dataSource).toBe('api')
    expect(store!.commute.configured).toBe(false)
    await act(async () => { store!.startPreview() })
    expect(store!.dataSource).toBe('preview')
    expect(store!.profile.loggedIn).toBe(false)
    const routeId = store!.selectedRoute!.id
    await act(async () => { await store!.submitRating(routeId, 5) })
    expect(store!.ratings[routeId]).toBe(5)
    expect(Object.values(store!.tagWeights!.weights).some((weight) => weight > 0)).toBe(true)
    await act(async () => { await store!.refreshJourney('short', 'to_work') })
    expect(store!.direction).toBe('to_work')
    expect(store!.preference).toBe('short')
    expect(store!.journeyStatus).toBe('ready')
    expect(store!.ratings[routeId]).toBe(5)
    const changed = { ...PREVIEW_COMMUTE, morning: '07:20', preference: 'sunset' as const }
    await act(async () => { await store!.saveCommute(changed) })
    expect(store!.commute.morning).toBe('07:20')
    expect(store!.direction).toBe('to_home')
    expect(store!.preference).toBe('sunset')
    expect(store!.ratings[routeId]).toBe(5)
    expect(requests.apiRequest).not.toHaveBeenCalled()
    expect(requests.saveCommuteRequest).not.toHaveBeenCalled()
    const saved = JSON.parse(storage.getItem('saetgil:preview:v2')!)
    expect(saved).toMatchObject({ enabled: true, commute: { morning: '07:20' }, ratings: { [routeId]: 5 } })
    expect(saved).not.toHaveProperty('profile')
    await act(async () => { renderer!.unmount(); renderer = undefined })
    sdk.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    await mount()
    expect(store!.dataSource).toBe('preview')
    expect(store!.commute.morning).toBe('07:20')
    expect(store!.ratings[routeId]).toBe(5)
    expect(storage.getItem('saetgil:preview:v2')).not.toBeNull()
    await act(async () => { await store!.signOut() })
    expect(store!.dataSource).toBe('api')
    expect(store!.commute.configured).toBe(false)
    expect(store!.ratings).toEqual({})
    expect(storage.getItem('saetgil:preview:v2')).toBeNull()
  })

  it('clears an authenticated account and its loaded journey and preference state on sign-out', async () => {
    await mount()
    await act(async () => { await store!.readTagWeights(); await store!.submitRating('A-route', 4); store!.setAlerts({ morning: true }) })
    expect(store!.profile.loggedIn).toBe(true)
    expect(store!.tagWeights).not.toBeNull()
    await act(async () => { await store!.signOut() })
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(store!.profile).toMatchObject({ loggedIn: false, userId: '' })
    expect(store!.profile.authId).toBeUndefined()
    expect(store!.sessionReady).toBe(true)
    expect(store!.commute.configured).toBe(false)
    expect(store!.card).toBeNull()
    expect(store!.routes).toBeNull()
    expect(store!.tagWeights).toBeNull()
    expect(store!.ratings).toEqual({})
    expect(store!.records).toEqual([])
    expect(store!.alerts).toEqual({ morning: false, evening: false })
    expect(storage.getItem('saetgil:preview:v2')).toBeNull()
  })

  it('keeps a commute lookup outage visible and restores the commute when retry succeeds', async () => {
    const defaultRequest = requests.apiRequest.getMockImplementation()!
    let commuteAttempts = 0
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) => {
      if (path === '/commutes/me' && ++commuteAttempts === 1) return Promise.reject(new ApiError('commute service unavailable', 500))
      return defaultRequest(path, options)
    })
    await mount()
    expect(store!.sessionReady).toBe(true)
    expect(store!.profile.loggedIn).toBe(true)
    expect(store!.journeyStatus).toBe('error')
    expect(store!.journeyError).toContain('일상 경로를 불러오지 못했어요')
    expect(store!.commute.configured).toBe(false)
    await act(async () => { await store!.refreshJourney() })
    expect(commuteAttempts).toBe(2)
    expect(store!.commute).toMatchObject({ configured: true, from: 'account-A의 집', morning: '08:05' })
    expect(store!.journeyStatus).toBe('ready')
    expect(store!.journeyError).toBeNull()
    expect(store!.selectedRoute).not.toBeNull()
  })

  it('does not attach a delayed old refresh response to a newly saved commute and its generated routes', async () => {
    const defaultRequest = requests.apiRequest.getMockImplementation()!
    const oldJourney = createPreviewJourney(PREVIEW_COMMUTE)
    oldJourney.card.text = '이전 동선 카드'
    oldJourney.routes.candidates[0].id = 'old-commute-route'
    const changed: Commute = { ...PREVIEW_COMMUTE, from: '새 집', morning: '07:15',
      fromPlace: { name: '새 집', area: '북구', address: '새 집 주소', lat: 35.9, lng: 128.6 } }
    const newJourney = createPreviewJourney(changed)
    newJourney.card.text = '새 동선 카드'
    newJourney.routes.candidates[0].id = 'new-commute-route'
    const oldCard = deferred<typeof oldJourney.card>()
    const oldRoutes = deferred<typeof oldJourney.routes>()
    let useOldJourney = true
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) => {
      if (path.startsWith('/cards/today')) return useOldJourney ? oldCard.promise : Promise.resolve(newJourney.card)
      if (path.startsWith('/commutes/me/routes')) return options?.method === 'POST' || !useOldJourney ? Promise.resolve(newJourney.routes) : oldRoutes.promise
      return defaultRequest(path, options)
    })
    requests.saveCommuteRequest.mockResolvedValueOnce({ ...serverCommute('account-A'), from_lat: 35.9, from_lng: 128.6,
      to_lat: changed.toPlace!.lat, to_lng: changed.toPlace!.lng, from_area: '북구', go_time: '07:15:00' })
    await mount()
    let delayedRefresh!: Promise<unknown>
    await act(async () => { delayedRefresh = store!.refreshJourney().catch((error: unknown) => error) })
    expect(store!.journeyStatus).toBe('loading')
    useOldJourney = false
    await act(async () => { await store!.saveCommute(changed) })
    expect(store!.commute).toMatchObject({ from: '새 집', morning: '07:15' })
    expect(store!.selectedRoute?.id).toBe('new-commute-route')
    expect(store!.card?.text).toBe('새 동선 카드')
    await act(async () => { oldCard.resolve(oldJourney.card); oldRoutes.resolve(oldJourney.routes); await delayedRefresh })
    expect(store!.commute).toMatchObject({ from: '새 집', morning: '07:15' })
    expect(store!.selectedRoute?.id).toBe('new-commute-route')
    expect(store!.card?.text).toBe('새 동선 카드')
    expect(store!.journeyStatus).toBe('ready')
    expect(requests.apiRequest.mock.calls.filter(([path, options]) => path === '/commutes/me/routes' && options?.method === 'POST')).toHaveLength(1)
  })

  it('applies and restores an exploration without changing the saved commute, direction, selection or server', async () => {
    await mount()
    await act(async () => { await store!.changeDirection('to_work') })
    await act(async () => { store!.selectRoute(store!.routes!.shortest[0].id) })
    const original = { commute: store!.commute, card: store!.card, routes: store!.routes, direction: store!.direction, selectedId: store!.selectedId }
    requests.apiRequest.mockClear()
    requests.saveCommuteRequest.mockClear()
    const trip: OneTimeTrip = { from: { ...PREVIEW_COMMUTE.fromPlace!, name: '이번 출발' }, to: { ...PREVIEW_COMMUTE.toPlace!, name: '이번 도착' }, mode: '도보' }
    await act(async () => { store!.applyOneTimeTrip(trip, 'api:account-A') })
    expect(store!.oneTimeTrip?.from.name).toBe('이번 출발')
    trip.from.name = '나중에 변경한 draft'
    expect(store!.oneTimeTrip?.from.name).toBe('이번 출발')
    expect(store!.commute).toBe(original.commute)
    expect(store!.card).toBe(original.card)
    expect(store!.routes).toBe(original.routes)
    expect(store!.direction).toBe(original.direction)
    expect(store!.selectedId).toBe(original.selectedId)
    expect(store!.selectedRoute).toBeNull()
    await act(async () => { await expect(store!.submitRating(original.selectedId!, 4)).rejects.toThrow('이번 탐색은 아직 평가할 수 없어요') })
    await act(async () => { store!.clearOneTimeTrip() })
    expect(store!.oneTimeTrip).toBeNull()
    expect(store!.selectedId).toBe(original.selectedId)
    expect(store!.selectedRoute?.id).toBe(original.selectedId)
    expect(store!.direction).toBe('to_work')
    expect(requests.apiRequest).not.toHaveBeenCalled()
    expect(requests.saveCommuteRequest).not.toHaveBeenCalled()
  })

  it('keeps an exploration out of preview persistence and recovers the original commute after reload', async () => {
    sdk.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await mount()
    await act(async () => { store!.startPreview() })
    const original = storage.getItem('saetgil:preview:v2')
    await act(async () => { store!.applyOneTimeTrip({ from: { ...PREVIEW_COMMUTE.fromPlace!, name: '캐시에 남기지 않을 장소' }, to: PREVIEW_COMMUTE.toPlace!, mode: '도보' }, 'preview:guest') })
    expect(storage.getItem('saetgil:preview:v2')).toBe(original)
    expect(storage.getItem('saetgil:preview:v2')).not.toContain('캐시에 남기지 않을 장소')
    await act(async () => { renderer!.unmount(); renderer = undefined })
    await mount()
    expect(store!.oneTimeTrip).toBeNull()
    expect(store!.commute).toEqual(PREVIEW_COMMUTE)
    expect(requests.saveCommuteRequest).not.toHaveBeenCalled()
  })

  it('clears an exploration on account changes and rejects an old editor apply', async () => {
    await mount()
    const trip: OneTimeTrip = { from: PREVIEW_COMMUTE.fromPlace!, to: PREVIEW_COMMUTE.toPlace!, mode: '도보' }
    await act(async () => { store!.applyOneTimeTrip(trip, 'api:account-A') })
    await switchAccount('account-B')
    expect(store!.oneTimeTrip).toBeNull()
    expect(() => store!.applyOneTimeTrip(trip, 'api:account-A')).toThrow('로그인 정보가 변경됐어요')
    expect(store!.commute.from).toBe('account-B의 집')
    expect(requests.saveCommuteRequest).not.toHaveBeenCalled()
  })

  it('requires a real parsed candidate for transit and detaches its stops from later editor changes', async () => {
    await mount()
    const from = PREVIEW_COMMUTE.fromPlace!, to = PREVIEW_COMMUTE.toPlace!
    expect(() => store!.applyOneTimeTrip({ from, to, mode: '대중교통' }, 'api:account-A')).toThrow()
    expect(store!.oneTimeTrip).toBeNull()
    const trip: OneTimeTrip = { from, to, mode: '대중교통', transitPath: {
      index: 0, summary: '2호선', total_minutes: 18, transfers: 0, walk_minutes: 2,
      legs: [{ kind: 'subway', line: '2호선', start_name: from.name, end_name: to.name, minutes: 16,
        stops: [{ ...from, external_id: 'station-1' }, { ...to, external_id: 'station-2' }] }],
    } }
    await act(async () => { store!.applyOneTimeTrip(trip, 'api:account-A') })
    trip.transitPath!.legs[0].stops[0].name = '변경된 정류장'
    expect(store!.oneTimeTrip?.transitPath?.legs[0].stops[0].name).toBe(from.name)
    expect(requests.saveCommuteRequest).not.toHaveBeenCalled()
    expect(requests.apiRequest.mock.calls.some(([, options]) => options?.method === 'POST' || options?.method === 'PUT')).toBe(false)
  })

  it('rejects invalid exploration coordinates without replacing the current exploration', async () => {
    await mount()
    const trip: OneTimeTrip = { from: PREVIEW_COMMUTE.fromPlace!, to: PREVIEW_COMMUTE.toPlace!, mode: '도보' }
    await act(async () => { store!.applyOneTimeTrip(trip, 'api:account-A') })
    const currentTrip = store!.oneTimeTrip
    expect(() => store!.applyOneTimeTrip({ ...trip, to: trip.from }, 'api:account-A')).toThrow('서로 다르게')
    expect(() => store!.applyOneTimeTrip({ ...trip, from: { ...trip.from, lat: NaN } }, 'api:account-A')).toThrow('선택해 주세요')
    expect(store!.oneTimeTrip).toBe(currentTrip)
  })

  it('preserves preview ratings and learned weights through reload, then preserves the reset through another reload', async () => {
    sdk.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await mount()
    await act(async () => { store!.startPreview() })
    const routeId = store!.selectedRoute!.id
    await act(async () => { await store!.submitRating(routeId, 5) })
    const learnedWeights = { ...store!.tagWeights!.weights }
    expect(Object.values(learnedWeights).some((weight) => weight > 0)).toBe(true)
    await act(async () => { renderer!.unmount(); renderer = undefined })
    await mount()
    expect(store!.ratings[routeId]).toBe(5)
    expect(store!.tagWeights?.weights).toEqual(learnedWeights)
    await act(async () => { await store!.resetTagWeights() })
    expect(store!.tagWeights?.weights).toEqual({})
    expect(store!.ratings[routeId]).toBe(5)
    await act(async () => { renderer!.unmount(); renderer = undefined })
    await mount()
    expect(store!.dataSource).toBe('preview')
    expect(store!.ratings[routeId]).toBe(5)
    expect(store!.tagWeights?.weights).toEqual({})
    expect(requests.apiRequest).not.toHaveBeenCalled()
    expect(requests.saveCommuteRequest).not.toHaveBeenCalled()
  })
})
