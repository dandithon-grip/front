import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapDisplay } from '../lib/map'
const provider = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../lib/map', () => ({ createMapDisplay: provider.create }))
import { JourneyMap } from './JourneyMap'

const display = (): MapDisplay => ({ provider: 'openstreetmap', showPosition: vi.fn(), fit: vi.fn(), resize: vi.fn(), destroy: vi.fn(), update: vi.fn() })
const deferred = () => {
  let resolve!: (value: MapDisplay) => void
  const promise = new Promise<MapDisplay>(complete => { resolve = complete })
  return { promise, resolve }
}
describe('map component lifecycle', () => {
  let renderer: ReactTestRenderer | undefined
  const container = { replaceChildren: vi.fn() }
  const createNodeMock = () => container
  beforeEach(() => vi.resetAllMocks())
  afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined })
  it('cancels an old initialization and destroys only its own late map when pick mode changes', async () => {
    // 보여줄 내용(routes·locations·selectedId)이 바뀌면 지도를 다시 만들지 않는다. 지도 탭 선택 모드가 켜지고 꺼질 때만 다시 만든다
    const first = deferred(), second = deferred(), oldMap = display(), newMap = display()
    provider.create.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await act(async () => { renderer = create(<JourneyMap selectedId="old" />, { createNodeMock }) })
    const oldSignal = provider.create.mock.calls[0][1].signal as AbortSignal
    await act(async () => renderer!.update(<JourneyMap selectedId="new" onPick={() => undefined} />))
    expect(oldSignal.aborted).toBe(true)
    await act(async () => { second.resolve(newMap); await second.promise })
    await act(async () => { first.resolve(oldMap); await first.promise })
    expect(oldMap.destroy).toHaveBeenCalledTimes(1)
    expect(newMap.destroy).not.toHaveBeenCalled()
    await act(async () => { renderer!.unmount(); renderer = undefined })
    expect(newMap.destroy).toHaveBeenCalledTimes(1)
  })
  it('updates GPS position and following without rebuilding the route map', async () => {
    const map = display()
    provider.create.mockResolvedValueOnce(map)
    await act(async () => { renderer = create(<JourneyMap />, { createNodeMock }) })
    const position = { lat: 35.85, lng: 128.6, accuracy: 9, timestamp: Date.now() }
    await act(async () => renderer!.update(<JourneyMap position={position} follow />))
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect(map.showPosition).toHaveBeenLastCalledWith(position, true, true)
    await act(async () => renderer!.update(<JourneyMap position={position} follow={false} overviewKey={1} />))
    expect(map.fit).toHaveBeenCalledTimes(1)
  })
  it('updates routes and locations in place instead of rebuilding the map', async () => {
    const map = display()
    provider.create.mockResolvedValueOnce(map)
    const home = { name: '집', area: '대구', address: '', lat: 35.85, lng: 128.6 }
    await act(async () => { renderer = create(<JourneyMap locations={[]} />, { createNodeMock }) })
    await act(async () => renderer!.update(<JourneyMap locations={[home]} pickable={home} />))
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect(map.destroy).not.toHaveBeenCalled()
    expect(map.update).toHaveBeenLastCalledWith({ routes: [], locations: [home], selectedId: undefined, pickable: home, suggestions: [] })
  })
  it('applies props that changed while the map was still loading', async () => {
    const pending = deferred(), map = display()
    provider.create.mockReturnValueOnce(pending.promise)
    const home = { name: '집', area: '대구', address: '', lat: 35.85, lng: 128.6 }
    await act(async () => { renderer = create(<JourneyMap locations={[]} />, { createNodeMock }) })
    await act(async () => renderer!.update(<JourneyMap locations={[home]} />))
    await act(async () => { pending.resolve(map); await pending.promise })
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect(map.update).toHaveBeenCalledWith(expect.objectContaining({ locations: [home] }))
  })
})
