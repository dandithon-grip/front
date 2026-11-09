import { create } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'
import type { RouteData } from '../lib/types'
import { RouteSketch, sketchPaths } from './RouteSketch'

const H = { lat: 35.86, lng: 128.6 }, S = { lat: 35.86, lng: 128.603 }, P = { lat: 35.8612, lng: 128.61 }, W = { lat: 35.86, lng: 128.611 }
const route: RouteData = { id: 'r', leg_type: 'back_walk', is_baseline: false, name: '샛길', minutes: 10, add_minutes: 3, green_pct: 30, event_score: 0, score: 1, tags: [], highlights: [],
  polyline: [S, P, W], spots: [], alight_station_id: null,
  journey: [{ kind: 'walk', role: 'usual', polyline: [H, S], minutes: 3, line: null, from_name: null, to_name: null },
    { kind: 'walk', role: 'saetgil', polyline: [S, P, W], minutes: 10, line: null, from_name: null, to_name: null }] }

describe('route sketch thumbnail', () => {
  it('draws the changed walking piece as the highlight and the rest faintly, scaled into the box', () => {
    const paths = sketchPaths(route, 100, 100)
    expect(paths.map(path => path.role)).toEqual(['usual', 'saetgil'])
    const all = paths.flatMap(path => path.points)
    expect(Math.min(...all.map(p => p.x))).toBeGreaterThanOrEqual(0)
    expect(Math.max(...all.map(p => p.x))).toBeLessThanOrEqual(100)
    expect(Math.max(...all.map(p => p.y))).toBeLessThanOrEqual(100)
    // 동서로 긴 길은 가로를 꽉 채운다
    expect(Math.max(...all.map(p => p.x)) - Math.min(...all.map(p => p.x))).toBeGreaterThanOrEqual(80)
  })
  it('falls back to the plain polyline when there is no journey', () => {
    const paths = sketchPaths({ ...route, journey: undefined }, 100, 100)
    expect(paths).toHaveLength(1)
    expect(paths[0].role).toBe('saetgil')
  })
  it('renders an svg with no external resources', () => {
    const json = JSON.stringify(create(<RouteSketch route={route} />).toJSON())
    expect(json).toContain('"type":"svg"')
    expect(json).not.toContain('http')
  })
})
