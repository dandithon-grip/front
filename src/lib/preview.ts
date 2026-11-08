import type { Commute, Direction, PlaceLocation, Preference, RouteData, RoutesData, TodayCard } from './types'

/** Explicit preview fixtures, never presented as a server-calculated route. */
export const PREVIEW_PLACES: PlaceLocation[] = [
  { name: '수성구청역', address: '대구 2호선 정류장', area: '수성구 범어동', lat: 35.8575, lng: 128.637 },
  { name: '반월당역', address: '대구 2호선 정류장', area: '중구 동성로', lat: 35.869, lng: 128.596 },
  { name: '범어역', address: '대구 2호선 정류장', area: '수성구 범어동', lat: 35.859, lng: 128.626 },
]
export const PREVIEW_COMMUTE: Commute = {
  from: PREVIEW_PLACES[0].name, to: PREVIEW_PLACES[1].name, fromPlace: PREVIEW_PLACES[0], toPlace: PREVIEW_PLACES[1],
  morning: '08:30', evening: '18:10', mode: '도보', preference: 'full', configured: true,
}
export function todayInKorea(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type: string) => parts.find(p => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function createPreviewJourney(commute: Commute, preference: Preference = 'full', direction: Direction = 'to_home'): { card: TodayCard; routes: RoutesData } {
  const home = commute.fromPlace ?? PREVIEW_PLACES[0], work = commute.toPlace ?? PREVIEW_PLACES[1]
  const start = direction === 'to_home' ? work : home, end = direction === 'to_home' ? home : work
  const middle = { lat: (start.lat + end.lat) / 2 + .002, lng: (start.lng + end.lng) / 2 - .001 }
  const make = (id: string, name: string, minutes: number, add: number, green: number, tags: string[], baseline = false): RouteData => ({
    id, name, minutes, add_minutes: add, green_pct: green, event_score: baseline ? 0 : 12, score: green - add,
    leg_type: 'walk', is_baseline: baseline, tags, highlights: ['화면 확인용 좌표 연결선이에요. 실제 도로를 따라 계산한 보행 경로가 아니에요.'],
    polyline: baseline ? [start, end] : [start, { ...middle, lat: middle.lat + (id.endsWith('2') ? -.003 : .001) }, end],
    spots: baseline ? [] : ['preview-place-1'], alight_station_id: null,
  })
  const sunset = make('preview-1', '신천 노을길', 34, 12, 64, ['river', 'sunset'])
  const trees = make('preview-2', '가을빛 가득한 나무 그늘길', 26, 4, 41, ['trees', 'park'])
  const shortest = make('preview-shortest', '최단 경로', 22, 0, 18, [], true)
  const candidates = preference === 'sunset' ? [sunset] : preference === 'short' ? [trees] : [sunset, trees]
  const routes: RoutesData = { preference, direction, fallback_level: 1, action_type: 'detour', candidates, shortest: [shortest] }
  const card: TodayCard = {
    date: todayInKorea(), preference, action_type: 'detour', fallback_level: 1, reason_tag: candidates[0].tags[0],
    text: '조금 돌아가면, 익숙한 길에서도 새로운 계절을 만날 수 있어요.', deviation: null, by_llm: false,
    sunset_at: `${todayInKorea()}T17:30:00+09:00`, sky: null, air_grade: null, route: candidates[0], candidates, shortest: [shortest],
  }
  return { card, routes }
}
