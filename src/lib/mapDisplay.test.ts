import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapDisplayOptions } from './map'

const fake = vi.hoisted(() => {
  const callbacks = new Map<string, (event: { latlng: { lat: number; lng: number } }) => void>()
  const layer = () => {
    const value = { addTo: vi.fn(), on: vi.fn(), off: vi.fn(), remove: vi.fn(), bindTooltip: vi.fn(), bringToFront: vi.fn() }
    value.addTo.mockReturnValue(value); value.on.mockReturnValue(value); value.bindTooltip.mockReturnValue(value)
    return value
  }
  const map = { on: vi.fn(), off: vi.fn(), fitBounds: vi.fn(), panTo: vi.fn(), setView: vi.fn(), invalidateSize: vi.fn(), remove: vi.fn() }
  return { callbacks, map, create: vi.fn(() => map), tile: vi.fn(layer), polyline: vi.fn(layer), circle: vi.fn(layer), marker: vi.fn(layer), zoom: vi.fn(layer) }
})
const settings = vi.hoisted(() => ({ kakaoKey: '', mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', mapAttribution: '© OpenStreetMap contributors' }))
vi.mock('./config', () => ({ config: settings }))
vi.mock('leaflet', () => ({ map: fake.create, tileLayer: fake.tile, polyline: fake.polyline, circle: fake.circle, circleMarker: fake.marker,
  latLngBounds: (points: unknown[]) => ({ points }), control: { zoom: fake.zoom } }))
import { createMapDisplay, DEFAULT_MAP_CENTER } from './map'

const emptyOptions = (): MapDisplayOptions => ({ routes: [], locations: [] })
const element = () => ({ replaceChildren: vi.fn() }) as unknown as HTMLElement
describe('real map provider and GPS display', () => {
  beforeEach(() => {
    vi.clearAllMocks(); fake.callbacks.clear(); settings.kakaoKey = ''
    fake.map.on.mockImplementation((event: string, callback: (event: { latlng: { lat: number; lng: number } }) => void) => { fake.callbacks.set(event, callback); return fake.map })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('opens a real map at a default centre before any location is selected and supports map picking', async () => {
    const onPick = vi.fn(), onManualPan = vi.fn()
    const display = await createMapDisplay(element(), { ...emptyOptions(), onPick, onManualPan })
    expect(display.provider).toBe('openstreetmap')
    expect(fake.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ center: [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng] }))
    fake.callbacks.get('click')!({ latlng: { lat: 35.8, lng: 128.7 } })
    expect(onPick).toHaveBeenCalledWith({ lat: 35.8, lng: 128.7 })
    fake.callbacks.get('dragstart')!({ latlng: { lat: 0, lng: 0 } })
    expect(onManualPan).toHaveBeenCalledTimes(1)
    expect(fake.tile).toHaveBeenCalledWith('https://tile.openstreetmap.org/{z}/{x}/{y}.png', expect.objectContaining({ attribution: expect.stringContaining('openstreetmap.org/copyright'), keepBuffer: 0 }))
    display.destroy(); expect(fake.map.remove).toHaveBeenCalledTimes(1)
  })
  it('draws the live position and accuracy circle, following only when enabled', async () => {
    const display = await createMapDisplay(element(), emptyOptions())
    const fix = { lat: 35.85, lng: 128.63, accuracy: 12, timestamp: Date.now() }
    display.showPosition(fix, false)
    expect(fake.circle).toHaveBeenLastCalledWith([35.85, 128.63], expect.objectContaining({ radius: 12 }))
    expect(fake.marker).toHaveBeenLastCalledWith([35.85, 128.63], expect.objectContaining({ fillColor: '#4285ee' }))
    expect(fake.map.panTo).not.toHaveBeenCalled()
    display.showPosition(fix, true)
    expect(fake.map.panTo).toHaveBeenCalledWith([35.85, 128.63], { animate: false })
    display.showPosition(fix, true, true)
    expect(fake.map.setView).toHaveBeenCalledWith([35.85, 128.63], 17, { animate: false })
    display.destroy()
  })
  it('does not initialize a stale container after the asynchronous provider import was cancelled', async () => {
    const controller = new AbortController()
    const pending = createMapDisplay(element(), { ...emptyOptions(), signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toThrow('Map was closed')
    expect(fake.create).not.toHaveBeenCalled()
  })
  it('uses the OSM map when loading the configured Kakao SDK fails', async () => {
    settings.kakaoKey = 'test-public-key'
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout })
    vi.stubGlobal('document', { createElement: () => ({ remove: vi.fn() }), head: { appendChild: (script: { onerror: () => void }) => queueMicrotask(() => script.onerror()) } })
    const display = await createMapDisplay(element(), emptyOptions())
    expect(display.provider).toBe('openstreetmap')
    expect(fake.create).toHaveBeenCalledTimes(1)
    display.destroy()
  })
})
