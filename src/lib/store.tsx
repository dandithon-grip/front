import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { authClient } from './auth'
import { cleanupNotificationsForSignOut } from './notifications'
import { ApiError, apiRequest, saveCommuteRequest } from './api'
import { createPreviewJourney, PREVIEW_COMMUTE } from './preview'
import { MODE_FROM_API } from './types'
import type { Alerts, Commute, CommuteResponse, Direction, GenerationStatus, Preference, Profile, RecordItem, RouteData, RoutesData, TagWeights, TodayCard } from './types'
export type { Mode, Season, Profile, Commute, RecordItem, Alerts } from './types'

const CACHE = 'saetgil:preview:v2'
const REGENERATION = 'saetgil:regeneration-needed:v1:'
// Only a recovery flag is stored, never the user's endpoint coordinates.
function needsRegeneration(actor: string) { return localStorage.getItem(`${REGENERATION}${actor}`) === '1' }
function needsCardRefresh(actor: string) { return localStorage.getItem(`${REGENERATION}${actor}`) === 'card' }
function markRegeneration(actor: string) {
  try { localStorage.setItem(`${REGENERATION}${actor}`, '1') }
  catch { throw new ApiError('위치 변경을 이어서 확인할 수 있도록 브라우저 저장공간을 허용한 뒤 다시 시도해 주세요.', 0) }
}
function finishRegeneration(actor: string) { localStorage.setItem(`${REGENERATION}${actor}`, 'card') }
function finishJourneyRefresh(actor: string) {
  if (needsCardRefresh(actor)) localStorage.removeItem(`${REGENERATION}${actor}`)
}
// Route generation calls TMAP dozens of times per usual route; three routes can take over a minute (server#93).
// The server builds in the background (server#97); we poll its status every few seconds, up to this long.
const GENERATION_POLL_MS = 3_000
const GENERATION_MAX_WAIT_MS = 180_000
// Older servers ignore wait=false and answer synchronously, so the start request itself may take long.
const GENERATION_TIMEOUT_MS = 120_000
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const EMPTY_COMMUTE: Commute = { from: '', to: '', morning: '08:30', evening: '18:10', mode: '도보', preference: 'full', configured: false }
interface State {
  profile: Profile; commute: Commute; records: RecordItem[]; alerts: Alerts; sessionReady: boolean; dataSource: 'api' | 'preview'
  card: TodayCard | null; routes: RoutesData | null; selectedId: string | null; direction: Direction; preference: Preference
  /** Usual route chosen for today's card (server#90). null = best across all registered routes. */
  rideId: string | null
  /** Background route generation (server#97): 'pending' while the server is still building routes. */
  generation: 'idle' | 'pending'
  journeyStatus: 'idle' | 'loading' | 'ready' | 'error'; journeyError: string | null; tagWeights: TagWeights | null; ratings: Record<string, number>
}
const empty = (): State => ({ profile: { userId: '', nickname: '샛길러', loggedIn: false }, commute: { ...EMPTY_COMMUTE }, records: [], alerts: { morning: false, evening: false },
  sessionReady: !authClient, dataSource: 'api', card: null, routes: null, selectedId: null, direction: 'to_home', preference: 'full', rideId: null, generation: 'idle', journeyStatus: 'idle', journeyError: null, tagWeights: null, ratings: {} })
function load(): State {
  const state = empty()
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE) || 'null')
    if (saved?.enabled && saved.commute && typeof saved.commute.from === 'string' && typeof saved.commute.to === 'string') {
      const commute: Commute = { ...PREVIEW_COMMUTE, ...saved.commute }
      const preference: Preference = ['full', 'short', 'sunset'].includes(saved.preference) ? saved.preference : 'full'
      const direction: Direction = saved.direction === 'to_work' ? 'to_work' : 'to_home'
      const data = createPreviewJourney(commute, preference, direction)
      const selectedId = [...data.routes.candidates, ...data.routes.shortest].some(r => r.id === saved.selectedId) ? saved.selectedId : data.card.route?.id ?? null
      const weights = saved.tagWeights?.weights && typeof saved.tagWeights.weights === 'object'
        ? Object.fromEntries(Object.entries(saved.tagWeights.weights).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1)) as Record<string, number> : {}
      return { ...state, commute, ...data, preference, direction, selectedId, tagWeights: { weights, hint: null }, journeyStatus: 'ready', dataSource: 'preview', records: Array.isArray(saved.records) ? saved.records : [], ratings: saved.ratings || {} }
    }
  } catch { /* Old caches never impersonate authenticated users. */ }
  return state
}
function fromServer(saved: CommuteResponse, previous?: Commute): Commute {
  const same = (place: Commute['fromPlace'], lat: number, lng: number) => place && Math.abs(place.lat - lat) < .000001 && Math.abs(place.lng - lng) < .000001
  const fromPlace = same(previous?.fromPlace, saved.from_lat, saved.from_lng) ? previous!.fromPlace! : { name: saved.from_area, area: saved.from_area, address: saved.from_area, lat: saved.from_lat, lng: saved.from_lng }
  const toPlace = same(previous?.toPlace, saved.to_lat, saved.to_lng) ? previous!.toPlace! : { name: saved.to_area, area: saved.to_area, address: saved.to_area, lat: saved.to_lat, lng: saved.to_lng }
  return { from: fromPlace.name, to: toPlace.name, fromPlace, toPlace, morning: saved.go_time.slice(0, 5), evening: saved.leave_time.slice(0, 5), mode: MODE_FROM_API[saved.transport_mode],
    preference: saved.preference, stationIds: saved.station_ids, line: saved.line ?? undefined, transitLegs: previous?.transitLegs, transitOptions: previous?.transitOptions,
    rides: saved.rides ?? [], configured: true }
}
interface Store extends State {
  isGuest: boolean; selectedRoute: RouteData | null
  signIn(email: string, password: string): Promise<void>; signUp(email: string, password: string, nickname: string): Promise<{ needsConfirmation: boolean }>
  signOut(): Promise<void>; updateProfile(nickname: string, password?: string): Promise<void>; enterGuest(): Promise<void>; startPreview(): void
  refreshJourney(preference?: Preference, direction?: Direction, rideId?: string | null): Promise<void>; selectRide(rideId: string | null): Promise<void>; saveCommute(commute: Commute, options?: { direction?: Direction; expectedUserId?: string; waitForRoutes?: boolean }): Promise<void>
  selectRoute(id: string): void; changeDirection(direction: Direction): Promise<void>; submitRating(routeId: string, rating: number): Promise<void>
  readTagWeights(): Promise<TagWeights>; resetTagWeights(): Promise<void>; setProfile(profile: Partial<Profile>): void
  setCommute(commute: Partial<Commute>): void; setAlerts(alerts: Partial<Alerts>): void; addRecord(record: Omit<RecordItem, 'id'>): void
}
const Context = createContext<Store | null>(null)
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(load)
  const current = useRef(state), epoch = useRef(0), authEpoch = useRef(0), identity = useRef<string | null>(null)
  const saveEpoch = useRef(0)
  const inflight = useRef<{ key: string; ticket: number; promise: Promise<void> } | null>(null)
  const update = useCallback((fn: (previous: State) => State) => { const next = fn(current.current); current.current = next; setState(next) }, [])
  const assertAccount = useCallback((actor?: string) => {
    if (!actor || current.current.profile.authId !== actor || !current.current.profile.loggedIn || current.current.dataSource !== 'api') {
      throw new ApiError('로그인 정보가 변경됐어요. 다시 시도해 주세요.', 401)
    }
  }, [])
  useEffect(() => {
    try {
      if (state.dataSource === 'preview') localStorage.setItem(CACHE, JSON.stringify({ enabled: true, commute: state.commute, records: state.records.slice(0, 20), ratings: state.ratings, tagWeights: state.tagWeights, preference: state.preference, direction: state.direction, selectedId: state.selectedId }))
      else localStorage.removeItem(CACHE)
    } catch { /* Preview is still available in memory when browser storage is full. */ }
  }, [state.dataSource, state.commute, state.records, state.ratings, state.tagWeights, state.preference, state.direction, state.selectedId])

  const hydrate = useCallback(async (session: Session) => {
    const ticket = ++authEpoch.current
    epoch.current++
    identity.current = session.user.id
    const previous = current.current.dataSource === 'api' && current.current.profile.authId === session.user.id ? current.current.commute : undefined
    update(() => ({ ...empty(), sessionReady: false, profile: { userId: session.user.email || '', authId: session.user.id, loggedIn: true,
      nickname: typeof session.user.user_metadata.nickname === 'string' ? session.user.user_metadata.nickname : '샛길러' }, commute: previous || { ...EMPTY_COMMUTE } }))
    const [user, commute] = await Promise.allSettled([apiRequest<{ nickname: string; city?: string }>('/users/me', { expectedUserId: session.user.id }), apiRequest<CommuteResponse>('/commutes/me', { expectedUserId: session.user.id })])
    if (authEpoch.current !== ticket || identity.current !== session.user.id) return
    const failed = commute.status === 'rejected' && !(commute.reason instanceof ApiError && commute.reason.status === 404)
    update(s => ({ ...s, sessionReady: true, profile: user.status === 'fulfilled' ? { ...s.profile, nickname: user.value.nickname, city: user.value.city } : s.profile,
      commute: commute.status === 'fulfilled' ? fromServer(commute.value, previous) : failed && previous ? previous : { ...EMPTY_COMMUTE }, preference: commute.status === 'fulfilled' ? commute.value.preference : previous?.preference ?? 'full',
      journeyStatus: failed ? 'error' : 'idle', journeyError: failed ? '일상 경로를 불러오지 못했어요. 다시 확인해 주세요.' : null }))
  }, [update])
  useEffect(() => {
    if (!authClient) return
    let alive = true
    const initialEpoch = authEpoch.current
    const timers = new Set<ReturnType<typeof setTimeout>>()
    void authClient.auth.getSession().then(({ data, error }) => {
      if (!alive || authEpoch.current !== initialEpoch) return
      if (!error && data.session) void hydrate(data.session)
      else update(s => ({ ...s, sessionReady: true }))
    }).catch(() => { if (alive) update(s => ({ ...s, sessionReady: true })) })
    const { data } = authClient.auth.onAuthStateChange((event, session) => {
      // Finish the SDK callback before making further SDK/API requests.
      if (event === 'SIGNED_OUT') { epoch.current++; authEpoch.current++; identity.current = null; update(() => ({ ...empty(), sessionReady: true })) }
      else if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED') && identity.current !== session.user.id) {
        const timer = setTimeout(() => { timers.delete(timer); if (alive && identity.current !== session.user.id) void hydrate(session) }, 0); timers.add(timer)
      }
    })
    return () => { alive = false; timers.forEach(clearTimeout); data.subscription.unsubscribe() }
  }, [hydrate, update])

  // Warm the server-side card cache for the other preference chips (and other usual routes) so switching is instant.
  // One LLM call per card on the server; a key is warmed at most once per session (server#101).
  const warmed = useRef(new Set<string>())
  const warmCards = useCallback((actor: string | undefined, preference: Preference, rideId: string | null, rides: string[]) => {
    const targets: Array<{ preference: Preference; rideId: string | null }> = (['full', 'short', 'sunset'] as Preference[])
      .filter(value => value !== preference).map(value => ({ preference: value, rideId }))
    for (const id of rides) if (id !== rideId) targets.push({ preference, rideId: id })
    for (const target of targets) {
      const key = `${actor}:${target.preference}:${target.rideId ?? ''}`
      if (warmed.current.has(key)) continue
      warmed.current.add(key)
      const query = new URLSearchParams()
      if (target.preference !== preference || !target.rideId) query.set('preference', target.preference)
      if (target.rideId) query.set('ride_id', target.rideId)
      setTimeout(() => { void apiRequest(`/cards/today?${query}`, { expectedUserId: actor }).catch(() => { warmed.current.delete(key) }) }, 0)
    }
  }, [])

  /** Start generation on the server and wait for it to finish. Throws if it fails or takes too long. */
  const generateRoutes = useCallback(async (path: string, actor: string | undefined, stillValid: () => void): Promise<void> => {
    // 요청을 보내는 순간부터 "만들고 있어요". 홈이 등록 직후에도 상태를 보여 준다 (QA 11/10)
    update(s => ({ ...s, generation: 'pending' }))
    try {
      const started = await apiRequest<GenerationStatus | RoutesData>(`${path}${path.includes('?') ? '&' : '?'}wait=false`, { method: 'POST', expectedUserId: actor, timeoutMs: GENERATION_TIMEOUT_MS })
      stillValid()
      if (!('state' in started) || started.state === 'ready') return
      const deadline = Date.now() + GENERATION_MAX_WAIT_MS
      while (Date.now() < deadline) {
        await sleep(GENERATION_POLL_MS)
        stillValid()
        const status = await apiRequest<GenerationStatus>('/commutes/me/routes/status', { expectedUserId: actor })
        stillValid()
        if (status.state === 'ready') return
        if (status.state === 'failed') throw new ApiError('샛길을 만들지 못했어요. 다시 등록해 주세요.', 502)
      }
      throw new ApiError('샛길 만들기가 너무 오래 걸려요. 잠시 후 다시 불러와 주세요.', 408)
    } finally { update(s => ({ ...s, generation: 'idle' })) }
  }, [update])

  const refreshJourney = useCallback((requestedPreference?: Preference, requestedDirection?: Direction, requestedRide?: string | null): Promise<void> => {
    const snapshot = current.current, direction = requestedDirection ?? snapshot.direction
    const rideId = requestedRide === undefined ? snapshot.rideId : requestedRide
    let preference = requestedPreference ?? snapshot.preference
    if (!snapshot.sessionReady) return Promise.resolve()
    const key = `${snapshot.dataSource}:${snapshot.profile.authId || 'guest'}:${preference}:${direction}:${rideId ?? ''}`
    if (inflight.current?.key === key && inflight.current.ticket === epoch.current) return inflight.current.promise
    const ticket = ++epoch.current
    let recovering = false, refreshingCard = false, regenerationFinished = false
    try {
      if (snapshot.dataSource === 'api' && snapshot.profile.loggedIn) {
        recovering = needsRegeneration(snapshot.profile.authId!)
        refreshingCard = needsCardRefresh(snapshot.profile.authId!)
      }
    }
    catch {
      const error = new ApiError('경로 변경 상태를 확인하지 못했어요. 브라우저 저장공간을 확인해 주세요.', 0)
      update(s => ({ ...s, card: null, routes: null, selectedId: null, journeyStatus: 'error', journeyError: error.message }))
      return Promise.reject(error)
    }
    update(s => ({ ...s, journeyStatus: 'loading', journeyError: null, ...(recovering || refreshingCard ? { card: null, routes: null, selectedId: null } : {}) }))
    // Start on a microtask so the in-flight record exists even for synchronous preview data.
    const promise = Promise.resolve().then(async () => {
      try {
        if (snapshot.dataSource === 'preview') {
          const data = createPreviewJourney(snapshot.commute, preference, direction)
          if (epoch.current === ticket) update(s => ({ ...s, ...data, preference, direction, journeyStatus: 'ready', selectedId: data.routes.candidates.some(r => r.id === s.selectedId) ? s.selectedId : data.card.route?.id ?? null }))
          return
        }
        if (!snapshot.profile.loggedIn) {
          if (direction === 'to_work' || requestedPreference) throw new ApiError('나의 걷기 취향과 출근길은 로그인 후 이용할 수 있어요.', 401)
          const card = await apiRequest<TodayCard>('/cards/demo', { authenticated: false })
          const routes: RoutesData = { preference: card.preference, direction: 'to_home', candidates: card.candidates, shortest: card.shortest, fallback_level: card.fallback_level, action_type: card.action_type }
          if (epoch.current === ticket) update(s => ({ ...s, card, routes, preference: card.preference, direction: 'to_home', journeyStatus: 'ready', selectedId: card.route?.id ?? routes.candidates[0]?.id ?? routes.shortest[0]?.id ?? null }))
          return
        }
        if (recovering) {
          const saved = await apiRequest<CommuteResponse>('/commutes/me', { expectedUserId: snapshot.profile.authId })
          if (epoch.current !== ticket) return
          assertAccount(snapshot.profile.authId)
          if (!requestedPreference) preference = saved.preference
          update(s => ({ ...s, commute: fromServer(saved, s.commute), preference, direction }))
          await generateRoutes(`/commutes/me/routes?direction=${direction}`, snapshot.profile.authId, () => { if (epoch.current !== ticket) throw new ApiError('다른 요청이 시작됐어요.', 409); assertAccount(snapshot.profile.authId) })
          if (epoch.current !== ticket) return
          assertAccount(snapshot.profile.authId)
          finishRegeneration(snapshot.profile.authId!)
          regenerationFinished = true
        }
        if (!snapshot.commute.configured && !recovering) {
          try {
            const saved = await apiRequest<CommuteResponse>('/commutes/me', { expectedUserId: snapshot.profile.authId })
            if (epoch.current !== ticket) return
            update(s => ({ ...s, commute: fromServer(saved), preference: saved.preference }))
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 404)) throw error
            if (epoch.current === ticket) update(s => ({ ...s, card: null, routes: null, selectedId: null, journeyStatus: 'ready' }))
            return
          }
        }
        const cardQuery = new URLSearchParams()
        if (requestedPreference || recovering || refreshingCard) cardQuery.set('preference', preference)
        if (rideId) cardQuery.set('ride_id', rideId)
        const cardPath = `/cards/today${cardQuery.size ? `?${cardQuery}` : ''}`
        const [card, routes] = await Promise.all([apiRequest<TodayCard>(cardPath, { expectedUserId: snapshot.profile.authId }), apiRequest<RoutesData>(`/commutes/me/routes?direction=${direction}&preference=${preference}`, { expectedUserId: snapshot.profile.authId })])
        if (epoch.current === ticket) {
          finishJourneyRefresh(snapshot.profile.authId!)
          update(s => ({ ...s, card, routes, preference, direction, rideId, journeyStatus: 'ready', journeyError: null,
            selectedId: [...routes.candidates, ...routes.shortest].some(r => r.id === s.selectedId) ? s.selectedId : routes.candidates.find(r => r.id === card.route?.id)?.id ?? routes.candidates[0]?.id ?? routes.shortest[0]?.id ?? null }))
          warmed.current.add(`${snapshot.profile.authId}:${preference}:${rideId ?? ''}`)
          warmCards(snapshot.profile.authId, preference, rideId, (card.rides ?? []).length >= 2 ? (card.rides ?? []).map(ride => ride.id) : [])
        }
      } catch (error) {
        if (epoch.current === ticket) update(s => ({ ...s, journeyStatus: 'error', journeyError: recovering && !regenerationFinished ? '저장된 위치의 경로를 다시 만들지 못했어요. 다시 불러오기를 눌러 주세요.' : error instanceof Error ? error.message : '경로를 불러오지 못했어요.' }))
        throw error
      } finally { if (inflight.current?.ticket === ticket) inflight.current = null }
    })
    inflight.current = { key, ticket, promise }
    return promise
  }, [update, assertAccount, generateRoutes, warmCards])

  const actions = useMemo(() => ({
    signIn: async (email: string, password: string) => {
      if (!authClient) throw new Error('로그인 연결을 준비하고 있어요. 잠시 후 다시 이용해 주세요.')
      const { data, error } = await authClient.auth.signInWithPassword({ email, password }); if (error) throw error
      if (!data.session) throw new Error('로그인을 완료하지 못했어요.')
      await hydrate(data.session)
    },
    signUp: async (email: string, password: string, nickname: string) => {
      if (!authClient) throw new Error('회원가입 연결을 준비하고 있어요. 잠시 후 다시 이용해 주세요.')
      const { data, error } = await authClient.auth.signUp({ email, password, options: { data: { nickname }, emailRedirectTo: `${window.location.origin}/login` } }); if (error) throw error
      if (data.session) await hydrate(data.session)
      return { needsConfirmation: !data.session }
    },
    signOut: async () => {
      if (current.current.profile.loggedIn) await cleanupNotificationsForSignOut(current.current.profile.authId)
      if (authClient) { const { error } = await authClient.auth.signOut({ scope: 'local' }); if (error) throw error }
      epoch.current++; authEpoch.current++; identity.current = null; update(() => ({ ...empty(), sessionReady: true }))
    },
    updateProfile: async (nickname: string, password?: string) => {
      if (!authClient || !current.current.profile.loggedIn) throw new ApiError('로그인 후 내 정보를 수정할 수 있어요.', 401)
      const actor = current.current.profile.authId
      assertAccount(actor)
      const { error } = await authClient.auth.updateUser({ data: { nickname }, ...(password ? { password } : {}) }); if (error) throw error
      assertAccount(actor)
      const refreshed = await authClient.auth.refreshSession(); if (refreshed.error) throw refreshed.error
      assertAccount(actor)
      const user = await apiRequest<{ nickname: string }>('/users/me', { expectedUserId: actor }); assertAccount(actor); update(s => ({ ...s, profile: { ...s.profile, nickname: user.nickname } }))
    },
    enterGuest: async () => {
      if (current.current.profile.loggedIn) throw new Error('로그아웃 후 둘러보기를 이용해 주세요.')
      epoch.current++; authEpoch.current++; update(() => ({ ...empty(), sessionReady: true })); await refreshJourney()
    },
    startPreview: () => {
      epoch.current++; authEpoch.current++
      const data = createPreviewJourney(PREVIEW_COMMUTE)
      update(s => ({ ...empty(), sessionReady: true, dataSource: 'preview', commute: { ...PREVIEW_COMMUTE }, ...data, selectedId: data.card.route?.id ?? null,
        journeyStatus: 'ready', records: s.dataSource === 'preview' ? s.records : [], ratings: s.dataSource === 'preview' ? s.ratings : {}, tagWeights: s.dataSource === 'preview' ? s.tagWeights : null }))
    },
    refreshJourney,
    saveCommute: async (commute: Commute, options: { direction?: Direction; expectedUserId?: string; waitForRoutes?: boolean } = {}) => {
      const direction = options.direction ?? 'to_home'
      if (current.current.dataSource === 'preview') {
        if (options.expectedUserId) throw new ApiError('로그인 후 실제 경로를 저장해 주세요.', 401)
        if (!commute.fromPlace || !commute.toPlace) throw new Error('출발지와 도착지를 선택해 주세요.')
        epoch.current++; const data = createPreviewJourney(commute, commute.preference, direction)
        update(s => ({ ...s, commute: { ...commute, configured: true }, ...data, direction, preference: commute.preference, selectedId: data.card.route?.id ?? null, journeyStatus: 'ready', journeyError: null })); return
      }
      if (!current.current.profile.loggedIn) throw new ApiError('로그인 후 일상 경로를 등록할 수 있어요.', 401)
      const actor = current.current.profile.authId
      assertAccount(actor)
      if (options.expectedUserId && actor !== options.expectedUserId) throw new ApiError('로그인 정보가 변경됐어요. 다시 시도해 주세요.', 401)
      markRegeneration(actor!)
      const saving = ++saveEpoch.current
      const sessionEpoch = authEpoch.current
      const assertSaving = () => {
        assertAccount(actor)
        if (saveEpoch.current !== saving || authEpoch.current !== sessionEpoch) throw new ApiError('설정이 변경됐어요. 현재 동선을 다시 확인해 주세요.', 409)
      }
      epoch.current++; inflight.current = null
      update(s => ({ ...s, card: null, routes: null, selectedId: null, journeyStatus: 'loading', journeyError: null }))
      let saved: CommuteResponse
      try { saved = await saveCommuteRequest(commute, actor); assertSaving() }
      catch (error) {
        if (saveEpoch.current === saving && current.current.profile.authId === actor && authEpoch.current === sessionEpoch) update(s => ({ ...s, journeyStatus: 'error', journeyError: '동선을 저장하지 못했어요. 다시 확인해 주세요.' }))
        throw error
      }
      epoch.current++; inflight.current = null
      // A re-saved commute has new ride ids, so today's ride choice no longer applies.
      update(s => ({ ...s, commute: fromServer(saved, commute), preference: saved.preference, direction, rideId: null }))
      const routePath = options.direction ? `/commutes/me/routes?direction=${direction}` : '/commutes/me/routes'
      const buildRoutes = async () => {
        try { await generateRoutes(routePath, actor, assertSaving); assertSaving(); finishRegeneration(actor!) }
        catch (error) {
          const message = `동선은 저장됐지만 샛길을 만들지 못했어요. 다시 등록해 주세요. ${error instanceof Error ? error.message : ''}`
          if (saveEpoch.current === saving && current.current.profile.authId === actor && authEpoch.current === sessionEpoch) update(s => ({ ...s, journeyStatus: 'error', journeyError: message }))
          throw new Error(message)
        }
        assertSaving()
        try { await refreshJourney(saved.preference, direction) }
        catch (error) {
          assertSaving()
          const message = `출퇴근 위치와 경로는 저장됐지만 화면을 갱신하지 못했어요. 다시 불러와 주세요. ${error instanceof Error ? error.message : ''}`
          update(s => ({ ...s, journeyStatus: 'error', journeyError: message }))
          throw new Error(message)
        }
      }
      // 등록 화면은 저장까지만 기다리고 홈에서 "만들고 있어요"를 본다 (QA 11/10). 실패는 journeyStatus 로 홈에 표시된다
      if (options.waitForRoutes === false) { void buildRoutes().catch(() => undefined); return }
      await buildRoutes()
    },
    selectRoute: (id: string) => update(s => ({ ...s, selectedId: id })),
    changeDirection: (direction: Direction) => refreshJourney(undefined, direction),
    selectRide: (rideId: string | null) => refreshJourney(undefined, undefined, rideId),
    submitRating: async (routeId: string, rating: number) => {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('별점을 1점부터 5점까지 골라 주세요.')
      const snapshot = current.current
      if (snapshot.dataSource === 'preview') {
        const route = [...(snapshot.routes?.candidates || []), ...(snapshot.routes?.shortest || [])].find(r => r.id === routeId)
        if (!route) throw new Error('평가할 경로를 먼저 선택해 주세요.')
        const old = snapshot.ratings[routeId] ?? 3, weights = { ...(snapshot.tagWeights?.weights || {}) }
        for (const tag of route.tags) weights[tag] = Math.max(-1, Math.min(1, (weights[tag] || 0) + (rating - old) * .1))
        update(s => ({ ...s, ratings: { ...s.ratings, [routeId]: rating }, tagWeights: { weights, hint: null } })); return
      }
      const actor = snapshot.profile.authId
      assertAccount(actor)
      const result = await apiRequest<{ weights: Record<string, number> }>('/feedback', { method: 'POST', body: { route_id: routeId, rating }, expectedUserId: actor })
      assertAccount(actor)
      update(s => ({ ...s, ratings: { ...s.ratings, [routeId]: rating }, tagWeights: { weights: result.weights, hint: s.tagWeights?.hint ?? null } }))
    },
    readTagWeights: async () => {
      const s = current.current
      if (s.dataSource === 'preview' || !s.profile.loggedIn) return s.tagWeights ?? { weights: {}, hint: null }
      const actor = s.profile.authId
      const result = await apiRequest<TagWeights>('/users/me/tag-weights', { expectedUserId: actor }); assertAccount(actor); update(previous => ({ ...previous, tagWeights: result })); return result
    },
    resetTagWeights: async () => {
      if (current.current.dataSource === 'preview') { update(s => ({ ...s, tagWeights: { weights: {}, hint: null } })); return }
      const actor = current.current.profile.authId
      assertAccount(actor)
      const result = await apiRequest<TagWeights>('/users/me/tag-weights', { method: 'DELETE', expectedUserId: actor }); assertAccount(actor); update(s => ({ ...s, tagWeights: result }))
    },
    setProfile: (profile: Partial<Profile>) => update(s => ({ ...s, profile: { ...s.profile, nickname: profile.nickname ?? s.profile.nickname } })),
    setCommute: (commute: Partial<Commute>) => update(s => ({ ...s, commute: { ...s.commute, ...commute } })),
    setAlerts: (alerts: Partial<Alerts>) => update(s => ({ ...s, alerts: { ...s.alerts, ...alerts } })),
    addRecord: (record: Omit<RecordItem, 'id'>) => {
      if (current.current.dataSource !== 'preview') throw new Error('사진 기록은 계정에 저장해 주세요.')
      update(s => ({ ...s, records: [{ ...record, id: Date.now() }, ...s.records] }))
    },
  }), [hydrate, refreshJourney, generateRoutes, update, assertAccount])
  const selectedRoute = useMemo(() => [...(state.routes?.candidates || []), ...(state.routes?.shortest || []), ...(state.card?.candidates || []), ...(state.card?.shortest || [])]
    .find(r => r.id === state.selectedId) ?? (state.selectedId === state.card?.route?.id ? state.card.route : null), [state.routes, state.card, state.selectedId])
  const value = useMemo<Store>(() => ({ ...state, ...actions, isGuest: !state.profile.loggedIn, selectedRoute }), [state, actions, selectedRoute])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useStore(): Store { const value = useContext(Context); if (!value) throw new Error('StoreProvider 안에서만 사용할 수 있어요.'); return value }
