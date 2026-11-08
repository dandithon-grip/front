import type { FirebaseApp } from 'firebase/app'
import type { MessagePayload } from 'firebase/messaging'
import { ApiError, apiRequest } from './api'
import { authClient } from './auth'
import { config } from './config'

const STORAGE_KEY = 'saetgil:notifications:v1'
const APP_NAME = 'saetgil-notifications'
const SW_SCOPE = '/firebase-cloud-messaging-push-scope'
const CHANGE_EVENT = 'saetgil:notifications-change'
export type NotificationProblem = 'unconfigured' | 'unsupported' | 'denied' | 'dismissed' | 'auth' | 'server-unavailable' | 'server-unconfigured' | 'device' | 'cleanup' | 'busy'
export class NotificationError extends Error {
  constructor(public readonly code: NotificationProblem, message: string) { super(message); this.name = 'NotificationError' }
}
interface DeviceRegistration { userId: string; token: string; projectId: string; registered: boolean }
export interface NotificationStatus {
  state: 'unconfigured' | 'unsupported' | 'denied' | 'off' | 'on'
  permission: NotificationPermission | 'unsupported'
  hasRegistration: boolean
  message: string
}
export interface NotificationCleanup { serverRemoved: boolean; deviceRevoked: boolean; warning?: string }
export interface ForegroundNotification { id: string; title: string; body: string; href: string }
let app: FirebaseApp | undefined
let memoryRegistration: DeviceRegistration | null = null
let storageUnavailable = false
let pendingOwner: string | null = null
let generation = 0
let pendingEnable: Promise<void> | null = null
let activeController: AbortController | null = null

export function notificationsConfigured(): boolean {
  const f = config.firebase
  return Boolean(f.apiKey && f.projectId && f.messagingSenderId && f.appId && config.firebaseVapidKey)
}
function browserSupportsPush(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}
function readRegistration(): DeviceRegistration | null {
  if (storageUnavailable) return memoryRegistration
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!value || typeof value !== 'object') return memoryRegistration
    const item = value as Partial<DeviceRegistration>
    return typeof item.userId === 'string' && typeof item.token === 'string' && item.token.length > 0 && typeof item.projectId === 'string'
      ? { userId: item.userId, token: item.token, projectId: item.projectId, registered: item.registered === true } : null
  } catch { return memoryRegistration }
}
function writeRegistration(value: DeviceRegistration | null) {
  memoryRegistration = value
  try { if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); else localStorage.removeItem(STORAGE_KEY) }
  catch { storageUnavailable = true /* Keep cleanup possible when localStorage is blocked or full. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}
async function messagingClient() {
  const [applications, sdk] = await Promise.all([import('firebase/app'), import('firebase/messaging')])
  if (!app) app = applications.getApps().find(candidate => candidate.name === APP_NAME) ?? applications.initializeApp(config.firebase, APP_NAME)
  return { sdk, messaging: sdk.getMessaging(app) }
}
async function supportsMessaging() { return (await import('firebase/messaging')).isSupported() }
async function assertUser(userId: string) {
  const session = await authClient?.auth.getSession()
  if (!userId || session?.error || session?.data.session?.user.id !== userId) throw new NotificationError('auth', '로그인 정보가 바뀌었어요. 다시 로그인해 주세요.')
}
function toNotificationError(cause: unknown): NotificationError {
  if (cause instanceof NotificationError) return cause
  if (cause instanceof ApiError) {
    if (cause.status === 404 || cause.status === 405) return new NotificationError('server-unavailable', '알림 서버 연결이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.')
    if (cause.status === 503) return new NotificationError('server-unconfigured', '알림 발송 설정이 아직 준비되지 않았어요. 기기 등록과 실제 수신은 다를 수 있어요.')
    if (cause.status === 401) return new NotificationError('auth', '로그인한 뒤 알림을 다시 켜 주세요.')
    return new NotificationError('device', '알림 연결을 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
  }
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : ''
  if (/permission-blocked|permission-denied/.test(code)) return new NotificationError('denied', '브라우저에서 알림이 차단돼 있어요. 사이트 설정에서 알림을 허용해 주세요.')
  if (/unsupported-browser/.test(code)) return new NotificationError('unsupported', '이 브라우저에서는 웹 알림을 사용할 수 없어요. 지원되는 브라우저에서 열어 주세요.')
  if (/invalid-vapid-key|missing-app-config-values|invalid-api-key|project-not-found/.test(code)) return new NotificationError('unconfigured', '알림 연결 설정을 준비하고 있어요. 준비되면 이곳에서 켤 수 있어요.')
  return new NotificationError('device', '이 기기의 알림 연결을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.')
}
export function notificationErrorMessage(cause: unknown): string { return toNotificationError(cause).message }

/** Passive status checks never request permission, create a token or change server registration. */
export async function getNotificationStatus(userId?: string): Promise<NotificationStatus> {
  const saved = readRegistration()
  const hasRegistration = Boolean(userId && saved?.userId === userId)
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  if (!browserSupportsPush()) return { state: 'unsupported', permission, hasRegistration, message: '이 브라우저에서는 알림을 지원하지 않아요. iPhone은 홈 화면에 추가한 웹앱에서 확인해 주세요.' }
  if (!notificationsConfigured()) return { state: 'unconfigured', permission, hasRegistration, message: '알림 연결 설정을 준비하고 있어요. 준비되면 이곳에서 켤 수 있어요.' }
  let supported = false
  try { supported = await supportsMessaging() } catch { /* Private/restricted browser storage can make messaging unavailable. */ }
  if (!supported) return { state: 'unsupported', permission, hasRegistration, message: '이 브라우저의 알림 기능을 사용할 수 없어요. 지원되는 브라우저에서 열어 주세요.' }
  if (permission === 'denied') return { state: 'denied', permission, hasRegistration, message: '브라우저에서 알림이 차단돼 있어요. 사이트 설정에서 알림을 허용해 주세요.' }
  const registered = hasRegistration && saved?.registered && saved.projectId === config.firebase.projectId && permission === 'granted'
  return { state: registered ? 'on' : 'off', permission, hasRegistration, message: registered ? '이 브라우저에 퇴근 알림이 등록돼 있어요.' : '퇴근 10분 전에 오늘의 샛길을 알려드려요.' }
}
async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const url = new URL('/firebase-messaging-sw.js', window.location.origin)
  for (const [key, value] of Object.entries(config.firebase)) if (value) url.searchParams.set(key, value)
  const registration = await navigator.serviceWorker.register(url.href, { scope: SW_SCOPE, updateViaCache: 'none' })
  if (registration.active) return registration
  const worker = registration.installing ?? registration.waiting
  if (!worker) throw new NotificationError('device', '알림 서비스를 시작하지 못했어요. 새로고침 후 다시 시도해 주세요.')
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => { worker.removeEventListener('statechange', changed); reject(new Error('Service worker activation timed out')) }, 12_000)
    function changed() {
      if (worker!.state === 'activated') { clearTimeout(timeout); worker!.removeEventListener('statechange', changed); resolve() }
      else if (worker!.state === 'redundant') { clearTimeout(timeout); worker!.removeEventListener('statechange', changed); reject(new Error('Service worker installation failed')) }
    }
    worker.addEventListener('statechange', changed)
    changed()
  })
  return registration
}
async function revokeDevice(): Promise<boolean> {
  if (notificationsConfigured()) {
    try {
      if (await supportsMessaging()) { const { sdk, messaging } = await messagingClient(); if (await sdk.deleteToken(messaging)) return true }
    } catch { /* Revoke the native subscription as a fallback. */ }
  }
  try {
    const registration = await navigator.serviceWorker?.getRegistration(SW_SCOPE)
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return true
    return await subscription.unsubscribe()
  } catch { return false }
}

/** Called directly by a click: permission is requested before the first async boundary. */
export function enableNotifications(userId: string): Promise<void> {
  if (!userId) return Promise.reject(new NotificationError('auth', '로그인 후 알림을 켤 수 있어요.'))
  if (pendingEnable) return Promise.reject(new NotificationError('busy', '알림 연결을 확인하고 있어요. 잠시만 기다려 주세요.'))
  if (!browserSupportsPush()) return Promise.reject(new NotificationError('unsupported', '이 브라우저에서는 웹 알림을 사용할 수 없어요.'))
  if (!notificationsConfigured()) return Promise.reject(new NotificationError('unconfigured', '알림 연결 설정을 준비하고 있어요.'))
  if (Notification.permission === 'denied') return Promise.reject(new NotificationError('denied', '브라우저에서 알림이 차단돼 있어요. 사이트 설정에서 알림을 허용해 주세요.'))
  pendingOwner = userId
  const permission = Notification.permission === 'granted' ? Promise.resolve<NotificationPermission>('granted') : Notification.requestPermission()
  const ticket = ++generation
  const controller = new AbortController()
  activeController = controller
  let candidate: DeviceRegistration | null = null
  const operation = (async () => {
    try {
      const allowed = await permission
      if (allowed !== 'granted') throw new NotificationError(allowed === 'denied' ? 'denied' : 'dismissed', allowed === 'denied' ? '알림이 차단됐어요. 브라우저 사이트 설정에서 허용할 수 있어요.' : '알림 권한을 허용하지 않아 켜지지 않았어요.')
      await assertUser(userId)
      if (ticket !== generation) throw new NotificationError('auth', '알림 연결이 취소됐어요.')
      if (!await supportsMessaging()) throw new NotificationError('unsupported', '이 브라우저에서는 알림을 사용할 수 없어요.')
      const worker = await registerWorker()
      await assertUser(userId)
      if (ticket !== generation) throw new NotificationError('auth', '알림 연결이 취소됐어요.')
      const { sdk, messaging } = await messagingClient()
      const token = await sdk.getToken(messaging, { vapidKey: config.firebaseVapidKey, serviceWorkerRegistration: worker })
      if (!token) throw new NotificationError('device', '이 기기를 알림에 등록하지 못했어요. 다시 시도해 주세요.')
      candidate = { token, userId, projectId: config.firebase.projectId, registered: false }
      await assertUser(userId)
      if (ticket !== generation) throw new NotificationError('auth', '알림 연결이 취소됐어요.')
      writeRegistration(candidate)
      const result = await apiRequest<{ registered: boolean }>('/users/me/push-tokens', { method: 'PUT', body: { token }, expectedUserId: userId, signal: controller.signal })
      await assertUser(userId)
      if (ticket !== generation) throw new NotificationError('auth', '알림 연결이 취소됐어요.')
      if (result.registered !== true) throw new NotificationError('device', '알림 등록을 확인하지 못했어요.')
      writeRegistration({ ...candidate, registered: true })
    } catch (cause) {
      const saved = readRegistration()
      // Do not revoke a token that a different tab has since registered to another account.
      if (candidate && (!saved || saved.userId === userId) && await revokeDevice()) writeRegistration(null)
      throw toNotificationError(cause)
    } finally {
      if (activeController === controller) activeController = null
    }
  })()
  pendingEnable = operation
  void operation.finally(() => { if (pendingEnable === operation) { pendingEnable = null; pendingOwner = null } }).catch(() => undefined)
  return operation
}

async function removeRegistration(userId: string): Promise<NotificationCleanup> {
  const saved = readRegistration()
  if (!saved || saved.userId !== userId) return { serverRemoved: true, deviceRevoked: true }
  let serverRemoved = false
  try { await assertUser(userId); await apiRequest('/users/me/push-tokens', { method: 'DELETE', body: { token: saved.token }, expectedUserId: userId }); serverRemoved = true }
  catch { /* Even an unavailable backend must not prevent revoking this browser's push capability. */ }
  const current = readRegistration()
  if (current && current.userId !== userId) throw new NotificationError('auth', '로그인 정보가 변경됐어요. 현재 계정에서 다시 확인해 주세요.')
  const deviceRevoked = await revokeDevice()
  if (serverRemoved || deviceRevoked) {
    writeRegistration(deviceRevoked ? null : { ...saved, registered: false })
    return { serverRemoved, deviceRevoked, ...(!serverRemoved ? { warning: '이 기기의 알림은 껐어요. 서버 등록 정리는 연결이 복구된 뒤 확인이 필요해요.' } : !deviceRevoked ? { warning: '계정의 알림 등록은 해제했어요. 브라우저 연결 정리는 다시 확인해 주세요.' } : {}) }
  }
  throw new NotificationError('cleanup', '알림 해제를 완료하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
}
export async function disableNotifications(userId: string): Promise<NotificationCleanup> {
  generation++; activeController?.abort()
  if (pendingEnable) await pendingEnable.catch(() => undefined)
  return removeRegistration(userId)
}
/** Store calls this while the authenticated session is still valid, before signing out. */
export async function cleanupNotificationsForSignOut(userId?: string): Promise<NotificationCleanup> {
  const saved = readRegistration()
  if (!userId || (saved && saved.userId !== userId && pendingOwner !== userId)) return { serverRemoved: true, deviceRevoked: true }
  if (!saved && pendingOwner !== userId) {
    // Clearing app storage must not leave an SDK-persisted push subscription alive after logout.
    // There is no known owned token to DELETE, so do not call an undeployed backend endpoint here.
    if (browserSupportsPush() && Notification.permission === 'granted' && notificationsConfigured()) {
      await assertUser(userId)
      if (!await revokeDevice()) throw new NotificationError('cleanup', '기기의 알림 연결을 해제하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
      return { serverRemoved: false, deviceRevoked: true, warning: '이 기기의 알림 연결을 해제했어요. 저장된 등록 정보가 없어 서버 정리는 확인하지 못했어요.' }
    }
    return { serverRemoved: true, deviceRevoked: true }
  }
  generation++; activeController?.abort()
  // A dismissed or unanswered native permission prompt must never trap the user in sign-out.
  // Without an owned token there is no backend registration, and the generation check prevents a late PUT.
  if (pendingEnable && saved?.userId === userId) {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([pendingEnable.catch(() => undefined), new Promise<void>(resolve => { timeout = setTimeout(resolve, 4000) })]) }
    finally { if (timeout) clearTimeout(timeout) }
  }
  return removeRegistration(userId)
}
/** The old auth token may already be invalid after another tab signs out or changes account. */
export async function revokeNotificationsAfterSessionChange(previousUserId: string): Promise<void> {
  const saved = readRegistration()
  if (saved?.userId !== previousUserId && pendingOwner !== previousUserId) return
  generation++; activeController?.abort()
  if (!saved || saved.userId !== previousUserId) return
  const revoked = await revokeDevice()
  const current = readRegistration()
  if (current?.userId === previousUserId) writeRegistration(revoked ? null : { ...current, registered: false })
}
export async function sendTestNotification(userId: string): Promise<number> {
  await assertUser(userId)
  const saved = readRegistration()
  if (!saved?.registered || saved.userId !== userId) throw new NotificationError('device', '먼저 이 브라우저의 퇴근 알림을 켜 주세요.')
  try {
    const result = await apiRequest<{ sent: number }>('/users/me/push-tokens/test', { method: 'POST', expectedUserId: userId })
    await assertUser(userId)
    if (!Number.isInteger(result.sent) || result.sent < 0) throw new NotificationError('device', '알림 전송 결과를 확인하지 못했어요.')
    return result.sent
  } catch (cause) { throw toNotificationError(cause) }
}
export function subscribeNotificationChanges(callback: () => void): () => void {
  const storage = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) { memoryRegistration = null; storageUnavailable = false; callback() } }
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener('storage', storage)
  window.addEventListener('focus', callback)
  return () => { window.removeEventListener(CHANGE_EVENT, callback); window.removeEventListener('storage', storage); window.removeEventListener('focus', callback) }
}
export function safeNotificationHref(value: unknown, origin: string): string {
  if (typeof value !== 'string') return '/home'
  try {
    const url = new URL(value, origin)
    const allowed = ['/home', '/route', '/routes', '/record', '/my']
    if (url.origin !== origin || !allowed.includes(url.pathname)) return '/home'
    return url.pathname
  } catch { return '/home' }
}
function foregroundPayload(payload: MessagePayload): ForegroundNotification {
  const data = payload.data || {}
  return { id: payload.messageId || `${payload.notification?.title || data.title || ''}:${payload.notification?.body || data.body || ''}`,
    title: (payload.notification?.title || data.title || '오늘의 샛길').slice(0, 80), body: (payload.notification?.body || data.body || '').slice(0, 300),
    href: safeNotificationHref(payload.fcmOptions?.link || data.link, window.location.origin) }
}
/** Receives only; no permission prompt, getToken call, or automatic server registration. */
export async function listenForForegroundNotifications(userId: string, callback: (notification: ForegroundNotification) => void): Promise<() => void> {
  const status = await getNotificationStatus(userId)
  if (status.state !== 'on') return () => {}
  await assertUser(userId)
  const seen = new Set<string>()
  const { sdk, messaging } = await messagingClient()
  return sdk.onMessage(messaging, payload => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return
    const item = foregroundPayload(payload)
    if (seen.has(item.id)) return
    seen.add(item.id); if (seen.size > 50) seen.delete(seen.values().next().value!)
    void assertUser(userId).then(() => {
      const registration = readRegistration()
      if (registration?.registered && registration.userId === userId) callback(item)
    }).catch(() => undefined)
  })
}
