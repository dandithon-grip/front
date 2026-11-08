import { validateTransitPaths } from './transit'
import type { Commute, Direction, EndpointDraft, PlaceLocation } from './types'

function validPlace(place: PlaceLocation) {
  return place && typeof place.name === 'string' && place.name.trim() && typeof place.area === 'string' && place.area.trim()
    && Number.isFinite(place.lat) && Number.isFinite(place.lng) && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180
}

/** Persist home -> work even when editing the work -> home map. Never reverse station IDs. */
export function editedCommute(original: Commute, draft: EndpointDraft, direction: Direction): Commute {
  if (!validPlace(draft.from) || !validPlace(draft.to)) throw new Error('출발지와 도착지를 선택해 주세요.')
  if (Math.abs(draft.from.lat - draft.to.lat) < .000001 && Math.abs(draft.from.lng - draft.to.lng) < .000001) throw new Error('출발지와 도착지를 서로 다르게 선택해 주세요.')
  if (!['도보', '대중교통', '자동차'].includes(draft.mode)) throw new Error('교통수단을 선택해 주세요.')
  const home = direction === 'to_home' ? draft.to : draft.from, work = direction === 'to_home' ? draft.from : draft.to
  const path = draft.mode === '대중교통' ? validateTransitPaths({ paths: draft.transitPath ? [draft.transitPath] : [] })[0] : undefined
  const legs = path?.legs.filter(leg => leg.kind !== 'walk' && leg.line && leg.stops.length >= 2)
    .map(leg => ({ line: leg.line!, stops: leg.stops.map(stop => ({ ...stop })) })) ?? []
  if (draft.mode === '대중교통' && !legs.length) throw new Error('탑승 구간이 있는 대중교통 경로를 선택해 주세요.')
  return { ...original, from: home.name, to: work.name, fromPlace: { ...home }, toPlace: { ...work }, mode: draft.mode,
    configured: true, transitLegs: legs, stationIds: [], line: legs.length === 1 ? legs[0].line : undefined }
}
