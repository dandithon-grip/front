import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapDisplay } from '../lib/map'
const provider = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../lib/map', () => ({ createMapDisplay: provider.create }))
import { JourneyMap } from './JourneyMap'

const display = (): MapDisplay => ({ provider: 'openstreetmap', showPosition: vi.fn(), fit: vi.fn(), resize: vi.fn(), destroy: vi.fn() })
const deferred = () => {
  let resolve!: (value: MapDisplay) => void
  const promise = new Promise<MapDisplay>(complete => { resolve = complete })
  return { promise, resolve }
}
describe('map component lifecycle', () => {
  let renderer: ReactTestRenderer | undefined
  const container = { replaceChildren: vi.fn() }
  const createNodeMock = () => container
  beforeEach(() => vi.clearAllMocks())
  afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined })
  it('cancels an old initialization and destroys only its own late map', async () => {
    const first = deferred(), second = deferred(), oldMap = display(), newMap = display()
    provider.create.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await act(async () => { renderer = create(<JourneyMap selectedId="old" />, { createNodeMock }) })
    const oldSignal = provider.create.mock.calls[0][1].signal as AbortSignal
    await act(async () => renderer!.update(<JourneyMap selectedId="new" />))
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
})
