import { useEffect, useRef, useState } from 'react'
import './time-wheel.css'

export type Period = '오전' | '오후'
const PERIODS: Period[] = ['오전', '오후']
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1)
const MINUTES = Array.from({ length: 60 }, (_, index) => index)
export const ITEM_HEIGHT = 44

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

/** 'HH:MM' → 오전/오후 · 12시간제 시 · 분. 형식이 깨졌으면 오전 9시. */
export function parseTime(value: string): { period: Period; hour: number; minute: number } {
  const [hour24, minute] = (validTime(value) ? value : '09:00').split(':').map(Number)
  return { period: hour24 >= 12 ? '오후' : '오전', hour: hour24 % 12 || 12, minute }
}

export function formatTime(period: Period, hour: number, minute: number): string {
  const hour24 = hour % 12 + (period === '오후' ? 12 : 0)
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

interface ColumnProps<T> { label: string; items: T[]; selected: number; render: (item: T) => string; onSelect: (index: number) => void }

/** 한 열. 스크롤이 멈추면 가운데 항목을 고르고, 탭하면 그 항목으로 간다. */
function Column<T>({ label, items, selected, render, onSelect }: ColumnProps<T>) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  const fromScroll = useRef(false)

  // 선택값이 바뀌면 그 항목을 가운데로. 사용자가 스크롤해서 바뀐 경우는 이미 거기 있다
  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (fromScroll.current) { fromScroll.current = false; return }
    const top = selected * ITEM_HEIGHT
    if (Math.abs(element.scrollTop - top) < 1) return
    if (typeof element.scrollTo === 'function') element.scrollTo({ top })
    else element.scrollTop = top
  }, [selected])

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  const onScroll = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const element = ref.current
      if (!element) return
      const index = Math.max(0, Math.min(items.length - 1, Math.round(element.scrollTop / ITEM_HEIGHT)))
      if (index !== selected) { fromScroll.current = true; onSelect(index) }
    }, 90)
  }

  return (
    <div className="time-wheel__column" role="listbox" aria-label={label} ref={ref} onScroll={onScroll}>
      {items.map((item, index) => (
        <button type="button" role="option" aria-selected={index === selected} key={render(item)}
          className={`time-wheel__item${index === selected ? ' is-selected' : ''}`} tabIndex={index === selected ? 0 : -1}
          onClick={() => onSelect(index)}>{render(item)}</button>
      ))}
    </div>
  )
}

/** 아이폰식 시간 휠. 위아래로 넘겨 고르고, 탭해도 되고, 아래 '직접 입력'으로 키보드 입력도 된다. */
export function TimeWheel({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { period, hour, minute } = parseTime(value)
  const [typing, setTyping] = useState(false)
  return (
    <div className="time-wheel">
      <div className="time-wheel__columns" aria-label={label}>
        <div className="time-wheel__band" aria-hidden="true" />
        <Column label={`${label} 오전 또는 오후`} items={PERIODS} selected={PERIODS.indexOf(period)} render={(item) => item}
          onSelect={(index) => onChange(formatTime(PERIODS[index], hour, minute))} />
        <Column label={`${label} 시`} items={HOURS} selected={hour - 1} render={(item) => `${item}시`}
          onSelect={(index) => onChange(formatTime(period, HOURS[index], minute))} />
        <Column label={`${label} 분`} items={MINUTES} selected={minute} render={(item) => `${String(item).padStart(2, '0')}분`}
          onSelect={(index) => onChange(formatTime(period, hour, MINUTES[index]))} />
      </div>
      <div className="time-wheel__typed">
        {typing
          ? <label>{label} 직접 입력<input type="time" value={validTime(value) ? value : '09:00'} onChange={(event) => { if (validTime(event.target.value)) onChange(event.target.value) }} /></label>
          : <button type="button" className="time-wheel__toggle" onClick={() => setTyping(true)}>위아래로 넘겨 고르세요 · 직접 입력</button>}
      </div>
    </div>
  )
}
