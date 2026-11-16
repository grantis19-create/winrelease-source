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
