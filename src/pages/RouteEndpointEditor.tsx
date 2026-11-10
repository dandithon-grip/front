import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { searchTransitRoutes } from '../lib/api'
import { useStore } from '../lib/store'
import type { Direction, EndpointDraft, Mode, PlaceLocation, TransitPath } from '../lib/types'
import { PlacePicker, validPlace } from './Setup'
import { TransitPathCards, toggleSelection } from '../components/TransitPathCards'
import { sortTransitPaths } from '../lib/transitSummary'
import './route-endpoint.css'

export interface RouteEndpointEditorProps {
  from?: PlaceLocation; to?: PlaceLocation; mode: Mode; initialSide: 'from' | 'to'; direction: Direction
  onSave: (draft: EndpointDraft) => Promise<void>; onClose: () => void; onLogin: () => void
}

export function RouteEndpointEditor({ from: initialFrom, to: initialTo, mode: initialMode, initialSide, direction, onSave, onClose, onLogin }: RouteEndpointEditorProps) {
  const { dataSource, profile, isGuest } = useStore()
  const [from, setFrom] = useState<PlaceLocation | undefined>(() => initialFrom ? { ...initialFrom } : undefined)
  const [to, setTo] = useState<PlaceLocation | undefined>(() => initialTo ? { ...initialTo } : undefined)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [side, setSide] = useState(initialSide)
  const [pickerRevision, setPickerRevision] = useState(0)
  const [paths, setPaths] = useState<TransitPath[]>([])
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([])
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingNow = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(false), closing = useRef(false), sequence = useRef(0)
  const request = useRef<{ id: number; controller: AbortController } | null>(null)
  const id = useId()
  const callbacks = useRef({ onClose, onSave, onLogin })
  callbacks.current = { onClose, onSave, onLogin }
  const owner = `${dataSource}:${profile.authId || 'guest'}:${profile.loggedIn}:${isGuest}`
  const currentOwner = useRef(owner), originalOwner = useRef(owner)
  currentOwner.current = owner
  const canQueryTransit = dataSource === 'api' && profile.loggedIn && !isGuest && Boolean(profile.authId)
  const canSaveAccount = canQueryTransit
  const placesReady = validPlace(from) && validPlace(to)
  const samePlace = placesReady && Math.abs(from.lat - to.lat) < .000001 && Math.abs(from.lng - to.lng) < .000001
  const selectedPaths = sortTransitPaths(paths).filter(path => selectedIndexes.includes(path.index))
  const canSave = canSaveAccount && !pending && !saving && placesReady && !samePlace && (mode !== '대중교통' || selectedPaths.length > 0)
  const canonicalFrom = direction === 'to_home' ? to : from
  const canonicalTo = direction === 'to_home' ? from : to

  const cancelRequest = useCallback(() => {
    const previous = request.current
    request.current = null
    sequence.current++
    previous?.controller.abort()
    if (mounted.current) setPending(false)
  }, [])
  const closeNow = useCallback(() => {
    if (closing.current) return
    closing.current = true
    cancelRequest()
    callbacks.current.onClose()
  }, [cancelRequest])
  const close = useCallback(() => { if (!savingNow.current) closeNow() }, [closeNow])
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
  useEffect(() => { if (owner !== originalOwner.current) closeNow() }, [owner, closeNow])
  const invalidateCandidates = () => { cancelRequest(); setPaths([]); setSelectedIndexes([]); setError('') }
  const updatePlace = (place?: PlaceLocation) => {
    if (savingNow.current) return
    invalidateCandidates()
    if (side === 'from') setFrom(place)
    else setTo(place)
  }
  const swap = () => { if (!savingNow.current) { invalidateCandidates(); setFrom(to); setTo(from); setPickerRevision(value => value + 1) } }
  const updateMode = (next: Mode) => { if (!savingNow.current && next !== mode) { invalidateCandidates(); setMode(next) } }
  const queryTransit = async () => {
    if (request.current || closing.current || savingNow.current || mode !== '대중교통' || !canQueryTransit || !validPlace(canonicalFrom) || !validPlace(canonicalTo) || samePlace) return
    const active = { id: ++sequence.current, controller: new AbortController() }, actor = owner
    request.current = active
    const isCurrent = () => mounted.current && !closing.current && request.current?.id === active.id && currentOwner.current === actor && !active.controller.signal.aborted
    setPending(true); setError(''); setPaths([]); setSelectedIndexes([])
    try {
      const result = await searchTransitRoutes(canonicalFrom, canonicalTo, { expectedUserId: profile.authId, signal: active.controller.signal })
      if (isCurrent()) { setPaths(result); const fastest = sortTransitPaths(result)[0]; setSelectedIndexes(fastest ? [fastest.index] : []) }
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error && /[가-힣]/.test(cause.message) ? cause.message : '대중교통 후보를 불러오지 못했어요. 다시 검색해 주세요.')
    } finally {
      if (request.current?.id === active.id) { request.current = null; if (mounted.current) setPending(false) }
    }
  }
  const save = async () => {
    if (closing.current || pending || request.current || savingNow.current || !canSaveAccount) return
    if (!placesReady) { setError('출발지와 도착지를 선택해 주세요.'); return }
    if (samePlace) { setError('출발지와 도착지를 서로 다르게 선택해 주세요.'); return }
    if (!canSave) return
    const actor = owner
    savingNow.current = true
    setSaving(true); setError('')
    cancelRequest()
    try {
      await callbacks.current.onSave({ from: { ...from }, to: { ...to }, mode, ...(mode === '대중교통' && selectedPaths.length ? { transitPaths: selectedPaths } : {}) })
      if (mounted.current && currentOwner.current === actor) closing.current = true
    } catch (cause) {
      if (mounted.current && currentOwner.current === actor && !closing.current) setError(cause instanceof Error && /[가-힣]/.test(cause.message) ? cause.message : '경로를 저장하지 못했어요. 위치와 교통수단을 다시 확인해 주세요.')
    } finally { savingNow.current = false; if (mounted.current && currentOwner.current === actor) setSaving(false) }
  }
  const login = () => { if (!savingNow.current) { cancelRequest(); callbacks.current.onLogin() } }
  const changeSideWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (savingNow.current) return
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const next = side === 'from' ? 'to' : 'from'
    setSide(next)
    document.getElementById(`${id}-${next}`)?.focus()
  }

  return <dialog ref={dialog} className="route-endpoint-dialog" aria-labelledby={`${id}-title`} aria-busy={saving}
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="route-endpoint-header"><div><p>{!canSaveAccount ? `${dataSource === 'preview' ? '미리보기' : '둘러보기'} · 실제 경로 저장은 로그인 후` : `${direction === 'to_home' ? '하교·퇴근' : '등교·출근'} 화면의 출발·도착을 바꿔요`}</p><h2 ref={heading} id={`${id}-title`} tabIndex={-1}>출퇴근 위치 변경</h2></div><button type="button" aria-label="출퇴근 위치 편집 닫기" disabled={saving} onClick={close}>×</button></header>
    <div className="route-endpoint-body">
      <fieldset className="route-endpoint-fields" disabled={saving}>
      <div className="route-endpoint-endpoints">
        <div role="tablist" aria-label="수정할 위치" aria-orientation="vertical">
          {(['from', 'to'] as const).map(value => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-selected={side === value}
            aria-controls={`${id}-place`} tabIndex={side === value ? 0 : -1} onKeyDown={changeSideWithKeyboard} onClick={() => { if (!savingNow.current) setSide(value) }}>
            <span>{value === 'from' ? '출발' : '도착'}</span><strong>{(value === 'from' ? from : to)?.name || '장소를 선택해 주세요'}</strong>
          </button>)}
        </div>
        <button type="button" className="route-endpoint-swap" aria-label="출퇴근 출발지와 도착지 바꾸기" onClick={swap}>⇅</button>
      </div>
      <section role="tabpanel" id={`${id}-place`} aria-labelledby={`${id}-${side}`}>
        <PlacePicker key={`${side}:${pickerRevision}`} label={side === 'from' ? '출발지' : '도착지'} value={side === 'from' ? from : to}
          other={side === 'from' ? to : from} onChange={updatePlace} preview={dataSource === 'preview'} realSearch />
      </section>
      <fieldset className="route-endpoint-modes"><legend>출퇴근 교통수단</legend>{(['도보', '대중교통', '자동차'] as const).map(value => <label key={value} className={mode === value ? 'is-selected' : ''}>
        <input type="radio" name={`${id}-mode`} value={value} checked={mode === value} onChange={() => updateMode(value)} /><span>{value}</span>
      </label>)}</fieldset>
      {samePlace && <p className="flow-error" role="alert">출발지와 도착지를 서로 다르게 선택해 주세요.</p>}
      {mode === '대중교통' && <section className="route-endpoint-transit" aria-label="저장을 위한 출근 경로">
        <div className="route-endpoint-canonical"><h3>저장을 위한 출근 경로</h3><p>{canonicalFrom?.name || '출근 출발지 선택'} → {canonicalTo?.name || '출근 도착지 선택'}</p><span>퇴근길은 이 경로의 반대 방향으로 표시돼요.</span></div>
        {!canQueryTransit && <p className="flow-notice">대중교통 후보 조회와 경로 저장은 로그인 후 이용할 수 있어요.</p>}
        <button type="button" className="flow-button route-endpoint-query" disabled={pending || saving || !canQueryTransit || !placesReady || samePlace} onClick={() => void queryTransit()}>{pending ? '대중교통 후보 찾는 중…' : '대중교통 후보 찾기'}</button>
        {pending && <p className="route-endpoint-help" role="status">출발지나 도착지를 바꾸거나 취소하면 검색도 멈춰요.</p>}
        <TransitPathCards paths={paths} selected={selectedIndexes} name={`${id}-path`} disabled={saving} onToggle={index => { if (!savingNow.current) setSelectedIndexes(previous => toggleSelection(previous, index)) }} />
      </section>}
      </fieldset>
      {error && <p className="flow-error" role="alert">{error}</p>}
      <p className="route-endpoint-help">{dataSource === 'preview' ? '미리보기: 실제 경로 저장은 로그인 후 이용할 수 있어요. 위치는 실제 지도에서 선택할 수 있어요.' : !canSaveAccount ? '위치를 먼저 골라볼 수 있어요. 로그인한 뒤 출퇴근 경로를 저장해 주세요.' : '저장하면 일상 경로가 변경되고 새로운 위치로 샛길을 다시 만들어요.'}</p>
    </div>
    <footer className="route-endpoint-actions">
      {saving && <p className="route-endpoint-save-status" role="status">경로를 저장하고 샛길을 만들고 있어요. 완료될 때까지 기다려 주세요.</p>}
      <button type="button" className="flow-button route-endpoint-cancel" disabled={saving} onClick={close}>취소</button>
      <button type="button" className="flow-button" disabled={!canSave} onClick={() => void save()}>{saving ? '저장하고 샛길 만드는 중…' : '위치 저장하고 경로 보기'}</button>
      {!canSaveAccount && <button type="button" className="flow-button route-endpoint-login" onClick={login}>로그인하고 저장하기</button>}
    </footer>
  </dialog>
}
