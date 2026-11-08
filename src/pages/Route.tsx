import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, HomeIndicator, Nav, StatusBar } from '../components/ui'
import { JourneyMap } from '../components/JourneyMap'
import { A } from '../lib/assets'
import { buildKakaoDirections } from '../lib/map'
import { useStore } from '../lib/store'
import { useWalking } from '../lib/useWalking'
import type { Mode, OneTimeTrip, PlaceLocation, Point, RouteData } from '../lib/types'
import { JourneyBadge, RouteMetrics, routeImage } from './Home'
import { OneTimeRouteEditor } from './OneTimeRouteEditor'
import './journey.css'
import './walking.css'

function uniqueRoutes(routes: RouteData[]) {
  return [...new Map(routes.map((route) => [route.id, route])).values()]
}

function RouteComparison({ route }: { route: RouteData }) {
  return <dl className="journey-comparison">
    <div><dt>소요 시간</dt><dd>{Math.round(route.minutes)}<small>분</small></dd></div>
    <div><dt>녹지 비율</dt><dd>{Math.round(route.green_pct)}<small>%</small></dd></div>
    <div><dt>더 걷는 시간</dt><dd>{route.add_minutes > 0 ? '+' : ''}{Math.round(route.add_minutes)}<small>분</small></dd></div>
  </dl>
}

function useJourneyRoutes() {
  const store = useStore()
  const { routes, card, journeyStatus, sessionReady, refreshJourney } = store
  useEffect(() => {
    if (sessionReady && journeyStatus === 'idle' && !store.oneTimeTrip) void refreshJourney().catch(() => undefined)
  }, [sessionReady, journeyStatus, refreshJourney, store.oneTimeTrip])
  const available = useMemo(() => uniqueRoutes([
    ...(routes?.candidates || card?.candidates || []),
    ...(routes?.shortest || card?.shortest || []),
  ]), [routes, card])
  return { ...store, available }
}

function RouteProblem() {
  const nav = useNavigate()
  const { journeyStatus, journeyError, refreshJourney, isGuest } = useStore()
  if (journeyStatus === 'loading') return <div className="journey-state" role="status"><span className="journey-loader" /><strong>경로를 불러오고 있어요.</strong></div>
  return (
    <div className="journey-state" role={journeyError ? 'alert' : undefined}>
      <strong>{journeyError ? '경로를 불러오지 못했어요.' : '아직 표시할 경로가 없어요.'}</strong>
      <p>{journeyError || '오늘의 샛길이 준비되면 이곳에서 비교할 수 있어요.'}</p>
      <button className="journey-button journey-button--outline" onClick={() => void refreshJourney().catch(() => undefined)}>다시 불러오기</button>
      <button className="journey-text-button" onClick={() => nav(isGuest ? '/login' : '/route-setup')}>{isGuest ? '로그인하고 내 경로 만들기' : '일상 경로 설정하기'}</button>
    </div>
  )
}

function OneTimeTripDetails({ trip, onRestore }: { trip: OneTimeTrip; onRestore: () => void }) {
  const path = trip.transitPath
  return <section className="journey-one-time" aria-label="이번 탐색 정보">
    <div className="journey-route-top__title"><h2>이번 탐색 · {trip.mode}</h2><span className="journey-badge">일회성</span></div>
    <p className="journey-note">일상 경로는 그대로 보관하고 있어요. 이번 탐색은 앱을 새로 열면 초기화돼요.</p>
    {path && <>
      <h3>{path.summary}</h3>
      <p className="journey-one-time__metrics">총 {path.total_minutes}분 · 환승 {path.transfers}회 · 도보 {path.walk_minutes}분</p>
      <ol className="journey-one-time__legs">{path.legs.map((leg, index) => <li key={index}>
        <strong>{leg.kind === 'walk' ? '도보 이동' : `${leg.kind === 'bus' ? '버스' : '지하철'} ${leg.line || ''}`} <small>{leg.minutes}분</small></strong>
        {(leg.start_name || leg.end_name) && <p>{leg.start_name || '출발'} → {leg.end_name || '도착'}</p>}
        {leg.stops.length > 0 && <details><summary>정류장 {leg.stops.length}개 보기</summary><p>{leg.stops.map(stop => stop.name).join(' → ')}</p></details>}
      </li>)}</ol>
    </>}
    <p className="journey-one-time__notice">지도에는 출발·도착 위치를 표시해요. 이번 탐색의 보행 경로선과 걷기 안내는 아직 지원하지 않아요.</p>
    <button type="button" className="journey-button journey-button--outline" onClick={onRestore}>일상 경로로 돌아가기</button>
  </section>
}

interface TripEditorDraft { from?: PlaceLocation; to?: PlaceLocation; mode: Mode; side: 'from' | 'to'; owner: string }

/** 실제 경로 후보와 최단 경로를 같은 지도에서 비교한다. */
export function RouteMap() {
  const nav = useNavigate()
  const { available, commute, direction, changeDirection, selectedRoute, selectRoute, journeyStatus, journeyError, dataSource, isGuest, sessionReady,
    profile, oneTimeTrip, applyOneTimeTrip, clearOneTimeTrip } = useJourneyRoutes()
  const [editor, setEditor] = useState<TripEditorDraft | null>(null)
  const owner = `${dataSource}:${profile.authId || 'guest'}`
  useEffect(() => { setEditor(null) }, [owner])
  const busy = journeyStatus === 'loading' || !sessionReady
  const guestPersonalization = dataSource !== 'preview' && isGuest
  const from = oneTimeTrip?.from.name ?? (guestPersonalization ? '데모 보행구간의 시작점' : direction === 'to_work' ? commute.from : commute.to)
  const to = oneTimeTrip?.to.name ?? (guestPersonalization ? '데모 보행구간의 도착점' : direction === 'to_work' ? commute.to : commute.from)
  const openEditor = (side: 'from' | 'to', swap = false) => {
    const demoPlace = (point: Point | undefined, name: string) => point ? { ...point, name, address: '', area: '대구' } : undefined
    const path = selectedRoute?.polyline
    const baseFrom = guestPersonalization ? demoPlace(path?.[0], from) : direction === 'to_work' ? commute.fromPlace : commute.toPlace
    const baseTo = guestPersonalization ? demoPlace(path?.[path.length - 1], to) : direction === 'to_work' ? commute.toPlace : commute.fromPlace
    const start = oneTimeTrip?.from ?? baseFrom, end = oneTimeTrip?.to ?? baseTo
    setEditor({ from: swap ? end : start, to: swap ? start : end, mode: oneTimeTrip?.mode ?? (guestPersonalization ? '도보' : commute.mode), side, owner })
  }

  return (
    <div className="screen screen--flow journey-screen journey-route-screen">
      <StatusBar />
      <div className="journey-route-scroll">
      <header className="journey-route-top">
        <div className="journey-route-top__title"><h1>나의 샛길</h1><JourneyBadge /></div>
        <div className="journey-location-pair">
          <button className="journey-swap" aria-label={oneTimeTrip ? '이번 탐색 출발·도착 바꾸기' : '출근·퇴근 방향 바꾸기'} disabled={oneTimeTrip ? !sessionReady : busy || guestPersonalization} onClick={() => oneTimeTrip ? openEditor('from', true) : void changeDirection(direction === 'to_home' ? 'to_work' : 'to_home').catch(() => undefined)}>⇅</button>
          <div className="journey-location-pair__fields">
            <button type="button" aria-label="출발지 수정" title={from} disabled={!sessionReady} onClick={() => openEditor('from')}><span>출발 · {from || '출발지 선택'}</span><span aria-hidden>✎</span></button>
            <button type="button" aria-label="도착지 수정" title={to} disabled={!sessionReady} onClick={() => openEditor('to')}><span>도착 · {to || '도착지 선택'}</span><span aria-hidden>✎</span></button>
          </div>
        </div>
        {!oneTimeTrip && <div className="journey-direction" aria-label="이동 방향">
          <button className={direction === 'to_work' ? 'is-on' : ''} aria-pressed={direction === 'to_work'} disabled={busy || guestPersonalization} onClick={() => void changeDirection('to_work').catch(() => undefined)}>등교·출근</button>
          <button className={direction === 'to_home' ? 'is-on' : ''} aria-pressed={direction === 'to_home'} disabled={busy} onClick={() => void changeDirection('to_home').catch(() => undefined)}>하교·퇴근</button>
        </div>}
        <p className="journey-note">출발·도착을 누르면 일상 경로를 바꾸지 않고 이번 탐색만 수정할 수 있어요.</p>
        {!oneTimeTrip && guestPersonalization && <button className="journey-text-button" onClick={() => nav('/login')}>로그인하고 출근길도 살펴보기</button>}
        {!oneTimeTrip && journeyError && available.length > 0 && <p className="journey-rating-error" role="alert">{journeyError}</p>}
      </header>
      <main className="journey-map-area">
        {oneTimeTrip ? <><JourneyMap locations={[oneTimeTrip.from, oneTimeTrip.to]} className="journey-map" /><div className="journey-map-caption">이번 탐색 · 출발·도착 위치</div></>
          : available.length > 0 ? <><JourneyMap routes={available} selectedId={selectedRoute?.id} onSelect={selectRoute} className="journey-map" /><div className="journey-map-caption"><span><i className="journey-line-key" />샛길</span><span><i className="journey-line-key journey-line-key--short" />최단</span>{dataSource === 'preview' && <span>샘플 경로</span>}</div></> : <div className="journey-map-empty"><RouteProblem /></div>}
      </main>
      {oneTimeTrip && <OneTimeTripDetails trip={oneTimeTrip} onRestore={clearOneTimeTrip} />}
      {!oneTimeTrip && available.length > 0 && <section className="journey-route-bottom" aria-label="경로 선택">
        <div className="journey-carousel">{available.map((route) => (
          <article key={route.id} className={`journey-route-card${selectedRoute?.id === route.id ? ' is-sel' : ''}`}>
            <button className="journey-route-card__select" aria-pressed={selectedRoute?.id === route.id} onClick={() => selectRoute(route.id)}><strong>{route.name}</strong><span className="journey-route-check" aria-hidden>{selectedRoute?.id === route.id ? '✓' : ''}</span></button>
            <RouteComparison route={route} />
            <button className="journey-button" disabled={busy} onClick={() => { selectRoute(route.id); nav('/guide') }}>이 길로 걷기 <span aria-hidden>↗</span></button>
          </article>
        ))}</div>
        <button className="journey-text-button" onClick={() => nav('/routes')}>다른 길 자세히 보기</button>
      </section>}
      </div>
      <Nav /><HomeIndicator />
      {editor && editor.owner === owner && <OneTimeRouteEditor from={editor.from} to={editor.to} mode={editor.mode} initialSide={editor.side}
        onClose={() => setEditor(null)} onApply={trip => { applyOneTimeTrip(trip, editor.owner); setEditor(null) }} />}
    </div>
  )
}

/** 후보를 시간·녹지율과 함께 비교하는 별도 목록. */
export function OtherRoutes() {
  const nav = useNavigate()
  const { available, selectedRoute, selectRoute, dataSource, oneTimeTrip, clearOneTimeTrip } = useJourneyRoutes()
  return (
    <div className="screen screen--flow screen--grad journey-screen">
      <Header title="다른 길 보기" tone="gray" /><StatusBar />
      <main className="journey-content journey-route-list">
        <div className="journey-route-top__title"><p className="journey-note">같은 동선에서도 다른 풍경을 만날 수 있어요.</p><JourneyBadge /></div>
        {dataSource === 'preview' && <p className="journey-note journey-note--preview">비교를 위한 샘플 경로예요.</p>}
        {oneTimeTrip ? <><OneTimeTripDetails trip={oneTimeTrip} onRestore={clearOneTimeTrip} /><button className="journey-button" onClick={() => nav('/route')}>이번 탐색 지도 보기</button></> : available.length === 0 ? <RouteProblem /> : available.map((route) => (
          <button key={route.id} className={`pick journey-pick${selectedRoute?.id === route.id ? ' is-sel' : ''}`} onClick={() => { selectRoute(route.id); nav('/route') }}>
            <img className="pick__img" src={routeImage(route)} alt="풍경 예시 이미지" />
            <div className="pick__body"><span className="tag">{route.is_baseline ? '최단 경로' : route.highlights[0] || '자연을 지나는 길'}</span><h2 className="pick__title">{route.name}</h2><RouteMetrics route={route} />{selectedRoute?.id === route.id && <span className="journey-list-selected">선택한 경로</span>}</div>
          </button>
        ))}
      </main><HomeIndicator />
    </div>
  )
}

const formatDistance = (meters: number) => meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.max(0, Math.round(meters))}m`

/** 실제 위치로 걷기를 진행하며 외부 길찾기는 보조로 제공한다. */
export function Guide() {
  const nav = useNavigate()
  const { selectedRoute: baseRoute, commute, direction, dataSource, journeyStatus, profile, oneTimeTrip, clearOneTimeTrip } = useJourneyRoutes()
  const selectedRoute = oneTimeTrip ? null : baseRoute
  const walking = useWalking(selectedRoute, `${dataSource}:${profile.authId || 'guest'}:${direction}:${oneTimeTrip ? 'one-time' : 'commute'}`)
  const [follow, setFollow] = useState(true), [focusKey, setFocusKey] = useState(0), [overviewKey, setOverviewKey] = useState(0)
  const remaining = walking.status === 'arrived' ? 0 : walking.projection?.remainingMeters ?? walking.totalMeters
  const progress = walking.status === 'arrived' ? 100 : Math.round((walking.projection?.progress || 0) * 100)
  const expectedMinutes = selectedRoute && walking.totalMeters > 0 ? Math.max(1, Math.ceil(selectedRoute.minutes * remaining / walking.totalMeters)) : null
  const estimateText = walking.status === 'arrived' ? '도착을 확인했어요'
    : walking.status === 'paused' ? '일시정지 중 · 다시 시작하면 예상 시간을 확인해요'
      : walking.status === 'stopped' ? '걷기 종료 · 위치 확인을 멈췄어요'
        : walking.error || walking.warning || walking.status === 'locating' ? '정확한 위치를 확인한 뒤 예상 시간을 표시해요'
          : expectedMinutes ? `${walking.status === 'idle' ? '전체 ' : ''}약 ${expectedMinutes}분 ${walking.status === 'idle' ? '소요' : '남음'} (예상)` : ''
  const begin = () => { setFollow(true); setFocusKey(value => value + 1); walking.start() }
  const statusText = walking.status === 'arrived' ? '샛길 끝에 도착했어요!'
    : walking.status === 'locating' ? '현재 위치를 확인하고 있어요'
      : walking.status === 'paused' ? '걷기를 잠시 멈췄어요'
        : walking.status === 'stopped' ? '걷기를 종료했어요'
          : walking.status === 'error' ? '현재 위치를 다시 확인해 주세요'
            : walking.status === 'walking' ? '초록색 샛길을 따라 걸어보세요' : '오늘의 샛길을 걸어볼까요?'
  const link = selectedRoute && selectedRoute.polyline.length >= 2 ? buildKakaoDirections(selectedRoute, commute, direction) : ''
  return (
    <div className="screen screen--flow journey-screen journey-guide walking-guide">
      <Header title="경로 안내" tone="gray" /><StatusBar />
      {oneTimeTrip ? <main className="journey-content journey-route-list"><OneTimeTripDetails trip={oneTimeTrip} onRestore={clearOneTimeTrip} /><button className="journey-button" onClick={() => nav('/route')}>이번 탐색 지도로 돌아가기</button></main> : selectedRoute ? <>
        <div className="journey-map-area walking-map-area">
          <JourneyMap routes={[selectedRoute]} selectedId={selectedRoute.id} className="journey-map" position={walking.fix} follow={follow}
            focusKey={focusKey} overviewKey={overviewKey} onFollowChange={setFollow} />
          <div className="walking-instruction">
            <img src={A('icons/leaf.svg')} alt="" />
            <div><strong aria-live="polite">{statusText}</strong><span>{selectedRoute.name} · {formatDistance(remaining)} 남음</span></div>
          </div>
          <div className="walking-map-controls">
            <button type="button" aria-pressed={follow} disabled={!walking.fix} onClick={() => { setFollow(true); setFocusKey(value => value + 1) }}>◎ <span>현재 위치</span></button>
            <button type="button" onClick={() => { setFollow(false); setOverviewKey(value => value + 1) }}>⌁ <span>전체 경로</span></button>
          </div>
          {dataSource === 'preview' && <span className="walking-preview-badge">예시 연결선 · 실제 보행 경로 아님</span>}
        </div>
        <section className="journey-guide__sheet walking-sheet">
          <div className="walking-sheet__top"><h2>{walking.status === 'arrived' ? '오늘도 한 걸음, 잘 걸었어요.' : walking.status === 'stopped' ? '걷기를 마쳤어요.' : selectedRoute.highlights[0] || '일상 가까이 자연을 만나보세요.'}</h2><span>{walking.fix ? `정확도 ±${Math.round(walking.fix.accuracy)}m` : 'GPS 대기'}</span></div>
          <div className="walking-progress" role="progressbar" aria-label="샛길 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
          <div className="walking-metrics"><strong>{formatDistance(remaining)} <small>남음</small></strong><span>{progress}% · {Math.floor(walking.elapsedSeconds / 60)}분 {walking.elapsedSeconds % 60}초</span></div>
          <p className="walking-estimate">{estimateText}</p>
          {walking.error && <p className="walking-message walking-message--error" role="alert">{walking.error}</p>}
          {walking.warning && <p className="walking-message" role="status">{walking.warning}</p>}
          {walking.status === 'idle' && <><p className="walking-help">{dataSource === 'preview' ? '실제 길 안내가 아닌 GPS 기능 확인용이에요. 거리와 진행률도 예시 연결선 기준으로 계산해요.' : '현재 위치를 허용하면 이 화면에서 남은 거리와 도착을 확인할 수 있어요.'}</p><button className="journey-button" disabled={walking.totalMeters < 1} onClick={begin}>{dataSource === 'preview' ? '예시 연결선으로 GPS 기능 확인' : '이 샛길 걷기 시작'}</button></>}
          {walking.isActive && <div className="walking-actions"><button className="journey-button journey-button--outline" onClick={() => walking.pause()}>{walking.status === 'locating' ? '위치 확인 멈추기' : '일시정지'}</button><button className="journey-button journey-button--outline" onClick={walking.stop}>걷기 종료</button></div>}
          {walking.status === 'paused' && <div className="walking-actions"><button className="journey-button" onClick={begin}>이어서 걷기</button><button className="journey-button journey-button--outline" onClick={walking.stop}>걷기 종료</button></div>}
          {walking.status === 'error' && <div className="walking-actions"><button className="journey-button" onClick={begin}>위치 다시 확인</button><button className="journey-button journey-button--outline" onClick={walking.stop}>걷기 종료</button></div>}
          {(walking.status === 'arrived' || walking.status === 'stopped') && <><button className="journey-button" onClick={() => nav('/rating')}>걷기 마치고 평가하기</button><div className="walking-actions">{selectedRoute.spots.length > 0 && <button className="journey-text-button" onClick={() => nav('/photo')}>풍경 사진 남기기</button>}<button className="journey-text-button" onClick={begin}>다시 걷기</button></div></>}
          <details className="walking-more"><summary>걷기 안내와 다른 지도</summary><p>진행률은 현재 위치와 선택한 경로 선으로 계산해요. 남은 시간은 경로의 소요 시간과 남은 거리 비율로 추정해요. 위치는 이 화면에서만 사용하며 이동 이력을 저장하지 않아요. 화면을 벗어나면 일시정지해요.</p><p>회전별 도로 안내가 필요하면 카카오맵도 이용할 수 있어요. 외부 지도는 샛길의 시작·끝 지점으로 길을 다시 찾으므로 표시한 선과 다를 수 있어요.</p>{link && <a href={link} target="_blank" rel="noopener noreferrer">카카오맵으로도 길 찾기 ↗</a>}<button type="button" onClick={() => nav('/routes')}>다른 길 살펴보기</button></details>
        </section>
      </> : <main className="journey-content journey-route-list"><RouteProblem />{journeyStatus !== 'loading' && <button className="journey-text-button" onClick={() => nav('/route')}>경로 선택으로 돌아가기</button>}</main>}
      <HomeIndicator />
    </div>
  )
}
