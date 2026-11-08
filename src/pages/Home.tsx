import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, HomeIndicator, Nav, StatusBar, Stat } from '../components/ui'
import { A } from '../lib/assets'
import { useStore } from '../lib/store'
import { PREFERENCE_LABELS, type Preference, type RouteData } from '../lib/types'
import './journey.css'
import './core.css'

const PREFERENCES: Preference[] = ['full', 'short', 'sunset']
const ACTION_LABELS: Record<string, string> = {
  detour: '둘러가기', alight_early: '먼저 내려 걷기', board_late: '걸어가서 타기',
  after_arrival: '도착 후 산책', delay: '잠시 쉬어가기', glance: '풍경 바라보기', none: '오늘의 풍경',
}

export function routeImage(route: RouteData) {
  return A(route.tags.includes('sunset') ? 'img/home-sunset.png' : 'img/home-autumn.png')
}

export function RouteMetrics({ route }: { route: RouteData }) {
  const added = Math.round(route.add_minutes)
  return (
    <div className="stats journey-metrics">
      <Stat icon="icons/clock.svg" size={12}>{route.is_baseline ? `${Math.round(route.minutes)}분` : `${added > 0 ? '+' : ''}${added}분`}</Stat>
      <Stat icon="icons/leaf.svg" size={14}>녹지 {Math.round(route.green_pct)}%</Stat>
    </div>
  )
}

export function JourneyBadge() {
  const { dataSource, isGuest } = useStore()
  if (dataSource === 'preview') return <span className="journey-badge">미리보기</span>
  if (isGuest) return <span className="journey-badge journey-badge--guest">둘러보기</span>
  return null
}

/** 홈: 오늘의 추천 한 장과 비교 경로를 분리한다. */
export function Home() {
  const nav = useNavigate()
  const { card, preference, direction, profile, journeyStatus, journeyError, refreshJourney, selectRoute, changeDirection, commute, isGuest, dataSource, startPreview, sessionReady } = useStore()
  const [showSeason, setShowSeason] = useState(true)
  const [opening, setOpening] = useState(false)
  const openingLock = useRef(false)
  const owner = useRef('')
  owner.current = `${profile.authId || 'guest'}:${dataSource}`
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const busy = journeyStatus === 'loading'
  const guestPersonalization = dataSource !== 'preview' && isGuest

  useEffect(() => {
    if (sessionReady && journeyStatus === 'idle') void refreshJourney().catch(() => undefined)
  }, [sessionReady, journeyStatus, refreshJourney])

  const date = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })
    .format(card ? new Date(`${card.date}T12:00:00+09:00`) : new Date())
  const recommended = [...new Map([...(card?.route ? [card.route] : []), ...(card?.candidates || [])].map(route => [route.id, route])).values()].slice(0, 3)
  const openRoute = async (routeId: string) => {
    if (!routeId || busy || openingLock.current || !sessionReady) return
    const actor = owner.current
    openingLock.current = true; setOpening(true)
    try {
      if (direction !== 'to_home') await changeDirection('to_home')
      if (!mounted.current || actor !== owner.current) return
      selectRoute(routeId)
      nav('/route')
    } catch { /* refreshJourney의 오류를 홈에서 표시하고 이동하지 않는다. */ }
    finally { openingLock.current = false; if (mounted.current) setOpening(false) }
  }

  return (
    <div className="screen screen--flow screen--grad journey-screen journey-home">
      <StatusBar />
      <header className="journey-home__head">
        <p className="brand">샛길</p>
        <JourneyBadge />
      </header>
      <main className="journey-content journey-home__body">
        {dataSource === 'preview' && <p className="journey-home__preview">샘플 경로예요. 예시 기록은 이 브라우저에만 남아요.</p>}
        {showSeason && (
          <section className="season-card journey-season-card">
            <button className="season-card__x" aria-label="절기 이야기 닫기" onClick={() => setShowSeason(false)}><img src={A('icons/close-x.svg')} alt="" /></button>
            <span className="chip-date">절기 이야기 · 상강</span>
            <h2>서리가 내려앉은<br />늦가을의 풍경을 만나요.</h2>
            <button className="more" onClick={() => nav('/season')}>계절 더보기<img src={A('icons/chevron-right-gray.svg')} alt="" /></button>
          </section>
        )}
        <section className="journey-today" aria-labelledby="today-title">
          <div className="sec-title"><small>{date}</small><h1 id="today-title">오늘의 퇴근 샛길</h1></div>
          <div className="journey-chips" aria-label="오늘의 걷기 취향">
            {PREFERENCES.map((value) => (
              <button key={value} className={preference === value ? 'is-on' : ''} aria-pressed={preference === value} disabled={busy || !sessionReady || guestPersonalization} onClick={() => void refreshJourney(value).catch(() => undefined)}>{PREFERENCE_LABELS[value]}</button>
            ))}
          </div>
          {guestPersonalization && <button className="journey-text-button" onClick={() => nav('/login')}>로그인하고 나의 걷기 취향 적용하기</button>}
          {busy && <div className="journey-state" role="status"><span className="journey-loader" /><strong>오늘의 샛길을 찾고 있어요.</strong><p>잠시만 기다려 주세요.</p></div>}
          {!busy && journeyError && (
            <div className="journey-state journey-state--error" role="alert">
              <strong>샛길을 불러오지 못했어요.</strong><p>{journeyError}</p>
              <button className="journey-button journey-button--outline" onClick={() => void refreshJourney().catch(() => undefined)}>다시 불러오기</button>
              {!isGuest && <button className="journey-text-button" onClick={() => nav('/route-setup')}>일상 경로 설정하기</button>}
              {isGuest && dataSource !== 'preview' && <button className="journey-text-button" onClick={startPreview}>샘플 화면 미리보기</button>}
            </div>
          )}
          {!busy && !journeyError && card && (
            <>
              <div className="journey-home__recommendations">{recommended.map(route => (
                <button key={route.id} className="pick journey-pick" disabled={busy || opening || !sessionReady} onClick={() => void openRoute(route.id)}>
                  <img className="pick__img" src={routeImage(route)} alt="풍경 예시 이미지" />
                  <div className="pick__body">
                    <span className="tag">{route.is_baseline ? '기본 경로' : ACTION_LABELS[route.leg_type] || ACTION_LABELS[card.action_type] || '오늘의 샛길'}</span>
                    <h2 className="pick__title">{!route.is_baseline && route.add_minutes > 0 && !/분.*만날/.test(route.name) ? `${Math.round(route.add_minutes)}분 둘러가면 만날 수 있는 ` : ''}{route.name}</h2>
                    <RouteMetrics route={route} />
                  </div>
                </button>
              ))}</div>
              {opening && <p className="journey-note" role="status">선택한 퇴근길을 열고 있어요.</p>}
              <p className="journey-card-text">{card.text}</p>
              {card.deviation && <p className="journey-note">{card.deviation}</p>}
              {(card.candidates.length > 0 || card.shortest.length > 0) && <button className="journey-button journey-button--outline" onClick={() => nav('/routes')}>다른 길 보기 <span aria-hidden>→</span></button>}
              {!card.route && card.candidates.length === 0 && <p className="journey-note">오늘은 돌아가는 길 대신 익숙한 동선에서 풍경을 찾아보세요.</p>}
            </>
          )}
          {!busy && !journeyError && !card && (
            <div className="journey-state"><strong>일상에 샛길을 더해 보세요.</strong><p>{isGuest ? '로그인하고 나의 출퇴근 경로를 등록해 주세요.' : commute.configured ? '오늘의 샛길을 불러와 주세요.' : '출발지와 도착지를 등록하면 나에게 맞는 길을 찾아드려요.'}</p><button className="journey-button" onClick={() => isGuest ? nav('/login') : commute.configured ? void refreshJourney().catch(() => undefined) : nav('/route-setup')}>{isGuest ? '로그인하기' : commute.configured ? '샛길 불러오기' : '일상 경로 설정하기'}</button></div>
          )}
        </section>
      </main>
      <Nav /><HomeIndicator />
    </div>
  )
}

const INFO = [
  ['계절', '늦가을'],
  ['의미', "'서리가 내린다'는 뜻을 가진 상강은 가을의 마지막 절기예요. 겨울을 앞두고 계절이 깊어지는 시기예요."],
  ['특징', '낮과 밤의 기온 차가 커지고 아침저녁으로 쌀쌀해져요. 풀잎에 서리가 맺히고, 나뭇잎은 붉고 노랗게 물들어요.'],
  ['풍경', '서리 내린 들판, 붉게 물든 산, 차가워진 아침 공기'],
  ['추천', '단풍길 산책, 국화 감상, 따뜻한 차 마시기'],
  ['다음', '입동(立冬)'],
]

/** 정적 절기 이야기. 현재의 절기나 실제 장소 상태라고 표시하지 않는다. */
export function Season() {
  return (
    <div className="screen screen--flow screen--season journey-screen">
      <Header title="상강 소개보기" tone="gray" /><StatusBar />
      <main className="journey-content journey-season">
        <div><div className="season__hero"><img src={A('img/season-frost.png')} alt="서리가 내려앉은 풀잎과 나뭇잎" /></div><div className="season__cap">가을의 마지막,<br />24절기 중 18번째 절기</div></div>
        <ul className="info">{INFO.map(([label, value]) => <li key={label}><span className="pill">{label}</span><p>{value}</p></li>)}</ul>
        <p className="journey-note">절기와 풍경에 관한 읽을거리예요. 실제 날씨와 장소의 상태는 다를 수 있어요.</p>
      </main>
      <HomeIndicator />
    </div>
  )
}
