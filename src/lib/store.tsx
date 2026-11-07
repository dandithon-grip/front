import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Mode = '도보' | '대중교통' | '자동차'
export type Season = '봄' | '여름' | '가을' | '겨울'

export interface Profile {
  userId: string
  nickname: string
  loggedIn: boolean
}
export interface Commute {
  from: string
  to: string
  morning: string
  evening: string
  mode: Mode
}
export interface RecordItem {
  id: number
  place: string
  season: Season
  memo: string
  photo?: string
}
export interface Alerts {
  morning: boolean
  evening: boolean
}

interface State {
  profile: Profile
  commute: Commute
  records: RecordItem[]
  alerts: Alerts
}

const DEFAULT: State = {
  profile: { userId: '', nickname: '아기사자어흥', loggedIn: false },
  commute: { from: '수성구청역', to: '반월당역', morning: '08:30', evening: '18:10', mode: '도보' },
  records: [],
  alerts: { morning: false, evening: true },
}

const KEY = 'saetgil:v1'

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) }
  } catch {
    /* 저장소를 못 읽어도 기본값으로 동작 */
  }
  return DEFAULT
}

interface Ctx extends State {
  setProfile: (p: Partial<Profile>) => void
  setCommute: (c: Partial<Commute>) => void
  setAlerts: (a: Partial<Alerts>) => void
  addRecord: (r: Omit<RecordItem, 'id'>) => void
}

const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load)

  useEffect(() => {
    try {
      // 사진(dataURL)은 용량이 커서 저장하지 않는다
      const slim = { ...state, records: state.records.map(({ photo: _p, ...r }) => r) }
      localStorage.setItem(KEY, JSON.stringify(slim))
    } catch {
      /* ignore */
    }
  }, [state])

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      setProfile: (p) => setState((s) => ({ ...s, profile: { ...s.profile, ...p } })),
      setCommute: (c) => setState((s) => ({ ...s, commute: { ...s.commute, ...c } })),
      setAlerts: (a) => setState((s) => ({ ...s, alerts: { ...s.alerts, ...a } })),
      addRecord: (r) =>
        setState((s) => ({ ...s, records: [{ ...r, id: Date.now() }, ...s.records] })),
    }),
    [state],
  )

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('StoreProvider 안에서만 사용할 수 있어요')
  return ctx
}
