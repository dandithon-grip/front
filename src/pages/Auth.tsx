import { useEffect, useId, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { A } from '../lib/assets'
import { useStore } from '../lib/store'
import './auth.css'

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

export function authErrorMessage(error: unknown, fallback = '요청을 완료하지 못했어요. 다시 시도해 주세요.') {
  const message = error instanceof Error ? error.message : ''
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호를 확인해 주세요.'
  if (/email not confirmed/i.test(message)) return '메일함에서 이메일 인증을 완료한 뒤 로그인해 주세요.'
  if (/already registered|already been registered|user_already_exists/i.test(message)) return '이미 가입한 이메일이에요. 로그인해 주세요.'
  if (/rate limit|too many|over_email_send_rate_limit/i.test(message)) return '요청이 잠시 많아요. 잠시 후 다시 시도해 주세요.'
  if (/same password|same_password/i.test(message)) return '현재 비밀번호와 다른 비밀번호를 입력해 주세요.'
  if (/password.*least|weak.password/i.test(message)) return '비밀번호 보안 조건을 확인해 주세요. 더 긴 비밀번호로 다시 시도해 주세요.'
  if (/reauthentication|reauthenticate|requires.*recent/i.test(message)) return '다시 로그인한 뒤 비밀번호를 변경해 주세요.'
  if (/fetch|network|load failed/i.test(message)) return '연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.'
  return /[가-힣]/.test(message) ? message : fallback
}

export function AuthField({ label, onClear, hint, error, className = '', ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; onClear?: () => void; hint?: string; error?: string }) {
  const generatedId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const id = input.id || generatedId
  const description = error || hint
  return (
    <div className={`auth-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className="auth-field__input">
        <input {...input} ref={inputRef} id={id} className="inp" aria-invalid={Boolean(error)} aria-describedby={description ? `${id}-hint` : undefined} />
        {onClear && Boolean(input.value) && !input.disabled && !input.readOnly && <button type="button" className="auth-field__clear" aria-label={`${label} 지우기`} onClick={() => { onClear(); inputRef.current?.focus() }}><img src={A('icons/clear-x-a.svg')} alt="" /></button>}
      </div>
      {description && <p id={`${id}-hint`} className={error ? 'auth-field__error' : 'auth-field__hint'}>{description}</p>}
    </div>
  )
}

export function AccountHeader({ title, backTo = '/login' }: { title: string; backTo?: string }) {
  const nav = useNavigate()
  return <header className="auth-header"><button type="button" onClick={() => nav(backTo)} aria-label="뒤로가기"><img src={A('icons/arrow-left.svg')} alt="" /></button><h1>{title}</h1><span /></header>
}

export function Login() {
  const nav = useNavigate()
  const { profile, commute, sessionReady, isGuest, journeyStatus, signIn, enterGuest, startPreview } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState<'login' | 'guest' | null>(null)
  const [error, setError] = useState('')
  const [guestFailed, setGuestFailed] = useState(false)
  const busy = useRef(false)
  const ready = validEmail(email) && password.length > 0 && sessionReady && !pending
  useEffect(() => {
    if (sessionReady && profile.loggedIn && !isGuest && !pending) nav(commute.configured || journeyStatus === 'error' ? '/home' : '/route-setup', { replace: true })
  }, [sessionReady, profile.loggedIn, isGuest, pending, commute.configured, journeyStatus, nav])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || busy.current) return
    busy.current = true
    setPending('login'); setError(''); setGuestFailed(false)
    try { await signIn(email.trim(), password) }
    catch (cause) { setError(authErrorMessage(cause, '로그인하지 못했어요. 다시 시도해 주세요.')) }
    finally { busy.current = false; setPending(null) }
  }
  const browse = async () => {
    if (busy.current || !sessionReady) return
    busy.current = true
    setPending('guest'); setError(''); setGuestFailed(false)
    try { await enterGuest(); nav('/home', { replace: true }) }
    catch (cause) { setError(authErrorMessage(cause, '둘러보기를 시작하지 못했어요. 다시 시도하거나 예시를 둘러볼 수 있어요.')); setGuestFailed(true) }
    finally { busy.current = false; setPending(null) }
  }
  return (
    <main className="flow-page auth-page auth-login">
      <img className="auth-backdrop" src={A('img/login-map.png')} alt="" />
      <div className="auth-login__content">
        <div className="auth-brand"><img src={A('img/logo.svg')} alt="" /><h1 className="brand">샛길</h1></div>
        <form className="auth-login__form" onSubmit={submit} aria-busy={Boolean(pending)}>
          <AuthField label="이메일" type="email" placeholder="이메일 입력" value={email} onChange={(e) => setEmail(e.target.value)} onClear={() => setEmail('')} autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={Boolean(pending)} />
          <AuthField label="비밀번호" type="password" placeholder="비밀번호 입력" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required disabled={Boolean(pending)} />
          {error && <p className="flow-error auth-feedback" role="alert">{error}</p>}
          <Button type="submit" on={ready} disabled={!ready}>{pending === 'login' ? '로그인 중…' : !sessionReady ? '확인 중…' : '로그인'}</Button>
        </form>
        <div className="auth-links"><button type="button" onClick={() => nav('/signup')} disabled={Boolean(pending)}>회원가입</button><button type="button" onClick={() => void browse()} disabled={Boolean(pending) || !sessionReady}>{pending === 'guest' ? '둘러보기 준비 중…' : guestFailed ? '둘러보기 다시 시도' : '로그인 없이 둘러보기'}</button></div>
        <button type="button" className="auth-preview" disabled={Boolean(pending) || !sessionReady} onClick={() => { startPreview(); nav('/home', { replace: true }) }}>예시로 둘러보기</button>
      </div>
    </main>
  )
}

export function Signup() {
  const nav = useNavigate()
  const { profile, commute, sessionReady, isGuest, journeyStatus, signUp } = useStore()
  const [fields, setFields] = useState({ email: '', password: '', confirmation: '', nickname: '' })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const busy = useRef(false)
  const mismatch = fields.confirmation !== '' && fields.password !== fields.confirmation
  const ready = sessionReady && validEmail(fields.email) && fields.password.length >= 6 && fields.password === fields.confirmation && fields.nickname.trim() !== '' && !pending
  const change = (key: keyof typeof fields, value: string) => setFields((previous) => ({ ...previous, [key]: value }))
  useEffect(() => {
    if (sessionReady && profile.loggedIn && !isGuest && !pending && !confirmationEmail) nav(commute.configured || journeyStatus === 'error' ? '/home' : '/route-setup', { replace: true })
  }, [sessionReady, profile.loggedIn, isGuest, pending, confirmationEmail, commute.configured, journeyStatus, nav])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || busy.current) return
    busy.current = true
    setPending(true); setError('')
    try {
      const result = await signUp(fields.email.trim(), fields.password, fields.nickname.trim())
      if (result.needsConfirmation) { setConfirmationEmail(fields.email.trim()); setFields((previous) => ({ ...previous, password: '', confirmation: '' })) }
    } catch (cause) { setError(authErrorMessage(cause, '회원가입을 완료하지 못했어요. 다시 시도해 주세요.')) }
    finally { busy.current = false; setPending(false) }
  }
  return (
    <main className="flow-page auth-page auth-signup">
      <AccountHeader title={confirmationEmail ? '이메일 확인' : '회원가입'} />
      {confirmationEmail ? (
        <section className="auth-confirmation" aria-live="polite"><div className="auth-confirmation__mark" aria-hidden>✓</div><h2>메일함을 확인해 주세요</h2><p><strong>{confirmationEmail}</strong>로 인증 메일을 보냈어요. 메일의 인증 링크를 누른 뒤 로그인해 주세요.</p><p className="auth-field__hint">메일이 보이지 않으면 스팸함도 확인해 주세요.</p><Button on onClick={() => nav('/login', { replace: true })}>로그인으로</Button><button type="button" className="auth-text-button" onClick={() => setConfirmationEmail('')}>이메일 다시 입력하기</button></section>
      ) : (
        <form className="auth-form" onSubmit={submit} aria-busy={pending}>
          <fieldset className="auth-fieldset" disabled={pending}>
            <AuthField label="이메일" type="email" placeholder="이메일 입력" value={fields.email} onChange={(e) => change('email', e.target.value)} onClear={() => change('email', '')} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
            <AuthField label="비밀번호" type="password" placeholder="비밀번호 입력" value={fields.password} onChange={(e) => change('password', e.target.value)} minLength={6} hint="6자 이상 입력해 주세요." autoComplete="new-password" required />
            <AuthField className="auth-confirm-password" label="비밀번호 확인" type="password" placeholder="비밀번호 확인" value={fields.confirmation} onChange={(e) => change('confirmation', e.target.value)} autoComplete="new-password" error={mismatch ? '비밀번호가 일치하지 않아요.' : undefined} required />
            <AuthField label="닉네임" placeholder="닉네임 입력" value={fields.nickname} onChange={(e) => change('nickname', e.target.value)} maxLength={50} autoComplete="nickname" required />
          </fieldset>
          {error && <p className="flow-error auth-feedback" role="alert">{error}</p>}
          <div className="auth-form__actions"><Button type="submit" on={ready} disabled={!ready}>{pending ? '가입 중…' : '다음'}</Button></div>
        </form>
      )}
    </main>
  )
}

export { RouteSetup, CommuteFields } from './Setup'
