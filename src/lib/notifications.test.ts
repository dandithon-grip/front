import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ getApps: vi.fn(), initializeApp: vi.fn(), getMessaging: vi.fn(), getToken: vi.fn(), deleteToken: vi.fn(), isSupported: vi.fn(), onMessage: vi.fn() }))
const calls = vi.hoisted(() => ({ api: vi.fn(), getSession: vi.fn(), requestPermission: vi.fn(), register: vi.fn(), getRegistration: vi.fn(), unsubscribe: vi.fn() }))
const settings = vi.hoisted(() => ({ firebase: { apiKey: 'public-example', authDomain: 'example.firebaseapp.com', projectId: 'example', storageBucket: 'example.appspot.com', messagingSenderId: '123', appId: 'web-example' }, firebaseVapidKey: 'public-vapid-example' }))
vi.mock('firebase/app', () => ({ getApps: sdk.getApps, initializeApp: sdk.initializeApp }))
vi.mock('firebase/messaging', () => ({ getMessaging: sdk.getMessaging, getToken: sdk.getToken, deleteToken: sdk.deleteToken, isSupported: sdk.isSupported, onMessage: sdk.onMessage }))
vi.mock('./auth', () => ({ authClient: { auth: { getSession: calls.getSession } } }))
vi.mock('./config', () => ({ config: settings }))
vi.mock('./api', () => ({ apiRequest: calls.api, ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message) } } }))

function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() }
}
let permission: NotificationPermission
let browser: EventTarget & { isSecureContext: boolean }
let memory: ReturnType<typeof storage>
let worker: { active: object; pushManager: { getSubscription: ReturnType<typeof vi.fn> } }

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  permission = 'default'
  settings.firebase.apiKey = 'public-example'; settings.firebaseVapidKey = 'public-vapid-example'
  memory = storage()
  browser = Object.assign(new EventTarget(), { isSecureContext: true, PushManager: class {}, location: { origin: 'https://saetgil.example' }, setTimeout, clearTimeout })
  const notifications = { get permission() { return permission }, requestPermission: calls.requestPermission }
  Object.assign(browser, { Notification: notifications })
  vi.stubGlobal('window', browser); vi.stubGlobal('Notification', notifications); vi.stubGlobal('localStorage', memory)
  worker = { active: {}, pushManager: { getSubscription: vi.fn().mockResolvedValue({ unsubscribe: calls.unsubscribe }) } }
  vi.stubGlobal('navigator', { serviceWorker: { register: calls.register, getRegistration: calls.getRegistration } })
  vi.stubGlobal('document', { visibilityState: 'visible', hasFocus: () => true })
  calls.requestPermission.mockImplementation(async () => { permission = 'granted'; return 'granted' })
  calls.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-A' } } }, error: null })
  calls.register.mockResolvedValue(worker); calls.getRegistration.mockResolvedValue(worker); calls.unsubscribe.mockResolvedValue(true)
  sdk.getApps.mockReturnValue([]); sdk.initializeApp.mockReturnValue({ name: 'saetgil-notifications' }); sdk.getMessaging.mockReturnValue({})
  sdk.isSupported.mockResolvedValue(true); sdk.getToken.mockResolvedValue('fcm-device-A'); sdk.deleteToken.mockResolvedValue(true); sdk.onMessage.mockReturnValue(vi.fn())
  calls.api.mockImplementation(async (_path: string, options: { method?: string } = {}) => options.method === 'PUT' ? { registered: true } : options.method === 'POST' ? { sent: 1 } : { registered: false })
})

async function library() { return import('./notifications') }

describe('FCM registration and safe account cleanup', () => {
  it('checks status without prompting, generating a token, registering a worker or calling the backend', async () => {
    const notifications = await library()
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('off')
    expect(calls.requestPermission).not.toHaveBeenCalled(); expect(sdk.getToken).not.toHaveBeenCalled()
    expect(calls.register).not.toHaveBeenCalled(); expect(calls.api).not.toHaveBeenCalled()
  })
  it('reports missing public configuration before requesting permission', async () => {
    settings.firebase.apiKey = ''
    const notifications = await library()
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('unconfigured')
    await expect(notifications.enableNotifications('user-A')).rejects.toMatchObject({ code: 'unconfigured' })
    expect(calls.requestPermission).not.toHaveBeenCalled(); expect(calls.api).not.toHaveBeenCalled()
  })
  it('distinguishes unsupported browsers and denied permission', async () => {
    const notifications = await library()
    browser.isSecureContext = false
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('unsupported')
    browser.isSecureContext = true; permission = 'denied'
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('denied')
    await expect(notifications.enableNotifications('user-A')).rejects.toMatchObject({ code: 'denied' })
    expect(calls.requestPermission).not.toHaveBeenCalled(); expect(sdk.getToken).not.toHaveBeenCalled()
  })
  it('requests permission synchronously on the explicit action and turns on only after authenticated PUT succeeds', async () => {
    const notifications = await library()
    let complete!: (result: { registered: boolean }) => void
    calls.api.mockReturnValue(new Promise(resolve => { complete = resolve }))
    const pending = notifications.enableNotifications('user-A')
    expect(calls.requestPermission).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(calls.api).toHaveBeenCalledTimes(1))
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('off')
    expect(calls.api).toHaveBeenCalledWith('/users/me/push-tokens', expect.objectContaining({ method: 'PUT', expectedUserId: 'user-A', body: { token: 'fcm-device-A' } }))
    complete({ registered: true }); await pending
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('on')
    expect(sdk.getToken).toHaveBeenCalledWith(expect.anything(), { vapidKey: 'public-vapid-example', serviceWorkerRegistration: worker })
    const url = new URL(calls.register.mock.calls[0][0])
    expect(url.pathname).toBe('/firebase-messaging-sw.js'); expect(url.searchParams.get('projectId')).toBe('example')
    expect(url.searchParams.has('token')).toBe(false)
  })
  it('keeps the switch off when permission is dismissed', async () => {
    calls.requestPermission.mockResolvedValue('default')
    const notifications = await library()
    await expect(notifications.enableNotifications('user-A')).rejects.toMatchObject({ code: 'dismissed' })
    expect(sdk.getToken).not.toHaveBeenCalled(); expect(calls.api).not.toHaveBeenCalled()
  })
  it('reports an undeployed 404 backend and revokes the unregistered device token', async () => {
    const notifications = await library(); const { ApiError } = await import('./api')
    calls.api.mockRejectedValue(new ApiError('Not Found', 404))
    await expect(notifications.enableNotifications('user-A')).rejects.toMatchObject({ code: 'server-unavailable' })
    expect(sdk.deleteToken).toHaveBeenCalledTimes(1)
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('off')
  })
  it('does not commit an A-account registration when the SDK session changes to B', async () => {
    const notifications = await library()
    calls.api.mockImplementation(async () => { calls.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-B' } } } }); return { registered: true } })
    await expect(notifications.enableNotifications('user-A')).rejects.toMatchObject({ code: 'auth' })
    expect(sdk.deleteToken).toHaveBeenCalled()
    expect((await notifications.getNotificationStatus('user-B')).state).toBe('off')
  })
  it('deletes the current token on the backend and revokes the local FCM subscription before sign-out', async () => {
    const notifications = await library(); await notifications.enableNotifications('user-A'); calls.api.mockClear()
    expect(await notifications.cleanupNotificationsForSignOut('user-A')).toEqual({ serverRemoved: true, deviceRevoked: true })
    expect(calls.api).toHaveBeenCalledWith('/users/me/push-tokens', { method: 'DELETE', body: { token: 'fcm-device-A' }, expectedUserId: 'user-A' })
    expect(sdk.deleteToken).toHaveBeenCalledTimes(1)
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('off')
  })
  it('does not call an undeployed endpoint or block sign-out for a browser that never registered', async () => {
    const notifications = await library()
    await expect(notifications.cleanupNotificationsForSignOut('user-A')).resolves.toEqual({ serverRemoved: true, deviceRevoked: true })
    expect(calls.api).not.toHaveBeenCalled(); expect(sdk.deleteToken).not.toHaveBeenCalled()
  })
  it('revokes an SDK-persisted browser token after app storage was cleared, without inventing a server DELETE', async () => {
    permission = 'granted'
    const notifications = await library()
    await expect(notifications.cleanupNotificationsForSignOut('user-A')).resolves.toMatchObject({ serverRemoved: false, deviceRevoked: true })
    expect(calls.api).not.toHaveBeenCalled(); expect(sdk.getToken).not.toHaveBeenCalled(); expect(sdk.deleteToken).toHaveBeenCalledTimes(1)
  })
  it('does not wait for an unanswered permission prompt during sign-out and prevents a later PUT', async () => {
    let answer!: (permission: NotificationPermission) => void
    calls.requestPermission.mockReturnValue(new Promise<NotificationPermission>(resolve => { answer = resolve }))
    const notifications = await library()
    const pending = notifications.enableNotifications('user-A').catch(error => error)
    await expect(notifications.cleanupNotificationsForSignOut('user-A')).resolves.toEqual({ serverRemoved: true, deviceRevoked: true })
    permission = 'granted'; answer('granted')
    expect(await pending).toMatchObject({ code: 'auth' })
    expect(calls.api).not.toHaveBeenCalled(); expect(sdk.getToken).not.toHaveBeenCalled()
  })
  it('revokes the device even when backend cleanup fails, and returns the incomplete cleanup warning', async () => {
    const notifications = await library(); await notifications.enableNotifications('user-A')
    calls.api.mockRejectedValue(new Error('Network interrupted'))
    const result = await notifications.disableNotifications('user-A')
    expect(result).toMatchObject({ serverRemoved: false, deviceRevoked: true, warning: expect.any(String) })
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('off')
  })
  it('reports failure without a false off state when neither cleanup method succeeds', async () => {
    const notifications = await library(); await notifications.enableNotifications('user-A')
    calls.api.mockRejectedValue(new Error('offline')); sdk.deleteToken.mockRejectedValue(new Error('offline')); calls.getRegistration.mockRejectedValue(new Error('blocked'))
    await expect(notifications.disableNotifications('user-A')).rejects.toMatchObject({ code: 'cleanup' })
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('on')
  })
  it('revokes only the previous account device after an external auth change without using the expired bearer token', async () => {
    const notifications = await library(); await notifications.enableNotifications('user-A'); calls.api.mockClear()
    calls.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-B' } } } })
    await notifications.revokeNotificationsAfterSessionChange('user-A')
    expect(calls.api).not.toHaveBeenCalled(); expect(sdk.deleteToken).toHaveBeenCalled()
    expect((await notifications.getNotificationStatus('user-B')).state).toBe('off')
  })
  it('retains cleanup ownership in memory if browser storage is unavailable', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } })
    const notifications = await library(); await notifications.enableNotifications('user-A')
    expect((await notifications.getNotificationStatus('user-A')).state).toBe('on')
    await notifications.cleanupNotificationsForSignOut('user-A')
    expect(sdk.deleteToken).toHaveBeenCalled()
  })
  it('sends a test only for an explicitly registered current account', async () => {
    const notifications = await library()
    await expect(notifications.sendTestNotification('user-A')).rejects.toMatchObject({ code: 'device' })
    await notifications.enableNotifications('user-A'); calls.api.mockClear()
    expect(await notifications.sendTestNotification('user-A')).toBe(1)
    expect(calls.api).toHaveBeenCalledWith('/users/me/push-tokens/test', { method: 'POST', expectedUserId: 'user-A' })
  })
  it('deduplicates foreground delivery and rejects external or unsupported deep links', async () => {
    const notifications = await library(); await notifications.enableNotifications('user-A')
    const receive = vi.fn(); await notifications.listenForForegroundNotifications('user-A', receive)
    const onMessage = sdk.onMessage.mock.calls[0][1]
    const payload = { messageId: 'message-1', notification: { title: '샛길', body: '오늘의 풍경' }, fcmOptions: { link: 'https://outside.example/?secret=1' } }
    onMessage(payload); onMessage(payload)
    await vi.waitFor(() => expect(receive).toHaveBeenCalledTimes(1))
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({ href: '/home' }))
    expect(notifications.safeNotificationHref('/my?secret=1', 'https://saetgil.example')).toBe('/my')
    expect(notifications.safeNotificationHref('javascript:alert(1)', 'https://saetgil.example')).toBe('/home')
    expect(notifications.safeNotificationHref('//other.example', 'https://saetgil.example')).toBe('/home')
  })
})
