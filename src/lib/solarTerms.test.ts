import { describe, expect, it } from 'vitest'
import { currentSolarTerm } from './solarTerms'

describe('solar term for the home season card', () => {
  it('picks the latest term that has started', () => {
    expect(currentSolarTerm(new Date('2026-11-09T12:00:00+09:00')).name).toBe('입동')
    expect(currentSolarTerm(new Date('2026-10-30T12:00:00+09:00')).name).toBe('상강')
    expect(currentSolarTerm(new Date('2026-11-22T12:00:00+09:00')).name).toBe('소설')
    expect(currentSolarTerm(new Date('2026-12-25T12:00:00+09:00')).name).toBe('동지')
  })
  it('wraps around the new year', () => {
    expect(currentSolarTerm(new Date('2027-01-10T12:00:00+09:00')).name).toBe('소한')
    expect(currentSolarTerm(new Date('2026-01-02T12:00:00+09:00')).name).toBe('동지')
  })
  it('knows the next term by name', () => {
    expect(currentSolarTerm(new Date('2026-11-09T12:00:00+09:00')).next).toBe('소설(小雪)')
  })
})
