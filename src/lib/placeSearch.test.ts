import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config', () => ({ config: { kakaoKey: 'test-key', mapTileUrl: '', mapAttribution: '' } }))
import { searchKakaoPlaces } from './map'

type KeywordCb = (results: Array<{ place_name: string; address_name: string; road_address_name: string; x: string; y: string }>, status: string) => void
type AddressCb = (results: Array<{ address_name: string; x: string; y: string; road_address: { address_name: string; building_name: string } | null; address: { region_1depth_name: string; region_2depth_name: string; region_3depth_name: string } | null }>, status: string) => void

const sdk = vi.hoisted(() => ({ keyword: vi.fn<(query: string, cb: KeywordCb) => void>(), address: vi.fn<(query: string, cb: AddressCb) => void>() }))

describe('place search accepts addresses as well as names', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      setTimeout, clearTimeout,
      kakao: { maps: { load: (ready: () => void) => ready(), services: {
        Places: class { keywordSearch(query: string, cb: KeywordCb) { sdk.keyword(query, cb) } },
        Geocoder: class { addressSearch(query: string, cb: AddressCb) { sdk.address(query, cb) } },
      } } },
    })
    vi.stubGlobal('document', { createElement: () => ({}), head: { appendChild: () => {} } })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })

  it('falls back to the address geocoder when the keyword search is empty', async () => {
    sdk.keyword.mockImplementation((_q, cb) => cb([], 'ZERO_RESULT'))
    sdk.address.mockImplementation((_q, cb) => cb([{ address_name: '대구 동구 신암동 294-1', x: '128.628', y: '35.879',
      road_address: { address_name: '대구 동구 동대구로 550', building_name: '동대구역' },
      address: { region_1depth_name: '대구', region_2depth_name: '동구', region_3depth_name: '신암동' } }], 'OK'))

    const places = await searchKakaoPlaces('대구 동구 동대구로 550')

    expect(sdk.address).toHaveBeenCalledWith('대구 동구 동대구로 550', expect.any(Function))
    expect(places).toEqual([{ name: '동대구역', address: '대구 동구 동대구로 550', area: '대구 동구 신암동', lat: 35.879, lng: 128.628 }])
  })

  it('uses the road address as the name when the building has none', async () => {
    sdk.keyword.mockImplementation((_q, cb) => cb([], 'ZERO_RESULT'))
    sdk.address.mockImplementation((_q, cb) => cb([{ address_name: '대구 중구 동성로2가 1', x: '128.596', y: '35.869',
      road_address: { address_name: '대구 중구 동성로 1', building_name: '' }, address: null }], 'OK'))

    const [place] = await searchKakaoPlaces('대구 중구 동성로 1')

    expect(place.name).toBe('대구 중구 동성로 1')
    expect(place.area).toBe('대구 중구 동성로2가')
  })

  it('merges keyword hits first and address hits after, without duplicates by coordinates', async () => {
    sdk.keyword.mockImplementation((_q, cb) => cb([{ place_name: '동대구역', address_name: '대구 동구 신암동 294-1', road_address_name: '대구 동구 동대구로 550', x: '128.628', y: '35.879' }], 'OK'))
    sdk.address.mockImplementation((_q, cb) => cb([
      { address_name: '대구 동구 신암동 294-1', x: '128.628', y: '35.879', road_address: { address_name: '대구 동구 동대구로 550', building_name: '동대구역' }, address: null },
      { address_name: '대구 동구 신암동 295', x: '128.629', y: '35.880', road_address: null, address: null },
    ], 'OK'))

    const places = await searchKakaoPlaces('동대구로')

    expect(places.map(p => p.name)).toEqual(['동대구역', '대구 동구 신암동 295'])
  })

  it('still returns keyword results when the geocoder has nothing', async () => {
    sdk.keyword.mockImplementation((_q, cb) => cb([{ place_name: '수성못', address_name: '대구 수성구 두산동', road_address_name: '', x: '128.62', y: '35.83' }], 'OK'))
    sdk.address.mockImplementation((_q, cb) => cb([], 'ZERO_RESULT'))

    const places = await searchKakaoPlaces('수성못')

    expect(places).toHaveLength(1)
    expect(places[0].name).toBe('수성못')
  })
})
