import { describe, expect, it } from 'vitest'
import { thumbPathOf } from './recordMedia'

describe('record photo thumbnails', () => {
  it('derives the thumbnail path next to the full photo', () => {
    expect(thumbPathOf('user-1/abc.jpg')).toBe('user-1/abc_thumb.jpg')
    expect(thumbPathOf('user-1/no-extension')).toBe('user-1/no-extension_thumb.jpg')
  })
})
