import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Nav } from '../components/ui'
import { A } from '../lib/assets'
import { useStore } from '../lib/store'
import { AccountHeader, AuthField, authErrorMessage } from './Auth'
import { RouteSetup } from './Setup'
import { disableNotifications, enableNotifications, getNotificationStatus, notificationErrorMessage, sendTestNotification, subscribeNotificationChanges, type NotificationStatus } from '../lib/notifications'
import './auth.css'
import '../components/notifications.css'

export function My() {
  const nav = useNavigate()
  const { profile, commute, sessionReady, isGuest, dataSource, tagWeights, readTagWeights, signOut } = useStore()
  const [error, setError] = useState('')
  const [hintError, setHintError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const canEditProfile = profile.loggedIn && !isGuest && dataSource !== 'preview'

  useEffect(() => {
    let active = true
    if (sessionReady && profile.loggedIn && dataSource === 'api') {
      setHintError('')
      void readTagWeights().catch(() => { if (active) setHintError('취향을 불러오지 못했어요. 취향 화면에서 다시 확인해 주세요.') })
    }
    return () => { active = false }
  }, [sessionReady, profile.authId, profile.loggedIn, dataSource])

  const leave = async () => {
    if (busy.current) return
    busy.current = true
    setPending(true); setError('')
    try { await signOut(); nav('/login', { replace: true }) }
    catch (cause) { setError(authErrorMessage(cause, '로그아웃하지 못했어요. 다시 시도해 주세요.')) }
    finally { busy.current = false; setPending(false) }
  }

  return (
    <main className="flow-page account-page">
      <div className="account-content">
        <section className="account-summary">
          <div className="account-avatar"><img src={A('img/avatar-lion.png')} alt="" /></div>
          <h1>{canEditProfile ? profile.nickname : dataSource === 'preview' ? '샛길 미리보기' : '샛길 둘러보기'}</h1>
          {canEditProfile ? <button type="button" className="account-edit-profile" onClick={() => nav('/my/edit')}>내 정보 수정</button> : <button type="button" className="account-edit-profile" onClick={() => nav('/login')}>로그인하고 내 정보 저장하기</button>}
        </section>
        {!sessionReady && <p className="flow-notice" role="status">내 정보를 확인하고 있어요.</p>}
        <section className="account-card">
          <div className="account-card__head"><h2>{tagWeights?.hint?.message || '내 취향을 알아가는 중이에요'}</h2><button type="button" className="account-edit" onClick={() => nav('/my/preferences')}>확인</button></div>
          {hintError && <p className="auth-field__hint">{hintError}</p>}
        </section>
        <section className="account-card">
          <div className="account-card__head"><h2>나의 일상 경로</h2><button type="button" className="account-edit" onClick={() => nav(commute.configured ? '/my/route' : '/route-setup')}>{commute.configured ? '수정' : '등록'}</button></div>
          {commute.configured ? <dl className="account-details"><div><dt>출발·도착</dt><dd>{commute.from}<span aria-hidden> › </span>{commute.to}</dd></div><div><dt>등교·출근</dt><dd>{commute.morning || '—'}</dd></div><div><dt>하교·퇴근</dt><dd>{commute.evening || '—'}</dd></div><div><dt>교통수단</dt><dd>{commute.mode}</dd></div></dl> : <p className="auth-field__hint">자주 오가는 길을 등록하면 주변 자연을 찾아드려요.</p>}
        </section>
        <NotificationSettings userId={profile.authId} enabledAccount={canEditProfile} sessionReady={sessionReady} preview={dataSource === 'preview'} evening={commute.evening} commuteConfigured={commute.configured} />
        {error && <p className="flow-error auth-feedback" role="alert">{error}</p>}
        <button type="button" className="account-signout" disabled={pending} onClick={() => void leave()}>{pending ? '종료 중…' : canEditProfile ? '로그아웃' : '둘러보기 끝내기'}</button>
      </div>
      <Nav />
    </main>
  )
}

function NotificationSettings({ userId, enabledAccount, sessionReady, preview, evening, commuteConfigured }: {
  userId?: string; enabledAccount: boolean; sessionReady: boolean; preview: boolean; evening: string; commuteConfigured: boolean
}) {
  const nav = useNavigate()
  const [status, setStatus] = useState<NotificationStatus | null>(null)
  const [pending, setPending] = useState<'toggle' | 'test' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const identity = useRef(userId)
  identity.current = userId
  useEffect(() => {
    let active = true
    let revision = 0
    setStatus(null); setError(''); setMessage(''); setPending(null)
    const refresh = () => {
      const request = ++revision
      void getNotificationStatus(userId).then(result => { if (active && request === revision) setStatus(result) })
    }
    if (sessionReady) refresh()
    const unsubscribe = subscribeNotificationChanges(refresh)
    return () => { active = false; unsubscribe() }
  }, [userId, enabledAccount, sessionReady, preview])
  const refresh = async () => { const result = await getNotificationStatus(userId); if (identity.current === userId) setStatus(result) }
  const toggle = async () => {
    if (lock.current || !userId || !enabledAccount) return
    const actor = userId
    lock.current = true; setPending('toggle'); setError(''); setMessage('')
    try {
      if (status?.state === 'on' || status?.hasRegistration) {
        const result = await disableNotifications(actor)
        if (identity.current === actor) setMessage(result.warning || '이 브라우저의 퇴근 알림을 껐어요.')
      } else {
        await enableNotifications(actor)
        if (identity.current === actor) setMessage('이 브라우저를 등록했어요. 퇴근 10분 전에 알림을 보내드려요.')
      }
    } catch (cause) { if (identity.current === actor) setError(notificationErrorMessage(cause)) }
    finally { lock.current = false; if (identity.current === actor) { setPending(null); await refresh() } }
  }
  const test = async () => {
    if (lock.current || !userId || !enabledAccount) return
    const actor = userId
    lock.current = true; setPending('test'); setError(''); setMessage('')
    try {
      const count = await sendTestNotification(actor)
      if (identity.current === actor) setMessage(count > 0 ? '테스트 알림 전송을 요청했어요. 기기에 도착했는지 확인해 주세요.' : '전송된 기기가 없어요. 알림을 껐다가 다시 등록해 주세요.')
    } catch (cause) { if (identity.current === actor) setError(notificationErrorMessage(cause)) }
    finally { lock.current = false; if (identity.current === actor) setPending(null) }
  }
  const on = status?.state === 'on' && enabledAccount
  const canToggle = enabledAccount && sessionReady && status && (status.hasRegistration || status.state === 'off' || status.state === 'on')
  return <section className="account-card notification-settings" aria-label="퇴근 알림 설정">
    <h2>퇴근 알림</h2>
    <div className="account-alert-row"><button type="button" role="switch" aria-checked={Boolean(on)} aria-label="이 브라우저의 퇴근 알림" disabled={!canToggle || Boolean(pending)} onClick={() => void toggle()}><img src={A(on ? 'icons/toggle-on.svg' : 'icons/toggle-off.svg')} alt="" /></button><span>오늘의 샛길 알림</span><strong>{evening || '시간 미설정'}</strong></div>
    <p className="auth-field__hint">등록한 퇴근 시간 10분 전에 알려드려요. 출근 알림과 개별 알림 시각 변경은 아직 지원하지 않아요.</p>
    {preview ? <p className="notification-settings__notice">예시 모드에서는 기기 알림을 등록하지 않아요. 로그인한 뒤 켤 수 있어요.</p> : !enabledAccount ? <button type="button" className="notification-settings__link" onClick={() => nav('/login')}>로그인하고 알림 켜기</button> : !sessionReady || !status ? <p className="auth-field__hint" role="status">이 기기의 알림 기능을 확인하고 있어요.</p> : <>
      <p className="notification-settings__notice">{status.message}</p>
      {!commuteConfigured && <button type="button" className="notification-settings__link" onClick={() => nav('/route-setup')}>알림을 받을 일상 경로 등록하기</button>}
      {pending === 'toggle' && <p className="auth-field__hint" role="status">알림 연결을 확인하고 있어요.</p>}
      {on && <button type="button" className="notification-settings__test" disabled={Boolean(pending)} onClick={() => void test()}>{pending === 'test' ? '전송 요청 중…' : '테스트 알림 보내기'}</button>}
    </>}
    {error && <p className="notification-settings__error" role="alert">{error}</p>}
    {message && <p className="notification-settings__notice" role="status">{message}</p>}
  </section>
}

export function EditProfile() {
  const nav = useNavigate()
  const { profile, sessionReady, isGuest, dataSource, updateProfile } = useStore()
  const [nickname, setNickname] = useState(profile.nickname)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const canEdit = profile.loggedIn && !isGuest && dataSource !== 'preview'
  const mismatch = confirmation !== '' && confirmation !== password
  const dirty = nickname.trim() !== profile.nickname || password !== ''
  const ready = sessionReady && canEdit && nickname.trim() !== '' && (!password || password.length >= 6) && password === confirmation && dirty && !pending
  useEffect(() => { setNickname(profile.nickname) }, [profile.nickname])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || busy.current) return
    busy.current = true
    setPending(true); setError('')
    try { await updateProfile(nickname.trim(), password || undefined); nav('/my', { replace: true }) }
    catch (cause) { setError(authErrorMessage(cause, '정보를 수정하지 못했어요. 다시 시도해 주세요.')) }
    finally { busy.current = false; setPending(false) }
  }
  return (
    <main className="flow-page auth-page">
      <AccountHeader title="내 정보 수정" backTo="/my" />
      {!canEdit && sessionReady ? <section className="auth-confirmation"><h2>로그인이 필요해요</h2><p>로그인한 뒤 내 정보를 수정할 수 있어요.</p><Button on onClick={() => nav('/login')}>로그인하기</Button></section> : (
        <form className="auth-form" onSubmit={submit} aria-busy={pending}>
          <fieldset className="auth-fieldset" disabled={pending || !sessionReady}>
            <AuthField label="이메일" type="email" value={profile.userId} readOnly autoComplete="username" hint="로그인 이메일은 이 화면에서 바꿀 수 없어요." />
            <AuthField label="새 비밀번호" type="password" placeholder="변경할 때만 입력" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete="new-password" hint="비워두면 현재 비밀번호를 유지해요. 변경 시 6자 이상 입력해 주세요." />
            <AuthField label="새 비밀번호 확인" type="password" placeholder="비밀번호 확인" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" error={mismatch ? '비밀번호가 일치하지 않아요.' : undefined} />
            <AuthField label="닉네임" placeholder="닉네임 입력" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={50} autoComplete="nickname" required />
          </fieldset>
          {error && <p className="flow-error auth-feedback" role="alert">{error}</p>}
          <div className="auth-form__actions"><Button type="submit" on={ready} disabled={!ready}>{pending ? '저장 중…' : '내 정보 수정하기'}</Button></div>
        </form>
      )}
    </main>
  )
}

export function EditRoute() { return <RouteSetup edit /> }
