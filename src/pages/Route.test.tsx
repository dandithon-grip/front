import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import type { Commute, Direction, Mode, PlaceLocation, RouteData, TransitPath } from '../lib/types'

const mocks = vi.hoisted(() => ({ store: {} as Record<string, unknown>, navigate: vi.fn(), map: vi.fn(), editor: vi.fn(), walking: vi.fn(),
  save: vi.fn(), refresh: vi.fn(), changeDirection: vi.fn(), select: vi.fn(), kakao: vi.fn() }))
vi.mock('../lib/store', () => ({ useStore: () => mocks.store }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../components/ui', () => ({ Header: ({ title }: { title: string }) => <h1>{title}</h1>, HomeIndicator: () => null, Nav: () => null, StatusBar: () => null }))
vi.mock('../components/JourneyMap', () => ({ JourneyMap: (props: unknown) => mocks.map(props) }))
vi.mock('./RouteEndpointEditor', () => ({ RouteEndpointEditor: (props: unknown) => mocks.editor(props) }))
vi.mock('../lib/useWalking', () => ({ useWalking: (...args: unknown[]) => mocks.walking(...args) }))
vi.mock('./Home', () => ({ JourneyBadge: () => null, RouteMetrics: () => null, routeImage: () => '/sample-landscape.png' }))
vi.mock('../lib/map', async (importOriginal) => ({ ...await importOriginal<typeof import('../lib/map')>(), buildKakaoDirections: mocks.kakao }))
import { Guide, RouteMap } from './Route'
import { RouteEndpointEditor } from './RouteEndpointEditor'

const home: PlaceLocation = { name: '등록한 집', area: '대구 수성구', address: '집 주소', lat: 35.85, lng: 128.6 }
const work: PlaceLocation = { name: '등록한 회사', area: '대구 중구', address: '회사 주소', lat: 35.86, lng: 128.61 }
const nextHome: PlaceLocation = { name: '변경한 집', area: '대구 동구', address: '새 집 주소', lat: 35.87, lng: 128.62 }
const nextWork: PlaceLocation = { name: '변경한 회사', area: '대구 북구', address: '새 회사 주소', lat: 35.88, lng: 128.63 }
const registeredCommute: Commute = { from: home.name, to: work.name, fromPlace: home, toPlace: work,
  morning: '08:30', evening: '18:10', mode: '도보', preference: 'sunset', configured: true }
const original: RouteData = { id: 'original-route', leg_type: 'detour', is_baseline: false, name: '등록 동선의 샛길', minutes: 20, add_minutes: 5,
  green_pct: 50, event_score: 0, score: 1, tags: ['river'], highlights: ['강변 풍경'], polyline: [work, home], spots: ['nature-place'], alight_station_id: null }
const baseline: RouteData = { ...original, id: 'baseline-route', is_baseline: true, name: '등록 동선의 최단 길', add_minutes: 0 }
const canonicalTransitPath: TransitPath = { index: 0, summary: '새 집에서 새 회사까지 버스', total_minutes: 15, transfers: 0, walk_minutes: 3,
  legs: [{ kind: 'walk', line: null, start_name: nextHome.name, end_name: '집 앞 정류장', minutes: 3, stops: [] },
    { kind: 'bus', line: '버스 1', start_name: '집 앞 정류장', end_name: '회사 앞 정류장', minutes: 12,
      stops: [{ ...nextHome, external_id: 'home-stop' }, { ...nextWork, external_id: 'work-stop' }] }] }
interface EndpointDraft { from: PlaceLocation; to: PlaceLocation; mode: Mode; transitPaths?: TransitPath[] }
interface EditorProps { from?: PlaceLocation; to?: PlaceLocation; mode: Mode; direction: Direction; initialSide: 'from' | 'to';
  onSave: (draft: EndpointDraft) => Promise<void>; onClose: () => void; onLogin: () => void }
const latestEditor = () => mocks.editor.mock.calls[mocks.editor.mock.calls.length - 1][0] as EditorProps
const latestMap = () => mocks.map.mock.calls[mocks.map.mock.calls.length - 1][0] as { routes?: RouteData[]; selectedId?: string }
const text = (node: ReactTestInstance | string): string => typeof node === 'string' ? node : node.children.map(text).join('')
const deferred = () => {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const returnDraft: EndpointDraft = { from: nextWork, to: nextHome, mode: '도보' }

describe('saved route endpoint editing integration', () => {
  let renderer: ReactTestRenderer | undefined
  const fetchGuard = vi.fn(() => { throw new Error('Route component tests must not make external requests') })
  const button = (label: string) => renderer!.root.findAllByType('button').find(node => text(node).includes(label))!
  const rerender = async () => { await act(async () => { renderer!.update(<RouteMap />) }) }
  const mount = async (guide = false) => { await act(async () => { renderer = create(guide ? <Guide /> : <RouteMap />) }) }
  const edit = async (side: 'from' | 'to') => { await act(async () => { renderer!.root.findByProps({ 'aria-label': side === 'from' ? '출발지 수정' : '도착지 수정' }).props.onClick() }) }
  const dialogs = () => renderer!.root.findAllByType(RouteEndpointEditor)
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal('fetch', fetchGuard)
    mocks.map.mockReturnValue(null); mocks.editor.mockReturnValue(null); mocks.kakao.mockReturnValue('https://map.kakao.com/sample')
    mocks.save.mockResolvedValue(undefined); mocks.refresh.mockResolvedValue(undefined); mocks.changeDirection.mockResolvedValue(undefined)
    mocks.walking.mockReturnValue({ status: 'idle', isActive: false, fix: null, projection: null, totalMeters: 1000, elapsedSeconds: 0,
      error: '', warning: '', start: vi.fn(), pause: vi.fn(), stop: vi.fn() })
    mocks.store = { profile: { authId: 'account-A', loggedIn: true }, dataSource: 'api', isGuest: false, sessionReady: true,
      commute: structuredClone(registeredCommute), direction: 'to_home', selectedRoute: original,
      routes: { candidates: [original], shortest: [baseline] }, card: null, journeyStatus: 'ready', journeyError: null,
      refreshJourney: mocks.refresh, changeDirection: mocks.changeDirection, selectRoute: mocks.select, saveCommute: mocks.save }
  })
  afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; expect(fetchGuard).not.toHaveBeenCalled(); vi.unstubAllGlobals() })

  it('opens return-trip editing in displayed work-to-home order', async () => {
    await mount(); await edit('from')
    expect(latestEditor()).toMatchObject({ from: work, to: home, mode: '도보', direction: 'to_home', initialSide: 'from' })
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('opens outbound editing in the registered home-to-work order', async () => {
    mocks.store = { ...mocks.store, direction: 'to_work' }
    await mount(); await edit('to')
    expect(latestEditor()).toMatchObject({ from: home, to: work, direction: 'to_work', initialSide: 'to' })
  })

  it('cancels without saving, regenerating or changing the existing route cards', async () => {
    await mount(); await edit('to')
    await act(async () => { latestEditor().onClose() })
    expect(dialogs()).toHaveLength(0)
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.store.commute).toEqual(registeredCommute)
    expect(latestMap().routes).toEqual([original, baseline])
    expect(button('이 길로 걷기')).toBeDefined()
  })

  it('saves edited return-trip coordinates in canonical home-to-work order and preserves times and preference', async () => {
    await mount(); await edit('to')
    await act(async () => { await latestEditor().onSave(returnDraft) })
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ ...registeredCommute,
      from: nextHome.name, to: nextWork.name, fromPlace: nextHome, toPlace: nextWork }), { direction: 'to_home', expectedUserId: 'account-A' })
    expect(dialogs()).toHaveLength(0)
    expect(mocks.changeDirection).not.toHaveBeenCalled()
  })

  it('saves outbound endpoints without reversing their coordinates', async () => {
    mocks.store = { ...mocks.store, direction: 'to_work' }
    await mount(); await edit('from')
    await act(async () => { await latestEditor().onSave({ from: nextHome, to: nextWork, mode: '자동차' }) })
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ from: nextHome.name, to: nextWork.name,
      fromPlace: nextHome, toPlace: nextWork, mode: '자동차', morning: '08:30', evening: '18:10', preference: 'sunset' }),
    { direction: 'to_work', expectedUserId: 'account-A' })
  })

  it('passes the canonical transit stop order through when editing the return trip', async () => {
    await mount(); await edit('from')
    await act(async () => { await latestEditor().onSave({ ...returnDraft, mode: '대중교통', transitPaths: [canonicalTransitPath] }) })
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ fromPlace: nextHome, toPlace: nextWork, mode: '대중교통',
      transitLegs: [{ line: '버스 1', stops: canonicalTransitPath.legs[1].stops }] }), { direction: 'to_home', expectedUserId: 'account-A' })
  })

  it('keeps the editor mounted until saving and regeneration have completed', async () => {
    const saving = deferred(); mocks.save.mockReturnValue(saving.promise)
    await mount(); await edit('from')
    let submitted!: Promise<void>
    await act(async () => { submitted = latestEditor().onSave(returnDraft) })
    expect(dialogs()).toHaveLength(1)
    await act(async () => { saving.resolve(); await submitted })
    expect(dialogs()).toHaveLength(0)
  })

  it('propagates a failed save to the editor and leaves it open for retry', async () => {
    const failure = new Error('경로를 다시 만들지 못했어요. 다시 시도해 주세요.')
    mocks.save.mockRejectedValue(failure)
    await mount(); await edit('to')
    await act(async () => { await expect(latestEditor().onSave(returnDraft)).rejects.toBe(failure) })
    expect(dialogs()).toHaveLength(1)
    expect(mocks.store.commute).toEqual(registeredCommute)
  })

  it.each([{ source: 'api', guest: true }, { source: 'preview', guest: false }])('blocks parent-side saving in $source guest=$guest and offers login', async ({ source, guest }) => {
    mocks.store = { ...mocks.store, dataSource: source, isGuest: guest,
      profile: { authId: guest ? undefined : 'account-A', loggedIn: !guest } }
    await mount(); await edit('from')
    await act(async () => { await expect(latestEditor().onSave(returnDraft)).rejects.toThrow('로그인 후') })
    expect(mocks.save).not.toHaveBeenCalled(); expect(dialogs()).toHaveLength(1)
    await act(async () => { latestEditor().onLogin() })
    expect(mocks.navigate).toHaveBeenCalledWith('/login', { state: { from: '/route' } })
  })

  it('removes the editor after switching account and blocks its stale save callback', async () => {
    await mount(); await edit('from')
    const staleEditor = latestEditor()
    mocks.store = { ...mocks.store, profile: { authId: 'account-B', loggedIn: true } }
    await rerender()
    expect(dialogs()).toHaveLength(0)
    await act(async () => { await expect(staleEditor.onSave(returnDraft)).rejects.toBeInstanceOf(Error) })
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('does not let a previous account save completion close the new account editor', async () => {
    const saving = deferred(); mocks.save.mockReturnValue(saving.promise)
    await mount(); await edit('from')
    let submitted!: Promise<void | unknown>
    await act(async () => { submitted = latestEditor().onSave(returnDraft).catch(error => error) })
    mocks.store = { ...mocks.store, profile: { authId: 'account-B', loggedIn: true } }
    await rerender(); await edit('to')
    await act(async () => { saving.resolve(); await submitted })
    expect(dialogs()).toHaveLength(1)
    expect(latestEditor()).toMatchObject({ from: work, to: home, initialSide: 'to' })
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.save.mock.calls[0][1]).toEqual({ direction: 'to_home', expectedUserId: 'account-A' })
  })

  it('invalidates editing after the displayed commute direction changes', async () => {
    await mount(); await edit('from')
    const staleEditor = latestEditor()
    mocks.store = { ...mocks.store, direction: 'to_work' }
    await rerender()
    expect(dialogs()).toHaveLength(0)
    await act(async () => { await expect(staleEditor.onSave(returnDraft)).rejects.toBeInstanceOf(Error) })
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('keeps Guide connected to the saved selected route', async () => {
    await mount(true)
    expect(mocks.walking.mock.calls[mocks.walking.mock.calls.length - 1][0]).toBe(original)
    expect(button('이 샛길 걷기 시작')).toBeDefined()
  })
})
