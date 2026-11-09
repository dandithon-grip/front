import { describe, expect, it } from 'vitest'
import { editedCommute } from './commuteEdit'
import { PREVIEW_COMMUTE } from './preview'
import type { EndpointDraft, TransitPath } from './types'

const home = { name: '새 집', area: '수성구', address: '집 주소', lat: 35.85, lng: 128.63 }
const work = { name: '새 회사', area: '중구', address: '회사 주소', lat: 35.87, lng: 128.59 }
const path: TransitPath = { index: 1, summary: '버스 → 지하철', total_minutes: 30, transfers: 1, walk_minutes: 5,
  legs: [
    { kind: 'walk', line: null, start_name: null, end_name: null, minutes: 5, stops: [] },
    { kind: 'bus', line: '동쪽행 버스', start_name: '집 앞 동쪽', end_name: '환승 동쪽', minutes: 10,
      stops: [{ ...home, name: '집 앞 동쪽', external_id: 'east-1' }, { ...work, name: '환승 동쪽', external_id: 'east-2' }] },
    { kind: 'subway', line: '2호선', start_name: '환승역', end_name: '회사역', minutes: 15,
      stops: [{ ...home, name: '환승역', external_id: 'rail-1' }, { ...work, name: '회사역', external_id: 'rail-2' }] },
  ] }

describe('persistent endpoint edits', () => {
  it.each(['to_work', 'to_home'] as const)('maps the %s screen back to home -> work and preserves times and preference', direction => {
    const original = { ...PREVIEW_COMMUTE, preference: 'sunset' as const, morning: '07:10', evening: '19:40' }
    const draft: EndpointDraft = { from: direction === 'to_home' ? work : home, to: direction === 'to_home' ? home : work, mode: '도보' }
    const saved = editedCommute(original, draft, direction)
    expect(saved).toMatchObject({ from: home.name, to: work.name, fromPlace: home, toPlace: work, morning: '07:10', evening: '19:40', preference: 'sunset' })
    expect(original).toMatchObject({ from: PREVIEW_COMMUTE.from, to: PREVIEW_COMMUTE.to })
  })

  it('keeps canonical transit leg order and direction-specific station IDs when saving from the home-bound map', () => {
    const saved = editedCommute(PREVIEW_COMMUTE, { from: work, to: home, mode: '대중교통', transitPaths: [path] }, 'to_home')
    expect(saved.transitLegs?.map(leg => leg.line)).toEqual(['동쪽행 버스', '2호선'])
    expect(saved.transitLegs?.flatMap(leg => leg.stops.map(stop => stop.external_id))).toEqual(['east-1', 'east-2', 'rail-1', 'rail-2'])
    expect(saved.transitLegs![0].stops[0]).not.toBe(path.legs[1].stops[0])
    expect(saved.fromPlace).not.toBe(home)
    expect(saved.fromPlace).toEqual(home)
  })

  it('keeps every chosen path as a transit option, first one mirrored into transitLegs (server#88)', () => {
    const other: TransitPath = { ...path, index: 2, summary: '버스만', transfers: 0,
      legs: [{ kind: 'bus', line: '156', start_name: '집 앞', end_name: '회사 앞', minutes: 25,
        stops: [{ ...home, name: '집 앞', external_id: 'b1' }, { ...work, name: '회사 앞', external_id: 'b2' }] }] }
    const saved = editedCommute(PREVIEW_COMMUTE, { from: home, to: work, mode: '대중교통', transitPaths: [path, other] }, 'to_work')
    expect(saved.transitOptions?.map(option => option.map(leg => leg.line))).toEqual([['동쪽행 버스', '2호선'], ['156']])
    expect(saved.transitLegs?.map(leg => leg.line)).toEqual(['동쪽행 버스', '2호선'])
  })

  it('clears old transit selections for walking and car edits', () => {
    const original = { ...PREVIEW_COMMUTE, transitLegs: [{ line: '예전 노선', stops: [] }], stationIds: ['old'], line: '예전 노선' }
    for (const mode of ['도보', '자동차'] as const) {
      expect(editedCommute(original, { from: home, to: work, mode }, 'to_work')).toMatchObject({ mode, transitLegs: [], stationIds: [], line: undefined })
    }
  })

  it('rejects invalid endpoints and transit candidates without usable boarding legs', () => {
    expect(() => editedCommute(PREVIEW_COMMUTE, { from: home, to: home, mode: '도보' }, 'to_work')).toThrow('서로 다르게')
    expect(() => editedCommute(PREVIEW_COMMUTE, { from: { ...home, lat: NaN }, to: work, mode: '도보' }, 'to_work')).toThrow('선택해 주세요')
    expect(() => editedCommute(PREVIEW_COMMUTE, { from: home, to: work, mode: '대중교통' }, 'to_work')).toThrow()
    expect(() => editedCommute(PREVIEW_COMMUTE, { from: home, to: work, mode: '대중교통', transitPath: { ...path, legs: [path.legs[0]] } }, 'to_work')).toThrow('탑승 구간')
  })
})
