import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Point, RouteData } from './types'
import { cleanWalkingPath, distanceMeters, isValidPoint, projectWalkingPosition, walkingArrival, walkingDistance, type WalkingProjection } from './walking'

export interface WalkingFix extends Point { accuracy: number; timestamp: number }
export type WalkingStatus = 'idle' | 'locating' | 'walking' | 'paused' | 'arrived' | 'stopped' | 'error'
interface WalkingState { status: WalkingStatus; fix: WalkingFix | null; projection: WalkingProjection | null; warning: string; error: string; elapsedSeconds: number }
const initial = (): WalkingState => ({ status: 'idle', fix: null, projection: null, warning: '', error: '', elapsedSeconds: 0 })

/** Holds only the latest fix in memory and clears GPS subscriptions on every identity change. */
export function useWalking(route: RouteData | null, contextKey: string) {
  const routeKey = `${contextKey}:${route?.id || ''}:${JSON.stringify(route?.polyline || [])}`
  const path = useMemo(() => cleanWalkingPath(route?.polyline || []), [routeKey])
  const totalMeters = useMemo(() => walkingDistance(path), [path])
  const [state, setState] = useState<WalkingState>(initial)
  const current = useRef(state), watch = useRef<number | null>(null), generation = useRef(0)
  const accepted = useRef<WalkingFix | null>(null), arrivalFix = useRef<number | null>(null)
  const startedAt = useRef<number | null>(null), accumulated = useRef(0)
  current.current = state
  const elapsed = () => Math.floor((accumulated.current + (startedAt.current === null ? 0 : Math.max(0, Date.now() - startedAt.current))) / 1000)
  const clear = useCallback(() => {
    generation.current++
    if (watch.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
  }, [])
  const settleTime = () => { if (startedAt.current !== null) { accumulated.current += Math.max(0, Date.now() - startedAt.current); startedAt.current = null } }
  const pause = useCallback((message = '걷기를 일시정지했어요.') => {
    clear(); settleTime(); arrivalFix.current = null
    setState(previous => ({ ...previous, status: 'paused', warning: message, elapsedSeconds: elapsed() }))
  }, [clear])
  const stop = useCallback(() => {
    clear(); settleTime(); arrivalFix.current = null; accepted.current = null
    setState(previous => ({ ...previous, status: 'stopped', warning: '', error: '', elapsedSeconds: elapsed() }))
  }, [clear])
  useEffect(() => {
    clear(); startedAt.current = null; accumulated.current = 0; accepted.current = null; arrivalFix.current = null; setState(initial())
    return clear
  }, [routeKey, clear])
  useEffect(() => {
    if (state.status !== 'walking') return
    const timer = setInterval(() => setState(previous => ({ ...previous, elapsedSeconds: elapsed(),
      warning: previous.fix && Date.now() - previous.fix.timestamp > 20_000 ? '위치 갱신이 지연되고 있어요. 열린 곳에서 위치를 다시 확인해 주세요.' : previous.warning })), 1000)
    return () => clearInterval(timer)
  }, [state.status])
  useEffect(() => {
    if (typeof document === 'undefined') return
    const hide = () => { if (document.visibilityState === 'hidden' && ['walking', 'locating'].includes(current.current.status)) pause('화면을 벗어나 걷기를 일시정지했어요. 돌아오면 이어서 걸을 수 있어요.') }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [pause])

  const start = useCallback(() => {
    clear(); arrivalFix.current = null; accepted.current = null
    if (path.length < 2 || totalMeters < 1) { setState(previous => ({ ...previous, status: 'error', error: '걸을 수 있는 경로 선이 없어요. 다른 경로를 선택해 주세요.' })); return }
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setState(previous => ({ ...previous, status: 'error', error: '이 브라우저는 현재 위치를 지원하지 않아요.' })); return }
    if (typeof window !== 'undefined' && window.isSecureContext === false) { setState(previous => ({ ...previous, status: 'error', error: '현재 위치는 HTTPS 연결에서 사용할 수 있어요.' })); return }
    const restart = ['idle', 'stopped', 'arrived'].includes(current.current.status)
    if (restart) { accumulated.current = 0; startedAt.current = null }
    setState(previous => ({ ...(restart ? initial() : previous), status: 'locating', error: '', warning: '위치 권한을 허용하면 선택한 샛길을 따라 걸을 수 있어요.' }))
    const ticket = generation.current
    const success = (position: GeolocationPosition) => {
      if (generation.current !== ticket) return
      const fix: WalkingFix = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp }
      if (!isValidPoint(fix) || !Number.isFinite(fix.accuracy) || fix.accuracy <= 0 || !Number.isFinite(fix.timestamp)) return
      const age = Date.now() - fix.timestamp
      if (age > 15_000 || age < 0) { arrivalFix.current = null; setState(previous => ({ ...previous, warning: '위치의 시각이 맞지 않아요. 새 위치를 기다리고 있어요.' })); return }
      if (fix.accuracy > 50) { arrivalFix.current = null; setState(previous => ({ ...previous, fix, warning: `위치 정확도가 ±${Math.round(fix.accuracy)}m예요. 더 정확한 위치를 기다리고 있어요.` })); return }
      const previousFix = accepted.current
      if (previousFix && fix.timestamp <= previousFix.timestamp) return
      if (previousFix) {
        const jump = distanceMeters(previousFix, fix), seconds = (fix.timestamp - previousFix.timestamp) / 1000
        if (jump > Math.max(60, fix.accuracy + previousFix.accuracy) && jump / seconds > 15) {
          arrivalFix.current = null; setState(previous => ({ ...previous, warning: '위치가 갑자기 달라졌어요. 정확한 위치를 다시 확인하고 있어요.' })); return
        }
      }
      const projection = projectWalkingPosition(path, fix)
      if (!projection) return
      if (startedAt.current === null) startedAt.current = Date.now()
      const offRoute = projection.distanceFromRoute > Math.max(35, fix.accuracy * 1.5)
      let warning = offRoute ? `샛길에서 약 ${Math.round(projection.distanceFromRoute)}m 떨어져 있어요. 지도에서 경로를 확인해 주세요.` : ''
      if (offRoute) arrivalFix.current = null
      else accepted.current = fix
      const eligible = !offRoute && walkingArrival(projection, fix.accuracy)
      const arrived = eligible && arrivalFix.current !== null && fix.timestamp - arrivalFix.current >= 1000
      if (eligible && arrivalFix.current === null) { arrivalFix.current = fix.timestamp; warning = '도착지 가까이에 있어요. 위치를 한 번 더 확인하고 있어요.' }
      else if (!eligible) arrivalFix.current = null
      if (arrived) { clear(); settleTime() }
      setState(previous => ({ ...previous, status: arrived ? 'arrived' : 'walking', fix,
        projection: offRoute ? previous.projection : projection, warning: arrived ? '' : warning, error: '', elapsedSeconds: elapsed() }))
    }
    const failure = (error: GeolocationPositionError) => {
      if (generation.current !== ticket) return
      clear(); settleTime(); arrivalFix.current = null
      const message = error.code === 1 ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 위치를 허용한 뒤 다시 시도해 주세요.'
        : error.code === 3 ? '현재 위치를 확인하는 데 시간이 걸려요. 다시 시도해 주세요.' : '현재 위치를 확인하지 못했어요. 기기의 위치 설정과 연결을 확인해 주세요.'
      setState(previous => ({ ...previous, status: 'error', error: message, warning: '', elapsedSeconds: elapsed() }))
    }
    try { watch.current = navigator.geolocation.watchPosition(success, failure, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }) }
    catch { clear(); setState(previous => ({ ...previous, status: 'error', error: '현재 위치를 사용할 수 없어요. 브라우저의 위치 권한을 확인해 주세요.', warning: '' })) }
  }, [path, totalMeters, clear])
  return { ...state, totalMeters, start, retry: start, pause: () => pause(), stop,
    isActive: state.status === 'walking' || state.status === 'locating' }
}
