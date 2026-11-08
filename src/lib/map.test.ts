import { describe, expect, it } from 'vitest'
import { buildKakaoDirections } from './map'
import type { Commute, Point, RouteData } from './types'

const commute: Commute = {
  from: '집', to: '회사',
  fromPlace: { name: '집', address: '', area: '수성구', lat: 35.85, lng: 128.63 },
  toPlace: { name: '회사', address: '', area: '중구', lat: 35.87, lng: 128.59 },
  morning: '08:30', evening: '18:10', mode: '도보', preference: 'full', configured: true,
}

function route(polyline: Point[], name = '신천 노을길'): RouteData {
  return {
    id: 'route-1', leg_type: 'walk', is_baseline: false, name, minutes: 20, add_minutes: 5,
    green_pct: 64, event_score: 0, score: 1, tags: [], highlights: [], polyline, spots: [], alight_station_id: null,
  }
}

function entries(url: string) {
  return new URL(url).pathname.split('/').slice(4).map(decodeURIComponent)
}

describe('buildKakaoDirections', () => {
  it('uses the actual outbound polyline endpoints, including a route that begins after transit', () => {
    const url = buildKakaoDirections(route([
      { lat: 35.861, lng: 128.612 }, { lat: 35.865, lng: 128.605 }, { lat: 35.869, lng: 128.598 },
    ]), commute, 'to_work')
    expect(new URL(url).origin).toBe('https://map.kakao.com')
    expect(entries(url)).toEqual(['샛길 시작,35.861,128.612', '신천 노을길,35.869,128.598'])
  })

  it('keeps the return-route polyline direction instead of reversing it a second time', () => {
    const url = buildKakaoDirections(route([
      { lat: 35.869, lng: 128.598 }, { lat: 35.865, lng: 128.605 }, { lat: 35.861, lng: 128.612 },
    ]), commute, 'to_home')
    expect(entries(url)).toEqual(['샛길 시작,35.869,128.598', '신천 노을길,35.861,128.612'])
  })

  it('falls back to home → work when outbound geometry is unavailable', () => {
    expect(entries(buildKakaoDirections(route([]), commute, 'to_work')))
      .toEqual(['샛길 시작,35.85,128.63', '신천 노을길,35.87,128.59'])
  })

  it('falls back to work → home when return geometry is unavailable', () => {
    expect(entries(buildKakaoDirections(route([]), commute, 'to_home')))
      .toEqual(['샛길 시작,35.87,128.59', '신천 노을길,35.85,128.63'])
  })

  it('ignores non-finite points before selecting route endpoints', () => {
    const url = buildKakaoDirections(route([
      { lat: Number.NaN, lng: 128.6 }, { lat: 35.861, lng: 128.612 },
      { lat: 35.869, lng: 128.598 }, { lat: 35.88, lng: Number.POSITIVE_INFINITY },
    ]), commute, 'to_work')
    expect(entries(url)).toEqual(['샛길 시작,35.861,128.612', '신천 노을길,35.869,128.598'])
    expect(url).not.toMatch(/NaN|Infinity/)
  })

  it('encodes route names so slashes, query characters and fragments stay inside the destination name', () => {
    const name = '하천 / 노을 & 산책길? #1'
    const url = buildKakaoDirections(route([{ lat: 35.8, lng: 128.6 }, { lat: 35.9, lng: 128.7 }], name), commute, 'to_work')
    expect(entries(url)).toEqual(['샛길 시작,35.8,128.6', `${name},35.9,128.7`])
    expect(url).toContain(encodeURIComponent(name))
    expect(new URL(url).search).toBe('')
    expect(new URL(url).hash).toBe('')
  })

  it('returns the map homepage rather than a broken directions URL without usable locations', () => {
    expect(buildKakaoDirections(route([]), { ...commute, fromPlace: undefined, toPlace: undefined }, 'to_home'))
      .toBe('https://map.kakao.com/')
  })
})
