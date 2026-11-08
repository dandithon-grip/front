import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/ui'
import { useStore } from '../lib/store'
import { PREFERENCE_LABELS } from '../lib/types'
import { JourneyBadge } from './Home'
import './journey.css'
import './core.css'

const TAGS = [['river', '하천길'], ['trees', '나무숲길'], ['sunset', '노을길'], ['park', '공원길'], ['bridge', '다리 건너는 길']] as const
const LANDSCAPES = [
  ['river', '하천길'], ['trees', '나무숲길'], ['sunset', '노을길'], ['night', '밤길'],
  ['season', '계절 풍경길'], ['quiet', '조용한 길'], ['active', '활기찬 길'], ['sunny', '햇살 좋은 길'],
  ['nightview', '야경길'], ['crowded', '사람 많은 길'], ['park', '공원길'], ['residential', '주택가길'],
  ['bridge', '다리 건너는 길'], ['street_trees', '가로수길'], ['alley', '골목길'],
] as const

/** 풍경 칩은 조회 전용. 실제 저장 계약이 있는 평가 가중치만 초기화한다. */
export function Preferences() {
  const nav = useNavigate()
  const { tagWeights, readTagWeights, resetTagWeights, dataSource, isGuest, profile, commute } = useStore()
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  const identity = `${dataSource}:${profile.authId || 'guest'}`
  const latest = useRef(identity)
  latest.current = identity
  const needsLogin = dataSource !== 'preview' && (isGuest || !profile.loggedIn)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let active = true
    setError(''); setMessage(''); setConfirmReset(false)
    if (needsLogin) { setLoading(false); return }
    setLoading(true)
    void readTagWeights().catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : '취향을 불러오지 못했어요.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [readTagWeights, needsLogin, identity])

  const reload = async () => {
    if (pending.current || needsLogin) return
    const actor = identity
    pending.current = true; setLoading(true); setError('')
    try { await readTagWeights() }
    catch (cause) { if (mounted.current && latest.current === actor) setError(cause instanceof Error ? cause.message : '취향을 불러오지 못했어요.') }
    finally { pending.current = false; if (mounted.current && latest.current === actor) setLoading(false) }
  }
  const reset = async () => {
    if (pending.current || needsLogin || !confirmReset) return
    const actor = identity
    pending.current = true; setResetting(true); setError(''); setMessage('')
    try {
      await resetTagWeights()
      if (mounted.current && latest.current === actor) { setConfirmReset(false); setMessage('평가로 쌓인 취향을 초기화했어요. 이전 평가와 기본 걷기 취향은 남아 있어요.') }
    } catch (cause) { if (mounted.current && latest.current === actor) setError(cause instanceof Error ? cause.message : '초기화하지 못했어요. 다시 시도해 주세요.') }
    finally { pending.current = false; if (mounted.current) setResetting(false) }
  }
  const hasWeights = Boolean(tagWeights && Object.values(tagWeights.weights).some(weight => weight !== 0))

  return <div className="screen screen--flow journey-screen core-preferences">
    <Header title="내 취향" tone="gray" />
    <main className="journey-content journey-preferences">
      <div className="journey-route-top__title"><h1 className="journey-preferences__intro">좋아했던 길을 모아<br />더 잘 맞는 샛길을 찾아드릴게요.</h1><JourneyBadge /></div>
      {dataSource === 'preview' && <p className="journey-note journey-note--preview">예시 취향이에요. 초기화도 이 브라우저에만 적용돼요.</p>}
      {needsLogin ? <div className="journey-state"><strong>내 취향을 확인하려면 로그인해 주세요.</strong><p>걷고 난 뒤 평가를 남기면 좋아하는 풍경이 쌓여요.</p><button className="journey-button" onClick={() => nav('/login')}>로그인하기</button></div> : <>
        <section className="core-landscapes" aria-labelledby="landscape-title" aria-busy={loading}>
          <h2 id="landscape-title" className="core-sr-only">풍경 취향</h2>
          <ul>{LANDSCAPES.map(([key, label]) => {
            const score = tagWeights?.weights[key] || 0
            return <li key={key} className={!loading && score > 0 ? 'is-positive' : ''}>{label}{!loading && score > 0 && <span className="core-sr-only">, 경로 평가에 반영된 취향</span>}</li>
          })}</ul>
          <p className="journey-note">직접 선택해 저장하는 기능은 준비 중이에요. 지금은 경로 평가로 반영된 취향을 확인할 수 있어요.</p>
        </section>
        {loading && <p className="journey-note" role="status">내 취향을 불러오고 있어요.</p>}
        {!loading && tagWeights?.hint && <p className="journey-preferences__hint">{tagWeights.hint.message}</p>}
        <section className="journey-preference-panel"><h2>기본 걷기 취향</h2><strong>{PREFERENCE_LABELS[commute.preference]}</strong><p className="journey-note">매일의 기본 취향은 일상 경로에서 바꿀 수 있어요.</p><button className="journey-text-button" onClick={() => nav('/my/route')}>일상 경로에서 수정하기</button></section>
        {!loading && <details className="core-weight-details"><summary>평가로 쌓인 취향 자세히 보기</summary><div className="journey-weight-list">{TAGS.map(([tag, label]) => {
          const weight = Math.max(-1, Math.min(1, tagWeights?.weights[tag] || 0))
          return <div className="journey-weight" key={tag}><span className="journey-weight__name">{label}</span><span className="journey-weight__track" aria-hidden><span className={`journey-weight__fill${weight < 0 ? ' is-negative' : ''}`} style={{ left: `${weight < 0 ? 50 + weight * 50 : 50}%`, width: `${Math.abs(weight) * 50}%` }} /></span><span className="journey-weight__value">{weight > 0 ? '+' : ''}{weight.toFixed(1)}</span></div>
        })}</div><p className="journey-note">별점이 다음 추천에 반영돼요. 아직 평가가 없으면 모든 풍경이 0에서 시작해요.</p></details>}
        {error && <div className="journey-rating-error" role="alert">{error}<button className="journey-text-button" disabled={loading || resetting} onClick={() => void reload()}>다시 불러오기</button></div>}
        {message && <p className="journey-preferences__hint" role="status">{message}</p>}
      </>}
    </main>
    {!needsLogin && !loading && <footer className="journey-preference-footer">
      {confirmReset ? <><p className="journey-note">평가로 쌓인 취향을 초기화할까요? 이전 평가와 기본 걷기 취향은 유지돼요.</p><button className="journey-button" disabled={resetting} onClick={() => void reset()}>{resetting ? '초기화 중…' : '취향 가중치 초기화'}</button><button className="journey-text-button" disabled={resetting} onClick={() => setConfirmReset(false)}>취소</button></> : <button className="journey-button journey-button--outline" disabled={!hasWeights || resetting || Boolean(error)} onClick={() => setConfirmReset(true)}>↻ 평가로 쌓인 취향 초기화</button>}
    </footer>}
  </div>
}
