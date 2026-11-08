import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceLocation } from './types'
const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), onAuthStateChange: vi.fn() }))
vi.mock('./auth', () => ({ authClient: { auth } }))
vi.mock('./config', () => ({ config: { apiUrl: 'https://app.example.test', kakaoKey: '', odsayWebKey: 'dummy-browser-key' } }))
import { searchTransitRoutes } from './api'

const from: PlaceLocation = { name: '출발', address: '', area: '대구', lat: 35.85, lng: 128.63 }
const to: PlaceLocation = { name: '도착', address: '', area: '대구', lat: 35.86, lng: 128.59 }
const raw = { result: { path: [{ info: { totalTime: 20 }, subPath: [] }] }, preserve: 'original response' }
const paths = [{ index: 0, summary: '대구 2호선', total_minutes: 20, walk_minutes: 4, transfers: 0,
  legs: [{ kind: 'subway', line: '대구 2호선', minutes: 16, start_name: '출발', end_name: '도착',
    stops: [{ name: '출발', external_id: '1', lat: 35.85, lng: 128.63 }, { name: '도착', external_id: '2', lat: 35.86, lng: 128.59 }] }] }]
const session = (id: string) => ({ data: { session: { access_token: `token-${id}`, user: { id } } }, error: null })

describe('browser ODsay → authenticated server parsing', () => {
  const fetchMock = vi.fn<typeof fetch>(), unsubscribe = vi.fn()
  let listener: (event: string, next: { user: { id: string } } | null) => void
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubGlobal('fetch', fetchMock)
    auth.getSession.mockResolvedValue(session('A'))
    auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'refreshed-A', user: { id: 'A' } } }, error: null })
    auth.onAuthStateChange.mockImplementation(callback => { listener = callback; return { data: { subscription: { unsubscribe } } } })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('passes the full raw response only to the authenticated parse endpoint', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(raw)).mockResolvedValueOnce(Response.json({ paths }))
    await expect(searchTransitRoutes(from, to, { expectedUserId: 'A' })).resolves.toEqual(paths)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ Accept: 'application/json' })
    expect(fetchMock.mock.calls[1]).toEqual(['https://app.example.test/transit/routes/parse', expect.objectContaining({ method: 'POST',
      body: JSON.stringify({ odsay: raw }), headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer token-A' } })])
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
  it('blocks guests before spending an ODsay query', async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    await expect(searchTransitRoutes(from, to)).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('blocks a request started by a different account before ODsay', async () => {
    await expect(searchTransitRoutes(from, to, { expectedUserId: 'B' })).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('retries only parsing when its token is rejected, without repeating the ODsay query', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(raw)).mockResolvedValueOnce(Response.json({ message: 'expired' }, { status: 401 })).mockResolvedValueOnce(Response.json({ paths }))
    await expect(searchTransitRoutes(from, to, { expectedUserId: 'A' })).resolves.toEqual(paths)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://api.odsay.com/'))).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/transit/routes/parse'))).toHaveLength(2)
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({ Authorization: 'Bearer refreshed-A' })
  })
  it('does not parse an A search result after the current session changes to B', async () => {
    fetchMock.mockImplementationOnce(async () => { auth.getSession.mockResolvedValue(session('B')); return Response.json(raw) })
    await expect(searchTransitRoutes(from, to, { expectedUserId: 'A' })).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('cancels a pending provider request on a sign-out event and clears the subscription', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    const pending = searchTransitRoutes(from, to, { expectedUserId: 'A' }).catch(cause => cause)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    listener('SIGNED_OUT', null)
    await expect(pending).resolves.toMatchObject({ status: 401 })
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true)
  })
  it('does not return parsed results to a different account', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(raw)).mockImplementationOnce(async () => { auth.getSession.mockResolvedValue(session('B')); return Response.json({ paths }) })
    await expect(searchTransitRoutes(from, to, { expectedUserId: 'A' })).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('does not fall back to the legacy GET when parsing is not deployed', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(raw)).mockResolvedValueOnce(Response.json({ message: 'Not Found' }, { status: 404 }))
    await expect(searchTransitRoutes(from, to)).rejects.toMatchObject({ status: 404, message: expect.stringContaining('서버에 반영되지') })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/transit/routes?'))).toBe(false)
  })
  it('redacts a failed parser message containing provider query credentials', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(raw)).mockResolvedValueOnce(Response.json({ message: 'https://api.odsay.com/?apiKey=dummy-private-key' }, { status: 500 }))
    const error = await searchTransitRoutes(from, to).catch(cause => cause)
    expect(error).toMatchObject({ status: 500 })
    expect(error.message).not.toMatch(/apiKey|https:|dummy-private-key/)
  })
  it('does not call parsing after the caller cancels the provider phase', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    const controller = new AbortController()
    const pending = searchTransitRoutes(from, to, { signal: controller.signal }).catch(cause => cause)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    controller.abort()
    await expect(pending).resolves.toMatchObject({ code: 'cancelled' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
