import { describe, expect, it } from 'vitest'
import { COMPANY, companyLine } from './company'

describe('company details', () => {
  it('states the registered name, place of registration, number and office in one line', () => {
    const line = companyLine()
    expect(line).toContain('GE App Solutions Limited')
    expect(line).toContain('registered in England and Wales')
    expect(line).toContain('company number 16317660')
    expect(line).toContain('Shelton Street')
  })

  it('uses the registered name with its legal ending', () => {
    expect(COMPANY.name.endsWith('Limited')).toBe(true)
    expect(COMPANY.number).toMatch(/^\d{8}$/)
  })
})
