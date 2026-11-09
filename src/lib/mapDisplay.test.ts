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
  const group = { addTo: vi.fn(), clearLayers: vi.fn(), remove: vi.fn() }
  group.addTo.mockReturnValue(group)
  const pin = () => {
    const value = { ...layer(), getLatLng: vi.fn(() => ({ lat: 35.8, lng: 128.7 })) }
    value.addTo.mockReturnValue(value); value.on.mockReturnValue(value)
    return value
  }
  return { callbacks, map, group, create: vi.fn(() => map), tile: vi.fn(layer), polyline: vi.fn(layer), circle: vi.fn(layer), marker: vi.fn(layer), pin: vi.fn(pin), zoom: vi.fn(layer), layerGroup: vi.fn(() => group), divIcon: vi.fn(() => ({})) }
})
const settings = vi.hoisted(() => ({ kakaoKey: '', mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', mapAttribution: '© OpenStreetMap contributors' }))
vi.mock('./config', () => ({ config: settings }))
vi.mock('leaflet', () => ({ map: fake.create, tileLayer: fake.tile, polyline: fake.polyline, circle: fake.circle, circleMarker: fake.marker, marker: fake.pin,
  layerGroup: fake.layerGroup, divIcon: fake.divIcon, latLngBounds: (points: unknown[]) => ({ points }), control: { zoom: fake.zoom } }))
import { createMapDisplay, DEFAULT_MAP_CENTER, journeyLines, journeyStops, journeyPoints } from './map'
import type { JourneySegment, RouteData } from './types'

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

const segment = (kind: JourneySegment['kind'], role: JourneySegment['role'], polyline: JourneySegment['polyline'], extra: Partial<JourneySegment> = {}): JourneySegment =>
  ({ kind, role, polyline, minutes: null, line: null, from_name: null, to_name: null, ...extra })
const H = { lat: 35.86, lng: 128.6 }, S0 = { lat: 35.86, lng: 128.603 }, S1 = { lat: 35.86, lng: 128.606 }, S2 = { lat: 35.86, lng: 128.609 }, W = { lat: 35.86, lng: 128.611 }, PARK = { lat: 35.8612, lng: 128.61 }
const frontWalk = segment('walk', 'usual', [H, S0], { minutes: 4 })
const ride = segment('ride', 'usual', [S0, S1, S2], { line: '2', from_name: '역0', to_name: '역2' })
const backWalk = segment('walk', 'usual', [S2, W], { minutes: 3 })
const backSaetgil = segment('walk', 'saetgil', [S2, PARK, W], { minutes: 7 })
const baseRoute = (id: string, journey: JourneySegment[], polyline: JourneySegment['polyline'], is_baseline = false): RouteData => ({
  id, leg_type: 'back_walk', is_baseline, name: id, minutes: 7, add_minutes: 4, green_pct: 40, event_score: 0, score: 30, tags: [], highlights: [],
  polyline, spots: [], alight_station_id: null, journey,
})
const candidate = baseRoute('candidate', [frontWalk, ride, backSaetgil], backSaetgil.polyline)
const other = baseRoute('other', [segment('walk', 'saetgil', [H, PARK, S0]), ride, backWalk], [H, PARK, S0])
const shortest = baseRoute('shortest', [frontWalk, ride, backWalk], backWalk.polyline, true)
const legacy: RouteData = { ...baseRoute('legacy', [], [H, PARK, W]), journey: undefined }

describe('journey drawing (server#77)', () => {
  it('draws the selected route as one connected journey: usual grey, ride dotted, saetgil green and thick', () => {
    const lines = journeyLines(candidate, true)
    expect(lines.map(line => line.points)).toEqual([[H, S0], [S0, S1, S2], [S2, PARK, W]])
    expect(lines.map(line => line.style)).toEqual([
      { color: '#87958c', weight: 4, dash: 'none' },
      { color: '#87958c', weight: 3, dash: 'dot' },
      { color: '#36bd75', weight: 6, dash: 'none' },
    ])
    expect(lines.every(line => !line.selectable)).toBe(true)
  })
  it('draws only the changed segment of an unselected candidate, faint and selectable', () => {
    const lines = journeyLines(other, false)
    expect(lines).toHaveLength(1)
    expect(lines[0].points).toEqual([H, PARK, S0])
    expect(lines[0].style).toEqual({ color: '#a6cdb5', weight: 3, dash: 'none' })
    expect(lines[0].selectable).toBe(true)
  })
  it('draws nothing extra for an unselected baseline whose journey is all usual', () => {
    expect(journeyLines(shortest, false)).toEqual([])
  })
  it('marks after-arrival walks as a green dashed extension', () => {
    const after = baseRoute('after', [frontWalk, ride, backWalk, segment('walk', 'after_arrival', [W, PARK])], [W, PARK])
    const lines = journeyLines(after, true)
    expect(lines[3].style).toEqual({ color: '#36bd75', weight: 5, dash: 'dash' })
    expect(journeyLines(after, false)[0].points).toEqual([W, PARK])
  })
  it('falls back to the whole polyline when the server sent no journey', () => {
    expect(journeyLines(legacy, true)).toEqual([{ points: [H, PARK, W], style: { color: '#36bd75', weight: 6, dash: 'none' }, selectable: false }])
    expect(journeyLines({ ...legacy, is_baseline: true }, false)).toEqual([{ points: [H, PARK, W], style: { color: '#87958c', weight: 3, dash: 'dash' }, selectable: true }])
  })
  it('names the boarding and alighting stops of each ride once', () => {
    expect(journeyStops(candidate)).toEqual([{ ...S0, name: '역0' }, { ...S2, name: '역2' }])
    expect(journeyStops(legacy)).toEqual([])
  })
  it('frames the selected journey from its first to its last point', () => {
    expect(journeyPoints(candidate)).toEqual([H, S0, S0, S1, S2, S2, PARK, W])
    expect(journeyPoints(legacy)).toEqual([H, PARK, W])
  })
  it('renders the selected journey on the OSM map with endpoint and stop markers', async () => {
    const onSelect = vi.fn()
    await createMapDisplay(element(), { routes: [candidate, other, shortest], locations: [], selectedId: candidate.id, onSelect })
    const drawn = (fake.polyline.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>).map(call => call[1])
    expect(drawn).toHaveLength(4)  // 선택한 여정 3조각 + 다른 후보의 바뀐 구간 1
    expect(drawn.filter(options => options.color === '#36bd75' && options.weight === 6)).toHaveLength(1)
    expect(drawn.filter(options => options.dashArray === '1 7')).toHaveLength(1)
    const faint = fake.polyline.mock.results[drawn.findIndex(options => options.color === '#a6cdb5')].value as { on: ReturnType<typeof vi.fn> }
    ;(faint.on.mock.calls.find(call => call[0] === 'click')![1] as () => void)()
    expect(onSelect).toHaveBeenCalledWith('other')
    const tooltips = fake.marker.mock.results.flatMap(result => (result.value as { bindTooltip: ReturnType<typeof vi.fn> }).bindTooltip.mock.calls.map(call => call[0]))
    expect(tooltips).toEqual(expect.arrayContaining(['출발', '도착', '역0', '역2']))
    expect(fake.map.fitBounds).toHaveBeenCalledWith({ points: journeyPoints(candidate).map(point => [point.lat, point.lng]) }, expect.anything())
  })
})

describe('in-place scene updates and draggable pin (F1·F2)', () => {
  beforeEach(() => { vi.clearAllMocks(); fake.callbacks.clear(); settings.kakaoKey = '' })
  it('redraws routes and refits without rebuilding the map', async () => {
    const display = await createMapDisplay(element(), { routes: [legacy], locations: [], selectedId: legacy.id })
    expect(fake.create).toHaveBeenCalledTimes(1)
    const drawnBefore = fake.polyline.mock.calls.length
    display.update({ routes: [candidate, shortest], locations: [], selectedId: candidate.id })
    expect(fake.create).toHaveBeenCalledTimes(1)
    expect(fake.group.clearLayers).toHaveBeenCalledTimes(1)
    expect(fake.polyline.mock.calls.length).toBeGreaterThan(drawnBefore)
    expect(fake.map.fitBounds).toHaveBeenLastCalledWith({ points: journeyPoints(candidate).map(point => [point.lat, point.lng]) }, expect.anything())
  })
  it('moves the map to a newly chosen location', async () => {
    const display = await createMapDisplay(element(), { routes: [], locations: [] })
    expect(fake.map.fitBounds).not.toHaveBeenCalled()
    display.update({ routes: [], locations: [{ name: '동대구역', area: '대구 동구', address: '', lat: 35.879, lng: 128.628 }] })
    expect(fake.map.fitBounds).toHaveBeenCalledWith({ points: [[35.879, 128.628]] }, expect.anything())
  })
  it('places a draggable pin for the location being edited and reports where it was dropped', async () => {
    const onPick = vi.fn()
    await createMapDisplay(element(), { routes: [], locations: [], pickable: { lat: 35.86, lng: 128.6 }, onPick })
    expect(fake.pin).toHaveBeenCalledWith([35.86, 128.6], expect.objectContaining({ draggable: true }))
    const pin = fake.pin.mock.results[0].value as { on: ReturnType<typeof vi.fn> }
    ;(pin.on.mock.calls.find(call => call[0] === 'dragend')![1] as () => void)()
    expect(onPick).toHaveBeenCalledWith({ lat: 35.8, lng: 128.7 })
  })
  it('does not add a pin when the map is read-only', async () => {
    await createMapDisplay(element(), { routes: [], locations: [], pickable: { lat: 35.86, lng: 128.6 } })
    expect(fake.pin).not.toHaveBeenCalled()
  })
})
