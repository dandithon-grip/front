import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { TimeWheel, formatTime, parseTime } from './TimeWheel'

const text = (node: ReactTestInstance | string): string => typeof node === 'string' ? node : node.children.map(text).join('')

describe('wheel time picker', () => {
  it('splits HH:MM into period, 12-hour and minute and back', () => {
    expect(parseTime('18:30')).toEqual({ period: '오후', hour: 6, minute: 30 })
    expect(parseTime('00:05')).toEqual({ period: '오전', hour: 12, minute: 5 })
    expect(parseTime('12:00')).toEqual({ period: '오후', hour: 12, minute: 0 })
    expect(formatTime('오후', 6, 30)).toBe('18:30')
    expect(formatTime('오전', 12, 5)).toBe('00:05')
    expect(formatTime('오후', 12, 0)).toBe('12:00')
    expect(parseTime('nonsense')).toEqual({ period: '오전', hour: 9, minute: 0 })
  })

  it('renders three scrollable columns with the current value selected', () => {
    let renderer: ReactTestRenderer | undefined
    act(() => { renderer = create(<TimeWheel label="퇴근 시간" value="18:30" onChange={() => {}} />) })
    const columns = renderer!.root.findAllByProps({ role: 'listbox' })
    expect(columns).toHaveLength(3)
    const selected = renderer!.root.findAllByProps({ 'aria-selected': true }).filter(node => node.type === 'button')
    expect(selected.map(text)).toEqual(['오후', '6시', '30분'])
  })

  it('tapping an item changes only that part of the time', () => {
    const onChange = vi.fn()
    let renderer: ReactTestRenderer | undefined
    act(() => { renderer = create(<TimeWheel label="퇴근 시간" value="18:30" onChange={onChange} />) })
    const minute45 = renderer!.root.findAllByType('button').find(node => text(node) === '45분')!
    act(() => { minute45.props.onClick() })
    expect(onChange).toHaveBeenLastCalledWith('18:45')
    const am = renderer!.root.findAllByType('button').find(node => text(node) === '오전')!
    act(() => { am.props.onClick() })
    expect(onChange).toHaveBeenLastCalledWith('06:30')
  })

  it('offers a typed input as an alternative', () => {
    const onChange = vi.fn()
    let renderer: ReactTestRenderer | undefined
    act(() => { renderer = create(<TimeWheel label="퇴근 시간" value="18:30" onChange={onChange} />) })
    const toggle = renderer!.root.findAllByType('button').find(node => text(node).includes('직접 입력'))!
    act(() => { toggle.props.onClick() })
    const input = renderer!.root.findByProps({ type: 'time' })
    act(() => { input.props.onChange({ target: { value: '07:10' } }) })
    expect(onChange).toHaveBeenLastCalledWith('07:10')
  })
})
