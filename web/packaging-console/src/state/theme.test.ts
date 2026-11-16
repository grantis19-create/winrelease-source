import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, getStoredTheme } from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to orange with no attribute', () => {
    expect(getStoredTheme()).toBe('orange')
    applyTheme('orange')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('applies and remembers a theme', () => {
    applyTheme('green')
    expect(document.documentElement.getAttribute('data-theme')).toBe('green')
    expect(getStoredTheme()).toBe('green')
  })

  it('ignores an unknown stored value', () => {
    localStorage.setItem('winrelease:theme', 'pink')
    expect(getStoredTheme()).toBe('orange')
  })

  it('does not store when told not to', () => {
    applyTheme('blue', false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('blue')
    expect(localStorage.getItem('winrelease:theme')).toBeNull()
  })

  it('going back to orange clears the attribute', () => {
    applyTheme('mono')
    applyTheme('orange')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
