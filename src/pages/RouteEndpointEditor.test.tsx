import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceLocation, TransitPath } from '../lib/types'

const mocks = vi.hoisted(() => ({ search: vi.fn(), places: vi.fn(), save: vi.fn(), close: vi.fn(), login: vi.fn(), directStoreSave: vi.fn(), store: {} as Record<string, unknown> }))
vi.mock('../lib/api', () => ({ searchTransitRoutes: mocks.search, getStations: vi.fn(), searchPlaces: mocks.places }))
vi.mock('../lib/store', () => ({ useStore: () => mocks.store }))
vi.mock('../components/JourneyMap', () => ({ JourneyMap: () => null }))
vi.mock('./Setup', async (importOriginal) => {
  const original = await importOriginal<typeof import('./Setup')>()
  return { validPlace: original.validPlace, PlacePicker: function PlacePickerMock() { return <div /> } }
})
import { RouteEndpointEditor, type RouteEndpointEditorProps } from './RouteEndpointEditor'
import { PlacePicker } from './Setup'

const from: PlaceLocation = { name: '처음 출발역', area: '대구', address: '출발 주소', lat: 35.85, lng: 128.6 }
const to: PlaceLocation = { name: '처음 도착역', area: '대구', address: '도착 주소', lat: 35.86, lng: 128.61 }
const nextFrom: PlaceLocation = { name: '바꾼 출발역', area: '대구', address: '다른 주소', lat: 35.87, lng: 128.62 }
const path = (summary = '선택할 경로'): TransitPath => ({ index: 0, summary, total_minutes: 20, transfers: 0, walk_minutes: 3,
  legs: [{ kind: 'subway', line: '대구 2호선', start_name: from.name, end_name: to.name, minutes: 17,
    stops: [{ ...from, external_id: '10' }, { ...to, external_id: '11' }] }] })
function deferred<T = TransitPath[]>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : text(child)).join('')

describe('persistent route endpoint editing', () => {
  let renderer: ReactTestRenderer | undefined, props: RouteEndpointEditorProps
  let modal: { open: boolean; showModal: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
  const previousFocus = { isConnected: true, focus: vi.fn() }, headingFocus = vi.fn()
  const button = (label: string) => renderer!.root.findAllByType('button').find(node => text(node) === label)!
  const contents = () => JSON.stringify(renderer!.toJSON())
  const click = async (label: string) => { await act(async () => { button(label).props.onClick() }) }
  const chooseMode = async (mode: string) => { await act(async () => { renderer!.root.findAllByType('input').find(node => node.props.value === mode)!.props.onChange() }) }
  const choosePath = async (summary = '선택할 경로') => { await act(async () => renderer!.root.findByProps({ 'aria-label': `${summary} 선택` }).props.onChange()) }
  const mount = async (changes: Partial<RouteEndpointEditorProps> = {}) => {
    props = { ...props, ...changes }
    await act(async () => { renderer = create(<RouteEndpointEditor {...props} />, {
      createNodeMock: element => element.type === 'dialog' ? modal : element.type === 'h2' ? { focus: headingFocus } : null,
    }) })
  }
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.store = { dataSource: 'api', profile: { authId: 'account-A', loggedIn: true }, isGuest: false, saveCommute: mocks.directStoreSave }
    mocks.save.mockResolvedValue(undefined)
    props = { from, to, mode: '대중교통', initialSide: 'from', direction: 'to_work', onSave: mocks.save, onClose: mocks.close, onLogin: mocks.login }
    modal = { open: false, showModal: vi.fn(() => { modal.open = true }), close: vi.fn(() => { modal.open = false }) }
    vi.stubGlobal('document', { activeElement: previousFocus, getElementById: vi.fn() })
  })
  afterEach(async () => {
    if (renderer) await act(async () => renderer!.unmount())
    renderer = undefined
    expect(mocks.directStoreSave).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('aborts a pending lookup on cancel and ignores its late result', async () => {
    const response = deferred(); mocks.search.mockReturnValueOnce(response.promise)
    await mount(); await click('대중교통 후보 찾기')
    const options = mocks.search.mock.calls[0][2]
    expect(options.expectedUserId).toBe('account-A')
    await click('취소')
    expect(options.signal.aborted).toBe(true)
    expect(mocks.close).toHaveBeenCalledTimes(1)
    await act(async () => { response.resolve([path('취소된 결과')]); await response.promise })
    expect(contents()).not.toContain('취소된 결과')
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('keeps the new lookup active when an invalidated old response finishes', async () => {
    const old = deferred(), latest = deferred()
    mocks.search.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    await mount(); await click('대중교통 후보 찾기')
    const oldSignal = mocks.search.mock.calls[0][2].signal as AbortSignal
    await act(async () => renderer!.root.findByType(PlacePicker).props.onChange(nextFrom))
    expect(oldSignal.aborted).toBe(true)
    await click('대중교통 후보 찾기')
    expect(mocks.search).toHaveBeenLastCalledWith(nextFrom, to, expect.objectContaining({ expectedUserId: 'account-A' }))
    await act(async () => { old.resolve([path('이전 후보')]); await old.promise })
    expect(contents()).not.toContain('이전 후보')
    expect(button('대중교통 후보 찾는 중…').props.disabled).toBe(true)
    await act(async () => { latest.resolve([path('새 후보')]); await latest.promise })
    expect(contents()).toContain('새 후보')
  })

  it('saves the displayed endpoints and full selected candidate through the parent callback', async () => {
    const candidate = path(); mocks.search.mockResolvedValueOnce([candidate])
    await mount(); await click('대중교통 후보 찾기')
    expect(button('위치 저장하고 경로 보기').props.disabled).toBe(true)
    await choosePath()
    expect(button('위치 저장하고 경로 보기').props.disabled).toBe(false)
    await click('위치 저장하고 경로 보기')
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ from, to, mode: '대중교통', transitPaths: [candidate] })
  })

  it('lets the person keep up to three usual routes and saves all of them (server#88)', async () => {
    const first = path('첫 노선'), second = { ...path('둘째 노선'), index: 1 }, third = { ...path('셋째 노선'), index: 2 }, fourth = { ...path('넷째 노선'), index: 3 }
    mocks.search.mockResolvedValueOnce([first, second, third, fourth])
    await mount(); await click('대중교통 후보 찾기')
    // 가장 빠른 첫 후보는 기본 선택
    expect(renderer!.root.findByProps({ 'aria-label': '첫 노선 선택' }).props.checked).toBe(true)
    await choosePath('둘째 노선'); await choosePath('셋째 노선')
    expect(renderer!.root.findByProps({ 'aria-label': '넷째 노선 선택' }).props.disabled).toBe(true)
    await click('위치 저장하고 경로 보기')
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ from, to, mode: '대중교통', transitPaths: [first, second, third] })
  })

  it('queries the canonical home-to-work endpoints on a return-commute screen without reversing the display draft', async () => {
    mocks.search.mockResolvedValueOnce([path()])
    await mount({ direction: 'to_home' }); await click('대중교통 후보 찾기')
    expect(mocks.search).toHaveBeenCalledWith(to, from, expect.objectContaining({ expectedUserId: 'account-A' }))
    expect(renderer!.root.findByType(PlacePicker).props.value).toEqual(from)
    expect(contents()).toContain('저장을 위한 출근 경로')
    expect(text(renderer!.root.findByProps({ className: 'route-endpoint-canonical' }))).toContain(`${to.name} → ${from.name}`)
    await choosePath(); await click('위치 저장하고 경로 보기')
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ from, to }))
  })

  it('invalidates transit selection after swapping or changing transport mode', async () => {
    mocks.search.mockResolvedValueOnce([path()])
    await mount(); await click('대중교통 후보 찾기'); await choosePath()
    const firstPicker = renderer!.root.findByType(PlacePicker)
    await act(async () => renderer!.root.findByProps({ 'aria-label': '출퇴근 출발지와 도착지 바꾸기' }).props.onClick())
    expect(renderer!.root.findByType(PlacePicker)).not.toBe(firstPicker)
    expect(renderer!.root.findByType(PlacePicker).props.value).toEqual(to)
    expect(contents()).not.toContain('선택할 경로')
    expect(button('위치 저장하고 경로 보기').props.disabled).toBe(true)
    await chooseMode('도보')
    expect(button('위치 저장하고 경로 보기').props.disabled).toBe(false)
    await chooseMode('대중교통')
    expect(button('위치 저장하고 경로 보기').props.disabled).toBe(true)
  })

  it.each(['preview', 'guest'])('allows real location selection but prevents saving and transit requests for %s', async source => {
    mocks.store = source === 'preview' ? { ...mocks.store, dataSource: 'preview' } : { ...mocks.store, isGuest: true, profile: { loggedIn: false } }
    await mount({ mode: '도보' })
    expect(text(renderer!.root.findByProps({ className: 'route-endpoint-header' }))).toContain(`${source === 'preview' ? '미리보기' : '둘러보기'} · 실제 경로 저장은 로그인 후`)
    expect(renderer!.root.findByType(PlacePicker).props.realSearch).toBe(true)
    await act(async () => renderer!.root.findByType(PlacePicker).props.onChange(nextFrom))
    expect(renderer!.root.findByType(PlacePicker).props.value).toEqual(nextFrom)
    expect(button('위치 저장하고 경로 보기').props.disabled).toBe(true)
    await click('위치 저장하고 경로 보기')
    expect(mocks.save).not.toHaveBeenCalled()
    await chooseMode('대중교통'); await click('대중교통 후보 찾기')
    expect(mocks.search).not.toHaveBeenCalled()
    await click('로그인하고 저장하기')
    expect(mocks.login).toHaveBeenCalledTimes(1)
    if (source === 'preview') expect(contents()).toContain('실제 경로 저장은 로그인 후')
  })

  it('supports car endpoint saving without sending stale transit information', async () => {
    await mount({ mode: '자동차' })
    expect(button('위치 저장하고 경로 보기').props.disabled).toBe(false)
    await click('위치 저장하고 경로 보기')
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ from, to, mode: '자동차' })
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it('awaits saving, blocks duplicate writes and closing, and lets the parent close only after success', async () => {
    const saved = deferred<void>()
    mocks.save.mockImplementationOnce(async () => { await saved.promise; mocks.close() })
    await mount({ mode: '도보' })
    await act(async () => { const save = button('위치 저장하고 경로 보기').props.onClick; save(); save() })
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(modal.open).toBe(true)
    expect(renderer!.root.findByProps({ className: 'route-endpoint-fields' }).props.disabled).toBe(true)
    expect(button('취소').props.disabled).toBe(true)
    await click('취소')
    await act(async () => renderer!.root.findByType('dialog').props.onCancel({ preventDefault: vi.fn() }))
    expect(mocks.close).not.toHaveBeenCalled()
    await act(async () => renderer!.root.findByType(PlacePicker).props.onChange(nextFrom))
    expect(renderer!.root.findByType(PlacePicker).props.value).toEqual(from)
    await act(async () => { saved.resolve(undefined); await saved.promise })
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('keeps the draft on an asynchronous save failure and allows retry', async () => {
    mocks.save.mockRejectedValueOnce(new Error('동선은 저장됐지만 샛길을 만들지 못했어요. 다시 시도해 주세요.')).mockResolvedValueOnce(undefined)
    await mount({ mode: '도보' }); await click('위치 저장하고 경로 보기')
    expect(contents()).toContain('동선은 저장됐지만 샛길을 만들지 못했어요')
    expect(renderer!.root.findByType(PlacePicker).props.value).toEqual(from)
    expect(button('취소').props.disabled).toBe(false)
    expect(mocks.close).not.toHaveBeenCalled()
    await click('위치 저장하고 경로 보기')
    expect(mocks.save).toHaveBeenCalledTimes(2)
  })

  it.each(['account', 'source'])('closes and aborts a lookup when the %s changes', async changed => {
    const response = deferred(); mocks.search.mockReturnValueOnce(response.promise)
    await mount(); await click('대중교통 후보 찾기')
    const signal = mocks.search.mock.calls[0][2].signal as AbortSignal
    mocks.store = changed === 'account' ? { ...mocks.store, profile: { authId: 'account-B', loggedIn: true } } : { ...mocks.store, dataSource: 'preview' }
    await act(async () => renderer!.update(<RouteEndpointEditor {...props} />))
    expect(signal.aborted).toBe(true)
    expect(mocks.close).toHaveBeenCalledTimes(1)
    await act(async () => { response.resolve([path('다른 세션의 결과')]); await response.promise })
    expect(contents()).not.toContain('다른 세션의 결과')
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('handles Escape cancellation before saving and returns focus on unmount', async () => {
    await mount({ mode: '도보' })
    expect(modal.showModal).toHaveBeenCalledTimes(1)
    expect(headingFocus).toHaveBeenCalledWith({ preventScroll: true })
    const preventDefault = vi.fn()
    await act(async () => renderer!.root.findByType('dialog').props.onCancel({ preventDefault }))
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
    await act(async () => { renderer!.unmount(); renderer = undefined })
    expect(previousFocus.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('aborts an active lookup on unmount', async () => {
    const response = deferred(); mocks.search.mockReturnValueOnce(response.promise)
    await mount(); await click('대중교통 후보 찾기')
    const signal = mocks.search.mock.calls[0][2].signal as AbortSignal
    await act(async () => { renderer!.unmount(); renderer = undefined })
    expect(signal.aborted).toBe(true)
    await act(async () => { response.resolve([path()]); await response.promise })
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('rejects endpoints at the same location including tiny coordinate differences', async () => {
    await mount({ mode: '도보', to: { ...from, name: '같은 위치', lat: from.lat + .0000005 } })
    expect(button('위치 저장하고 경로 보기').props.disabled).toBe(true)
    await click('위치 저장하고 경로 보기')
    expect(mocks.save).not.toHaveBeenCalled()
    expect(contents()).toContain('서로 다르게')
  })

  it('keeps the dialog open after a transit failure and permits a successful retry', async () => {
    mocks.search.mockRejectedValueOnce(new Error('대중교통 연결을 확인한 뒤 다시 검색해 주세요.')).mockResolvedValueOnce([path('재검색한 후보')])
    await mount(); await click('대중교통 후보 찾기')
    expect(modal.open).toBe(true)
    expect(contents()).toContain('대중교통 연결을 확인한 뒤 다시 검색해 주세요.')
    expect(button('위치 저장하고 경로 보기').props.disabled).toBe(true)
    expect(button('대중교통 후보 찾기').props.disabled).toBe(false)
    await click('대중교통 후보 찾기'); await choosePath('재검색한 후보')
    expect(mocks.search).toHaveBeenCalledTimes(2)
    expect(button('위치 저장하고 경로 보기').props.disabled).toBe(false)
  })

  it('uses real public place search instead of preview fixtures when realSearch is requested', async () => {
    const { PlacePicker: RealPicker } = await vi.importActual<typeof import('./Setup')>('./Setup')
    mocks.places.mockResolvedValueOnce([nextFrom])
    await act(async () => { renderer = create(<RealPicker label="출발지" preview realSearch onChange={vi.fn()} />) })
    await act(async () => renderer!.root.findByProps({ type: 'search' }).props.onChange({ target: { value: '시청' } }))
    await click('검색')
    expect(mocks.places).toHaveBeenCalledExactlyOnceWith('시청')
    expect(contents()).toContain(nextFrom.name)
    expect(contents()).not.toContain('미리보기 장소입니다')
  })
})
