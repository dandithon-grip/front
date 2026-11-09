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
/** A usual transit route the server pre-computed walking legs for (server#88). */
export interface RideInfo { id: string; order_no: number; line: string; station_ids: string[]; board_name: string; alight_name: string }
/** Endpoint order follows the currently displayed trip; transitPaths use the canonical work-bound direction. */
export interface EndpointDraft {
  from: PlaceLocation; to: PlaceLocation; mode: Mode; transitPaths?: TransitPath[]
}
export interface Station extends Point { id: string; line: string; name: string; order_no: number }
export interface Commute {
  from: string; to: string; morning: string; evening: string; mode: Mode
  fromPlace?: PlaceLocation; toPlace?: PlaceLocation; preference: Preference
  transitLegs?: TransitLeg[]; stationIds?: string[]; line?: string; configured: boolean
  /** Every usual route (≤3). transitLegs mirrors the first one for older servers. */
  transitOptions?: TransitLeg[][]; rides?: RideInfo[]
}
export interface CommuteResponse {
  id: string; from_lat: number; from_lng: number; to_lat: number; to_lng: number
  from_area: string; to_area: string; go_time: string; leave_time: string
  transport_mode: TransportMode; line: string | null; station_ids: string[]; preference: Preference
  rides?: RideInfo[]
}
export interface Profile { userId: string; nickname: string; loggedIn: boolean; authId?: string; city?: string }
/** One piece of the whole trip for a route (server#77). Consecutive pieces share their end/start point. */
export interface JourneySegment {
  kind: 'walk' | 'ride' | 'drive'; role: 'usual' | 'saetgil' | 'after_arrival'; polyline: Point[]
  minutes: number | null; line: string | null; from_name: string | null; to_name: string | null
}
export interface RouteData {
  id: string; leg_type: string; is_baseline: boolean; name: string; minutes: number; add_minutes: number
  green_pct: number; event_score: number; score: number; tags: string[]; highlights: string[]
  polyline: Point[]; spots: string[]; alight_station_id: string | null; board_station_id?: string | null; skip_stops?: number
  /** Whole trip when this route is chosen; `polyline` is only its walking piece. Absent from older servers and previews. */
  journey?: JourneySegment[]
  /** Which usual route this leg belongs to (server#88). null for walking commutes and after-arrival walks. */
  ride_id?: string | null
}
/** Background route generation progress (server#97). */
export interface GenerationStatus { state: 'idle' | 'pending' | 'ready' | 'failed'; updated_at?: string | null; route_count: number }
export interface RoutesData {
  preference: Preference; direction: Direction; fallback_level: number; action_type: string
  candidates: RouteData[]; shortest: RouteData[]; rides?: RideInfo[]
}
export interface TodayCard {
  date: string; preference: Preference; action_type: string; fallback_level: number; reason_tag: string
  text: string; deviation: string | null; by_llm: boolean; sunset_at: string; sky: string | null; air_grade: string | null
  route: RouteData | null; candidates: RouteData[]; shortest: RouteData[]
  /** The usual route this card is for (server#90); null = best across all of them. */
  ride_id?: string | null; rides?: RideInfo[]
}
export interface TagWeights { weights: Record<string, number>; hint: { tag: string; message: string } | null }
export type RecordSeason = 'cherry' | 'foliage' | 'ginkgo' | 'snow' | 'sunset' | 'none'
export interface RecordItem { id: number; place: string; season: Season | RecordSeason; memo: string; photo?: string; date?: string; placeId?: string; stage?: string }
export interface Alerts { morning: boolean; evening: boolean }
export const MODE_TO_API: Record<Mode, TransportMode> = { '도보': 'walk', '대중교통': 'transit', '자동차': 'car' }
export const MODE_FROM_API: Record<TransportMode, Mode> = { walk: '도보', transit: '대중교통', car: '자동차' }
export const PREFERENCE_LABELS: Record<Preference, string> = { full: '자연 가득', short: '짧게 걷기', sunset: '노을길' }
