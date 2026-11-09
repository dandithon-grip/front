import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RideInfo, RouteData, TodayCard } from '../lib/types'

const mocks = vi.hoisted(() => ({ store: {} as Record<string, unknown>, navigate: vi.fn(), selectRide: vi.fn(), refresh: vi.fn() }))
vi.mock('../lib/store', () => ({ useStore: () => mocks.store }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('../components/ui', () => ({ Header: () => null, HomeIndicator: () => null, Nav: () => null, StatusBar: () => null, Stat: ({ children }: { children: unknown }) => <span>{children as string}</span> }))
import { Home } from './Home'

const rides: RideInfo[] = [
  { id: 'ride-402', order_no: 0, line: '402', station_ids: [], board_name: '동대구역', alight_name: '달서교회건너' },
  { id: 'ride-156', order_no: 1, line: '156', station_ids: [], board_name: '동대구역', alight_name: '대구제일고건너' },
]
const route: RouteData = { id: 'r1', leg_type: 'back_walk', is_baseline: false, name: '달성공원 샛길', minutes: 12, add_minutes: 4, green_pct: 40,
  event_score: 0, score: 30, tags: [], highlights: [], polyline: [], spots: [], alight_station_id: null, ride_id: 'ride-156' }
const card: TodayCard = { date: '2026-11-09', preference: 'full', action_type: 'detour', fallback_level: 1, reason_tag: 'park', text: '156번을 타면 달성공원을 지나요.',
  deviation: null, by_llm: true, sunset_at: '2026-11-09T17:30:00+09:00', sky: null, air_grade: null, route, candidates: [route], shortest: [], rides, ride_id: null }
const text = (node: ReactTestInstance | string): string => typeof node === 'string' ? node : node.children.map(text).join('')

describe('home ride tabs (server#90)', () => {
  let renderer: ReactTestRenderer | undefined
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectRide.mockResolvedValue(undefined); mocks.refresh.mockResolvedValue(undefined)
    mocks.store = { card, preference: 'full', direction: 'to_home', profile: { loggedIn: true, authId: 'a' }, journeyStatus: 'ready', journeyError: null,
      refreshJourney: mocks.refresh, selectRoute: vi.fn(), changeDirection: vi.fn(), selectRide: mocks.selectRide, rideId: null,
      commute: { configured: true, rides }, isGuest: false, dataSource: 'api', startPreview: vi.fn(), sessionReady: true }
  })
  afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined })
  const tabs = () => renderer!.root.findAllByType('button').filter(node => node.props['data-ride'] !== undefined)

  it('shows one tab per usual route plus the overall recommendation, and marks the chosen one', async () => {
    await act(async () => { renderer = create(<Home />) })
    expect(tabs().map(node => [text(node), node.props['aria-pressed']])).toEqual([['오늘의 추천', true], ['402', false], ['156', false]])
    await act(async () => { tabs()[2].props.onClick() })
    expect(mocks.selectRide).toHaveBeenCalledWith('ride-156')
  })

  it('shows the line of the recommended route when more than one route is registered', async () => {
    await act(async () => { renderer = create(<Home />) })
    expect(JSON.stringify(renderer!.toJSON())).toContain('156')
  })

  it('hides the tabs when only one route is registered', async () => {
    mocks.store = { ...mocks.store, card: { ...card, rides: [rides[0]] }, commute: { configured: true, rides: [rides[0]] } }
    await act(async () => { renderer = create(<Home />) })
    expect(tabs()).toHaveLength(0)
  })
})
