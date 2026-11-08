import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { listenForForegroundNotifications, revokeNotificationsAfterSessionChange, subscribeNotificationChanges, type ForegroundNotification } from '../lib/notifications'
import './notifications.css'

/** One app-wide foreground banner. OS notifications are reserved for the background worker. */
export function NotificationListener() {
  const nav = useNavigate()
  const { profile, sessionReady, dataSource, refreshJourney } = useStore()
  const [item, setItem] = useState<ForegroundNotification | null>(null)
  const [revision, setRevision] = useState(0)
  const previousUser = useRef<string | undefined>()
  const identity = dataSource === 'api' && profile.loggedIn ? profile.authId : undefined
  const owner = sessionReady ? identity : undefined
  useEffect(() => {
    const previous = previousUser.current
    previousUser.current = identity
    setItem(null)
    if (previous && previous !== identity) void revokeNotificationsAfterSessionChange(previous).catch(() => undefined)
  }, [identity])
  useEffect(() => subscribeNotificationChanges(() => setRevision(value => value + 1)), [])
  useEffect(() => {
    if (!owner) return
    let active = true
    let unsubscribe = () => {}
    void listenForForegroundNotifications(owner, notification => { if (active) setItem(notification) })
      .then(stop => { if (active) unsubscribe = stop; else stop() }).catch(() => undefined)
    return () => { active = false; unsubscribe() }
  }, [owner, revision])
  useEffect(() => {
    if (!item) return
    const timeout = window.setTimeout(() => setItem(null), 12_000)
    return () => clearTimeout(timeout)
  }, [item])
  if (!item || !owner) return null
  return <aside className="notification-toast" role="status" aria-live="polite">
    <button className="notification-toast__body" onClick={() => { const href = item.href; setItem(null); void refreshJourney().catch(() => undefined); nav(href) }}><strong>{item.title}</strong><span>{item.body}</span><small>샛길에서 확인하기 →</small></button>
    <button className="notification-toast__close" aria-label="알림 닫기" onClick={() => setItem(null)}>×</button>
  </aside>
}
