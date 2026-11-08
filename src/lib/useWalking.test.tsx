import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { useWalking } from './useWalking'
import { createPreviewJourney, PREVIEW_COMMUTE } from './preview'

const route = { ...createPreviewJourney(PREVIEW_COMMUTE).routes.candidates[0], polyline: [{ lat: 35.85, lng: 128.6 }, { lat: 35.851, lng: 128.6 }, { lat: 35.852, lng: 128.6 }] }
const fix = (lat: number, lng = 128.6, accuracy = 5, timestamp = Date.now()): GeolocationPosition => {
  const coords = { latitude: lat, longitude: lng, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({ latitude: lat, longitude: lng, accuracy }) }
  return { coords, timestamp, toJSON: () => ({ coords: coords.toJSON(), timestamp }) }
}

describe('real GPS walking lifecycle', () => {
  let renderer: ReactTestRenderer | undefined, walking: ReturnType<typeof useWalking>
  let subscriptions: Array<{ success: PositionCallback; error: PositionErrorCallback | undefined }>
  let page: EventTarget & { visibilityState: string }
  const clearWatch = vi.fn()
  const watchPosition = vi.fn((success: PositionCallback, error?: PositionErrorCallback) => { subscriptions.push({ success, error }); return subscriptions.length - 1 })
  function Probe({ selected = route, owner = 'account-A' }: { selected?: typeof route; owner?: string }) { walking = useWalking(selected, owner); return null }
  const emit = async (position: GeolocationPosition, index = subscriptions.length - 1) => { await act(async () => { subscriptions[index].success(position) }) }
  beforeEach(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-08T00:00:00Z')); vi.clearAllMocks(); subscriptions = []
    page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    vi.stubGlobal('document', page); vi.stubGlobal('window', { isSecureContext: true }); vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } })
    await act(async () => { renderer = create(<Probe />) })
  })
  afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })
  it('requests GPS only after start and projects a fresh fix into walking progress', async () => {
    expect(watchPosition).not.toHaveBeenCalled()
    await act(async () => walking!.start())
    expect(walking!.status).toBe('locating')
    expect(watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
    await emit(fix(35.851))
    expect(walking!.status).toBe('walking')
    expect(walking!.projection?.progress).toBeCloseTo(.5, 3)
    expect(walking!.projection!.remainingMeters).toBeGreaterThan(110)
  })
  it('requires two distinct accurate endpoint fixes before arrival and then releases GPS', async () => {
    await act(async () => walking!.start())
    await emit(fix(35.852))
    expect(walking!.status).toBe('walking')
    expect(clearWatch).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    await emit(fix(35.852))
    expect(walking!.status).toBe('arrived')
    expect(clearWatch).toHaveBeenCalledWith(0)
  })
  it('never advances or arrives from inaccurate, old, future or off-route fixes', async () => {
    await act(async () => walking!.start())
    await emit(fix(35.852, 128.6, 100))
    expect(walking!.projection).toBeNull()
    await emit(fix(35.852, 128.6, 5, Date.now() - 20000))
    await emit(fix(35.852, 128.6, 5, Date.now() + 2000))
    expect(walking!.projection).toBeNull()
    await emit(fix(35.852, 128.62))
    expect(walking!.projection).toBeNull()
    expect(walking!.status).not.toBe('arrived')
    expect(walking!.warning).toContain('떨어져')
  })
  it('ignores a sudden implausible GPS jump to the destination', async () => {
    await act(async () => walking!.start())
    await emit(fix(35.85))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    await emit(fix(35.852))
    expect(walking!.projection?.progress).toBe(0)
    expect(walking!.warning).toContain('갑자기')
    expect(walking!.status).not.toBe('arrived')
  })
  it('pauses and stops the subscription and discards callbacks from an old watcher', async () => {
    await act(async () => walking!.start())
    await emit(fix(35.851))
    await act(async () => walking!.pause())
    expect(clearWatch).toHaveBeenCalledWith(0)
    await emit(fix(35.852), 0)
    expect(walking!.status).toBe('paused')
    await act(async () => walking!.start())
    expect(subscriptions).toHaveLength(2)
    await act(async () => walking!.stop())
    expect(clearWatch).toHaveBeenCalledWith(1)
    expect(walking!.status).toBe('stopped')
  })
  it('shows permission denial and retries only on another explicit start', async () => {
    await act(async () => walking!.start())
    await act(async () => subscriptions[0].error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }))
    expect(walking!.status).toBe('error')
    expect(walking!.error).toContain('위치 권한')
    expect(clearWatch).toHaveBeenCalledWith(0)
    await act(async () => walking!.retry())
    expect(watchPosition).toHaveBeenCalledTimes(2)
    await emit(fix(35.851))
    expect(walking!.status).toBe('walking')
  })
  it('cleans up on selected-route changes, account changes and unmount', async () => {
    await act(async () => walking!.start())
    const nextRoute = { ...route, id: 'next-route' }
    await act(async () => renderer!.update(<Probe selected={nextRoute} />))
    expect(clearWatch).toHaveBeenCalledWith(0)
    expect(walking!.status).toBe('idle')
    await emit(fix(35.852), 0)
    expect(walking!.fix).toBeNull()
    await act(async () => walking!.start())
    await act(async () => renderer!.update(<Probe selected={nextRoute} owner="account-B" />))
    expect(clearWatch).toHaveBeenCalledWith(1)
    await act(async () => walking!.start())
    await act(async () => { renderer!.unmount(); renderer = undefined })
    expect(clearWatch).toHaveBeenCalledWith(2)
  })
  it('pauses in the background and requires the user to resume on return', async () => {
    await act(async () => walking!.start())
    await emit(fix(35.851))
    await act(async () => { page.visibilityState = 'hidden'; page.dispatchEvent(new Event('visibilitychange')) })
    expect(walking!.status).toBe('paused')
    expect(clearWatch).toHaveBeenCalledWith(0)
    await act(async () => { page.visibilityState = 'visible'; page.dispatchEvent(new Event('visibilitychange')) })
    expect(watchPosition).toHaveBeenCalledTimes(1)
  })
})
