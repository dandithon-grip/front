import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, HomeIndicator, Nav, StatusBar } from '../components/ui'
import { JourneyMap } from '../components/JourneyMap'
import { A } from '../lib/assets'
import { buildKakaoDirections } from '../lib/map'
import { useStore } from '../lib/store'
import { useWalking } from '../lib/useWalking'
import { editedCommute } from '../lib/commuteEdit'
import type { Direction, EndpointDraft, Mode, PlaceLocation, Point, RouteData } from '../lib/types'
import { JourneyBadge, RouteMetrics, routeImage } from './Home'
import { RouteEndpointEditor } from './RouteEndpointEditor'
import './journey.css'
import './walking.css'

function uniqueRoutes(routes: RouteData[]) {
  return [...new Map(routes.map((route) => [route.id, route])).values()]
}

/** 도착 후 산책은 "길"이 아니라 도착한 뒤의 걷기라 버튼 문구를 바꾼다. */
export function walkLabel(route: RouteData): string {
  if (route.leg_type === 'after_arrival') return `도착하고 ${Math.round(route.minutes)}분 산책`
  return route.is_baseline ? '평소 길로 걷기' : '이 길로 걷기'
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
    if (sessionReady && journeyStatus === 'idle') void refreshJourney().catch(() => undefined)
  }, [sessionReady, journeyStatus, refreshJourney])
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

interface EndpointEditorDraft {
  from?: PlaceLocation; to?: PlaceLocation; mode: Mode; side: 'from' | 'to'; direction: Direction; owner: string; id: number
}

/** 실제 경로 후보와 최단 경로를 같은 지도에서 비교한다. */
export function RouteMap() {
  const nav = useNavigate()
  const { available, commute, direction, changeDirection, selectedRoute, selectRoute, journeyStatus, journeyError, dataSource, isGuest, sessionReady, profile, saveCommute } = useJourneyRoutes()
  const [editor, setEditor] = useState<EndpointEditorDraft | null>(null)
  const editorRef = useRef(editor), sequence = useRef(0), mounted = useRef(true)
  editorRef.current = editor
  const owner = `${dataSource}:${profile.authId || 'guest'}:${profile.loggedIn}:${direction}`
  const currentOwner = useRef(owner)
  currentOwner.current = owner
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setEditor(null) }, [owner])
  const busy = journeyStatus === 'loading' || !sessionReady
  const guestPersonalization = dataSource !== 'preview' && isGuest
  const from = guestPersonalization ? '데모 보행구간의 시작점' : direction === 'to_work' ? commute.from : commute.to
  const to = guestPersonalization ? '데모 보행구간의 도착점' : direction === 'to_work' ? commute.to : commute.from
  const openEditor = (side: 'from' | 'to') => {
    const demoPlace = (point: Point | undefined, name: string) => point ? { ...point, name, address: '', area: '대구' } : undefined
    const path = selectedRoute?.polyline
    setEditor({ from: guestPersonalization ? demoPlace(path?.[0], from) : direction === 'to_work' ? commute.fromPlace : commute.toPlace,
      to: guestPersonalization ? demoPlace(path?.[path.length - 1], to) : direction === 'to_work' ? commute.toPlace : commute.fromPlace,
      mode: guestPersonalization ? '도보' : commute.mode, side, direction, owner, id: ++sequence.current })
  }
  const saveEndpoints = async (draft: EndpointDraft, operation: EndpointEditorDraft) => {
    if (dataSource !== 'api' || isGuest || !profile.loggedIn || !profile.authId) throw new Error('로그인 후 출퇴근 위치를 저장하고 실제 경로를 검색할 수 있어요.')
    if (currentOwner.current !== operation.owner || editorRef.current?.id !== operation.id) throw new Error('로그인 정보가 변경됐어요. 다시 시도해 주세요.')
    await saveCommute(editedCommute(commute, draft, operation.direction), { direction: operation.direction, expectedUserId: profile.authId })
    if (mounted.current && currentOwner.current === operation.owner && editorRef.current?.id === operation.id) setEditor(null)
  }

  return (
    <div className="screen screen--flow journey-screen journey-route-screen">
      <StatusBar />
      <div className="journey-route-scroll">
      <header className="journey-route-top">
        <div className="journey-route-top__title"><h1>나의 샛길</h1><JourneyBadge /></div>
        <div className="journey-location-pair">
          <button className="journey-swap" aria-label="출근·퇴근 방향 바꾸기" disabled={busy || guestPersonalization} onClick={() => void changeDirection(direction === 'to_home' ? 'to_work' : 'to_home').catch(() => undefined)}>⇅</button>
          <div className="journey-location-pair__fields">
            <button type="button" aria-label="출발지 수정" title={from} disabled={busy} onClick={() => openEditor('from')}><span>출발 · {from || '출발지 선택'}</span><span aria-hidden>✎</span></button>
            <button type="button" aria-label="도착지 수정" title={to} disabled={busy} onClick={() => openEditor('to')}><span>도착 · {to || '도착지 선택'}</span><span aria-hidden>✎</span></button>
          </div>
        </div>
        <p className="journey-note">출발·도착을 눌러 출퇴근 위치를 저장하면 실제 경로를 다시 찾아요.</p>
        {dataSource === 'preview' && <p className="journey-note journey-note--preview">예시 경로를 보고 있어요. 실제 출퇴근 위치 저장·경로 검색은 로그인 후 이용해 주세요.</p>}
        <div className="journey-direction" aria-label="이동 방향">
          <button className={direction === 'to_work' ? 'is-on' : ''} aria-pressed={direction === 'to_work'} disabled={busy || guestPersonalization} onClick={() => void changeDirection('to_work').catch(() => undefined)}>등교·출근</button>
          <button className={direction === 'to_home' ? 'is-on' : ''} aria-pressed={direction === 'to_home'} disabled={busy} onClick={() => void changeDirection('to_home').catch(() => undefined)}>하교·퇴근</button>
        </div>
        {guestPersonalization && <button className="journey-text-button" onClick={() => nav('/login')}>로그인하고 출근길도 살펴보기</button>}
        {journeyError && available.length > 0 && <p className="journey-rating-error" role="alert">{journeyError}</p>}
      </header>
      <main className="journey-map-area">
        {available.length > 0 ? <><JourneyMap routes={available} selectedId={selectedRoute?.id} onSelect={selectRoute} className="journey-map" /><div className="journey-map-caption"><span><i className="journey-line-key" />오늘의 샛길</span><span><i className="journey-line-key journey-line-key--usual" />평소 길</span>{commute.mode === '대중교통' && <span><i className="journey-line-key journey-line-key--ride" />탑승</span>}{dataSource === 'preview' && <span>샘플 경로</span>}</div></> : <div className="journey-map-empty"><RouteProblem /></div>}
      </main>
      {available.length > 0 && <section className="journey-route-bottom" aria-label="경로 선택">
        <div className="journey-carousel">{available.map((route) => (
          <article key={route.id} className={`journey-route-card${selectedRoute?.id === route.id ? ' is-sel' : ''}`}>
            <button className="journey-route-card__select" aria-pressed={selectedRoute?.id === route.id} onClick={() => selectRoute(route.id)}><strong>{route.name}</strong><span className="journey-route-check" aria-hidden>{selectedRoute?.id === route.id ? '✓' : ''}</span></button>
            <RouteComparison route={route} />
            <button className="journey-button" disabled={busy} onClick={() => { selectRoute(route.id); nav('/guide') }}>{walkLabel(route)} <span aria-hidden>↗</span></button>
          </article>
        ))}</div>
        <button className="journey-text-button" onClick={() => nav('/routes')}>다른 길 자세히 보기</button>
      </section>}
      </div>
      <Nav /><HomeIndicator />
      {editor && editor.owner === owner && <RouteEndpointEditor from={editor.from} to={editor.to} mode={editor.mode} initialSide={editor.side} direction={editor.direction}
        onClose={() => setEditor(null)} onLogin={() => { setEditor(null); nav('/login', { state: { from: '/route' } }) }} onSave={draft => saveEndpoints(draft, editor)} />}
    </div>
  )
}

/** 후보를 시간·녹지율과 함께 비교하는 별도 목록. */
export function OtherRoutes() {
  const nav = useNavigate()
  const { available, selectedRoute, selectRoute, dataSource } = useJourneyRoutes()
  return (
    <div className="screen screen--flow screen--grad journey-screen">
      <Header title="다른 길 보기" tone="gray" /><StatusBar />
      <main className="journey-content journey-route-list">
        <div className="journey-route-top__title"><p className="journey-note">같은 동선에서도 다른 풍경을 만날 수 있어요.</p><JourneyBadge /></div>
        {dataSource === 'preview' && <p className="journey-note journey-note--preview">비교를 위한 샘플 경로예요.</p>}
        {available.length === 0 ? <RouteProblem /> : available.map((route) => (
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
  const { selectedRoute, commute, direction, dataSource, journeyStatus, profile } = useJourneyRoutes()
  const walking = useWalking(selectedRoute, `${dataSource}:${profile.authId || 'guest'}:${direction}`)
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
      {selectedRoute ? <>
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
