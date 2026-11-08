import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOdsayTransit, validateTransitPaths } from './transit'
import type { PlaceLocation } from './types'
const settings = vi.hoisted(() => ({ odsayWebKey: 'dummy web-key +/%&=' }))
vi.mock('./config', () => ({ config: settings }))
const from: PlaceLocation = { name: '출발', area: '대구', address: '', lat: 35.8575, lng: 128.637 }
const to: PlaceLocation = { name: '도착', area: '대구', address: '', lat: 35.869, lng: 128.596 }
const raw = { result: { path: [{ info: { totalTime: 20 }, subPath: [] }] }, extra: { unchanged: true } }
const parsed = () => ({ paths: [{ index: 0, summary: '대구 2호선', total_minutes: 20, transfers: 0, walk_minutes: 4,
  legs: [{ kind: 'subway', line: '대구 2호선', start_name: '출발', end_name: '도착', minutes: 16,
    stops: [{ name: '출발', lat: 35.85, lng: 128.63, external_id: '10' }, { name: '도착', lat: 35.86, lng: 128.59, external_id: '11' }] }] }] })

describe('ODsay browser request', () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', fetchMock); settings.odsayWebKey = 'dummy web-key +/%&=' })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  it('sends longitude on X, latitude on Y, and a once-encoded web key without app credentials', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(raw))
    await expect(fetchOdsayTransit(from, to)).resolves.toEqual(raw)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    const query = new URL(String(url)).searchParams
    expect(new URL(String(url)).origin).toBe('https://api.odsay.com')
    expect(Object.fromEntries(query)).toEqual({ SX: '128.637', SY: '35.8575', EX: '128.596', EY: '35.869', apiKey: settings.odsayWebKey })
    expect(options).toMatchObject({ method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' } })
    expect(options?.headers).not.toHaveProperty('Authorization')
  })
  it('does not call the provider when the web key is not configured', async () => {
    settings.odsayWebKey = ''
    await expect(fetchOdsayTransit(from, to)).rejects.toMatchObject({ code: 'missing_key' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([{ lat: Number.NaN }, { lat: 91 }, { lng: 181 }, { lng: Number.POSITIVE_INFINITY }])('rejects invalid coordinates before spending a provider request: %j', async invalid => {
    await expect(fetchOdsayTransit({ ...from, ...invalid }, to)).rejects.toMatchObject({ code: 'invalid_location' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([
    [{ error: { code: '-98', msg: 'upstream private details' } }, 'no_routes'],
    [{ result: { path: [] } }, 'no_routes'],
    [{ error: { code: '-7', msg: 'upstream private details' } }, 'odsay_error'],
    [{ error: { code: '500', message: '[ApiKeyAuthFailed] dummy-private-key https://api.odsay.com/?apiKey=dummy-private-key' } }, 'odsay_auth'],
    [{ error: { code: 'other', msg: '[ApiKeyAuthFailed] details' } }, 'odsay_auth'],
    [{ unexpected: true }, 'invalid_response'],
  ])('distinguishes provider errors, authentication failures and empty results without exposing their text', async (body, code) => {
    fetchMock.mockResolvedValueOnce(Response.json(body))
    const error = await fetchOdsayTransit(from, to).catch(cause => cause)
    expect(error).toMatchObject({ code })
    expect(error.message).toMatch(/[가-힣]/)
    expect(error.message).not.toMatch(/dummy-private-key|apiKey|https:|upstream private|ApiKeyAuthFailed/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('does not leak an HTTP failure body or retry the provider', async () => {
    fetchMock.mockResolvedValueOnce(new Response('private key in upstream URL', { status: 503 }))
    const error = await fetchOdsayTransit(from, to).catch(cause => cause)
    expect(error).toMatchObject({ code: 'odsay_http' })
    expect(error.message).not.toContain('private key')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('redacts a fetch exception containing the full query URL', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('https://api.odsay.com/?apiKey=dummy-private-key'))
    const error = await fetchOdsayTransit(from, to).catch(cause => cause)
    expect(error).toMatchObject({ code: 'network' })
    expect(error.message).not.toMatch(/dummy-private-key|apiKey|https:/)
  })
  it('cancels promptly even when a pending fetch does not settle itself', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    const controller = new AbortController()
    const pending = fetchOdsayTransit(from, to, controller.signal).catch(cause => cause)
    controller.abort()
    await expect(pending).resolves.toMatchObject({ code: 'cancelled' })
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true)
  })
  it('bounds the provider phase to 15 seconds and never replays a quota-consuming request', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    const pending = fetchOdsayTransit(from, to).catch(cause => cause)
    await vi.advanceTimersByTimeAsync(15000)
    await expect(pending).resolves.toMatchObject({ code: 'timeout' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('does not start an already cancelled request', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(fetchOdsayTransit(from, to, controller.signal)).rejects.toMatchObject({ code: 'cancelled' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('parsed transit candidate contract', () => {
  it('accepts and preserves every field needed by the selection screen', () => {
    const response = parsed()
    expect(validateTransitPaths(response)).toBe(response.paths)
  })
  it('distinguishes an empty path list from a malformed response', () => {
    expect(() => validateTransitPaths({ paths: [] })).toThrow('선택할 수 있는')
    expect(() => validateTransitPaths({ result: [] })).toThrow('올바른 대중교통 경로')
  })
  it('rejects duplicate indexes, missing leg fields, and swapped out-of-range stop coordinates', () => {
    const duplicate = parsed(); duplicate.paths.push(structuredClone(duplicate.paths[0]))
    expect(() => validateTransitPaths(duplicate)).toThrow('올바른 대중교통 경로')
    const missing = parsed(); Reflect.deleteProperty(missing.paths[0].legs[0], 'stops')
    expect(() => validateTransitPaths(missing)).toThrow('올바른 대중교통 경로')
    const swapped = parsed(); swapped.paths[0].legs[0].stops[0].lat = 128.63
    expect(() => validateTransitPaths(swapped)).toThrow('올바른 대중교통 경로')
  })
})
