import { describe, expect, it } from 'vitest'
import { parseRegFile } from './regFileParser'

describe('parseRegFile', () => {
  it('parses default value, string, and dword entries', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Vendor\\App]
@="Default value"
"StringValue"="hello world"
"DwordValue"=dword:00000001
`)

    expect(result.warnings).toEqual([]);
    expect(result.entries).toEqual([
      { root: 'hklm', key: 'SOFTWARE\\Vendor\\App', name: '', value: 'Default value', valueType: 'string' },
      { root: 'hklm', key: 'SOFTWARE\\Vendor\\App', name: 'StringValue', value: 'hello world', valueType: 'string' },
      { root: 'hklm', key: 'SOFTWARE\\Vendor\\App', name: 'DwordValue', value: '1', valueType: 'integer' },
    ]);
  })

  it('decodes hex(2) as an expandString, stripping the null terminator', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Vendor\\App]
"ExpandValue"=hex(2):25,00,50,00,41,00,54,00,48,00,25,00,00,00
`)

    expect(result.entries).toEqual([
      { root: 'hklm', key: 'SOFTWARE\\Vendor\\App', name: 'ExpandValue', value: '%PATH%', valueType: 'expandString' },
    ]);
  })

  it('decodes hex(7) as a multiString, newline-joined per the manifest convention', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Vendor\\App]
"MultiValue"=hex(7):61,00,00,00,62,00,00,00,00,00
`)

    expect(result.entries).toEqual([
      { root: 'hklm', key: 'SOFTWARE\\Vendor\\App', name: 'MultiValue', value: 'a\nb', valueType: 'multiString' },
    ]);
  })

  it('decodes hex: as a binary hex string', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Vendor\\App]
"BinaryValue"=hex:01,02,03,ff
`)

    expect(result.entries).toEqual([
      { root: 'hklm', key: 'SOFTWARE\\Vendor\\App', name: 'BinaryValue', value: '010203ff', valueType: 'binary' },
    ]);
  })

  it('joins backslash line-continuations before parsing', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\Vendor\\App]
"LongBinary"=hex:01,02,03,04,05,06,07,08,09,0a,\\
  0b,0c,0d,0e,0f,10
`)

    expect(result.entries).toEqual([
      { root: 'hkcu', key: 'Software\\Vendor\\App', name: 'LongBinary', value: '0102030405060708090a0b0c0d0e0f10', valueType: 'binary' },
    ]);
  })

  it('recognizes HKCR and HKU', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_CLASSES_ROOT\\myapp]
@="URL:MyApp Protocol"

[HKEY_USERS\\.DEFAULT\\Software\\Vendor\\App]
"Seen"=dword:00000001
`)

    expect(result.entries).toEqual([
      { root: 'hkcr', key: 'myapp', name: '', value: 'URL:MyApp Protocol', valueType: 'string' },
      { root: 'hku', key: '.DEFAULT\\Software\\Vendor\\App', name: 'Seen', value: '1', valueType: 'integer' },
    ]);
  })

  it('skips key-deletion sections and warns on unrecognized hives', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[-HKEY_CURRENT_USER\\Software\\Removed]

[HKEY_WEIRD\\Something]
"Value"="ignored"
`)

    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual(["Unrecognized hive 'HKEY_WEIRD' - skipped."]);
  })

  it('reads a key whose own name holds brackets, as in an Active Setup template', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Active Setup\\Installed Components\\[PackageName]]
@="[ProductName]"
"Version"="1,0"
"StubPath"="msiexec /fup [ProductCode] /qn"
`)

    const key = 'SOFTWARE\\Microsoft\\Active Setup\\Installed Components\\[PackageName]'
    expect(result.warnings).toEqual([]);
    expect(result.entries).toEqual([
      { root: 'hklm', key, name: '', value: '[ProductName]', valueType: 'string' },
      { root: 'hklm', key, name: 'Version', value: '1,0', valueType: 'string' },
      { root: 'hklm', key, name: 'StubPath', value: 'msiexec /fup [ProductCode] /qn', valueType: 'string' },
    ]);
  })

  it('keeps WOW6432Node keys as they are (the build turns them into 32-bit entries)', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Vendor]
"A"="1"
`)

    expect(result.entries).toEqual([{ root: 'hklm', key: 'SOFTWARE\\WOW6432Node\\Vendor', name: 'A', value: '1', valueType: 'string' }]);
  })

  it('skips values directly under a bare hive and values with no key above them, saying so', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

"Orphan"="x"

[HKEY_CURRENT_USER]
"AtRoot"="y"
`)

    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual([
      'Could not parse line (no key above it): "Orphan"="x"',
      "Values directly under HKEY_CURRENT_USER can't be installed - put them under a key. Skipped.",
    ]);
  })
})

describe('parseRegFile strict warnings', () => {
  it('warns that a QWORD cannot be written by Windows Installer and is imported as binary', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Vendor\\App]
"Big"=hex(b):01,00,00,00,00,00,00,00
`)
    expect(result.entries[0].valueType).toBe('binary')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('REG_QWORD')
    expect(result.warnings[0]).toContain("'Big'")
  })

  it('warns about other types Windows Installer cannot write, and not about plain binary', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Vendor\\App]
"None"=hex(0):01,02
"Plain"=hex:01,02
`)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('REG_NONE')
  })

  it('warns when WOW6432Node sits inside WOW6432Node, and keeps the key as written', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\WOW6432Node\\Vendor]
"A"="1"

[HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Vendor]
"A"="1"
`)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('WOW6432Node inside WOW6432Node')
    expect(result.entries[0].key).toBe('SOFTWARE\\WOW6432Node\\WOW6432Node\\Vendor')
  })

  it('warns about a value listed twice, and about a path into one user profile', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Vendor\\App]
"Dup"="1"
"dup"="2"
"Path"="C:\\\\Users\\\\jsmith\\\\AppData\\\\Local\\\\App\\\\x.exe"
"Shared"="C:\\\\Users\\\\Public\\\\Documents\\\\x.txt"
`)
    expect(result.warnings.some((w) => w.includes('more than once'))).toBe(true)
    expect(result.warnings.some((w) => w.includes("specific user's profile"))).toBe(true)
    expect(result.warnings.some((w) => w.includes('Shared'))).toBe(false)
  })

  it('stays quiet for a clean file', () => {
    const result = parseRegFile(`Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Vendor\\App]
"Name"="x"
"Count"=dword:00000002
`)
    expect(result.warnings).toEqual([])
  })
})
