import type { Point, RouteData } from '../lib/types'
import { isValidPoint } from '../lib/walking'

interface SketchPath { role: 'usual' | 'saetgil'; points: Array<{ x: number; y: number }> }

/**
 * A route as a small line drawing: the changed walking piece in green, the rest of the trip faint.
 * Pure SVG — no tiles, labels or pins, so a card thumbnail stays calm and loads instantly.
 */
export function sketchPaths(route: RouteData, width: number, height: number, padding = 10): SketchPath[] {
  const pieces: Array<{ role: 'usual' | 'saetgil'; points: Point[] }> = route.journey?.length
    ? route.journey.filter(segment => segment.kind !== 'ride').map(segment => ({ role: segment.role === 'usual' ? 'usual' : 'saetgil', points: segment.polyline.filter(isValidPoint) }))
    : [{ role: 'saetgil', points: route.polyline.filter(isValidPoint) }]
  const all = pieces.flatMap(piece => piece.points)
  if (!all.length) return []
  const lats = all.map(p => p.lat), lngs = all.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  // Degrees of longitude are shorter than latitude at Korean latitudes; keep the shape's proportions.
  const lngScale = Math.cos((minLat + maxLat) / 2 * Math.PI / 180)
  const spanX = Math.max((maxLng - minLng) * lngScale, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6)
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY)
  const offsetX = (width - spanX * scale) / 2, offsetY = (height - spanY * scale) / 2
  const project = (p: Point) => ({ x: offsetX + (p.lng - minLng) * lngScale * scale, y: height - offsetY - (p.lat - minLat) * scale })
  return pieces.filter(piece => piece.points.length >= 2).map(piece => ({ role: piece.role, points: piece.points.map(project) }))
}

const toD = (points: Array<{ x: number; y: number }>) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

export function RouteSketch({ route, size = 100 }: { route: RouteData; size?: number }) {
  const paths = sketchPaths(route, size, size)
  const highlight = paths.filter(path => path.role === 'saetgil')
  const start = highlight[0]?.points[0], end = highlight[highlight.length - 1]?.points.slice(-1)[0]
  return <svg className="route-sketch" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${route.name} 길 모양`}>
    <rect width={size} height={size} rx="6" fill="#eef6f0" />
    {paths.filter(path => path.role === 'usual').map((path, i) => <path key={`u${i}`} d={toD(path.points)} fill="none" stroke="#c5d3ca" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
    {highlight.map((path, i) => <path key={`s${i}`} d={toD(path.points)} fill="none" stroke="#36bd75" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />)}
    {start && <circle cx={start.x} cy={start.y} r="4" fill="#fff" stroke="#2fa966" strokeWidth="2.5" />}
    {end && <circle cx={end.x} cy={end.y} r="4" fill="#2fa966" stroke="#fff" strokeWidth="2" />}
  </svg>
}
