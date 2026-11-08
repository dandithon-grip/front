import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { searchTransitRoutes } from '../lib/api'
import { useStore } from '../lib/store'
import type { Mode, OneTimeTrip, PlaceLocation, TransitPath } from '../lib/types'
import { PlacePicker, validPlace } from './Setup'
import './one-time-route.css'

export interface OneTimeRouteEditorProps {
  from?: PlaceLocation; to?: PlaceLocation; mode: Mode; initialSide: 'from' | 'to'
  onApply: (trip: OneTimeTrip) => void; onClose: () => void
}

export function OneTimeRouteEditor({ from: initialFrom, to: initialTo, mode: initialMode, initialSide, onApply, onClose }: OneTimeRouteEditorProps) {
  const { dataSource, profile, isGuest } = useStore()
  const [from, setFrom] = useState<PlaceLocation | undefined>(() => initialFrom ? { ...initialFrom } : undefined)
  const [to, setTo] = useState<PlaceLocation | undefined>(() => initialTo ? { ...initialTo } : undefined)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [side, setSide] = useState(initialSide)
  const [pickerRevision, setPickerRevision] = useState(0)
  const [paths, setPaths] = useState<TransitPath[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(false), closing = useRef(false), sequence = useRef(0)
  const request = useRef<{ id: number; controller: AbortController } | null>(null)
  const id = useId()
  const callbacks = useRef({ onClose, onApply })
  callbacks.current = { onClose, onApply }
  const owner = `${dataSource}:${profile.authId || 'guest'}:${profile.loggedIn}:${isGuest}`
  const currentOwner = useRef(owner), originalOwner = useRef(owner)
  currentOwner.current = owner
  const canQueryTransit = dataSource === 'api' && profile.loggedIn && !isGuest && Boolean(profile.authId)
  const placesReady = validPlace(from) && validPlace(to)
  const samePlace = placesReady && Math.abs(from.lat - to.lat) < .000001 && Math.abs(from.lng - to.lng) < .000001
  const selectedPath = paths.find(path => path.index === selectedIndex)
  const canApply = !pending && placesReady && !samePlace && (mode === '도보' || (mode === '대중교통' && canQueryTransit && Boolean(selectedPath)))

  const cancelRequest = useCallback(() => {
    const previous = request.current
    request.current = null
    sequence.current++
    previous?.controller.abort()
    if (mounted.current) setPending(false)
  }, [])
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    cancelRequest()
    callbacks.current.onClose()
  }, [cancelRequest])
  useEffect(() => {
    mounted.current = true
    const previousFocus = document.activeElement as HTMLElement | null
    const modal = dialog.current
    if (modal && !modal.open) modal.showModal()
    heading.current?.focus({ preventScroll: true })
    return () => {
      mounted.current = false
      cancelRequest()
      modal?.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [cancelRequest])
  useEffect(() => { if (owner !== originalOwner.current) close() }, [owner, close])
  const invalidateCandidates = () => { cancelRequest(); setPaths([]); setSelectedIndex(null); setError('') }
  const updatePlace = (place?: PlaceLocation) => {
    invalidateCandidates()
    if (side === 'from') setFrom(place)
    else setTo(place)
  }
  const swap = () => { invalidateCandidates(); setFrom(to); setTo(from); setPickerRevision(value => value + 1) }
  const updateMode = (next: Mode) => { if (next !== mode) { invalidateCandidates(); setMode(next) } }
  const queryTransit = async () => {
    if (request.current || closing.current || mode !== '대중교통' || !canQueryTransit || !placesReady || samePlace) return
    const active = { id: ++sequence.current, controller: new AbortController() }, actor = owner
    request.current = active
    const isCurrent = () => mounted.current && !closing.current && request.current?.id === active.id && currentOwner.current === actor && !active.controller.signal.aborted
    setPending(true); setError(''); setPaths([]); setSelectedIndex(null)
    try {
      const result = await searchTransitRoutes(from, to, { expectedUserId: profile.authId, signal: active.controller.signal })
      if (isCurrent()) setPaths(result)
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error && /[가-힣]/.test(cause.message) ? cause.message : '대중교통 후보를 불러오지 못했어요. 다시 검색해 주세요.')
    } finally {
      if (request.current?.id === active.id) { request.current = null; if (mounted.current) setPending(false) }
    }
  }
  const apply = () => {
    if (closing.current || pending || request.current) return
    if (!placesReady) { setError('출발지와 도착지를 선택해 주세요.'); return }
    if (samePlace) { setError('출발지와 도착지를 서로 다르게 선택해 주세요.'); return }
    if (!canApply) return
    closing.current = true
    cancelRequest()
    try { callbacks.current.onApply({ from: { ...from }, to: { ...to }, mode, ...(mode === '대중교통' && selectedPath ? { transitPath: selectedPath } : {}) }) }
    catch (cause) { closing.current = false; setError(cause instanceof Error && /[가-힣]/.test(cause.message) ? cause.message : '이번 경로를 적용하지 못했어요. 위치와 교통수단을 다시 확인해 주세요.') }
  }
  const changeSideWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const next = side === 'from' ? 'to' : 'from'
    setSide(next)
    document.getElementById(`${id}-${next}`)?.focus()
  }

  return <dialog ref={dialog} className="one-time-route-dialog" aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="one-time-route-header"><div><p>저장된 일상 경로는 그대로 유지해요</p><h2 ref={heading} id={`${id}-title`} tabIndex={-1}>이번 경로의 출발·도착</h2></div><button type="button" aria-label="일회성 경로 편집 닫기" onClick={close}>×</button></header>
    <div className="one-time-route-body">
      <div className="one-time-route-endpoints">
        <div role="tablist" aria-label="수정할 위치" aria-orientation="vertical">
          {(['from', 'to'] as const).map(value => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-selected={side === value}
            aria-controls={`${id}-place`} tabIndex={side === value ? 0 : -1} onKeyDown={changeSideWithKeyboard} onClick={() => setSide(value)}>
            <span>{value === 'from' ? '출발' : '도착'}</span><strong>{(value === 'from' ? from : to)?.name || '장소를 선택해 주세요'}</strong>
          </button>)}
        </div>
        <button type="button" className="one-time-route-swap" aria-label="일회성 출발지와 도착지 바꾸기" onClick={swap}>⇅</button>
      </div>
      <section role="tabpanel" id={`${id}-place`} aria-labelledby={`${id}-${side}`}>
        <PlacePicker key={`${side}:${pickerRevision}`} label={side === 'from' ? '출발지' : '도착지'} value={side === 'from' ? from : to}
          other={side === 'from' ? to : from} onChange={updatePlace} preview={dataSource === 'preview'} />
      </section>
      <fieldset className="one-time-route-modes"><legend>이번 탐색의 교통수단</legend>{(['도보', '대중교통'] as const).map(value => <label key={value} className={mode === value ? 'is-selected' : ''}>
        <input type="radio" name={`${id}-mode`} value={value} checked={mode === value} onChange={() => updateMode(value)} /><span>{value}</span>
      </label>)}</fieldset>
      {mode === '자동차' && <p className="flow-notice">자동차의 일회성 탐색은 아직 지원하지 않아요. 도보 또는 대중교통을 선택해 주세요.</p>}
      {samePlace && <p className="flow-error" role="alert">출발지와 도착지를 서로 다르게 선택해 주세요.</p>}
      {mode === '대중교통' && <section className="one-time-route-transit" aria-label="이번 탐색의 대중교통 후보">
        {!canQueryTransit && <p className="flow-notice">{dataSource === 'preview' ? '미리보기에서는 실제 대중교통을 조회하지 않아요. 실제 후보 조회는 로그인 후 이용해 주세요.' : '대중교통 후보 조회는 로그인 후 이용할 수 있어요. 도보로 위치를 먼저 살펴볼 수 있어요.'}</p>}
        <button type="button" className="flow-button one-time-route-query" disabled={pending || !canQueryTransit || !placesReady || samePlace} onClick={() => void queryTransit()}>{pending ? '대중교통 후보 찾는 중…' : '대중교통 후보 찾기'}</button>
        {pending && <p className="one-time-route-help" role="status">출발지나 도착지를 바꾸거나 취소하면 검색도 멈춰요.</p>}
        {paths.map(path => <label className={`one-time-route-candidate${selectedIndex === path.index ? ' is-selected' : ''}`} key={path.index}>
          <input type="radio" name={`${id}-path`} value={path.index} aria-label={`${path.summary} 선택`} checked={selectedIndex === path.index} onChange={() => setSelectedIndex(path.index)} />
          <div><strong>{path.summary}</strong><p>{path.total_minutes}분 · 환승 {path.transfers}회 · 도보 {path.walk_minutes}분</p><ol>{path.legs.map((leg, index) => <li key={index}>{leg.line || '도보'}{leg.start_name ? ` · ${leg.start_name}` : ''}{leg.end_name ? ` → ${leg.end_name}` : ''} · {leg.minutes}분</li>)}</ol></div>
        </label>)}
      </section>}
      {error && <p className="flow-error" role="alert">{error}</p>}
      <p className="one-time-route-help">일회성 탐색은 위치와 대중교통 후보를 확인할 수 있어요. 걷기 안내는 아직 지원하지 않아요.</p>
    </div>
    <footer className="one-time-route-actions"><button type="button" className="flow-button one-time-route-cancel" onClick={close}>취소</button><button type="button" className="flow-button" disabled={!canApply} onClick={apply}>이번 탐색에 적용</button></footer>
  </dialog>
}
