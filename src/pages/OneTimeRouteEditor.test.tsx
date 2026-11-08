import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceLocation, TransitPath } from '../lib/types'

const mocks = vi.hoisted(() => ({ search: vi.fn(), save: vi.fn(), apply: vi.fn(), close: vi.fn(), store: {} as Record<string, unknown> }))
vi.mock('../lib/api', () => ({ searchTransitRoutes: mocks.search, getStations: vi.fn(), searchPlaces: vi.fn() }))
vi.mock('../lib/store', () => ({ useStore: () => mocks.store }))
vi.mock('./Setup', async (importOriginal) => {
  const original = await importOriginal<typeof import('./Setup')>()
  return { validPlace: original.validPlace, PlacePicker: function PlacePickerMock() { return <div /> } }
})
import { OneTimeRouteEditor, type OneTimeRouteEditorProps } from './OneTimeRouteEditor'
import { PlacePicker } from './Setup'

const from: PlaceLocation = { name: '처음 출발역', area: '대구', address: '출발 주소', lat: 35.85, lng: 128.6 }
const to: PlaceLocation = { name: '처음 도착역', area: '대구', address: '도착 주소', lat: 35.86, lng: 128.61 }
const nextFrom: PlaceLocation = { name: '바꾼 출발역', area: '대구', address: '다른 주소', lat: 35.87, lng: 128.62 }
const path = (summary = '선택할 경로'): TransitPath => ({ index: 0, summary, total_minutes: 20, transfers: 0, walk_minutes: 3,
  legs: [{ kind: 'subway', line: '대구 2호선', start_name: from.name, end_name: to.name, minutes: 17,
    stops: [{ ...from, external_id: '10' }, { ...to, external_id: '11' }] }] })
function deferred() {
  let resolve!: (value: TransitPath[]) => void
  const promise = new Promise<TransitPath[]>(complete => { resolve = complete })
  return { promise, resolve }
}
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : text(child)).join('')

describe('one-time route editing without permanent commute changes', () => {
  let renderer: ReactTestRenderer | undefined, props: OneTimeRouteEditorProps
  let modal: { open: boolean; showModal: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
  const previousFocus = { isConnected: true, focus: vi.fn() }, headingFocus = vi.fn()
  const button = (label: string) => renderer!.root.findAllByType('button').find(node => text(node) === label)!
  const contents = () => JSON.stringify(renderer!.toJSON())
  const click = async (label: string) => { await act(async () => { button(label).props.onClick() }) }
  const chooseMode = async (mode: string) => { await act(async () => { renderer!.root.findAllByType('input').find(node => node.props.value === mode)!.props.onChange() }) }
  const choosePath = async (summary = '선택할 경로') => { await act(async () => renderer!.root.findByProps({ 'aria-label': `${summary} 선택` }).props.onChange()) }
  const mount = async (changes: Partial<OneTimeRouteEditorProps> = {}) => {
    props = { ...props, ...changes }
    await act(async () => { renderer = create(<OneTimeRouteEditor {...props} />, {
      createNodeMock: element => element.type === 'dialog' ? modal : element.type === 'h2' ? { focus: headingFocus } : null,
    }) })
  }
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.store = { dataSource: 'api', profile: { authId: 'account-A', loggedIn: true }, isGuest: false, saveCommute: mocks.save }
    props = { from, to, mode: '대중교통', initialSide: 'from', onApply: mocks.apply, onClose: mocks.close }
    modal = { open: false, showModal: vi.fn(() => { modal.open = true }), close: vi.fn(() => { modal.open = false }) }
    vi.stubGlobal('document', { activeElement: previousFocus, getElementById: vi.fn() })
  })
  afterEach(async () => {
    if (renderer) await act(async () => renderer!.unmount())
    renderer = undefined
    expect(mocks.save).not.toHaveBeenCalled()
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
    expect(mocks.apply).not.toHaveBeenCalled()
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
    expect(contents()).not.toContain('이전 후보')
  })

  it('applies the chosen candidate with its full legs without saving the daily commute', async () => {
    const candidate = path(); mocks.search.mockResolvedValueOnce([candidate])
    await mount(); await click('대중교통 후보 찾기')
    expect(button('이번 탐색에 적용').props.disabled).toBe(true)
    await choosePath()
    expect(button('이번 탐색에 적용').props.disabled).toBe(false)
    await click('이번 탐색에 적용')
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith({ from, to, mode: '대중교통', transitPath: candidate })
  })

  it('invalidates selected transit candidates after swapping endpoints or changing mode', async () => {
    mocks.search.mockResolvedValueOnce([path()])
    await mount(); await click('대중교통 후보 찾기'); await choosePath()
    const firstPicker = renderer!.root.findByType(PlacePicker)
    await act(async () => renderer!.root.findByProps({ 'aria-label': '일회성 출발지와 도착지 바꾸기' }).props.onClick())
    expect(renderer!.root.findByType(PlacePicker)).not.toBe(firstPicker)
    expect(renderer!.root.findByType(PlacePicker).props.value).toEqual(to)
    expect(renderer!.root.findByType(PlacePicker).props.other).toEqual(from)
    expect(contents()).not.toContain('선택할 경로')
    expect(button('이번 탐색에 적용').props.disabled).toBe(true)
    await chooseMode('도보')
    expect(button('이번 탐색에 적용').props.disabled).toBe(false)
    await chooseMode('대중교통')
    expect(button('이번 탐색에 적용').props.disabled).toBe(true)
    expect(mocks.search).toHaveBeenCalledTimes(1)
  })

  it('never queries transit in preview and still allows a one-time walking location edit', async () => {
    mocks.store = { ...mocks.store, dataSource: 'preview', isGuest: true, profile: { loggedIn: false } }
    await mount()
    expect(button('대중교통 후보 찾기').props.disabled).toBe(true)
    await click('대중교통 후보 찾기')
    expect(mocks.search).not.toHaveBeenCalled()
    expect(contents()).toContain('실제 대중교통을 조회하지 않아요')
    await chooseMode('도보'); await click('이번 탐색에 적용')
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith({ from, to, mode: '도보' })
  })

  it('lets a guest apply walking endpoints while requiring login for transit', async () => {
    mocks.store = { ...mocks.store, isGuest: true, profile: { loggedIn: false } }
    await mount()
    expect(button('대중교통 후보 찾기').props.disabled).toBe(true)
    expect(contents()).toContain('대중교통 후보 조회는 로그인 후')
    await chooseMode('도보'); await click('이번 탐색에 적용')
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith({ from, to, mode: '도보' })
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it.each(['account', 'source'])('closes and aborts the lookup when the %s changes', async changed => {
    const response = deferred(); mocks.search.mockReturnValueOnce(response.promise)
    await mount(); await click('대중교통 후보 찾기')
    const signal = mocks.search.mock.calls[0][2].signal as AbortSignal
    mocks.store = changed === 'account' ? { ...mocks.store, profile: { authId: 'account-B', loggedIn: true } } : { ...mocks.store, dataSource: 'preview' }
    await act(async () => renderer!.update(<OneTimeRouteEditor {...props} />))
    expect(signal.aborted).toBe(true)
    expect(mocks.close).toHaveBeenCalledTimes(1)
    await act(async () => { response.resolve([path('다른 세션의 결과')]); await response.promise })
    expect(contents()).not.toContain('다른 세션의 결과')
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it('handles native Escape cancellation and returns focus when the dialog is removed', async () => {
    await mount({ mode: '도보' })
    expect(modal.showModal).toHaveBeenCalledTimes(1)
    expect(headingFocus).toHaveBeenCalledWith({ preventScroll: true })
    const preventDefault = vi.fn()
    await act(async () => renderer!.root.findByType('dialog').props.onCancel({ preventDefault }))
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
    await act(async () => { renderer!.unmount(); renderer = undefined })
    expect(modal.close).toHaveBeenCalledTimes(1)
    expect(previousFocus.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('aborts an active request on unmount', async () => {
    const response = deferred(); mocks.search.mockReturnValueOnce(response.promise)
    await mount(); await click('대중교통 후보 찾기')
    const signal = mocks.search.mock.calls[0][2].signal as AbortSignal
    await act(async () => { renderer!.unmount(); renderer = undefined })
    expect(signal.aborted).toBe(true)
    await act(async () => { response.resolve([path()]); await response.promise })
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it('rejects endpoints at the same location including tiny coordinate differences', async () => {
    await mount({ mode: '도보', to: { ...from, name: '같은 위치의 다른 이름', lat: from.lat + .0000005 } })
    expect(button('이번 탐색에 적용').props.disabled).toBe(true)
    await click('이번 탐색에 적용')
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(contents()).toContain('서로 다르게')
  })

  it('shows an apply validation failure and permits retry instead of leaving the modal locked', async () => {
    mocks.apply.mockImplementationOnce(() => { throw new Error('현재 위치를 다시 선택해 주세요.') })
    await mount({ mode: '도보' }); await click('이번 탐색에 적용')
    expect(contents()).toContain('현재 위치를 다시 선택해 주세요.')
    expect(mocks.close).not.toHaveBeenCalled()
    await click('이번 탐색에 적용')
    expect(mocks.apply).toHaveBeenCalledTimes(2)
  })

  it('keeps the dialog open after a lookup failure and allows a successful retry and selection', async () => {
    mocks.search.mockRejectedValueOnce(new Error('대중교통 연결을 확인한 뒤 다시 검색해 주세요.')).mockResolvedValueOnce([path('재검색한 후보')])
    await mount(); await click('대중교통 후보 찾기')
    expect(modal.open).toBe(true)
    expect(contents()).toContain('대중교통 연결을 확인한 뒤 다시 검색해 주세요.')
    expect(button('이번 탐색에 적용').props.disabled).toBe(true)
    expect(button('대중교통 후보 찾기').props.disabled).toBe(false)
    expect(mocks.close).not.toHaveBeenCalled()
    await click('대중교통 후보 찾기')
    expect(mocks.search).toHaveBeenCalledTimes(2)
    expect(contents()).not.toContain('대중교통 연결을 확인한 뒤 다시 검색해 주세요.')
    await choosePath('재검색한 후보')
    expect(button('이번 탐색에 적용').props.disabled).toBe(false)
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
