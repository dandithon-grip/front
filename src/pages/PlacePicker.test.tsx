import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const requests = vi.hoisted(() => ({ places: vi.fn(), describe: vi.fn(), map: vi.fn() }))
const settings = vi.hoisted(() => ({ kakaoKey: '' }))
vi.mock('../lib/api', () => ({ searchPlaces: requests.places, getStations: vi.fn(), searchTransitRoutes: vi.fn() }))
vi.mock('../lib/config', () => ({ config: settings }))
vi.mock('../lib/map', () => ({ describeKakaoPoint: requests.describe }))
vi.mock('../components/JourneyMap', () => ({ JourneyMap: (props: unknown) => { requests.map(props); return null } }))
import { PlacePicker } from './Setup'

const latestMap = () => requests.map.mock.calls[requests.map.mock.calls.length - 1][0] as { onPick: (point: { lat: number; lng: number }) => void; pickable?: unknown; locations: unknown[] }
const described = { name: '대구 중구 동성로2가 1', area: '대구 중구 동성로2가', address: '대구 중구 동성로 1', lat: 35.869, lng: 128.596 }

describe('real place lookup from the route editor', () => {
  let renderer: ReactTestRenderer | undefined
  const onChange = vi.fn()
  afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); settings.kakaoKey = '' })

  it('uses real search instead of example results even when the surrounding app is in preview', async () => {
    requests.places.mockResolvedValueOnce([{ name: '서버에서 찾은 역', area: '대구', address: '실제 정류장', lat: 35.88, lng: 128.6 }])
    await act(async () => { renderer = create(<PlacePicker label="출발지" onChange={onChange} preview realSearch />) })
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('미리보기 장소입니다')
    await act(async () => renderer!.root.findByProps({ type: 'search' }).props.onChange({ target: { value: ' 대구 ' } }))
    await act(async () => { renderer!.root.findByProps({ className: 'setup-place__search-button' }).props.onClick(); await Promise.resolve() })
    expect(requests.places).toHaveBeenCalledExactlyOnceWith('대구')
    expect(JSON.stringify(renderer!.toJSON())).toContain('서버에서 찾은 역')
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('미리보기 장소입니다')
  })

  it('retains explicit example searching for the original preview setup flow', async () => {
    await act(async () => { renderer = create(<PlacePicker label="출발지" onChange={onChange} preview />) })
    await act(async () => renderer!.root.findByProps({ type: 'search' }).props.onChange({ target: { value: '범어' } }))
    await act(async () => { renderer!.root.findByProps({ className: 'setup-place__search-button' }).props.onClick(); await Promise.resolve() })
    expect(requests.places).not.toHaveBeenCalled()
    expect(JSON.stringify(renderer!.toJSON())).toContain('미리보기 장소입니다')
    expect(JSON.stringify(renderer!.toJSON())).toContain('범어역')
  })

  it('searches on its own shortly after typing, once, with the trimmed text', async () => {
    vi.useFakeTimers()
    requests.places.mockResolvedValue([{ name: '동대구역', area: '대구 동구', address: '대구 동구 동대구로 550', lat: 35.879, lng: 128.628 }])
    await act(async () => { renderer = create(<PlacePicker label="출발지" onChange={onChange} preview={false} />) })
    await act(async () => renderer!.root.findByProps({ type: 'search' }).props.onChange({ target: { value: '동대' } }))
    await act(async () => renderer!.root.findByProps({ type: 'search' }).props.onChange({ target: { value: '동대구역 ' } }))
    expect(requests.places).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve() })
    expect(requests.places).toHaveBeenCalledExactlyOnceWith('동대구역')
    expect(JSON.stringify(renderer!.toJSON())).toContain('동대구역')
  })

  it('turns a tapped map point into a place without typing when Kakao can describe it', async () => {
    settings.kakaoKey = 'public-js-key'
    requests.describe.mockResolvedValueOnce(described)
    await act(async () => { renderer = create(<PlacePicker label="출발지" onChange={onChange} preview={false} />) })
    await act(async () => { latestMap().onPick({ lat: 35.869, lng: 128.596 }); await Promise.resolve() })
    expect(requests.describe).toHaveBeenCalledWith({ lat: 35.869, lng: 128.596 })
    expect(onChange).toHaveBeenLastCalledWith(described)
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('좌표로 장소 선택')
  })

  it('keeps the coordinate form only when no map provider can describe a point', async () => {
    await act(async () => { renderer = create(<PlacePicker label="출발지" onChange={onChange} preview={false} />) })
    await act(async () => { latestMap().onPick({ lat: 35.869, lng: 128.596 }); await Promise.resolve() })
    expect(requests.describe).not.toHaveBeenCalled()
    expect(JSON.stringify(renderer!.toJSON())).toContain('좌표로 장소 선택')
  })

  it('hands the chosen place to the map as a draggable pin', async () => {
    await act(async () => { renderer = create(<PlacePicker label="출발지" value={described} onChange={onChange} preview={false} />) })
    expect(latestMap().pickable).toEqual(described)
    expect(latestMap().locations).toEqual([described])
  })

  it('uses the device location as a tapped point', async () => {
    settings.kakaoKey = 'public-js-key'
    requests.describe.mockResolvedValueOnce(described)
    const getCurrentPosition = vi.fn((success: (position: { coords: { latitude: number; longitude: number } }) => void) => success({ coords: { latitude: 35.869, longitude: 128.596 } }))
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    await act(async () => { renderer = create(<PlacePicker label="출발지" onChange={onChange} preview={false} />) })
    await act(async () => { renderer!.root.findByProps({ className: 'setup-place__locate' }).props.onClick(); await Promise.resolve(); await Promise.resolve() })
    expect(getCurrentPosition).toHaveBeenCalled()
    expect(requests.describe).toHaveBeenCalledWith({ lat: 35.869, lng: 128.596 })
    expect(onChange).toHaveBeenLastCalledWith(described)
  })
})
