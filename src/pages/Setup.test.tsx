import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import type { TransitPath } from '../lib/types'

const mocks = vi.hoisted(() => ({ search: vi.fn(), stations: vi.fn(), places: vi.fn(), navigate: vi.fn(), save: vi.fn(), store: {} as Record<string, unknown> }))
vi.mock('../lib/api', () => ({ searchTransitRoutes: mocks.search, getStations: mocks.stations, searchPlaces: mocks.places }))
vi.mock('../lib/store', () => ({ useStore: () => mocks.store }))
vi.mock('../components/JourneyMap', () => ({ JourneyMap: () => null }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
import { RouteSetup } from './Setup'

const from = { name: '출발역', area: '대구', address: '대구', lat: 35.85, lng: 128.6 }
const to = { name: '도착역', area: '대구', address: '대구', lat: 35.86, lng: 128.61 }
const path = (summary: string): TransitPath => ({ index: 0, summary, total_minutes: 20, transfers: 0, walk_minutes: 2,
  legs: [{ kind: 'transit', line: '2', start_name: from.name, end_name: to.name, minutes: 18, stops: [{ ...from, external_id: 'from' }, { ...to, external_id: 'to' }] }] })
function deferred() {
  let resolve!: (value: TransitPath[]) => void
  const promise = new Promise<TransitPath[]>(complete => { resolve = complete })
  return { promise, resolve }
}

describe('transit selection request lifecycle', () => {
  let renderer: ReactTestRenderer | undefined
  const button = () => renderer!.root.findAllByType('button').find(item => item.props.className === 'flow-button')!
  const advance = async () => { await act(async () => { button().props.onClick() }) }
  const start = async () => {
    await act(async () => { renderer = create(<RouteSetup edit />, { createNodeMock: () => ({ focus: vi.fn() }) }) })
    for (let step = 0; step < 5; step++) await advance()
  }
  const contents = () => JSON.stringify(renderer!.toJSON())
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stations.mockResolvedValue([])
    mocks.store = { profile: { loggedIn: true, authId: 'account-A' }, isGuest: false, dataSource: 'api', saveCommute: mocks.save,
      commute: { from: from.name, to: to.name, fromPlace: from, toPlace: to, morning: '08:30', evening: '18:10', mode: '대중교통', preference: 'full', configured: true } }
  })
  afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined })

  it('aborts the lookup when leaving the setup screen', async () => {
    const response = deferred()
    mocks.search.mockReturnValueOnce(response.promise)
    await start()
    const options = mocks.search.mock.calls[0][2] as { signal: AbortSignal; expectedUserId: string }
    expect(options.expectedUserId).toBe('account-A')
    expect(options.signal.aborted).toBe(false)
    await act(async () => { renderer!.unmount(); renderer = undefined })
    expect(options.signal.aborted).toBe(true)
    await act(async () => { response.resolve([path('늦게 온 결과')]); await response.promise })
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('aborts on account changes and never shows the old account result', async () => {
    const response = deferred()
    mocks.search.mockReturnValueOnce(response.promise)
    await start()
    const signal = mocks.search.mock.calls[0][2].signal as AbortSignal
    mocks.store = { ...mocks.store, profile: { loggedIn: true, authId: 'account-B' } }
    await act(async () => { renderer!.update(<RouteSetup edit />) })
    expect(signal.aborted).toBe(true)
    await act(async () => { response.resolve([path('이전 계정 경로')]); await response.promise })
    expect(contents()).not.toContain('이전 계정 경로')
  })

  it('ignores a cancelled response while a newer lookup remains in progress', async () => {
    const first = deferred(), second = deferred()
    mocks.search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await start()
    const firstSignal = mocks.search.mock.calls[0][2].signal as AbortSignal
    const back = renderer!.root.findByProps({ 'aria-label': '이전 단계' })
    expect(back.props.disabled).toBe(false)
    await act(async () => { back.props.onClick() })
    expect(firstSignal.aborted).toBe(true)
    await advance()
    expect(mocks.search).toHaveBeenCalledTimes(2)
    await act(async () => { first.resolve([path('취소한 경로')]); await first.promise })
    expect(contents()).not.toContain('취소한 경로')
    expect(contents()).toContain('이용 가능한 경로를 찾고 있어요.')
    expect(button().props.disabled).toBe(true)
    await act(async () => { second.resolve([path('새로 찾은 경로')]); await second.promise })
    expect(contents()).toContain('새로 찾은 경로')
    expect(contents()).not.toContain('이용 가능한 경로를 찾고 있어요.')
  })

  it('checks the fastest route by default and registers every checked route (server#88)', async () => {
    const slow = { ...path('느린 노선'), index: 0, total_minutes: 40 }, fast = { ...path('빠른 노선'), index: 1, total_minutes: 20 }
    mocks.search.mockResolvedValueOnce([slow, fast])
    mocks.save.mockResolvedValue(undefined)
    await start()
    const boxes = renderer!.root.findAllByType('input').filter(node => node.props.type === 'checkbox')
    expect(boxes.map(node => [node.props['aria-label'], node.props.checked])).toEqual([['빠른 노선', true], ['느린 노선', false]])
    await act(async () => boxes[1].props.onChange())
    await advance()
    const saved = mocks.save.mock.calls[0][0] as { transitOptions?: unknown[][]; transitLegs?: unknown[] }
    expect(saved.transitOptions).toHaveLength(2)
    expect(saved.transitLegs).toEqual(saved.transitOptions![0])
  })

  it('uses preview data without starting ODsay or station requests', async () => {
    mocks.store = { ...mocks.store, dataSource: 'preview', isGuest: true, profile: { loggedIn: false } }
    await start()
    expect(mocks.search).not.toHaveBeenCalled()
    expect(mocks.stations).not.toHaveBeenCalled()
    expect(contents()).toContain('미리보기 대중교통 경로')
  })

  it('cancels a live lookup when changing into preview mode', async () => {
    const response = deferred()
    mocks.search.mockReturnValueOnce(response.promise)
    await start()
    const signal = mocks.search.mock.calls[0][2].signal as AbortSignal
    mocks.store = { ...mocks.store, dataSource: 'preview' }
    await act(async () => { renderer!.update(<RouteSetup edit />) })
    expect(signal.aborted).toBe(true)
    await act(async () => { response.resolve([path('다른 모드의 늦은 경로')]); await response.promise })
    expect(contents()).not.toContain('다른 모드의 늦은 경로')
  })
})
