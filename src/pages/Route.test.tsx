import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import type { OneTimeTrip, PlaceLocation, RouteData } from '../lib/types'

const mocks = vi.hoisted(() => ({ store: {} as Record<string, unknown>, navigate: vi.fn(), map: vi.fn(), editor: vi.fn(), walking: vi.fn(),
  apply: vi.fn(), clear: vi.fn(), save: vi.fn(), refresh: vi.fn(), changeDirection: vi.fn(), select: vi.fn(), kakao: vi.fn() }))
vi.mock('../lib/store', () => ({ useStore: () => mocks.store }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../components/ui', () => ({ Header: ({ title }: { title: string }) => <h1>{title}</h1>, HomeIndicator: () => null, Nav: () => null, StatusBar: () => null }))
vi.mock('../components/JourneyMap', () => ({ JourneyMap: (props: unknown) => mocks.map(props) }))
vi.mock('./OneTimeRouteEditor', () => ({ OneTimeRouteEditor: (props: unknown) => mocks.editor(props) }))
vi.mock('../lib/useWalking', () => ({ useWalking: (...args: unknown[]) => mocks.walking(...args) }))
vi.mock('./Home', () => ({ JourneyBadge: () => null, RouteMetrics: () => null, routeImage: () => '/sample-landscape.png' }))
vi.mock('../lib/map', async (importOriginal) => ({ ...await importOriginal<typeof import('../lib/map')>(), buildKakaoDirections: mocks.kakao }))
import { Guide, RouteMap } from './Route'
import { OneTimeRouteEditor } from './OneTimeRouteEditor'

const home: PlaceLocation = { name: '등록한 집', area: '대구 수성구', address: '집 주소', lat: 35.85, lng: 128.6 }
const work: PlaceLocation = { name: '등록한 회사', area: '대구 중구', address: '회사 주소', lat: 35.86, lng: 128.61 }
const original: RouteData = { id: 'original-route', leg_type: 'detour', is_baseline: false, name: '등록 동선의 샛길', minutes: 20, add_minutes: 5,
  green_pct: 50, event_score: 0, score: 1, tags: ['river'], highlights: ['강변 풍경'], polyline: [work, home], spots: ['nature-place'], alight_station_id: null }
const baseline: RouteData = { ...original, id: 'baseline-route', is_baseline: true, name: '등록 동선의 최단 길', add_minutes: 0 }
const walkingTrip: OneTimeTrip = { from: { ...work, name: '오늘의 출발지' }, to: { ...home, name: '오늘의 도착지' }, mode: '도보' }
const transitTrip: OneTimeTrip = { ...walkingTrip, mode: '대중교통', transitPath: { index: 0, summary: '오늘만 이용할 버스', total_minutes: 15, transfers: 0, walk_minutes: 3,
  legs: [{ kind: 'transit', line: '버스 1', start_name: walkingTrip.from.name, end_name: walkingTrip.to.name, minutes: 12,
    stops: [{ ...walkingTrip.from, external_id: 'start' }, { ...walkingTrip.to, external_id: 'end' }] }] } }
interface EditorProps { from?: PlaceLocation; to?: PlaceLocation; mode: string; initialSide: 'from' | 'to'; onApply: (trip: OneTimeTrip) => void; onClose: () => void }
const latestEditor = () => mocks.editor.mock.calls[mocks.editor.mock.calls.length - 1][0] as EditorProps
const latestMap = () => mocks.map.mock.calls[mocks.map.mock.calls.length - 1][0] as { routes?: RouteData[]; selectedId?: string; locations?: PlaceLocation[] }
const text = (node: ReactTestInstance | string): string => typeof node === 'string' ? node : node.children.map(text).join('')

describe('one-time route editing integration', () => {
  let renderer: ReactTestRenderer | undefined
  const fetchGuard = vi.fn(() => { throw new Error('Route component tests must not make external requests') })
  const button = (label: string) => renderer!.root.findAllByType('button').find(node => text(node).includes(label))!
  const rerender = async (guide = false) => { await act(async () => { renderer!.update(guide ? <Guide /> : <RouteMap />) }) }
  const mount = async (guide = false) => { await act(async () => { renderer = create(guide ? <Guide /> : <RouteMap />) }) }
  const edit = async (side: 'from' | 'to') => { await act(async () => { renderer!.root.findByProps({ 'aria-label': side === 'from' ? '출발지 수정' : '도착지 수정' }).props.onClick() }) }
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal('fetch', fetchGuard)
    mocks.map.mockReturnValue(null); mocks.editor.mockReturnValue(null); mocks.kakao.mockReturnValue('https://map.kakao.com/sample')
    mocks.refresh.mockResolvedValue(undefined); mocks.changeDirection.mockResolvedValue(undefined)
    mocks.apply.mockImplementation((trip: OneTimeTrip) => { mocks.store = { ...mocks.store, oneTimeTrip: trip } })
    mocks.clear.mockImplementation(() => { mocks.store = { ...mocks.store, oneTimeTrip: null } })
    mocks.walking.mockReturnValue({ status: 'idle', isActive: false, fix: null, projection: null, totalMeters: 1000, elapsedSeconds: 0, error: '', warning: '', start: vi.fn(), pause: vi.fn(), stop: vi.fn() })
    mocks.store = { profile: { authId: 'account-A', loggedIn: true }, dataSource: 'api', isGuest: false, sessionReady: true,
      commute: { from: home.name, to: work.name, fromPlace: home, toPlace: work, morning: '08:30', evening: '18:10', mode: '도보', preference: 'full', configured: true },
      direction: 'to_home', oneTimeTrip: null, selectedRoute: original, routes: { candidates: [original], shortest: [baseline] }, card: null,
      journeyStatus: 'ready', journeyError: null, refreshJourney: mocks.refresh, changeDirection: mocks.changeDirection, selectRoute: mocks.select,
      applyOneTimeTrip: mocks.apply, clearOneTimeTrip: mocks.clear, saveCommute: mocks.save }
  })
  afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; expect(fetchGuard).not.toHaveBeenCalled(); vi.unstubAllGlobals() })

  it('opens the return-trip editor with work as departure and home as arrival', async () => {
    await mount(); await edit('from')
    expect(latestEditor()).toMatchObject({ from: work, to: home, mode: '도보', initialSide: 'from' })
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('keeps outbound endpoints in their registered order', async () => {
    mocks.store = { ...mocks.store, direction: 'to_work' }
    await mount(); await edit('to')
    expect(latestEditor()).toMatchObject({ from: home, to: work, initialSide: 'to' })
  })

  it('cancels editing without changing the commute, route selection or cards', async () => {
    await mount()
    const commute = structuredClone(mocks.store.commute)
    await edit('to')
    await act(async () => { latestEditor().onClose() })
    expect(renderer!.root.findAllByType(OneTimeRouteEditor)).toHaveLength(0)
    expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.store.commute).toEqual(commute)
    expect(latestMap().routes).toEqual([original, baseline])
    expect(button('이 길로 걷기')).toBeDefined()
  })

  it('applies a one-time trip without saving or regenerating the registered commute', async () => {
    await mount(); await edit('from')
    await act(async () => { latestEditor().onApply(walkingTrip) })
    await rerender()
    expect(mocks.apply).toHaveBeenCalledWith(walkingTrip, 'api:account-A')
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.changeDirection).not.toHaveBeenCalled()
    expect(latestMap().routes || []).toHaveLength(0)
    expect(latestMap().selectedId).toBeUndefined()
    expect(latestMap().locations).toEqual([walkingTrip.from, walkingTrip.to])
    expect(button('이 길로 걷기')).toBeUndefined()
    expect(renderer!.root.findAllByProps({ 'aria-label': '경로 선택' })).toHaveLength(0)
    expect(button('일상 경로로 돌아가기')).toBeDefined()
  })

  it('reopens an active temporary trip using its actual mode and preserves it on cancel', async () => {
    mocks.store = { ...mocks.store, oneTimeTrip: transitTrip }
    await mount(); await edit('to')
    expect(latestEditor()).toMatchObject({ from: transitTrip.from, to: transitTrip.to, mode: '대중교통', initialSide: 'to' })
    await act(async () => { latestEditor().onClose() })
    expect(mocks.store.oneTimeTrip).toEqual(transitTrip)
    expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled()
    expect(latestMap().routes || []).toHaveLength(0)
  })

  it('opens reversed temporary endpoints without changing the registered commute and preserves the trip on cancel', async () => {
    mocks.store = { ...mocks.store, oneTimeTrip: transitTrip }
    await mount()
    await act(async () => { renderer!.root.findByProps({ 'aria-label': '이번 탐색 출발·도착 바꾸기' }).props.onClick() })
    expect(latestEditor()).toMatchObject({ from: transitTrip.to, to: transitTrip.from, mode: '대중교통', initialSide: 'from' })
    expect(mocks.changeDirection).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled()
    await act(async () => { latestEditor().onClose() })
    expect(renderer!.root.findAllByType(OneTimeRouteEditor)).toHaveLength(0)
    expect(mocks.store.oneTimeTrip).toEqual(transitTrip)
    expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled()
    expect(mocks.changeDirection).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled()
  })

  it('returns to the original route cards when one-time exploration is cleared', async () => {
    mocks.store = { ...mocks.store, oneTimeTrip: walkingTrip }
    await mount()
    await act(async () => { button('일상 경로로 돌아가기').props.onClick() })
    await rerender()
    expect(mocks.clear).toHaveBeenCalledTimes(1)
    expect(latestMap().routes).toEqual([original, baseline])
    expect(button('이 길로 걷기')).toBeDefined()
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('removes an open editor after switching account identity', async () => {
    await mount(); await edit('from')
    expect(renderer!.root.findAllByType(OneTimeRouteEditor)).toHaveLength(1)
    mocks.store = { ...mocks.store, profile: { authId: 'account-B', loggedIn: true } }
    await rerender()
    expect(renderer!.root.findAllByType(OneTimeRouteEditor)).toHaveLength(0)
    expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled()
  })

  it('never feeds an original walking route to Guide while a temporary trip is active', async () => {
    mocks.store = { ...mocks.store, oneTimeTrip: walkingTrip }
    await mount(true)
    expect(mocks.walking.mock.calls[mocks.walking.mock.calls.length - 1][0]).toBeNull()
    expect(button('이 샛길 걷기 시작')).toBeUndefined()
    expect(renderer!.root.findAllByProps({ 'aria-label': '샛길 진행률' })).toHaveLength(0)
    expect(mocks.map.mock.calls.every(([props]) => !(props as { routes?: RouteData[] }).routes?.length)).toBe(true)
    expect(mocks.walking.mock.results[mocks.walking.mock.results.length - 1].value.start).not.toHaveBeenCalled()
  })
})
