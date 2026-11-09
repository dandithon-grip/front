import { useEffect, useRef, useState } from 'react'
import { createMapDisplay, type MapDisplay, type MapScene } from '../lib/map'
import type { WalkingFix } from '../lib/useWalking'
import type { PlaceLocation, Point, RouteData } from '../lib/types'
import 'leaflet/dist/leaflet.css'
import '../pages/walking.css'

interface Props {
  routes?: RouteData[]; selectedId?: string; onSelect?: (id: string) => void
  locations?: PlaceLocation[]; onPick?: (point: Point) => void; pickable?: Point; suggestions?: PlaceLocation[]; onSuggestion?: (place: PlaceLocation) => void; className?: string
  position?: WalkingFix | null; follow?: boolean; focusKey?: number; overviewKey?: number; onFollowChange?: (follow: boolean) => void
  /** false = 썸네일 (끌기·확대 없음) */
  interactive?: boolean
}
const EMPTY_ROUTES: RouteData[] = [], EMPTY_LOCATIONS: PlaceLocation[] = []
export function JourneyMap({ routes = EMPTY_ROUTES, selectedId, onSelect, locations = EMPTY_LOCATIONS, onPick, pickable, suggestions = EMPTY_LOCATIONS, onSuggestion, className = '',
  position = null, follow = false, focusKey = 0, overviewKey = 0, onFollowChange, interactive = true }: Props) {
  const canvas = useRef<HTMLDivElement>(null), display = useRef<MapDisplay | null>(null)
  const callbacks = useRef({ onSelect, onPick, onSuggestion, onFollowChange, position, follow, focusKey })
  callbacks.current = { onSelect, onPick, onSuggestion, onFollowChange, position, follow, focusKey }
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  // The map is built once; later changes to what it shows are applied in place (no flicker, no lost viewport).
  const scene: MapScene = { routes, locations, selectedId, pickable, suggestions }
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const sceneKey = JSON.stringify({ routes: routes.map(route => ({ id: route.id, baseline: route.is_baseline, points: route.polyline, journey: route.journey })), locations, selectedId, pickable, suggestions })
  const canPick = Boolean(onPick)
  useEffect(() => {
    if (!canvas.current) return
    let disposed = false, resize: ResizeObserver | undefined
    const controller = new AbortController()
    const builtWith = sceneRef.current
    setLoading(true); setError('')
    void createMapDisplay(canvas.current, { ...builtWith, signal: controller.signal, interactive,
      onSelect: id => callbacks.current.onSelect?.(id),
      onSuggestion: place => callbacks.current.onSuggestion?.(place),
      ...(canPick ? { onPick: (point: Point) => callbacks.current.onPick?.(point) } : {}),
      onManualPan: () => callbacks.current.onFollowChange?.(false),
      onTileError: () => { if (!disposed) setError('배경 지도를 불러오지 못했어요. 연결을 확인해 주세요.') },
    }).then(map => {
      if (disposed) { map.destroy(); return }
      display.current = map
      if (sceneRef.current !== builtWith) map.update(sceneRef.current)
      map.showPosition(callbacks.current.position, callbacks.current.follow, Boolean(callbacks.current.focusKey))
      if (typeof ResizeObserver !== 'undefined') { resize = new ResizeObserver(() => map.resize()); resize.observe(canvas.current!) }
      setLoading(false)
    }).catch(() => { if (!disposed) { setLoading(false); setError('지도를 열지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.') } })
    return () => { disposed = true; controller.abort(); resize?.disconnect(); display.current?.destroy(); display.current = null }
  }, [canPick, revision, interactive])
  const previousScene = useRef(sceneKey)
  useEffect(() => {
    if (previousScene.current !== sceneKey) display.current?.update(sceneRef.current)
    previousScene.current = sceneKey
  }, [sceneKey])
  const previousFocus = useRef(focusKey)
  const hadPosition = useRef(false)
  useEffect(() => {
    display.current?.showPosition(position, follow, focusKey !== previousFocus.current || Boolean(position && !hadPosition.current && follow))
    previousFocus.current = focusKey
    hadPosition.current = Boolean(position)
  }, [position, follow, focusKey])
  useEffect(() => { if (overviewKey) display.current?.fit() }, [overviewKey])
  return <div className={`journey-map ${className}${interactive ? '' : ' journey-map--still'}`} aria-label="샛길 지도" aria-hidden={!interactive}>
    <div className="journey-map__tiles" ref={canvas} />
    {loading && interactive && <p className="walking-map-message" role="status">지도를 불러오고 있어요.</p>}
    {error && <div className="walking-map-message walking-map-message--error" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>지도 다시 연결</button></div>}
  </div>
}
