import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { ApiError, type RequestOptions } from './api'
import type { Commute, CommuteResponse, TagWeights } from './types'

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

  it('fetches the card for the chosen ride and goes back to the overall card (server#90)', async () => {
    await mount()
    await act(async () => { await store!.refreshJourney() })
    requests.apiRequest.mockClear()
    await act(async () => { await store!.selectRide('ride-156') })
    expect(requests.apiRequest).toHaveBeenCalledWith('/cards/today?ride_id=ride-156', { expectedUserId: 'account-A' })
    expect(store!.rideId).toBe('ride-156')
    requests.apiRequest.mockClear()
    await act(async () => { await store!.selectRide(null) })
    expect(requests.apiRequest).toHaveBeenCalledWith('/cards/today', { expectedUserId: 'account-A' })
    expect(store!.rideId).toBeNull()
  })

  it('starts route generation in the background and polls the status until ready (server#97)', async () => {
    const statuses = [{ state: 'pending' }, { state: 'pending' }, { state: 'ready', route_count: 5 }]
    const defaultRequest = requests.apiRequest.getMockImplementation()!
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) => {
      if (path.startsWith('/commutes/me/routes') && options?.method === 'POST') return Promise.resolve({ state: 'pending', route_count: 0 })
      if (path === '/commutes/me/routes/status') return Promise.resolve(statuses.shift() ?? { state: 'ready', route_count: 5 })
      return defaultRequest(path, options)
    })
    await mount()
    const commute = { ...PREVIEW_COMMUTE, mode: '도보' as const, configured: true }
    let saving!: Promise<void>
    await act(async () => { saving = store!.saveCommute(commute) })
    expect(requests.apiRequest).toHaveBeenCalledWith('/commutes/me/routes?wait=false', expect.objectContaining({ method: 'POST' }))
    expect(store!.generation).toBe('pending')
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); await saving })
    expect(requests.apiRequest.mock.calls.filter(([path]) => path === '/commutes/me/routes/status')).toHaveLength(3)
    expect(store!.generation).toBe('idle')
    expect(store!.journeyStatus).toBe('ready')
  })

  it('reports a failed background generation without pretending the routes exist (server#97)', async () => {
    const defaultRequest = requests.apiRequest.getMockImplementation()!
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) => {
      if (path.startsWith('/commutes/me/routes') && options?.method === 'POST') return Promise.resolve({ state: 'pending', route_count: 0 })
      if (path === '/commutes/me/routes/status') return Promise.resolve({ state: 'failed', route_count: 0 })
      return defaultRequest(path, options)
    })
    await mount()
    let outcome!: Promise<unknown>
    await act(async () => { outcome = store!.saveCommute({ ...PREVIEW_COMMUTE, mode: '도보' as const, configured: true }).catch((error: unknown) => error) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); await outcome })
    expect(await outcome).toBeInstanceOf(Error)
    expect(store!.journeyStatus).toBe('error')
    expect(store!.journeyError).toContain('샛길을 만들지 못했어요')
  })

  it('warms the other preference cards in the background after the first card arrives (server#101)', async () => {
    await mount()
    await act(async () => { await store!.refreshJourney() })
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    const warmed = requests.apiRequest.mock.calls.map(([path]) => path).filter((path: string) => path.startsWith('/cards/today?preference='))
    expect(warmed.sort()).toEqual(['/cards/today?preference=short', '/cards/today?preference=sunset'])
    requests.apiRequest.mockClear()
    await act(async () => { await store!.refreshJourney('short') })
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    // 이미 데운 취향은 다시 조회하지 않는다
    expect(requests.apiRequest.mock.calls.map(([path]) => path).filter((path: string) => path.startsWith('/cards/today?preference='))).toEqual(['/cards/today?preference=short'])
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
    expect(requests.apiRequest.mock.calls.filter(([path, options]) => path === '/commutes/me/routes?wait=false' && options?.method === 'POST')).toHaveLength(1)
  })

  it.each(['to_work', 'to_home'] as const)('saves edited endpoints, regenerates actual routes and refreshes the card while preserving %s', async direction => {
    await mount()
    const changed: Commute = { ...PREVIEW_COMMUTE, preference: 'sunset' }
    requests.apiRequest.mockClear()
    const defaultRequest = requests.apiRequest.getMockImplementation()!
    const generated = deferred<ReturnType<typeof createPreviewJourney>['routes']>()
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) => options?.method === 'POST' ? generated.promise : defaultRequest(path, options))
    requests.saveCommuteRequest.mockResolvedValueOnce({ ...serverCommute('account-A'), preference: 'sunset' })
    let saving!: Promise<void>
    await act(async () => { saving = store!.saveCommute(changed, { direction, expectedUserId: 'account-A' }) })
    expect(requests.saveCommuteRequest).toHaveBeenCalledWith(changed, 'account-A')
    expect(requests.apiRequest).toHaveBeenCalledWith(`/commutes/me/routes?direction=${direction}&wait=false`, { method: 'POST', expectedUserId: 'account-A', timeoutMs: 120_000 })
    expect(store!.journeyStatus).toBe('loading')
    expect(requests.apiRequest.mock.calls.some(([path]) => path.startsWith('/cards/today'))).toBe(false)
    await act(async () => { generated.resolve(createPreviewJourney(changed).routes); await saving })
    expect(store!.direction).toBe(direction)
    expect(store!.journeyStatus).toBe('ready')
    expect(requests.apiRequest).toHaveBeenCalledWith('/cards/today?preference=sunset', { expectedUserId: 'account-A' })
    expect(requests.apiRequest).toHaveBeenCalledWith(`/commutes/me/routes?direction=${direction}&preference=sunset`, { expectedUserId: 'account-A' })
  })

  it('keeps the new saved locations and reports partial success if route generation fails', async () => {
    await mount()
    const defaultRequest = requests.apiRequest.getMockImplementation()!
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) => options?.method === 'POST' ? Promise.reject(new ApiError('경로 계산 실패', 502)) : defaultRequest(path, options))
    requests.saveCommuteRequest.mockResolvedValueOnce({ ...serverCommute('account-A'), from_area: '새 집', from_lat: 35.9 })
    await act(async () => { await expect(store!.saveCommute(PREVIEW_COMMUTE, { direction: 'to_work', expectedUserId: 'account-A' })).rejects.toThrow('동선은 저장됐지만') })
    expect(store!.commute.from).toBe('새 집')
    expect(store!.direction).toBe('to_work')
    expect(store!.journeyStatus).toBe('error')
    expect(store!.journeyError).toContain('동선은 저장됐지만')
    expect(store!.selectedRoute).toBeNull()
    expect(requests.saveCommuteRequest).toHaveBeenCalledTimes(1)
  })

  it('rejects a stale endpoint editor before writing to a different account', async () => {
    await mount()
    await switchAccount('account-B')
    await expect(store!.saveCommute(PREVIEW_COMMUTE, { direction: 'to_home', expectedUserId: 'account-A' })).rejects.toMatchObject({ status: 401 })
    expect(requests.saveCommuteRequest).not.toHaveBeenCalled()
    expect(store!.commute.from).toBe('account-B의 집')
  })

  it('reports that saving succeeded when only the subsequent card refresh fails', async () => {
    await mount()
    const defaultRequest = requests.apiRequest.getMockImplementation()!
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) => path.startsWith('/cards/today') ? Promise.reject(new ApiError('카드 조회 실패', 503)) : defaultRequest(path, options))
    requests.saveCommuteRequest.mockResolvedValueOnce({ ...serverCommute('account-A'), to_area: '새 회사' })
    await act(async () => { await expect(store!.saveCommute(PREVIEW_COMMUTE, { direction: 'to_work', expectedUserId: 'account-A' })).rejects.toThrow('위치와 경로는 저장됐지만 화면을 갱신하지 못했어요') })
    expect(store!.commute.to).toBe('새 회사')
    expect(store!.direction).toBe('to_work')
    expect(store!.journeyError).toContain('다시 불러와 주세요')
    expect(requests.saveCommuteRequest).toHaveBeenCalledTimes(1)
    expect(storage.getItem('saetgil:regeneration-needed:v1:account-A')).toBe('card')
    await act(async () => { renderer!.unmount(); renderer = undefined })
    requests.apiRequest.mockImplementation(defaultRequest)
    await mount()
    requests.apiRequest.mockClear()
    await act(async () => { await store!.refreshJourney() })
    expect(requests.apiRequest).toHaveBeenCalledWith('/cards/today?preference=full', { expectedUserId: 'account-A' })
    expect(requests.apiRequest.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
    expect(storage.getItem('saetgil:regeneration-needed:v1:account-A')).toBeNull()
  })

  it('regenerates before accepting route GETs after a saved location change failed to generate routes', async () => {
    await mount()
    const defaultRequest = requests.apiRequest.getMockImplementation()!
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) => options?.method === 'POST' ? Promise.reject(new ApiError('TMAP 실패', 502)) : defaultRequest(path, options))
    await act(async () => { await store!.saveCommute(PREVIEW_COMMUTE, { direction: 'to_work', expectedUserId: 'account-A' }).catch(() => undefined) })
    expect(storage.getItem('saetgil:regeneration-needed:v1:account-A')).toBe('1')
    requests.apiRequest.mockClear()
    const generated = deferred<ReturnType<typeof createPreviewJourney>['routes']>()
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) => options?.method === 'POST' ? generated.promise : defaultRequest(path, options))
    let refreshing!: Promise<void>
    await act(async () => { refreshing = store!.refreshJourney() })
    expect(store!.routes).toBeNull()
    expect(store!.selectedRoute).toBeNull()
    expect(requests.apiRequest).toHaveBeenCalledWith('/commutes/me/routes?direction=to_work&wait=false', { method: 'POST', expectedUserId: 'account-A', timeoutMs: 120_000 })
    expect(requests.apiRequest.mock.calls.some(([path, options]) => path.startsWith('/cards/today') || path.startsWith('/commutes/me/routes') && options?.method !== 'POST')).toBe(false)
    await act(async () => { generated.resolve(createPreviewJourney(PREVIEW_COMMUTE).routes); await refreshing })
    expect(store!.journeyStatus).toBe('ready')
    expect(store!.selectedRoute).not.toBeNull()
    expect(storage.getItem('saetgil:regeneration-needed:v1:account-A')).toBeNull()
    expect(requests.saveCommuteRequest).toHaveBeenCalledTimes(1)
  })

  it('retains the regeneration requirement through reload and keeps old routes hidden on another failure', async () => {
    storage.setItem('saetgil:regeneration-needed:v1:account-A', '1')
    await mount()
    const defaultRequest = requests.apiRequest.getMockImplementation()!
    requests.apiRequest.mockImplementation((path: string, options?: RequestOptions) => options?.method === 'POST' ? Promise.reject(new ApiError('경로 생성 실패', 502)) : defaultRequest(path, options))
    requests.apiRequest.mockClear()
    await act(async () => { await store!.refreshJourney().catch(() => undefined) })
    expect(store!.journeyStatus).toBe('error')
    expect(store!.routes).toBeNull()
    expect(store!.card).toBeNull()
    expect(requests.apiRequest.mock.calls.some(([path]) => path.startsWith('/cards/today'))).toBe(false)
    expect(storage.getItem('saetgil:regeneration-needed:v1:account-A')).toBe('1')
    await act(async () => { renderer!.unmount(); renderer = undefined })
    await mount()
    requests.apiRequest.mockImplementation(defaultRequest)
    requests.apiRequest.mockClear()
    await act(async () => { await store!.refreshJourney() })
    expect(requests.apiRequest).toHaveBeenCalledWith('/commutes/me/routes?direction=to_home&wait=false', { method: 'POST', expectedUserId: 'account-A', timeoutMs: 120_000 })
    expect(store!.journeyStatus).toBe('ready')
    expect(storage.getItem('saetgil:regeneration-needed:v1:account-A')).toBeNull()
  })

  it('does not regenerate another account when a recovery flag exists for the previous account', async () => {
    storage.setItem('saetgil:regeneration-needed:v1:account-A', '1')
    await mount()
    await switchAccount('account-B')
    requests.apiRequest.mockClear()
    await act(async () => { await store!.refreshJourney() })
    expect(requests.apiRequest.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
    expect(storage.getItem('saetgil:regeneration-needed:v1:account-A')).toBe('1')
    expect(store!.profile.authId).toBe('account-B')
  })

  it('does not start a persistent location change when its recovery state cannot be retained', async () => {
    await mount()
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('storage unavailable') })
    await expect(store!.saveCommute(PREVIEW_COMMUTE, { expectedUserId: 'account-A' })).rejects.toThrow('브라우저 저장공간')
    expect(requests.saveCommuteRequest).not.toHaveBeenCalled()
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
