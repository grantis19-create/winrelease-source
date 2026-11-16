import { describe, expect, it } from 'vitest'
import { sanitizeToFileId } from './fileId'

describe('sanitizeToFileId', () => {
  it('sanitizes a nested path into a stable id', () => {
    expect(sanitizeToFileId('bin/App.exe')).toBe('fil_App_exe')
  })

  it('handles backslash-separated paths', () => {
    expect(sanitizeToFileId('bin\\App.exe')).toBe('fil_App_exe')
  })

  it('collapses runs of non-alphanumeric characters', () => {
    expect(sanitizeToFileId('My Config (v2).ini')).toBe('fil_My_Config_v2_ini')
  })

  it('falls back to a generic name for an empty basename', () => {
    expect(sanitizeToFileId('')).toBe('fil_file')
  })
})
