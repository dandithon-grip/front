import { sortTransitPaths, summarizeTransitPath } from '../lib/transitSummary'
import type { TransitPath } from '../lib/types'

export const MAX_TRANSIT_OPTIONS = 3

interface Props {
  paths: TransitPath[]; selected: number[]; onToggle: (index: number) => void
  name: string; disabled?: boolean; max?: number
}

/** Usual-route cards: line badge, boarding/alighting stop, walk after alighting. Up to `max` can be checked (server#88). */
export function TransitPathCards({ paths, selected, onToggle, name, disabled = false, max = MAX_TRANSIT_OPTIONS }: Props) {
  const ordered = sortTransitPaths(paths)
  const full = selected.length >= max
  return <>
    {ordered.length > 0 && <p className="setup-hint setup-transit__hint">평소 타는 노선을 모두 골라 주세요 (최대 {max}개). 먼저 오는 걸 타도 괜찮아요. 노선마다 샛길을 미리 만들어 두고, 매일 탄 노선을 홈에서 고를 수 있어요.</p>}
    {ordered.map((path, order) => {
      const summary = summarizeTransitPath(path)
      const checked = selected.includes(path.index)
      return <label className={`flow-card setup-transit__path${checked ? ' is-selected' : ''}${!checked && full ? ' is-full' : ''}`} key={path.index}>
        <input type="checkbox" name={name} aria-label={`${path.summary} 선택`} checked={checked} disabled={disabled || (!checked && full)} onChange={() => onToggle(path.index)} />
        <div className="setup-transit__body">
          <div className="setup-transit__head">
            <span className="setup-transit__lines">{summary.lines.map((line, index) => <span key={index} className={`setup-transit__line setup-transit__line--${line.kind}`}>{line.kind === 'subway' ? '🚇' : '🚌'} {line.name}</span>)}</span>
            <strong>{summary.totalMinutes}분</strong>
          </div>
          <p className="setup-transit__stops"><b>{summary.boardAt}</b> 승차 → <b>{summary.alightAt}</b> 하차</p>
          <p className="setup-transit__meta">
            {order === 0 && <span className="setup-transit__badge">가장 빠름</span>}
            {summary.transfers > 0 ? `환승 ${summary.transfers}회 · ` : ''}
            {summary.walkToBoard > 0 ? `정류장까지 ${summary.walkToBoard}분 · ` : ''}
            내려서 {summary.walkAfterAlight}분 걸어요
          </p>
          <details className="setup-transit__detail"><summary>자세히</summary>
            <ol>{path.legs.map((leg, index) => <li key={index}>{leg.line || (leg.kind === 'walk' ? '도보' : '이동')}{leg.start_name && ` · ${leg.start_name}`}{leg.end_name && ` → ${leg.end_name}`} <span>{leg.minutes}분</span></li>)}</ol>
          </details>
        </div>
      </label>
    })}
  </>
}

/** Toggle helper shared by the setup flow and the endpoint editor. */
export function toggleSelection(selected: number[], index: number, max = MAX_TRANSIT_OPTIONS): number[] {
  if (selected.includes(index)) return selected.filter(value => value !== index)
  return selected.length >= max ? selected : [...selected, index]
}
