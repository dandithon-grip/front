import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { JourneyMap } from '../components/JourneyMap'
import { searchPlaces, getStations, searchTransitRoutes } from '../lib/api'
import { A } from '../lib/assets'
import { config } from '../lib/config'
import { describeKakaoPoint } from '../lib/map'
import { PREVIEW_PLACES } from '../lib/preview'
import { TransitPathCards, toggleSelection } from '../components/TransitPathCards'
import { sortTransitPaths } from '../lib/transitSummary'
import { useStore } from '../lib/store'
import type { Commute, Mode, PlaceLocation, Point, Station, TransitLeg, TransitPath } from '../lib/types'
import { PREFERENCE_LABELS, type Preference } from '../lib/types'
import './setup.css'

const MODES: readonly Mode[] = ['도보', '대중교통', '자동차']
const STEPS = ['출발지', '도착지', '출근 시간', '퇴근 시간', '교통수단']
const TITLES = [
  '', '평소 출발하는 곳을\n선택해 주세요.', '평소 도착하는 곳을\n선택해 주세요.',
  '등교, 출근하는\n시간을 알려주세요.', '하교, 퇴근하는\n시간을 알려주세요.',
  '평소 어떤 방식으로\n이동하시나요?', '이용할 대중교통\n경로를 선택해 주세요.',
]

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.'
const AUTO_SEARCH_MS = 450
const AUTO_SEARCH_MIN_CHARS = 2
const LOCATE_ERRORS: Record<number, string> = { 1: '위치 권한을 허용하면 현재 위치를 쓸 수 있어요.', 2: '현재 위치를 확인하지 못했어요. 지도를 눌러 선택해 주세요.', 3: '현재 위치 확인이 늦어지고 있어요. 다시 시도해 주세요.' }
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
export const validPlace = (place?: PlaceLocation): place is PlaceLocation => Boolean(place && place.name.trim() && place.area.trim()
  && Number.isFinite(place.lat) && Number.isFinite(place.lng) && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180)

function TimePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [hour, minute] = (validTime(value) ? value : '09:00').split(':').map(Number)
  const period = hour >= 12 ? '오후' : '오전'
  const displayHour = hour % 12 || 12
  const update = (nextPeriod: string, nextHour: number, nextMinute: number) => {
    const hour24 = nextHour % 12 + (nextPeriod === '오후' ? 12 : 0)
    onChange(`${String(hour24).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`)
  }
  return (
    <fieldset className="setup-time">
      <legend className="setup-sr-only">{label}</legend>
      <div className="setup-time__ghost" aria-hidden="true">
        <span>{period === '오전' ? '' : '오전'}</span><span>{displayHour === 1 ? 12 : displayHour - 1}시</span><span>{String((minute + 50) % 60).padStart(2, '0')}분</span>
      </div>
      <div className="setup-time__selection">
        <label><span className="setup-sr-only">{label} 오전 또는 오후</span>
          <select value={period} onChange={(event) => update(event.target.value, displayHour, minute)}>
            <option>오전</option><option>오후</option>
          </select>
        </label>
        <label><span className="setup-sr-only">{label} 시</span>
          <select value={displayHour} onChange={(event) => update(period, Number(event.target.value), minute)}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => <option key={item} value={item}>{item}시</option>)}
          </select>
        </label>
        <label><span className="setup-sr-only">{label} 분</span>
          <select value={minute} onChange={(event) => update(period, displayHour, Number(event.target.value))}>
            {Array.from({ length: 60 }, (_, index) => index).map((item) => <option key={item} value={item}>{String(item).padStart(2, '0')}분</option>)}
          </select>
        </label>
      </div>
      <div className="setup-time__ghost" aria-hidden="true">
        <span>{period === '오후' ? '' : '오후'}</span><span>{displayHour === 12 ? 1 : displayHour + 1}시</span><span>{String((minute + 10) % 60).padStart(2, '0')}분</span>
      </div>
      <p className="setup-time__help">각 항목을 눌러 시간을 선택하세요.</p>
    </fieldset>
  )
}

export function PlacePicker({ label, value, other, onChange, preview, realSearch = false }: {
  label: string; value?: PlaceLocation; other?: PlaceLocation; onChange: (value?: PlaceLocation) => void; preview: boolean; realSearch?: boolean
}) {
  const useExamples = preview && !realSearch
  // Kakao 가 있으면 지도를 누르거나 핀을 끌어 놓은 자리를 주소로 바로 채운다. 없으면 좌표·이름 수기 입력으로 물러선다
  const canDescribe = Boolean(config.kakaoKey) && !useExamples
  const [query, setQuery] = useState(value?.name || '')
  const [results, setResults] = useState<PlaceLocation[]>(useExamples ? PREVIEW_PLACES : [])
  const [busy, setBusy] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState({ lat: '', lng: '', name: '', area: '', address: '' })
  const [manualOpen, setManualOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const requestId = useRef(0)
  const autoSearch = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const searchInputId = useId()

  const cancelAutoSearch = () => { if (autoSearch.current) { clearTimeout(autoSearch.current); autoSearch.current = null } }
  useEffect(() => () => { mounted.current = false; requestId.current += 1; cancelAutoSearch() }, [])

  const search = async (term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return
    const request = ++requestId.current
    setBusy(true)
    setError('')
    setSearched(true)
    try {
      const places = useExamples
        ? PREVIEW_PLACES.filter((place) => `${place.name} ${place.address} ${place.area}`.includes(trimmed))
        : await searchPlaces(trimmed)
      if (request === requestId.current) setResults(places)
    } catch (cause) {
      if (request === requestId.current) { setResults([]); setError(errorMessage(cause)) }
    } finally {
      if (request === requestId.current) setBusy(false)
    }
  }
  const choose = (place: PlaceLocation) => {
    if (!validPlace(place)) { setError('이 장소의 좌표 또는 지역 정보가 없어요. 다른 결과를 선택하거나 좌표로 등록해 주세요.'); return }
    cancelAutoSearch()
    requestId.current += 1
    setBusy(false)
    setQuery(place.name)
    setResults([])
    setSearched(false)
    setError('')
    setManualOpen(false)
    onChange(place)
  }
  const openManual = (point: Point) => {
    setManual({ lat: point.lat.toFixed(6), lng: point.lng.toFixed(6), name: '', area: '', address: '' })
    setManualOpen(true)
    onChange(undefined)
  }
  /** 지도를 누르거나 핀을 끌어 놓은 자리. 주소를 찾으면 바로 장소가 되고, 못 찾으면 수기 입력으로 */
  const pickPoint = async (point: Point) => {
    cancelAutoSearch()
    const request = ++requestId.current
    setResults([])
    setSearched(false)
    setError('')
    if (!canDescribe) { setBusy(false); openManual(point); return }
    setBusy(true)
    try {
      const place = await describeKakaoPoint(point)
      if (!mounted.current || request !== requestId.current) return
      if (place) choose(place)
      else { setError('이 자리의 주소를 찾지 못했어요. 가까운 길가를 눌러 주세요.'); openManual(point) }
    } catch {
      if (mounted.current && request === requestId.current) { setError('주소를 확인하지 못했어요. 다시 눌러 주세요.'); openManual(point) }
    } finally {
      if (mounted.current && request === requestId.current) setBusy(false)
    }
  }
  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setError('이 브라우저에서는 현재 위치를 쓸 수 없어요.'); return }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      (position) => { if (!mounted.current) return; setLocating(false); void pickPoint({ lat: position.coords.latitude, lng: position.coords.longitude }) },
      (failure) => { if (!mounted.current) return; setLocating(false); setError(LOCATE_ERRORS[failure.code] || LOCATE_ERRORS[2]) },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }
  const confirmManual = () => {
    const place: PlaceLocation = { name: manual.name.trim(), area: manual.area.trim(), address: manual.address.trim(), lat: Number(manual.lat), lng: Number(manual.lng) }
    if (!manual.lat.trim() || !manual.lng.trim() || !validPlace(place)) {
      setError('장소 이름과 지역명을 입력하고 올바른 위도·경도를 확인해 주세요.')
      return
    }
    choose(place)
  }
  const onQueryChange = (next: string) => {
    cancelAutoSearch()
    requestId.current += 1
    setBusy(false)
    setQuery(next)
    setResults([])
    setSearched(false)
    setError('')
    onChange(undefined)
    if (next.trim().length >= AUTO_SEARCH_MIN_CHARS) autoSearch.current = setTimeout(() => { autoSearch.current = null; void search(next) }, AUTO_SEARCH_MS)
  }
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); cancelAutoSearch(); void search(query) }
  }
  const pinned = validPlace(value) ? value : undefined
  return (
    <div className="setup-place">
      <JourneyMap className="setup-place__map" locations={(label.startsWith('출발') ? [value, other] : [other, value]).filter(validPlace)} pickable={pinned}
        suggestions={results.filter(validPlace)} onSuggestion={choose} onPick={(point) => void pickPoint(point)} />
      <div className="setup-place__controls">
        <div className="setup-place__search-wrap">
          <div className="setup-place__search">
            <label className="setup-sr-only" htmlFor={searchInputId}>{label} 장소 검색</label>
            <input id={searchInputId} type="search" placeholder={`${label}를 검색해 주세요`} value={query}
              onChange={(event) => onQueryChange(event.target.value)} onKeyDown={onSearchKey} autoComplete="off" />
            <button type="button" className="setup-place__search-button" disabled={busy || !query.trim()} onClick={() => { cancelAutoSearch(); void search(query) }}>{busy ? '검색 중' : '검색'}</button>
            {!useExamples && <button type="button" className="setup-place__locate" aria-label="현재 위치로 선택" title="현재 위치로 선택" disabled={busy || locating} onClick={locate}>{locating ? '…' : '◎'}</button>}
          </div>
          {/* 결과는 검색창 바로 아래 떠 있는 목록. 화면이 작아도 '다음' 버튼에 가려지지 않는다 */}
          {results.length > 0 && <ul className="setup-place__results" aria-label={`${label} 검색 결과`}>
            {results.map((place, index) => <li key={`${place.name}-${place.lat}-${place.lng}-${index}`}>
              <button type="button" onClick={() => choose(place)}><strong>{place.name}</strong><span>{place.address || place.area}</span></button>
            </li>)}
          </ul>}
        </div>
        {value && <p className="setup-place__selected"><strong>{value.name}</strong><span>{value.address || value.area}</span></p>}
        {useExamples && <p className="setup-hint">미리보기 장소입니다. 실제 검색이나 경로 계산 결과가 아닙니다.</p>}
        {canDescribe && <p className="setup-hint">{pinned ? '핀을 끌어 위치를 다듬거나 지도를 눌러 다시 고를 수 있어요.' : '이름으로 검색하거나 지도를 눌러 위치를 고를 수 있어요.'}</p>}
        {!useExamples && !config.kakaoKey && <p className="setup-hint">현재 대구 2호선 역 이름으로 검색할 수 있어요. 다른 장소는 지도에서 선택해 주세요.</p>}
        {!busy && searched && !results.length && !error && <p className="setup-hint" role="status">검색 결과가 없어요. 다른 이름으로 검색하거나 지도를 눌러 선택해 주세요.</p>}
        {error && <p className="flow-error" role="alert">{error}</p>}
        {(!canDescribe || manualOpen) && <details open={manualOpen} onToggle={(event) => setManualOpen(event.currentTarget.open)} className="setup-manual">
          <summary>좌표로 장소 선택</summary>
          <p className="setup-hint">지도를 눌러 좌표를 고르거나 직접 입력한 후 장소 이름과 지역명을 확인해 주세요.</p>
          <div className="setup-manual__coordinates">
            <label>위도<input inputMode="decimal" type="number" min="-90" max="90" step="any" value={manual.lat} onChange={(event) => setManual({ ...manual, lat: event.target.value })} /></label>
            <label>경도<input inputMode="decimal" type="number" min="-180" max="180" step="any" value={manual.lng} onChange={(event) => setManual({ ...manual, lng: event.target.value })} /></label>
          </div>
          <label>장소 이름<input value={manual.name} placeholder="예: 수성구청역" onChange={(event) => setManual({ ...manual, name: event.target.value })} /></label>
          <label>지역명<input value={manual.area} placeholder="예: 대구 수성구" onChange={(event) => setManual({ ...manual, area: event.target.value })} /></label>
          <label>주소 (선택)<input value={manual.address} placeholder="알고 있는 주소를 입력해 주세요" onChange={(event) => setManual({ ...manual, address: event.target.value })} /></label>
          <button className="flow-button setup-manual__confirm" type="button" onClick={confirmManual}>이 장소 선택하기</button>
        </details>}
      </div>
    </div>
  )
}

function previewTransit(): TransitPath[] {
  if (PREVIEW_PLACES.length < 2) return []
  const start = PREVIEW_PLACES[0]
  const end = PREVIEW_PLACES[1]
  return [{ index: 0, summary: '미리보기 대중교통 경로', total_minutes: 20, transfers: 0, walk_minutes: 5,
    legs: [{ kind: 'transit', line: '미리보기 노선', start_name: start.name, end_name: end.name, minutes: 15,
      stops: [start, end].map((place, index) => ({ name: place.name, lat: place.lat, lng: place.lng, external_id: `preview-${index}` })) }] }]
}

type TransitChoice = Pick<Commute, 'transitLegs' | 'transitOptions' | 'stationIds' | 'line'>
/** Every chosen route becomes a transit option; the first one is mirrored into transitLegs (server#88). */
function convertTransit(chosen: TransitPath[], stations: Station[]): TransitChoice {
  const transitOptions: TransitLeg[][] = chosen.map((path) => path.legs.filter((leg) => leg.kind !== 'walk' && leg.line && leg.stops.length >= 2)
    .map((leg) => ({ line: leg.line!, stops: leg.stops.map((stop) => ({ ...stop })) }))).filter((option) => option.length > 0)
  const transitLegs = transitOptions[0] ?? []
  const normalized = (value: string) => value.replace(/\s|역$/g, '')
  const matchedIds = transitLegs.flatMap((leg) => leg.stops.flatMap((stop) => {
    const station = stations.find((item) => item.id === stop.external_id)
      || stations.find((item) => normalized(item.name) === normalized(stop.name) && normalized(item.line) === normalized(leg.line))
    return station ? [station.id] : []
  }))
  return { transitLegs, transitOptions, stationIds: [...new Set(matchedIds)], line: transitLegs.length === 1 ? transitLegs[0].line : undefined }
}

/** Figma 343:987–1202: 소개와 5단계 일상 경로 등록. */
export function RouteSetup({ edit = false }: { edit?: boolean }) {
  const nav = useNavigate()
  const { commute, profile, isGuest, dataSource, saveCommute } = useStore()
  const preview = dataSource === 'preview'
  const [step, setStep] = useState(edit ? 1 : 0)
  const [draft, setDraft] = useState<Commute>(() => edit ? { ...commute } : {
    from: '', to: '', morning: '09:00', evening: '18:30', mode: '도보', preference: commute.preference || 'full', configured: false,
  })
  const [modeChosen, setModeChosen] = useState(edit && commute.configured)
  const [paths, setPaths] = useState<TransitPath[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [selectedPaths, setSelectedPaths] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const pending = useRef(false)
  const mounted = useRef(true)
  const owner = useRef('')
  owner.current = `${dataSource}:${profile.authId || 'guest'}`
  const lastAdvance = useRef<number | null>(null)
  const transitRequest = useRef<{ id: number; controller: AbortController } | null>(null)
  const transitSequence = useRef(0)
  const placeKey = JSON.stringify([draft.fromPlace?.lat, draft.fromPlace?.lng, draft.fromPlace?.name, draft.toPlace?.lat, draft.toPlace?.lng, draft.toPlace?.name])
  const latestPlaces = useRef(placeKey)
  latestPlaces.current = placeKey

  const cancelTransit = useCallback(() => {
    const request = transitRequest.current
    if (!request) return
    transitRequest.current = null
    request.controller.abort()
    pending.current = false
    if (mounted.current) setBusy(false)
  }, [])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelTransit() } }, [cancelTransit])
  useEffect(() => { cancelTransit(); setPaths([]); setStations([]); setSelectedPaths([]); setError('') }, [dataSource, profile.authId, placeKey, cancelTransit])
  useEffect(() => { heading.current?.focus(); lastAdvance.current = null }, [step])
  const clearTransit = () => { cancelTransit(); setPaths([]); setStations([]); setSelectedPaths([]); setError('') }
  const changePlace = (key: 'from' | 'to', place?: PlaceLocation) => {
    clearTransit()
    setDraft((previous) => ({ ...previous, [key]: place?.name || '', [key === 'from' ? 'fromPlace' : 'toPlace']: place,
      transitLegs: undefined, transitOptions: undefined, stationIds: undefined, line: undefined }))
  }
  const back = () => {
    if (busy && !transitRequest.current) return
    if (transitRequest.current) clearTransit()
    setError('')
    if (step > 1 || (step === 1 && !edit)) setStep((current) => current - 1)
    else nav(edit ? '/my' : '/home')
  }
  const needLogin = !preview && (isGuest || !profile.loggedIn)
  const complete = validPlace(draft.fromPlace) && validPlace(draft.toPlace) && validTime(draft.morning) && validTime(draft.evening) && modeChosen
  const save = async (transit?: TransitChoice) => {
    if (pending.current) return
    if (needLogin) { nav('/login', { state: { from: edit ? '/my/route' : '/route-setup' } }); return }
    if (!complete) { setError('장소와 시간, 교통수단을 모두 확인해 주세요.'); return }
    const actor = owner.current
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await saveCommute({ ...draft, ...transit, configured: true })
      if (!mounted.current || owner.current !== actor) return
      nav(edit ? '/my' : '/home', { replace: true })
    } catch (cause) { if (mounted.current && owner.current === actor) setError(errorMessage(cause)) }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  const findTransit = async () => {
    if (pending.current || !validPlace(draft.fromPlace) || !validPlace(draft.toPlace)) return
    if (needLogin) { nav('/login', { state: { from: edit ? '/my/route' : '/route-setup' } }); return }
    const actor = owner.current
    const requestedPlaces = placeKey
    const request = { id: ++transitSequence.current, controller: new AbortController() }
    transitRequest.current = request
    const isCurrent = () => mounted.current && owner.current === actor && latestPlaces.current === requestedPlaces
      && transitRequest.current?.id === request.id && !request.controller.signal.aborted
    pending.current = true
    setBusy(true)
    setError('')
    setSelectedPaths([])
    setStep(6)
    try {
      if (preview) { const samples = previewTransit(); setPaths(samples); setStations([]); setSelectedPaths(samples[0] ? [samples[0].index] : []) }
      else {
        const [candidates, knownStations] = await Promise.all([
          searchTransitRoutes(draft.fromPlace, draft.toPlace, { expectedUserId: profile.authId, signal: request.controller.signal }),
          getStations().catch((): Station[] => []),
        ])
        if (!isCurrent()) return
        const ordered = sortTransitPaths(candidates)
        setPaths(ordered)
        setStations(knownStations)
        // 가장 빠른 노선은 기본 선택. 다른 노선도 타면 체크를 더한다 (최대 3개)
        setSelectedPaths(ordered[0] ? [ordered[0].index] : [])
      }
    } catch (cause) { if (isCurrent()) { setPaths([]); setError(errorMessage(cause)) } }
    finally {
      if (transitRequest.current?.id === request.id) { transitRequest.current = null; pending.current = false; if (mounted.current) setBusy(false) }
    }
  }
  const next = () => {
    if (pending.current || busy) return
    setError('')
    if (step === 2 && draft.fromPlace && draft.toPlace && draft.fromPlace.lat === draft.toPlace.lat && draft.fromPlace.lng === draft.toPlace.lng) {
      setError('출발지와 도착지를 서로 다르게 선택해 주세요.'); return
    }
    if (step < 5) { if (lastAdvance.current === step) return; lastAdvance.current = step; setStep((current) => current + 1); return }
    if (needLogin) { nav('/login', { state: { from: edit ? '/my/route' : '/route-setup' } }); return }
    if (step === 5 && draft.mode === '대중교통') { void findTransit(); return }
    if (step === 6) {
      const chosen = paths.filter((item) => selectedPaths.includes(item.index))
      if (!chosen.length) return
      const transit = convertTransit(chosen, stations)
      if (!transit.transitLegs?.length) { setError('정류장 정보가 없는 경로는 등록할 수 없어요. 다른 경로를 선택해 주세요.'); return }
      void save(transit)
      return
    }
    void save({ transitLegs: undefined, transitOptions: undefined, stationIds: [], line: undefined })
  }
  const canNext = !busy && (step === 1 ? validPlace(draft.fromPlace)
    : step === 2 ? validPlace(draft.toPlace)
      : step === 3 ? validTime(draft.morning)
        : step === 4 ? validTime(draft.evening)
          : step === 5 ? modeChosen : selectedPaths.length > 0)

  if (step === 0) return (
    <main className="flow-page setup-page setup-page--intro">
      <div className="setup-intro">
        <h1>일상 경로를 등록하면<br />주변 자연을 발견할 수 있어요.</h1>
        <img className="setup-intro__illustration" src={A('img/route-setup.png')} alt="" width="156" height="173" />
      </div>
      <div className="flow-actions setup-actions">
        {preview && <p className="flow-notice">미리보기 모드 · 등록한 장소로 실제 경로를 계산하지 않습니다.</p>}
        {needLogin && <p className="flow-notice">경로를 계정에 등록하려면 로그인이 필요해요.</p>}
        <button type="button" className="flow-button" onClick={() => needLogin ? nav('/login', { state: { from: '/route-setup' } }) : setStep(1)}>{needLogin ? '로그인하고 경로 등록하기' : '경로 등록하기'}</button>
        <button type="button" className="flow-button setup-button--line" onClick={() => nav('/home')}>다음에 하기</button>
      </div>
    </main>
  )

  return (
    <main className="flow-page setup-page">
      <header className="flow-header setup-header">
        <button type="button" className="setup-back" aria-label={step === 1 && edit ? '마이페이지로 돌아가기' : '이전 단계'} onClick={back} disabled={busy && !transitRequest.current}>
          <img src={A('icons/arrow-left.svg')} alt="" />
        </button>
        <ol className="setup-progress" aria-label={`일상 경로 설정 ${Math.min(step, 5)} / 5단계`}>
          {STEPS.map((name, index) => <li key={name} className={index < step ? 'is-complete' : ''} aria-current={index === Math.min(step, 5) - 1 ? 'step' : undefined}><span className="setup-sr-only">{name}</span></li>)}
        </ol>
      </header>
      <div className="flow-content setup-content">
        <h1 className="setup-title" ref={heading} tabIndex={-1}>{TITLES[step]}</h1>
        {preview && <p className="setup-preview-note">미리보기 · 실제 서버 계산 결과가 아닙니다.</p>}
        {(step === 1 || step === 2) && <PlacePicker key={step} label={step === 1 ? '출발지' : '도착지'}
          value={step === 1 ? draft.fromPlace : draft.toPlace} other={step === 1 ? draft.toPlace : draft.fromPlace}
          onChange={(place) => changePlace(step === 1 ? 'from' : 'to', place)} preview={preview} />}
        {step === 3 && <TimePicker label="등교·출근 시간" value={draft.morning} onChange={(morning) => setDraft({ ...draft, morning })} />}
        {step === 4 && <TimePicker label="하교·퇴근 시간" value={draft.evening} onChange={(evening) => setDraft({ ...draft, evening })} />}
        {step === 5 && <fieldset className="setup-modes"><legend className="setup-sr-only">교통수단</legend>
          {MODES.map((mode) => <label key={mode} className={modeChosen && draft.mode === mode ? 'is-selected' : ''}>
            <input type="radio" name="setup-mode" value={mode} checked={modeChosen && draft.mode === mode}
              onChange={() => { setModeChosen(true); clearTransit(); setDraft({ ...draft, mode, transitLegs: undefined, stationIds: undefined, line: undefined }) }} />
            <span>{mode}</span>
          </label>)}
        </fieldset>}
        {step === 5 && <fieldset className="setup-preference"><legend>기본 걷기 취향</legend><div>
          {(['full', 'short', 'sunset'] as Preference[]).map(preference => <button key={preference} type="button" aria-pressed={draft.preference === preference}
            className={draft.preference === preference ? 'is-selected' : ''} onClick={() => setDraft(previous => ({ ...previous, preference }))}>{PREFERENCE_LABELS[preference]}</button>)}
        </div></fieldset>}
        {step === 6 && <div className="setup-transit">
          {preview && <p className="flow-notice">아래 경로는 고정된 교통 예시입니다. 선택한 출발·도착지로 조회한 결과가 아닙니다.</p>}
          {busy && <p role="status">이용 가능한 경로를 찾고 있어요.</p>}
          {!busy && !paths.length && <div className="flow-card setup-transit__empty">
            <p>선택할 수 있는 대중교통 경로가 없어요.</p>
            <button type="button" className="setup-text-button" onClick={() => void findTransit()}>다시 찾기</button>
            <button type="button" className="setup-text-button" onClick={() => setStep(5)}>교통수단 바꾸기</button>
          </div>}
          <TransitPathCards paths={paths} selected={selectedPaths} name="transit-path" disabled={busy} onToggle={(index) => setSelectedPaths((previous) => toggleSelection(previous, index))} />
        </div>}
      </div>
      <div className="flow-actions setup-actions">
        {error && <p className="flow-error" role="alert">{error}</p>}
        {needLogin && step >= 5 && <p className="flow-notice">로그인 후 경로를 계정에 등록할 수 있어요.</p>}
        <button type="button" className="flow-button" disabled={!canNext} onClick={next}>
          {busy ? '처리 중…' : step < 5 ? '다음' : needLogin ? '로그인 후 등록하기' : step === 5 && draft.mode === '대중교통' ? '대중교통 경로 확인하기' : preview ? '미리보기 경로 등록하기' : edit ? '변경 내용 저장하기' : '등록하기'}
        </button>
      </div>
    </main>
  )
}

/** 마이페이지 등에서 재사용하는 실제 장소·시간·교통수단 편집 필드. */
export function CommuteFields({ value, onChange }: { value: Commute; onChange: (change: Partial<Commute>) => void }) {
  const { dataSource } = useStore()
  const changeLocation = (side: 'from' | 'to', place?: PlaceLocation) => onChange({
    [side]: place?.name || '', [side === 'from' ? 'fromPlace' : 'toPlace']: place,
    transitLegs: undefined, stationIds: undefined, line: undefined,
  })
  return <div className="setup-compact">
    <h3>출발지</h3><PlacePicker label="출발지 수정" value={value.fromPlace} other={value.toPlace} onChange={(place) => changeLocation('from', place)} preview={dataSource === 'preview'} />
    <h3>도착지</h3><PlacePicker label="도착지 수정" value={value.toPlace} other={value.fromPlace} onChange={(place) => changeLocation('to', place)} preview={dataSource === 'preview'} />
    <div className="setup-compact__times">
      <label>등교·출근 시간<input type="time" value={value.morning} onChange={(event) => onChange({ morning: event.target.value })} /></label>
      <label>하교·퇴근 시간<input type="time" value={value.evening} onChange={(event) => onChange({ evening: event.target.value })} /></label>
    </div>
    <fieldset className="setup-modes setup-modes--compact"><legend>교통수단</legend>
      {MODES.map((mode) => <label key={mode} className={value.mode === mode ? 'is-selected' : ''}>
        <input type="radio" name="commute-edit-mode" checked={value.mode === mode} onChange={() => onChange({ mode, transitLegs: undefined, stationIds: undefined, line: undefined })} /><span>{mode}</span>
      </label>)}
    </fieldset>
    {value.mode === '대중교통' && <p className="flow-notice">대중교통 경로 확인이 필요해요. 일상 경로 수정 화면에서 이용할 경로까지 선택해 주세요.</p>}
  </div>
}
