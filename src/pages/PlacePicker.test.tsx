import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const requests = vi.hoisted(() => ({ places: vi.fn() }))
vi.mock('../lib/api', () => ({ searchPlaces: requests.places, getStations: vi.fn(), searchTransitRoutes: vi.fn() }))
vi.mock('../components/JourneyMap', () => ({ JourneyMap: () => null }))
import { PlacePicker } from './Setup'

describe('real place lookup from the route editor', () => {
  let renderer: ReactTestRenderer | undefined
  const onChange = vi.fn()
  afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.clearAllMocks() })

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
})
