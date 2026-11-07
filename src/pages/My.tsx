import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Header, HomeIndicator, Nav, StatusBar } from '../components/ui'
import { CommuteFields } from './Auth'
import { A } from '../lib/assets'
import { useStore, type Commute } from '../lib/store'

function Pencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

/** 시간 한 줄 + 연필 아이콘: 누르면 바로 고친다 */
function TimeRow({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const done = () => {
    if (/^\d{1,2}:\d{2}$/.test(draft.trim())) onSave(draft.trim().padStart(5, '0'))
    setEditing(false)
  }
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {editing ? (
          <input
            className="time-edit"
            type="time"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={done}
            onKeyDown={(e) => e.key === 'Enter' && done()}
          />
        ) : (
          value
        )}
        {!editing && (
          <button className="time-pencil" aria-label={`${label} 시간 수정`} onClick={() => { setDraft(value); setEditing(true) }}>
            <Pencil />
          </button>
        )}
      </dd>
    </div>
  )
}

/** 마이페이지 (Figma 230:850) */
export function My() {
  const nav = useNavigate()
  const { profile, commute, setCommute, alerts, setAlerts } = useStore()

  return (
    <div className="screen screen--gray">
      <StatusBar />
      <div className="my__avatar">
        <img src={A('img/avatar-lion.png')} alt="" />
      </div>
      <p className="my__name">{profile.nickname}</p>
      <div className="my__edit">
        <button onClick={() => nav('/my/edit')}>내 정보 수정</button>
      </div>

      <section className="card" style={{ top: 319 }}>
        <div className="card__head">
          <h2>나의 일상 경로</h2>
          <button className="card__edit" onClick={() => nav('/my/route')}>수정</button>
        </div>
        <dl className="kv" style={{ margin: 0 }}>
          <div>
            <dt>출발·도착</dt>
            <dd>
              {commute.from}
              <img src={A('icons/chevron-right.svg')} alt="" />
              {commute.to}
            </dd>
          </div>
          <div><dt>등교·출근</dt><dd>{commute.morning}</dd></div>
          <div><dt>하교·퇴근</dt><dd>{commute.evening}</dd></div>
        </dl>
      </section>

      <section className="card" style={{ top: 493 }}>
        <h2>알림 설정</h2>
        <div className="alarm">
          <div className="alarm__toggles">
            <button role="switch" aria-checked={alerts.morning} aria-label="등교·출근 알림" onClick={() => setAlerts({ morning: !alerts.morning })}>
              <img src={A(alerts.morning ? 'icons/toggle-on.svg' : 'icons/toggle-off.svg')} alt="" />
            </button>
            <button role="switch" aria-checked={alerts.evening} aria-label="하교·퇴근 알림" onClick={() => setAlerts({ evening: !alerts.evening })}>
              <img src={A(alerts.evening ? 'icons/toggle-on.svg' : 'icons/toggle-off.svg')} alt="" />
            </button>
          </div>
          <dl className="kv" style={{ margin: 0 }}>
            <TimeRow label="등교·출근" value={commute.morning} onSave={(morning) => setCommute({ morning })} />
            <TimeRow label="하교·퇴근" value={commute.evening} onSave={(evening) => setCommute({ evening })} />
          </dl>
        </div>
      </section>

      <Nav />
      <HomeIndicator />
    </div>
  )
}

/** 내 정보 수정 (Figma 230:537) */
export function EditProfile() {
  const nav = useNavigate()
  const { profile, setProfile } = useStore()
  const [f, setF] = useState({ id: profile.userId, pw: '', pw2: '', nick: profile.nickname })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const ready = f.nick.trim() !== '' && f.pw === f.pw2

  return (
    <div className="screen">
      <Header title="내 정보 수정" tone="gray" />
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
            setProfile({ userId: f.id.trim(), nickname: f.nick.trim() })
            nav('/my', { replace: true })
          }}
        >
          내 정보 수정하기
        </Button>
      </div>
      <HomeIndicator />
    </div>
  )
}

/** 일상 경로 수정 (Figma 230:797) */
export function EditRoute() {
  const nav = useNavigate()
  const { commute, setCommute } = useStore()
  const [c, setC] = useState<Commute>(commute)
  const ready = !!(c.from.trim() && c.to.trim() && c.morning.trim() && c.evening.trim())

  return (
    <div className="screen">
      <Header title="일상 경로 수정" tone="gray" />
      <StatusBar />
      <div className="form" style={{ top: 155 }}>
        <CommuteFields value={c} onChange={(p) => setC({ ...c, ...p })} />
      </div>
      <div className="bottom-actions" style={{ top: 772 }}>
        <Button
          on={ready}
          disabled={!ready}
          onClick={() => {
            setCommute(c)
            nav('/my', { replace: true })
          }}
        >
          일상 경로 수정하기
        </Button>
      </div>
      <HomeIndicator />
    </div>
  )
}
