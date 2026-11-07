import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { A, NAV_ICONS } from '../lib/assets'

/** iOS 상태바 (데스크톱 프레임에서만 보인다) */
export function StatusBar() {
  return (
    <div className="status" aria-hidden>
      <span>9:41</span>
      <svg width="68" height="13" viewBox="0 0 68 13" fill="#000">
        <rect x="0" y="8" width="3" height="5" rx="1" />
        <rect x="5" y="5.5" width="3" height="7.5" rx="1" />
        <rect x="10" y="3" width="3" height="10" rx="1" />
        <rect x="15" y="0" width="3" height="13" rx="1" />
        <path d="M30 3.2a9 9 0 0 1 12 0l-1.5 1.6a6.7 6.7 0 0 0-9 0zM33 6.6a5 5 0 0 1 6 0l-1.5 1.7a2.8 2.8 0 0 0-3 0zM36 10l1.6 1.7h-3.2z" />
        <rect x="46" y="0.5" width="21" height="12" rx="3.5" fill="none" stroke="#000" opacity=".4" />
        <rect x="48" y="2.5" width="17" height="8" rx="2" />
      </svg>
    </div>
  )
}

export function HomeIndicator() {
  return <div className="home-ind" aria-hidden />
}

/** 돌아갈 기록이 없을 때(새로고침·주소 직접 진입) 이동할 상위 화면 */
const PARENT: Record<string, string> = {
  '/signup': '/login',
  '/route-setup': '/signup',
  '/season': '/home',
  '/route': '/home',
  '/guide': '/route',
  '/photo': '/guide',
  '/record': '/home',
  '/my/edit': '/my',
  '/my/route': '/my',
}

/** 상단 헤더: 뒤로가기 + 가운데 제목 + 하단 라인 */
export function Header({ title, tone = 'dark' }: { title: string; tone?: 'dark' | 'gray' }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) nav(-1)
    else nav(PARENT[pathname] ?? '/home', { replace: true })
  }
  return (
    <header className="hdr">
      <button className="hdr__back" aria-label="뒤로가기" onClick={goBack}>
        <img src={A(tone === 'dark' ? 'icons/arrow-left.svg' : 'icons/arrow-left-gray.svg')} alt="" />
      </button>
      <h1>{title}</h1>
      <img className="hdr__line" src={A('icons/line-header.svg')} alt="" />
    </header>
  )
}

const TABS = [
  { key: 'home', to: '/home', label: '홈' },
  { key: 'route', to: '/route', label: '경로' },
  { key: 'record', to: '/record', label: '기록' },
  { key: 'my', to: '/my', label: '마이' },
] as const

/** 하단 탭바 */
export function Nav() {
  return (
    <nav className="nav">
      <div className="nav__bg">
        <img src={A('icons/nav-bg.svg')} alt="" />
      </div>
      <ul>
        {TABS.map((t) => (
          <li key={t.key}>
            <NavLink to={t.to} replace>
              {({ isActive }) => (
                <>
                  <img src={A(NAV_ICONS[t.key][isActive ? 'on' : 'off'])} alt="" />
                  <span className={isActive ? 'is-on' : ''}>{t.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** 라벨 + 입력 */
export function Field({
  label,
  className = '',
  ...input
}: { label?: string; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="lbl">{label}</span>}
      <input className="inp" {...input} />
    </label>
  )
}

export function Button({
  children,
  on,
  line,
  ...rest
}: { children: ReactNode; on?: boolean; line?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`btn${on ? ' on' : ''}${line ? ' btn--line' : ''}`} {...rest}>
      {children}
    </button>
  )
}

/** 세그먼트 컨트롤 (교통수단 / 계절) */
export function Segment<T extends string>({
  options,
  value,
  onChange,
  variant,
}: {
  options: readonly T[]
  value: T | null
  onChange: (v: T) => void
  variant: 'mode' | 'season'
}) {
  return (
    <div className={`seg seg--${variant}`} role="tablist">
      {options.map((o) => (
        <button key={o} role="tab" aria-selected={o === value} className={o === value ? 'is-on' : ''} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  )
}

/** 회전된 지도 선/도형: Figma 의 박스(box) 안에서 중앙 정렬 후 rot 만큼 회전 */
export function Rot({
  box,
  rot = 0,
  len,
  src,
  inset = 5,
  flipY,
}: {
  box: { left: number; top: number; w: number; h: number }
  rot?: number
  len: number
  src: string
  inset?: number
  flipY?: boolean
}) {
  const wrap: CSSStyleDeclaration | CSSProperties = {
    left: box.left,
    top: box.top,
    width: box.w,
    height: box.h,
  }
  return (
    <div className="rot" style={wrap as CSSProperties}>
      <div style={{ width: len, height: 0, transform: `rotate(${rot}deg)${flipY ? ' scaleY(-1)' : ''}`, position: 'relative', flex: 'none' }}>
        <img src={A(src)} alt="" style={{ position: 'absolute', left: 0, top: -inset, width: '100%', height: `calc(100% + ${inset}px)`, maxWidth: 'none' }} />
      </div>
    </div>
  )
}

/** 통계 아이콘 + 텍스트 (+12분, 녹지 64%) */
export function Stat({ icon, size, children }: { icon: string; size: number; children: ReactNode }) {
  return (
    <span className="stat">
      <img src={A(icon)} alt="" width={size} height={size} />
      {children}
    </span>
  )
}
