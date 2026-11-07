import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Header, HomeIndicator, Segment, StatusBar } from '../components/ui'
import { A } from '../lib/assets'
import { useStore, type Commute, type Mode } from '../lib/store'

/** 로그인 (Figma 285:405 · 상태 230:947 / 230:965) */
export function Login() {
  const nav = useNavigate()
  const { setProfile } = useStore()
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const ready = id.trim() !== '' && pw !== ''

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setProfile({ userId: id.trim(), loggedIn: true })
    nav('/home', { replace: true })
  }

  return (
    <div className="screen">
      <img className="login__map" src={A('img/login-map.png')} alt="" />
      <StatusBar />
      <div className="login__logo">
        <img src={A('img/logo.svg')} alt="" />
        <p className="brand">샛길</p>
      </div>
      <form className="login__form" onSubmit={submit}>
        <div className="login__fields">
          <input className="inp" type="email" placeholder="이메일 입력" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" />
          <input className="inp" type="password" placeholder="비밀번호 입력" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          <Button type="submit" on={ready} disabled={!ready}>
            로그인
          </Button>
        </div>
        <div className="login__links">
          <button type="button" onClick={() => nav('/signup')}>회원가입</button>
          <button type="button" onClick={() => nav('/home', { replace: true })}>로그인 없이 둘러보기</button>
        </div>
      </form>
      <HomeIndicator />
    </div>
  )
}

/** 회원가입 (Figma 230:993 · 상태 230:1082 / 230:1030) */
export function Signup() {
  const nav = useNavigate()
  const { setProfile } = useStore()
  const [f, setF] = useState({ id: '', pw: '', pw2: '', nick: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const ready = f.id.trim() !== '' && f.pw !== '' && f.pw === f.pw2 && f.nick.trim() !== ''

  return (
    <div className="screen screen--form">
      <Header title="회원가입" />
      <StatusBar />
      <div className="form" style={{ top: 155 }}>
        <Field label="아이디" placeholder="아이디 입력" value={f.id} onChange={set('id')} />
        <div>
          <span className="lbl" style={{ display: 'block' }}>비밀번호</span>
          <div className="group">
            <input className="inp" type="password" placeholder="비밀번호 입력" value={f.pw} onChange={set('pw')} />
            <input className="inp" type="password" placeholder="비밀번호 확인" value={f.pw2} onChange={set('pw2')} />
          </div>
        </div>
        <Field label="닉네임" placeholder="닉네임 입력" value={f.nick} onChange={set('nick')} />
      </div>
      <div className="bottom-actions" style={{ top: 772 }}>
        <Button
          on={ready}
          disabled={!ready}
          onClick={() => {
            setProfile({ userId: f.id.trim(), nickname: f.nick.trim(), loggedIn: true })
            nav('/route-setup')
          }}
        >
          다음
        </Button>
      </div>
      <HomeIndicator />
    </div>
  )
}

const MODES: readonly Mode[] = ['도보', '대중교통', '자동차']

/** 출발·도착 / 시간 / 교통수단 입력 묶음 (경로 설정 · 일상 경로 수정 공용) */
export function CommuteFields({ value, onChange }: { value: Commute; onChange: (c: Partial<Commute>) => void }) {
  return (
    <>
      <div>
        <span className="lbl" style={{ display: 'block' }}>출발·도착</span>
        <div className="group">
          <input className="inp" placeholder="출발지 입력" value={value.from} onChange={(e) => onChange({ from: e.target.value })} />
          <input className="inp" placeholder="도착지 입력" value={value.to} onChange={(e) => onChange({ to: e.target.value })} />
        </div>
      </div>
      <div className="row2">
        <Field label="등교·출근" placeholder="시간 입력" inputMode="numeric" value={value.morning} onChange={(e) => onChange({ morning: e.target.value })} />
        <Field label="하교·퇴근" placeholder="시간 입력" inputMode="numeric" value={value.evening} onChange={(e) => onChange({ evening: e.target.value })} />
      </div>
      <div>
        <span className="lbl" style={{ display: 'block' }}>교통수단</span>
        <Segment variant="mode" options={MODES} value={value.mode} onChange={(mode) => onChange({ mode })} />
      </div>
    </>
  )
}

const blankCommute: Commute = { from: '', to: '', morning: '', evening: '', mode: '도보' }
const complete = (c: Commute) => c.from.trim() && c.to.trim() && c.morning.trim() && c.evening.trim()

/** 일상 경로 설정 (Figma 230:1120 · 상태 230:1179) */
export function RouteSetup() {
  const nav = useNavigate()
  const { setCommute } = useStore()
  const [c, setC] = useState<Commute>(blankCommute)
  const ready = !!complete(c)

  return (
    <div className="screen screen--form">
      <Header title="일상 경로 설정" />
      <StatusBar />
      <p className="intro">
        일상 경로를 등록하면
        <br />
        주변 자연을 발견할 수 있어요.
      </p>
      <div className="form" style={{ top: 224 }}>
        <CommuteFields value={c} onChange={(p) => setC({ ...c, ...p })} />
      </div>
      <div className="bottom-actions" style={{ top: 710 }}>
        <Button
          on={ready}
          disabled={!ready}
          onClick={() => {
            setCommute(c)
            nav('/home', { replace: true })
          }}
        >
          경로 등록하기
        </Button>
        <Button line onClick={() => nav('/home', { replace: true })}>
          다음에 하기
        </Button>
      </div>
      <HomeIndicator />
    </div>
  )
}
