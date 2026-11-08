import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function worker() {
  const listeners = new Map<string, (event: unknown) => void>()
  const handlers: { background?: (payload: unknown) => unknown } = {}
  const showNotification = vi.fn().mockResolvedValue(undefined)
  const navigate = vi.fn().mockResolvedValue(undefined), focus = vi.fn().mockResolvedValue(undefined), openWindow = vi.fn().mockResolvedValue(undefined)
  const self = { location: { origin: 'https://saetgil.example', href: 'https://saetgil.example/firebase-messaging-sw.js?apiKey=public&projectId=sample&messagingSenderId=123&appId=sample' },
    registration: { showNotification }, addEventListener: (name: string, callback: (event: unknown) => void) => listeners.set(name, callback),
    clients: { matchAll: vi.fn().mockResolvedValue([{ url: 'https://saetgil.example/my', navigate, focus }]), openWindow } }
  const firebase = { initializeApp: vi.fn(), messaging: () => ({ onBackgroundMessage: (callback: typeof handlers.background) => { handlers.background = callback } }) }
  runInNewContext(readFileSync(new URL('../../public/firebase-messaging-sw.js', import.meta.url), 'utf8'), { self, firebase, importScripts: vi.fn(), URL })
  return { listeners, handlers, showNotification, navigate, focus, openWindow }
}

describe('FCM background worker behavior', () => {
  it('does not duplicate notification payloads that Firebase already displays', () => {
    const instance = worker()
    instance.handlers.background?.({ notification: { title: '샛길', body: '서버 알림' }, data: { title: '샛길' } })
    expect(instance.showNotification).not.toHaveBeenCalled()
  })
  it('displays a data-only message once with a safe application link', async () => {
    const instance = worker()
    await instance.handlers.background?.({ messageId: 'data-1', data: { title: '샛길', body: '풍경', link: 'https://other.example/steal' } })
    expect(instance.showNotification).toHaveBeenCalledTimes(1)
    expect(instance.showNotification).toHaveBeenCalledWith('샛길', expect.objectContaining({ body: '풍경', data: { link: '/home' } }))
  })
  it('handles notification clicks before Firebase and opens only a same-origin app route', async () => {
    const instance = worker()
    const stopImmediatePropagation = vi.fn(), close = vi.fn()
    let pending: Promise<unknown> | undefined
    instance.listeners.get('notificationclick')?.({ stopImmediatePropagation, notification: { close, data: { FCM_MSG: { fcmOptions: { link: 'https://other.example/steal' } } } }, waitUntil: (promise: Promise<unknown>) => { pending = promise } })
    await pending
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1)
    expect(instance.navigate).toHaveBeenCalledWith('https://saetgil.example/home'); expect(instance.focus).toHaveBeenCalledTimes(1)
    expect(instance.openWindow).not.toHaveBeenCalled()
  })
})
