import type { TransitPath } from './types'

export interface TransitLineBadge { kind: 'bus' | 'subway'; name: string }
/** What a person needs to recognise "their" route: which line(s), where they get on and off, how far they walk after. */
export interface TransitPathSummary {
  lines: TransitLineBadge[]; boardAt: string; alightAt: string
  totalMinutes: number; transfers: number; walkToBoard: number; walkAfterAlight: number; rideMinutes: number
}

// Anything that is not walking is a ride (the server sends bus | subway; older fixtures say 'transit').
const isRide = (kind: string) => kind !== 'walk'
/** "대구 2호선" → "2호선", "대구 급행1" → "급행1". City prefixes repeat on every card and add nothing. */
export const shortLineName = (line: string) => line.replace(/^(대구|서울|부산|인천|광주|대전|울산)\s*(도시철도\s*)?/, '').trim() || line

export function summarizeTransitPath(path: TransitPath): TransitPathSummary {
  const rides = path.legs.filter(leg => isRide(leg.kind))
  const first = path.legs[0], last = path.legs[path.legs.length - 1]
  return {
    lines: rides.map(leg => ({ kind: leg.kind === 'subway' ? 'subway' : 'bus', name: shortLineName(leg.line || '') })),
    boardAt: rides[0]?.start_name || rides[0]?.stops[0]?.name || '',
    alightAt: rides[rides.length - 1]?.end_name || rides[rides.length - 1]?.stops[rides[rides.length - 1].stops.length - 1]?.name || '',
    totalMinutes: path.total_minutes,
    transfers: path.transfers,
    walkToBoard: first?.kind === 'walk' ? first.minutes : 0,
    walkAfterAlight: last?.kind === 'walk' ? last.minutes : 0,
    rideMinutes: rides.reduce((sum, leg) => sum + leg.minutes, 0),
  }
}

/** Fastest first; ties go to fewer transfers, then less walking. ODsay's own order is close to this but not guaranteed. */
export function sortTransitPaths(paths: TransitPath[]): TransitPath[] {
  return [...paths].sort((a, b) => a.total_minutes - b.total_minutes || a.transfers - b.transfers || a.walk_minutes - b.walk_minutes)
}
