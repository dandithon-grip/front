import { config } from './config'
import type { Commute, Direction, JourneySegment, PlaceLocation, Point, RouteData } from './types'
import { isValidPoint } from './walking'
import type { WalkingFix } from './useWalking'

export interface KakaoLatLng { getLat(): number; getLng(): number }
export interface KakaoMapInstance { setBounds(bounds: unknown, ...padding: number[]): void; relayout(): void; panTo(point: KakaoLatLng): void; setLevel(level: number): void }
interface MapOverlay { setMap(map: KakaoMapInstance | null): void }
export interface KakaoSDK {
  maps: {
    load(callback: () => void): void
    Map: new (element: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMapInstance
    LatLng: new (lat: number, lng: number) => KakaoLatLng
    LatLngBounds: new () => { extend(point: KakaoLatLng): void }
    Polyline: new (options: Record<string, unknown>) => MapOverlay
    Marker: new (options: Record<string, unknown>) => MapOverlay
    Circle: new (options: Record<string, unknown>) => MapOverlay
    CustomOverlay: new (options: Record<string, unknown>) => MapOverlay
    event: { addListener(target: unknown, event: string, callback: (event: { latLng: KakaoLatLng }) => void): void; removeListener(target: unknown, event: string, callback: (event: { latLng: KakaoLatLng }) => void): void }
    services: { Places: new () => { keywordSearch(query: string, callback: (results: Array<{ place_name: string; address_name: string; road_address_name: string; x: string; y: string }>, status: string) => void, options?: unknown): void } }
  }
}
declare global { interface Window { kakao?: KakaoSDK } }
let sdkPromise: Promise<KakaoSDK> | undefined
export function loadKakaoSDK(): Promise<KakaoSDK> {
  if (!config.kakaoKey) return Promise.reject(new Error('지도 연결이 아직 준비되지 않았어요.'))
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<KakaoSDK>((resolve, reject) => {
    const finish = () => {
      if (!window.kakao?.maps) { reject(new Error('지도를 불러오지 못했어요.')); return }
      window.kakao.maps.load(() => { clearTimeout(timeout); resolve(window.kakao!) })
    }
    const timeout = window.setTimeout(() => reject(new Error('지도 연결이 지연되고 있어요.')), 12_000)
    if (window.kakao?.maps) { finish(); return }
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(config.kakaoKey)}&autoload=false&libraries=services`
    script.async = true
    script.onload = finish
    script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('지도를 불러오지 못했어요.')) }
    document.head.appendChild(script)
  }).catch(error => { sdkPromise = undefined; throw error })
  return sdkPromise
}
export async function searchKakaoPlaces(query: string): Promise<PlaceLocation[]> {
  const sdk = await loadKakaoSDK()
  return new Promise((resolve, reject) => {
    new sdk.maps.services.Places().keywordSearch(query.trim(), (results, status) => {
      if (status === 'ZERO_RESULT') { resolve([]); return }
      if (status !== 'OK') { reject(new Error('장소를 검색하지 못했어요. 다시 시도해 주세요.')); return }
      resolve(results.map(p => ({ name: p.place_name, address: p.road_address_name || p.address_name,
        area: p.address_name.split(' ').slice(0, 3).join(' ') || p.place_name, lat: Number(p.y), lng: Number(p.x) })))
    }, { size: 10 })
  })
}
export function buildKakaoDirections(route: RouteData, commute: Commute, direction: Direction): string {
  const points = route.polyline.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  const start = points[0] ?? (direction === 'to_home' ? commute.toPlace : commute.fromPlace)
  const end = points[points.length - 1] ?? (direction === 'to_home' ? commute.fromPlace : commute.toPlace)
  if (!start || !end) return 'https://map.kakao.com/'
  const entry = (name: string, p: Point) => `${encodeURIComponent(name)},${p.lat},${p.lng}`
  return `https://map.kakao.com/link/by/walk/${entry('샛길 시작', start)}/${entry(route.name, end)}`
}

export const DEFAULT_MAP_CENTER: Point = { lat: 35.8714, lng: 128.6014 }
export interface MapDisplayOptions {
  routes: RouteData[]; locations: PlaceLocation[]; selectedId?: string
  onSelect?: (id: string) => void; onPick?: (point: Point) => void; onManualPan?: () => void; onTileError?: () => void; signal?: AbortSignal
}
export interface MapDisplay {
  provider: 'kakao' | 'openstreetmap'
  showPosition(fix: WalkingFix | null, follow: boolean, zoom?: boolean): void
  fit(): void; resize(): void; destroy(): void
}
// --- journey drawing (server#77) ---------------------------------------------
// A route's `journey` is the whole trip when that route is chosen. The selected route is drawn in full
// (usual grey, ride dotted, changed piece green); other candidates only show their changed piece so they stay tappable.
export type LineDash = 'none' | 'dash' | 'dot'
export interface LineStyle { color: string; weight: number; dash: LineDash }
export interface JourneyLine { points: Point[]; style: LineStyle; selectable: boolean }
export interface JourneyStop extends Point { name: string }
const GREY = '#87958c', GREEN = '#36bd75', FAINT = '#a6cdb5'
const SEGMENT_STYLE: Record<JourneySegment['kind'], Record<JourneySegment['role'], LineStyle>> = {
  walk: { usual: { color: GREY, weight: 4, dash: 'none' }, saetgil: { color: GREEN, weight: 6, dash: 'none' }, after_arrival: { color: GREEN, weight: 5, dash: 'dash' } },
  ride: { usual: { color: GREY, weight: 3, dash: 'dot' }, saetgil: { color: GREY, weight: 3, dash: 'dot' }, after_arrival: { color: GREY, weight: 3, dash: 'dot' } },
  drive: { usual: { color: GREY, weight: 3, dash: 'dash' }, saetgil: { color: GREY, weight: 3, dash: 'dash' }, after_arrival: { color: GREY, weight: 3, dash: 'dash' } },
}
const validPath = (points: Point[]) => points.filter(isValidPoint)
export function journeyLines(route: RouteData, selected: boolean): JourneyLine[] {
  if (!route.journey?.length) {
    const points = validPath(route.polyline)
    if (points.length < 2) return []
    const style: LineStyle = route.is_baseline ? { color: GREY, weight: 3, dash: 'dash' } : selected ? { color: GREEN, weight: 6, dash: 'none' } : { color: FAINT, weight: 3, dash: 'none' }
    return [{ points, style, selectable: !selected }]
  }
  const lines: JourneyLine[] = []
  for (const segment of route.journey) {
    const points = validPath(segment.polyline)
    if (points.length < 2) continue
    if (selected) lines.push({ points, style: SEGMENT_STYLE[segment.kind][segment.role], selectable: false })
    else if (segment.role !== 'usual') lines.push({ points, style: { color: FAINT, weight: 3, dash: 'none' }, selectable: true })
  }
  return lines
}
/** Boarding and alighting stops of each ride, for small labelled dots. */
export function journeyStops(route: RouteData): JourneyStop[] {
  const stops: JourneyStop[] = []
  for (const segment of route.journey || []) {
    if (segment.kind !== 'ride') continue
    const points = validPath(segment.polyline)
    if (points.length < 2) continue
    if (segment.from_name) stops.push({ ...points[0], name: segment.from_name })
    if (segment.to_name) stops.push({ ...points[points.length - 1], name: segment.to_name })
  }
  return stops
}
/** Every point of the whole trip (or the plain polyline), used to frame the map. */
export function journeyPoints(route: RouteData): Point[] {
  return route.journey?.length ? route.journey.flatMap(segment => validPath(segment.polyline)) : validPath(route.polyline)
}
const selectedRoute = (options: MapDisplayOptions) => options.routes.find(route => route.id === options.selectedId) ?? options.routes.find(route => !route.is_baseline) ?? options.routes[0]
const mapPoints = (options: MapDisplayOptions) => {
  const focus = selectedRoute(options)
  const points = focus ? journeyPoints(focus) : options.routes.flatMap(route => route.polyline)
  return [...points, ...options.locations].filter(isValidPoint)
}
const endpointMarkers = (options: MapDisplayOptions) => {
  const focus = selectedRoute(options)
  const path = focus ? journeyPoints(focus) : []
  return options.locations.length ? options.locations.filter(isValidPoint) : path.length ? [path[0], path[path.length - 1]] : []
}
const drawOrder = (options: MapDisplayOptions) => {
  const focus = selectedRoute(options)
  return [...options.routes.filter(route => route !== focus), ...(focus ? [focus] : [])].map(route => ({ route, selected: route === focus }))
}

/** Prefer the configured Kakao app, with a real OSM map when Kakao is unavailable. */
export async function createMapDisplay(element: HTMLElement, options: MapDisplayOptions): Promise<MapDisplay> {
  if (config.kakaoKey) {
    try {
      const sdk = await loadKakaoSDK()
      if (options.signal?.aborted) throw new Error('Map was closed')
      return createKakaoDisplay(element, options, sdk)
    } catch { if (options.signal?.aborted) throw new Error('Map was closed'); element.replaceChildren() }
  }
  return createLeafletDisplay(element, options)
}

function createKakaoDisplay(element: HTMLElement, options: MapDisplayOptions, sdk: KakaoSDK): MapDisplay {
  const { maps } = sdk, points = mapPoints(options), center = points[0] || DEFAULT_MAP_CENTER
  const map = new maps.Map(element, { center: new maps.LatLng(center.lat, center.lng), level: points.length ? 5 : 7 })
  const overlays: MapOverlay[] = [], listeners: Array<{ target: unknown; event: string; callback: (event: { latLng: KakaoLatLng }) => void }> = []
  let positionOverlays: MapOverlay[] = []
  const listen = (target: unknown, event: string, callback: (event: { latLng: KakaoLatLng }) => void) => { maps.event.addListener(target, event, callback); listeners.push({ target, event, callback }) }
  const fit = () => {
    if (!points.length) return
    const bounds = new maps.LatLngBounds()
    points.forEach(point => bounds.extend(new maps.LatLng(point.lat, point.lng)))
    map.setBounds(bounds, 50, 35, 50, 35)
    if (points.length === 1) map.setLevel(4)
  }
  const KAKAO_DASH: Record<LineDash, string> = { none: 'solid', dash: 'dash', dot: 'dot' }
  drawOrder(options).forEach(({ route, selected }) => {
    journeyLines(route, selected).forEach(({ points, style, selectable }) => {
      const line = new maps.Polyline({ map, path: points.map(point => new maps.LatLng(point.lat, point.lng)),
        strokeWeight: style.weight, strokeColor: style.color, strokeOpacity: 1, strokeStyle: KAKAO_DASH[style.dash], zIndex: selected ? 3 : 1 })
      overlays.push(line)
      if (selectable && options.onSelect) listen(line, 'click', () => options.onSelect?.(route.id))
    })
    if (selected) journeyStops(route).forEach(stop => overlays.push(new maps.CustomOverlay({ map, position: new maps.LatLng(stop.lat, stop.lng),
      content: `<span class="journey-stop-dot" role="img" title="${stop.name.replace(/[<>"&]/g, '')}"></span>`, yAnchor: .5, xAnchor: .5, zIndex: 4 })))
  })
  endpointMarkers(options).forEach(point => overlays.push(new maps.Marker({ map, position: new maps.LatLng(point.lat, point.lng) })))
  if (options.onPick) listen(map, 'click', event => options.onPick?.({ lat: event.latLng.getLat(), lng: event.latLng.getLng() }))
  listen(map, 'dragstart', () => options.onManualPan?.())
  fit()
  return {
    provider: 'kakao', fit, resize: () => map.relayout(),
    showPosition: (fix, follow, zoom) => {
      positionOverlays.forEach(overlay => overlay.setMap(null)); positionOverlays = []
      if (!fix || !isValidPoint(fix)) return
      const point = new maps.LatLng(fix.lat, fix.lng)
      positionOverlays = [new maps.Circle({ map, center: point, radius: fix.accuracy, strokeWeight: 1, strokeColor: '#4285ee', strokeOpacity: .4, fillColor: '#4285ee', fillOpacity: .12 }),
        new maps.CustomOverlay({ map, position: point, content: '<span class="walking-current-dot" role="img" aria-label="현재 위치"></span>', yAnchor: .5, xAnchor: .5, zIndex: 20 })]
      if (follow) { if (zoom) map.setLevel(3); map.panTo(point) }
    },
    destroy: () => { listeners.forEach(({ target, event, callback }) => maps.event.removeListener(target, event, callback)); [...overlays, ...positionOverlays].forEach(overlay => overlay.setMap(null)); element.replaceChildren() },
  }
}

async function createLeafletDisplay(element: HTMLElement, options: MapDisplayOptions): Promise<MapDisplay> {
  const L = await import('leaflet')
  if (options.signal?.aborted) throw new Error('Map was closed')
  const points = mapPoints(options), center = points[0] || DEFAULT_MAP_CENTER
  const map = L.map(element, { center: [center.lat, center.lng], zoom: points.length ? 15 : 13, zoomControl: false, attributionControl: true })
  L.control.zoom({ position: 'bottomleft' }).addTo(map)
  const osmCredit = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  const escaped: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  const extraCredit = config.mapAttribution && config.mapAttribution !== '© OpenStreetMap contributors'
    ? ` · ${config.mapAttribution.replace(/[&<>"']/g, (character: string) => escaped[character])}` : ''
  // Default browser caching and referrers remain intact; no offline cache or tile prefetch is used.
  const tiles = L.tileLayer(config.mapTileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: osmCredit + extraCredit, maxZoom: 19, updateWhenIdle: true, keepBuffer: 0 }).addTo(map)
  let tileErrors = 0
  tiles.on('tileerror', () => { if (++tileErrors === 3) options.onTileError?.() })
  const fit = () => { if (points.length) map.fitBounds(L.latLngBounds(points.map(point => [point.lat, point.lng])), { padding: [35, 45], maxZoom: 17, animate: false }) }
  const LEAFLET_DASH: Record<LineDash, string | undefined> = { none: undefined, dash: '7 6', dot: '1 7' }
  drawOrder(options).forEach(({ route, selected }) => {
    journeyLines(route, selected).forEach(({ points, style, selectable }) => {
      const line = L.polyline(points.map(point => [point.lat, point.lng]), { weight: style.weight, color: style.color, opacity: 1,
        dashArray: LEAFLET_DASH[style.dash], lineCap: style.dash === 'dot' ? 'round' : undefined, bubblingMouseEvents: false }).addTo(map)
      if (selectable && options.onSelect) line.on('click', () => options.onSelect?.(route.id))
      if (selected) line.bringToFront()
    })
    if (selected) journeyStops(route).forEach(stop => L.circleMarker([stop.lat, stop.lng], { radius: 4, color: '#5d6d64', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false })
      .addTo(map).bindTooltip(stop.name))
  })
  endpointMarkers(options).forEach((point, index) => L.circleMarker([point.lat, point.lng], { radius: 7, color: '#2fa966', weight: 3,
    fillColor: index === 0 ? '#fff' : '#36bd75', fillOpacity: 1, interactive: false }).addTo(map).bindTooltip(index === 0 ? '출발' : '도착'))
  if (options.onPick) map.on('click', event => options.onPick?.({ lat: event.latlng.lat, lng: event.latlng.lng }))
  map.on('dragstart', () => options.onManualPan?.())
  let positionMarker: ReturnType<typeof L.circleMarker> | null = null, accuracyCircle: ReturnType<typeof L.circle> | null = null
  fit()
  return {
    provider: 'openstreetmap', fit, resize: () => { map.invalidateSize({ animate: false }) },
    showPosition: (fix, follow, zoom) => {
      positionMarker?.remove(); accuracyCircle?.remove(); positionMarker = null; accuracyCircle = null
      if (!fix || !isValidPoint(fix)) return
      accuracyCircle = L.circle([fix.lat, fix.lng], { radius: fix.accuracy, color: '#4285ee', weight: 1, opacity: .4, fillOpacity: .12, interactive: false }).addTo(map)
      positionMarker = L.circleMarker([fix.lat, fix.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#4285ee', fillOpacity: 1, interactive: false }).addTo(map).bindTooltip('현재 위치')
      if (follow) { if (zoom) map.setView([fix.lat, fix.lng], 17, { animate: false }); else map.panTo([fix.lat, fix.lng], { animate: false }) }
    },
    destroy: () => { map.off(); tiles.off(); map.remove() },
  }
}
