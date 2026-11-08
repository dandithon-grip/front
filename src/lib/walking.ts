import type { Point } from './types'

const EARTH_RADIUS = 6_371_000
const radians = (degrees: number) => degrees * Math.PI / 180
export const isValidPoint = (point: Point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
export function distanceMeters(a: Point, b: Point): number {
  const dLat = radians(b.lat - a.lat), dLng = radians(b.lng - a.lng)
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(Math.max(0, value)), Math.sqrt(Math.max(0, 1 - value)))
}
export function cleanWalkingPath(points: Point[]): Point[] {
  return points.filter(isValidPoint).filter((point, index, valid) => index === 0 || distanceMeters(valid[index - 1], point) > .05)
}
export function walkingDistance(points: Point[]): number {
  const valid = cleanWalkingPath(points)
  return valid.reduce((total, point, index) => index ? total + distanceMeters(valid[index - 1], point) : total, 0)
}
export interface WalkingProjection {
  snapped: Point; distanceFromRoute: number; remainingMeters: number; progressMeters: number; progress: number
  segmentIndex: number; distanceToDestination: number; totalMeters: number
}
/** Project a real fix onto the supplied path; no route is invented or sent elsewhere. */
export function projectWalkingPosition(polyline: Point[], position: Point): WalkingProjection | null {
  const points = cleanWalkingPath(polyline)
  if (!isValidPoint(position) || points.length < 2) return null
  let total = 0, nearest = Number.POSITIVE_INFINITY, progressMeters = 0, snapped = points[0], segmentIndex = 0
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index]
    const scaleX = Math.cos(radians((a.lat + b.lat + position.lat) / 3))
    const dx = radians(b.lng - a.lng) * scaleX, dy = radians(b.lat - a.lat)
    const px = radians(position.lng - a.lng) * scaleX, py = radians(position.lat - a.lat)
    const fraction = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)))
    const point = { lat: a.lat + (b.lat - a.lat) * fraction, lng: a.lng + (b.lng - a.lng) * fraction }
    const offset = distanceMeters(position, point), length = distanceMeters(a, b)
    if (offset < nearest) { nearest = offset; snapped = point; segmentIndex = index - 1; progressMeters = total + length * fraction }
    total += length
  }
  if (total < .1) return null
  return { snapped, distanceFromRoute: nearest, progressMeters, remainingMeters: Math.max(0, total - progressMeters),
    progress: Math.max(0, Math.min(1, progressMeters / total)), segmentIndex, distanceToDestination: distanceMeters(position, points[points.length - 1]), totalMeters: total }
}
export function walkingArrival(projection: WalkingProjection, accuracy: number): boolean {
  return Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 50
    && projection.distanceToDestination <= Math.max(12, Math.min(25, accuracy))
    && projection.distanceFromRoute <= Math.max(20, accuracy)
    && (projection.progress >= .9 || projection.totalMeters < 40)
}
