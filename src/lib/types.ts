export type Preference = 'short' | 'full' | 'sunset'
export type Direction = 'to_home' | 'to_work'
export type TransportMode = 'walk' | 'transit' | 'car'
export type Mode = '도보' | '대중교통' | '자동차'
export type Season = '봄' | '여름' | '가을' | '겨울'
export interface Point { lat: number; lng: number }
export interface PlaceLocation extends Point { name: string; address: string; area: string }
export interface TransitStop extends Point { name: string; external_id: string }
export interface TransitLeg { line: string; stops: TransitStop[] }
export interface TransitPath {
  index: number; summary: string; total_minutes: number; transfers: number; walk_minutes: number
  legs: Array<{ kind: string; line: string | null; start_name: string | null; end_name: string | null; minutes: number; stops: TransitStop[] }>
}
/** Endpoint order follows the currently displayed trip; transitPath uses the canonical work-bound direction. */
export interface EndpointDraft {
  from: PlaceLocation; to: PlaceLocation; mode: Mode; transitPath?: TransitPath
}
export interface Station extends Point { id: string; line: string; name: string; order_no: number }
export interface Commute {
  from: string; to: string; morning: string; evening: string; mode: Mode
  fromPlace?: PlaceLocation; toPlace?: PlaceLocation; preference: Preference
  transitLegs?: TransitLeg[]; stationIds?: string[]; line?: string; configured: boolean
}
export interface CommuteResponse {
  id: string; from_lat: number; from_lng: number; to_lat: number; to_lng: number
  from_area: string; to_area: string; go_time: string; leave_time: string
  transport_mode: TransportMode; line: string | null; station_ids: string[]; preference: Preference
}
export interface Profile { userId: string; nickname: string; loggedIn: boolean; authId?: string }
export interface RouteData {
  id: string; leg_type: string; is_baseline: boolean; name: string; minutes: number; add_minutes: number
  green_pct: number; event_score: number; score: number; tags: string[]; highlights: string[]
  polyline: Point[]; spots: string[]; alight_station_id: string | null; board_station_id?: string | null; skip_stops?: number
}
export interface RoutesData {
  preference: Preference; direction: Direction; fallback_level: number; action_type: string
  candidates: RouteData[]; shortest: RouteData[]
}
export interface TodayCard {
  date: string; preference: Preference; action_type: string; fallback_level: number; reason_tag: string
  text: string; deviation: string | null; by_llm: boolean; sunset_at: string; sky: string | null; air_grade: string | null
  route: RouteData | null; candidates: RouteData[]; shortest: RouteData[]
}
export interface TagWeights { weights: Record<string, number>; hint: { tag: string; message: string } | null }
export type RecordSeason = 'cherry' | 'foliage' | 'ginkgo' | 'snow' | 'sunset' | 'none'
export interface RecordItem { id: number; place: string; season: Season | RecordSeason; memo: string; photo?: string; date?: string; placeId?: string; stage?: string }
export interface Alerts { morning: boolean; evening: boolean }
export const MODE_TO_API: Record<Mode, TransportMode> = { '도보': 'walk', '대중교통': 'transit', '자동차': 'car' }
export const MODE_FROM_API: Record<TransportMode, Mode> = { walk: '도보', transit: '대중교통', car: '자동차' }
export const PREFERENCE_LABELS: Record<Preference, string> = { full: '자연 가득', short: '짧게 걷기', sunset: '노을길' }
