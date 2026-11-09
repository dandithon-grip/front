import { describe, expect, it } from 'vitest'
import { shortLineName, shortRideLabel, sortTransitPaths, summarizeTransitPath } from './transitSummary'
import type { TransitPath } from './types'

const stop = (name: string, external_id: string) => ({ name, external_id, lat: 35.87, lng: 128.6 })
const bus402: TransitPath = { index: 0, summary: '402 동대구역→달서교회건너 · 도보 8분', total_minutes: 32, transfers: 0, walk_minutes: 8,
  legs: [
    { kind: 'walk', line: null, start_name: null, end_name: '동대구역', minutes: 1, stops: [] },
    { kind: 'bus', line: '402', start_name: '동대구역', end_name: '달서교회건너', minutes: 24, stops: [stop('동대구역', 'a'), stop('달서교회건너', 'b')] },
    { kind: 'walk', line: null, start_name: '달서교회건너', end_name: null, minutes: 7, stops: [] },
  ] }
const transfer: TransitPath = { index: 1, summary: '2호선 → 503', total_minutes: 29, transfers: 1, walk_minutes: 5,
  legs: [
    { kind: 'subway', line: '대구 2호선', start_name: '동대구', end_name: '반월당', minutes: 12, stops: [stop('동대구', 'c'), stop('반월당', 'd')] },
    { kind: 'walk', line: null, start_name: '반월당', end_name: '반월당네거리', minutes: 3, stops: [] },
    { kind: 'bus', line: '503', start_name: '반월당네거리', end_name: '비산우체국앞', minutes: 12, stops: [stop('반월당네거리', 'e'), stop('비산우체국앞', 'f')] },
    { kind: 'walk', line: null, start_name: '비산우체국앞', end_name: null, minutes: 2, stops: [] },
  ] }

describe('transit path card summary', () => {
  it('names the lines, the boarding and alighting stops, and the walk after alighting', () => {
    expect(summarizeTransitPath(bus402)).toEqual({
      lines: [{ kind: 'bus', name: '402' }], boardAt: '동대구역', alightAt: '달서교회건너',
      totalMinutes: 32, transfers: 0, walkToBoard: 1, walkAfterAlight: 7, rideMinutes: 24,
    })
  })
  it('lists every ride of a transfer trip in order and shortens line names', () => {
    const summary = summarizeTransitPath(transfer)
    expect(summary.lines).toEqual([{ kind: 'subway', name: '2호선' }, { kind: 'bus', name: '503' }])
    expect(summary.boardAt).toBe('동대구')
    expect(summary.alightAt).toBe('비산우체국앞')
    expect(summary.walkToBoard).toBe(0)
    expect(summary.walkAfterAlight).toBe(2)
  })
  it('orders paths by total time, then fewer transfers, then less walking', () => {
    const slowNoTransfer = { ...bus402, index: 2, total_minutes: 35 }
    const sameTimeMoreWalk = { ...bus402, index: 3, total_minutes: 29, transfers: 1, walk_minutes: 9 }
    expect(sortTransitPaths([slowNoTransfer, bus402, sameTimeMoreWalk, transfer]).map(path => path.index)).toEqual([1, 3, 0, 2])
  })
})

describe('ride labels', () => {
  it('shortens every line in a transfer label and keeps the arrow', () => {
    expect(shortRideLabel('대구 1호선 → 724')).toBe('1호선 → 724')
    expect(shortRideLabel('402')).toBe('402')
    expect(shortLineName('대구 도시철도 2호선')).toBe('2호선')
  })
})
