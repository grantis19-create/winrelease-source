import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BuildLog, classifyLogLine } from './BuildLog'

describe('classifyLogLine', () => {
  it('marks WinRelease notes, errors and warnings, and leaves the rest as info', () => {
    expect(classifyLogLine('WinRelease note: the version is unusual')).toBe('note')
    expect(classifyLogLine('manifest.wxs(3) : error WIX0091: Duplicate Property')).toBe('error')
    expect(classifyLogLine('manifest.wxs(3) : warning WIX1234: something')).toBe('warning')
    expect(classifyLogLine('x.msi -> built')).toBe('info')
  })
})

describe('BuildLog', () => {
  it('shows every line of the output verbatim', () => {
    render(<BuildLog text={'line one\nerror WIX1: bad'} />)
    expect(screen.getByText('line one')).toBeInTheDocument()
    expect(screen.getByText('error WIX1: bad')).toBeInTheDocument()
  })
})
