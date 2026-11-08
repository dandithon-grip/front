import { validateTransitPaths } from './transit'
import type { OneTimeTrip, PlaceLocation } from './types'

function validPlace(place: PlaceLocation) {
  return place && typeof place.name === 'string' && place.name.trim() && typeof place.area === 'string' && place.area.trim()
    && Number.isFinite(place.lat) && Number.isFinite(place.lng) && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180
}

/** Keep a detached draft so a later edit cannot mutate the active exploration. */
export function copyOneTimeTrip(trip: OneTimeTrip): OneTimeTrip {
  if (!validPlace(trip.from) || !validPlace(trip.to)) throw new Error('출발지와 도착지를 선택해 주세요.')
  if (Math.abs(trip.from.lat - trip.to.lat) < .000001 && Math.abs(trip.from.lng - trip.to.lng) < .000001) {
    throw new Error('출발지와 도착지를 서로 다르게 선택해 주세요.')
  }
  if (trip.mode !== '도보' && trip.mode !== '대중교통') throw new Error('도보 또는 대중교통을 선택해 주세요.')
  const transitPath = trip.mode === '대중교통' ? validateTransitPaths({ paths: trip.transitPath ? [trip.transitPath] : [] })[0] : undefined
  return {
    from: { ...trip.from }, to: { ...trip.to }, mode: trip.mode,
    ...(transitPath ? { transitPath: { ...transitPath, legs: transitPath.legs.map(leg => ({ ...leg, stops: leg.stops.map(stop => ({ ...stop })) })) } } : {}),
  }
}
