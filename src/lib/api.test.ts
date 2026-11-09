import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Commute } from './types'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }))

vi.mock('./auth', () => ({ authClient: { auth } }))
vi.mock('./config', () => ({ config: { apiUrl: 'https://api.example.test', kakaoKey: '' } }))

import { ApiError, apiRequest, commutePayload } from './api'

function commute(overrides: Partial<Commute> = {}): Commute {
  return {
    from: '집', to: '회사',
    fromPlace: { name: '집', area: '수성구', address: '출발 주소', lat: 35.8575, lng: 128.637 },
    toPlace: { name: '회사', area: '중구', address: '도착 주소', lat: 35.869, lng: 128.596 },
    morning: '08:05', evening: '18:30', mode: '도보', preference: 'sunset', configured: true,
    ...overrides,
  }
}

describe('commutePayload', () => {
  it.each(['fromPlace', 'toPlace'] as const)('rejects an unselected %s before sending a commute', (field) => {
    expect(() => commutePayload(commute({ [field]: undefined }))).toThrow(ApiError)
    expect(() => commutePayload(commute({ [field]: undefined }))).toThrow('출발지와 도착지를 선택')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects a non-finite coordinate: %s', (lat) => {
    const draft = commute()
    draft.fromPlace = { ...draft.fromPlace!, lat }
    expect(() => commutePayload(draft)).toThrow('출발지와 도착지를 선택')
  })

  it.each(['24:00', '09:60', '9:00', '오전 9시', ''])('rejects malformed commute time %j', (time) => {
    expect(() => commutePayload(commute({ morning: time }))).toThrow('출근·퇴근 시간을 확인')
    expect(() => commutePayload(commute({ evening: time }))).toThrow('출근·퇴근 시간을 확인')
  })

  it('rejects transit without a selected transit path or station sequence', () => {
    expect(() => commutePayload(commute({ mode: '대중교통', transitLegs: [], stationIds: [] })))
      .toThrow('대중교통 경로를 선택')
  })

  it('preserves latitude/longitude axes, leading zeroes, and midnight/noon times', () => {
    expect(commutePayload(commute({ morning: '00:05', evening: '12:00' }))).toMatchObject({
      from_lat: 35.8575, from_lng: 128.637, to_lat: 35.869, to_lng: 128.596,
      from_area: '수성구', to_area: '중구', go_time: '00:05', leave_time: '12:00',
      transport_mode: 'walk', preference: 'sunset',
    })
  })

  it('sends every chosen transit option and mirrors the first one into transit_legs (server#88)', () => {
    const stop = (name: string, external_id: string) => ({ name, external_id, lat: 35.87, lng: 128.6 })
    const bus402 = [{ line: '402', stops: [stop('동대구역', 'd1'), stop('달서교회건너', 'd3')] }]
    const bus156 = [{ line: '156', stops: [stop('동대구역', 'd1'), stop('대구제일고건너', 'e3')] }]
    const payload = commutePayload(commute({ mode: '대중교통', transitOptions: [bus402, bus156], transitLegs: bus402 }))
    expect(payload.transit_options).toEqual([bus402, bus156])
    expect(payload.transit_legs).toEqual(bus402)
    expect(commutePayload(commute({ mode: '도보', transitOptions: [bus402] })).transit_options).toEqual([])
  })

  it('preserves every transit leg and ordered stop instead of flattening a transfer', () => {
    const legs = [
      { line: '2', stops: [{ name: '수성구청', external_id: '101', lat: 35.85, lng: 128.63 }, { name: '반월당', external_id: '102', lat: 35.86, lng: 128.59 }] },
      { line: '1', stops: [{ name: '반월당', external_id: '201', lat: 35.86, lng: 128.59 }, { name: '중앙로', external_id: '202', lat: 35.87, lng: 128.59 }] },
    ]
    const payload = commutePayload(commute({ mode: '대중교통', transitLegs: legs, stationIds: ['a', 'b', 'c'] }))
    expect(payload.transport_mode).toBe('transit')
    expect(payload.transit_legs).toEqual(legs)
    expect(payload.station_ids).toEqual(['a', 'b', 'c'])
    expect(payload.line).toBeNull()
  })

  it.each([['도보', 'walk'], ['자동차', 'car']] as const)('does not send stale transit fields after switching to %s', (mode, apiMode) => {
    const payload = commutePayload(commute({
      mode, line: '2', stationIds: ['previous-station'],
      transitLegs: [{ line: '2', stops: [{ name: '이전 역', external_id: 'old', lat: 35.85, lng: 128.6 }] }],
    }))
    expect(payload).toMatchObject({ transport_mode: apiMode, transit_legs: [], station_ids: [], line: null })
  })
})

describe('apiRequest', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'first-token', user: { id: 'account-A' } } }, error: null })
    auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'refreshed-token', user: { id: 'account-A' } } }, error: null })
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('adds the current bearer token and serializes a JSON write exactly once', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'saved' }))
    await expect(apiRequest('/commutes/me', { method: 'PUT', body: { go_time: '08:05', preference: 'sunset' } }))
      .resolves.toEqual({ id: 'saved' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/commutes/me', expect.objectContaining({
      method: 'PUT',
      headers: { Accept: 'application/json', Authorization: 'Bearer first-token', 'Content-Type': 'application/json' },
      body: '{"go_time":"08:05","preference":"sunset"}',
    }))
  })

  it('refreshes a rejected token once and retries with the refreshed authorization header', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'expired' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
    await expect(apiRequest('/profiles/me')).resolves.toEqual({ ok: true })
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer first-token' })
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer refreshed-token' })
  })

  it('stops after the second 401 instead of refreshing or retrying indefinitely', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'expired' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ message: 'still rejected' }, { status: 401 }))
    await expect(apiRequest('/profiles/me')).rejects.toMatchObject({ name: 'ApiError', status: 401 })
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not repeat the request when refreshing the session fails', async () => {
    auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'refresh failed' } })
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'expired' }, { status: 401 }))
    await expect(apiRequest('/profiles/me')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('blocks an operation created by another account before sending a request', async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'token-B', user: { id: 'account-B' } } }, error: null })
    await expect(apiRequest('/commutes/me', { method: 'PUT', body: { from_area: 'A의 집' }, expectedUserId: 'account-A' }))
      .rejects.toMatchObject({ name: 'ApiError', status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('allows a protected operation when its expected account is still current', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }))
    await expect(apiRequest('/users/me', { expectedUserId: 'account-A' })).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer first-token' })
  })

  it.each([undefined, 'account-A'])('does not replay an A-account write using B-account credentials after a 401 (expectedUserId=%s)', async (expectedUserId) => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'expired' }, { status: 401 }))
    auth.refreshSession.mockResolvedValueOnce({ data: { session: { access_token: 'token-B', user: { id: 'account-B' } } }, error: null })
    await expect(apiRequest('/feedback', { method: 'POST', body: { route_id: 'A-route', rating: 5 }, expectedUserId }))
      .rejects.toMatchObject({ name: 'ApiError', status: 401 })
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer first-token' })
  })

  it('does not replay a write after a network failure with an unknown server outcome', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network disconnected after upload'))
    await expect(apiRequest('/feedback', { method: 'POST', body: { rating: 5, route_id: 'route-1' } }))
      .rejects.toMatchObject({ name: 'ApiError', status: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('does not expose an HTML server error page in the user-facing error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html><body>private stack trace and infrastructure details</body></html>', {
      status: 500, headers: { 'Content-Type': 'text/html' },
    }))
    const error = await apiRequest('/cards/today').catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500 })
    expect((error as Error).message).toContain('잠시 후 다시 시도')
    expect((error as Error).message).not.toMatch(/<html>|private stack|infrastructure/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('blocks a protected request before fetch when no access token is available', async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    await expect(apiRequest('/commutes/me', { method: 'PUT', body: { arbitrary: 'draft' } }))
      .rejects.toMatchObject({ name: 'ApiError', status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('does not read or refresh a session for an explicitly public request', async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ id: 'station-1' }]))
    await expect(apiRequest('/stations', { authenticated: false })).resolves.toEqual([{ id: 'station-1' }])
    expect(auth.getSession).not.toHaveBeenCalled()
    expect(auth.refreshSession).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ Accept: 'application/json' })
  })

  it('returns an empty result for a successful 204 response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(apiRequest('/profiles/me/tag-weights', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})
