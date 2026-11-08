import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, HomeIndicator, StatusBar } from '../components/ui'
import { JourneyMap } from '../components/JourneyMap'
import { A } from '../lib/assets'
import { useStore } from '../lib/store'
import { JourneyBadge } from './Home'
import './journey.css'
import './core.css'

const RATING_LABELS = ['', '아쉬웠어요', '조금 아쉬웠어요', '괜찮았어요', '좋았어요', '다시 걷고 싶어요']

/** 정수 별점 1~5. 저장 성공 전에는 완료 상태를 표시하지 않는다. */
export function Rating() {
  const nav = useNavigate()
  const { selectedRoute, ratings, submitRating, profile, isGuest, dataSource } = useStore()
  const [rating, setRating] = useState<number>(selectedRoute ? ratings[selectedRoute.id] || 0 : 0)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  const identity = `${dataSource}:${profile.authId || 'guest'}:${selectedRoute?.id || ''}`
  const latest = useRef(identity)
  latest.current = identity
  const preview = dataSource === 'preview'
  const needsLogin = !preview && (isGuest || !profile.loggedIn)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setRating(selectedRoute ? ratings[selectedRoute.id] || 0 : 0); setSaved(false); setError('') }, [identity])
  const selectByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, value: number) => {
    const next = event.key === 'Home' ? 1 : event.key === 'End' ? 5 : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? value % 5 + 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? (value + 3) % 5 + 1 : 0
    if (!next) return
    event.preventDefault()
    setRating(next)
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-rating="${next}"]`)?.focus()
  }
  const save = async () => {
    if (!selectedRoute || rating < 1 || rating > 5 || pending.current || needsLogin) return
    const actor = identity
    pending.current = true
    setBusy(true); setError('')
    try {
      await submitRating(selectedRoute.id, rating)
      if (mounted.current && latest.current === actor) setSaved(true)
    } catch (e) {
      if (mounted.current && latest.current === actor) setError(e instanceof Error ? e.message : '평가를 저장하지 못했어요. 다시 시도해 주세요.')
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }

  return (
    <div className="screen screen--flow journey-screen core-rating">
      <Header title="경로 안내" tone="gray" /><StatusBar />
      <main className="journey-rating-body">
        <div className="journey-map-area">
          {selectedRoute ? <JourneyMap routes={[selectedRoute]} selectedId={selectedRoute.id} className="journey-map" /> : <div className="journey-map-empty"><p className="journey-note">평가할 경로를 먼저 선택해 주세요.</p></div>}
          <div className="journey-map-caption"><JourneyBadge />{selectedRoute?.name}</div>
        </div>
        <section className="journey-rating-sheet" aria-labelledby="rating-title">
          <button className="journey-close" aria-label="평가 닫기" disabled={busy} onClick={() => nav('/guide')}><img src={A('icons/close-x.svg')} alt="" /></button>
          <h2 id="rating-title">{saved ? preview ? '샘플 평가를 남겼어요.' : '평가를 남겨주셔서 고마워요.' : '오늘의 샛길은 어땠나요?'}</h2>
          {preview && <p className="journey-note">미리보기 평가는 이 브라우저에서만 적용돼요.</p>}
          {!saved && selectedRoute && <>
            <div className="journey-stars" role="radiogroup" aria-label="별점 선택">
              {[1, 2, 3, 4, 5].map((value) => <button type="button" role="radio" data-rating={value} key={value} className={value <= rating ? 'is-on' : ''} aria-label={`${value}점, ${RATING_LABELS[value]}`} aria-checked={value === rating} tabIndex={value === (rating || 1) ? 0 : -1} disabled={busy || needsLogin} onClick={() => setRating(value)} onKeyDown={(event) => selectByKeyboard(event, value)}>★</button>)}
            </div>
            <p className="journey-rating-label" aria-live="polite">{rating ? `${rating}점 · ${RATING_LABELS[rating]}` : '별을 눌러 1~5점을 골라 주세요.'}</p>
          </>}
          {error && <p className="journey-rating-error" role="alert">{error}</p>}
          {needsLogin ? <><p className="journey-note">나의 평가를 남기려면 로그인이 필요해요.</p><button className="journey-button" onClick={() => nav('/login')}>로그인하기</button></> : saved ? <><button className="journey-button" onClick={() => nav('/home')}>오늘의 샛길로 돌아가기</button><button className="journey-text-button" onClick={() => nav(selectedRoute?.spots.length ? '/photo' : '/record')}>{selectedRoute?.spots.length ? '이 장소에 사진 남기기' : '풍경 기록 보기'}</button></> : selectedRoute ? <button className="journey-button" disabled={!rating || busy} onClick={() => void save()}>{busy ? '평가 저장 중…' : preview ? '샘플 평가 남기기' : '평가 남기기'}</button> : <button className="journey-button" onClick={() => nav('/route')}>경로 선택하기</button>}
          {!saved && <button className="journey-text-button" disabled={busy} onClick={() => nav('/home')}>이번에는 건너뛰기</button>}
        </section>
      </main><HomeIndicator />
    </div>
  )
}
