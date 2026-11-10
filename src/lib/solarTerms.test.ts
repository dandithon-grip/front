import { describe, expect, it } from 'vitest'
import { SOLAR_TERMS, currentSolarTerm, localStory } from './solarTerms'

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

describe('local story for the user city', () => {
  it('tells a Daegu story for every term of the season', () => {
    for (const term of SOLAR_TERMS) {
      const story = localStory(term, 'daegu')
      expect(story, term.name).not.toBeNull()
      expect(story!.label).toBe('대구')
      expect(story!.line.length).toBeGreaterThan(10)
      expect(story!.spots.length).toBeGreaterThan(0)
    }
  })
  it('names curated places that lie on commutes', () => {
    const term = currentSolarTerm(new Date('2026-11-09T12:00:00+09:00'))
    expect(localStory(term, 'daegu')!.spots).toContain('범어로 은행나무길')
  })
  it('returns null for a city without stories', () => {
    expect(localStory(SOLAR_TERMS[0], 'seoul')).toBeNull()
  })
  it('falls back to the default city when the profile has none', () => {
    expect(localStory(SOLAR_TERMS[0])!.label).toBe('대구')
  })
})
