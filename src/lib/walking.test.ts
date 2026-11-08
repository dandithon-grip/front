import { describe, expect, it } from 'vitest'
import { cleanWalkingPath, distanceMeters, projectWalkingPosition, walkingArrival, walkingDistance } from './walking'

const a = { lat: 35.85, lng: 128.6 }, b = { lat: 35.851, lng: 128.6 }, c = { lat: 35.851, lng: 128.601 }
describe('walking route geometry', () => {
  it('measures metres without swapping latitude and longitude', () => {
    expect(distanceMeters(a, b)).toBeCloseTo(111.195, 2)
    expect(distanceMeters(b, c)).toBeGreaterThan(89)
    expect(distanceMeters(b, c)).toBeLessThan(92)
  })
  it('follows the bent path rather than using direct distance to the endpoint', () => {
    const projection = projectWalkingPosition([a, b, c], a)!
    expect(projection.remainingMeters).toBeCloseTo(distanceMeters(a, b) + distanceMeters(b, c), 3)
    expect(projection.remainingMeters).toBeGreaterThan(projection.distanceToDestination + 40)
    expect(projection.progress).toBe(0)
  })
  it('finds progress and remaining distance from the closest path segment', () => {
    const projection = projectWalkingPosition([a, b, c], { lat: 35.851, lng: 128.6005 })!
    expect(projection.segmentIndex).toBe(1)
    expect(projection.distanceFromRoute).toBeLessThan(.1)
    expect(projection.remainingMeters).toBeCloseTo(distanceMeters(b, c) / 2, 1)
    expect(projection.progress).toBeGreaterThan(.7)
  })
  it('uses the reverse path as received for the return commute', () => {
    const projection = projectWalkingPosition([c, b, a], c)!
    expect(projection.progress).toBe(0)
    expect(projectWalkingPosition([c, b, a], a)!.progress).toBe(1)
  })
  it('reports an off-path fix instead of claiming it is on the green line', () => {
    const projection = projectWalkingPosition([a, b], { lat: 35.8505, lng: 128.61 })!
    expect(projection.distanceFromRoute).toBeGreaterThan(800)
    expect(walkingArrival(projection, 5)).toBe(false)
  })
  it('rejects unusable points and handles repeated points without NaN', () => {
    const path = [{ lat: Number.NaN, lng: 128 }, a, a, b, { lat: 100, lng: 128 }]
    expect(cleanWalkingPath(path)).toEqual([a, b])
    expect(walkingDistance(path)).toBeCloseTo(distanceMeters(a, b), 5)
    expect(projectWalkingPosition([a, a], a)).toBeNull()
    expect(projectWalkingPosition([a, b], { lat: 35, lng: Number.POSITIVE_INFINITY })).toBeNull()
  })
  it('requires a good location close to the actual destination for arrival', () => {
    const end = projectWalkingPosition([a, b, c], c)!
    expect(walkingArrival(end, 5)).toBe(true)
    expect(walkingArrival(end, 80)).toBe(false)
    expect(walkingArrival(end, Number.NaN)).toBe(false)
    expect(walkingArrival(projectWalkingPosition([a, b, c], a)!, 5)).toBe(false)
  })
  it('does not call the start of a loop the destination on its first projection', () => {
    const loop = [a, b, c, a]
    const atStart = projectWalkingPosition(loop, a)!
    expect(atStart.progress).toBe(0)
    expect(walkingArrival(atStart, 5)).toBe(false)
  })
})
