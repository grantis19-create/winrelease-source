import type { RegistryEntry, RegistryRoot, RegistryValueType } from '../types/manifest'

export interface RegFileParseResult {
  entries: RegistryEntry[]
  warnings: string[]
}

const HIVE_MAP: Record<string, RegistryRoot> = {
  HKEY_LOCAL_MACHINE: 'hklm',
  HKLM: 'hklm',
  HKEY_CURRENT_USER: 'hkcu',
  HKCU: 'hkcu',
  HKEY_CLASSES_ROOT: 'hkcr',
  HKCR: 'hkcr',
  HKEY_USERS: 'hku',
  HKU: 'hku',
}

/** Parses a standard regedit.exe .reg export (Windows Registry Editor Version 5.00) into RegistryEntry[]. */
export function parseRegFile(content: string): RegFileParseResult {
  const entries: RegistryEntry[] = []
  const warnings: string[] = []
  const seenValues = new Set<string>()

  const lines = joinContinuations(content.split(/\r?\n/))

  let currentRoot: RegistryRoot | null = null
  let currentKey: string | null = null
  // Values under a [-deleted] key or an unrecognised hive are skipped without a warning each (the key line already explains it).
  let skippedKey = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith(';') || /^Windows Registry Editor/i.test(line)) {
      continue
    }

    // A key line is everything between the first '[' and the LAST ']' - key names may themselves hold brackets, as in a template's
    // [HKEY_LOCAL_MACHINE\...\Installed Components\[PackageName]] (that used to fail to match, and every value under it was dropped silently).
    const sectionMatch = line.startsWith('[') && line.endsWith(']') ? /^(-?)(.+)$/s.exec(line.slice(1, -1)) : null;
    if (sectionMatch) {
      if (sectionMatch[1] === '-') {
        // A key deletion ([-HIVE\Key]) - nothing to add to the manifest.
        currentRoot = null;
        currentKey = null;
        skippedKey = true;
        continue;
      }

      const [hive, ...rest] = sectionMatch[2].split('\\');
      const root = HIVE_MAP[hive.toUpperCase()];
      if (!root) {
        warnings.push(`Unrecognized hive '${hive}' - skipped.`);
        currentRoot = null;
        currentKey = null;
        skippedKey = true;
        continue;
      }

      if (rest.join('').length === 0) {
        // A bare hive has no key for Windows Installer to write to (wix rejects an empty Key outright).
        warnings.push(`Values directly under ${hive} can't be installed - put them under a key. Skipped.`);
        currentRoot = null;
        currentKey = null;
        skippedKey = true;
        continue;
      }

      currentRoot = root;
      currentKey = rest.join('\\');
      skippedKey = false;
      if (currentKey.split('\\').filter((segment) => segment.toLowerCase() === 'wow6432node').length > 1) {
        warnings.push(
          `Key '${hive}\\${currentKey}' has WOW6432Node inside WOW6432Node. Windows adds one more when it redirects, so it would end up as WOW6432Node\\WOW6432Node in the registry, which is almost always a mistake (a key exported twice). It is imported as written: remove the extra WOW6432Node if that is not what you want.`,
        );
      }
      continue;
    }

    if (!currentRoot || currentKey === null) {
      if (!skippedKey) warnings.push(`Could not parse line (no key above it): ${line}`);
      continue;
    }

    const valueMatch = /^(@|"(?:[^"\\]|\\.)*")=(.+)$/.exec(line);
    if (!valueMatch) {
      warnings.push(`Could not parse line: ${line}`);
      continue;
    }

    const name = valueMatch[1] === '@' ? '' : unescapeRegString(valueMatch[1].slice(1, -1));
    const parsed = parseValue(valueMatch[2].trim());
    if (!parsed) {
      warnings.push(`Could not parse value for '${name || '(default)'}': ${valueMatch[2]}`);
      continue;
    }

    const label = name || '(default)';
    if (parsed.warning) warnings.push(`'${label}' under ${currentKey}: ${parsed.warning}`);
    if ((parsed.valueType === 'string' || parsed.valueType === 'expandString') && /(^|[^A-Za-z0-9])[A-Za-z]:\\Users\\(?!Public\\|Default\\|All Users\\)[^\\]+\\/i.test(parsed.value)) {
      warnings.push(`'${label}' under ${currentKey} points into a specific user's profile (${parsed.value}). That folder will not exist on other PCs: use a folder the package installs, such as [INSTALLFOLDER], or a per-user path.`);
    }
    const seen = `${currentRoot}|${currentKey.toLowerCase()}|${name.toLowerCase()}`;
    if (seenValues.has(seen)) {
      warnings.push(`'${label}' under ${currentKey} appears more than once in this file. The package will not build with the same value twice: delete one of them.`);
    }
    seenValues.add(seen);
    entries.push({ root: currentRoot, key: currentKey, name, value: parsed.value, valueType: parsed.valueType });
  }

  return { entries, warnings };
}

/** regedit.exe wraps long hex value lines across lines ending in "\" - undo that before parsing. */
function joinContinuations(lines: string[]): string[] {
  const joined: string[] = [];
  let buffer = '';

  for (const line of lines) {
    const trimmedEnd = line.replace(/\s+$/, '');
    if (trimmedEnd.endsWith('\\')) {
      buffer += trimmedEnd.slice(0, -1);
    } else {
      joined.push(buffer + line);
      buffer = '';
    }
  }

  if (buffer.length > 0) {
    joined.push(buffer);
  }

  return joined;
}

function unescapeRegString(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

function parseValue(rawValue: string): { value: string; valueType: RegistryValueType; warning?: string } | null {
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return { value: unescapeRegString(rawValue.slice(1, -1)), valueType: 'string' };
  }

  if (rawValue.startsWith('dword:')) {
    const num = parseInt(rawValue.slice('dword:'.length).trim(), 16);
    return Number.isNaN(num) ? null : { value: String(num), valueType: 'integer' };
  }

  // The type is a hexadecimal number: regedit writes REG_QWORD as hex(b), which a decimal-only pattern never matched (the value was dropped with a
  // generic "could not parse" warning).
  const hexTypeMatch = /^hex\(([0-9a-fA-F]+)\):(.*)$/.exec(rawValue);
  if (hexTypeMatch) {
    const type = parseInt(hexTypeMatch[1], 16);
    const bytes = parseHexBytes(hexTypeMatch[2]);

    if (type === 1) {
      return { value: decodeUtf16(bytes).replace(/\0+$/, ''), valueType: 'string' };
    }
    if (type === 2) {
      return { value: decodeUtf16(bytes).replace(/\0+$/, ''), valueType: 'expandString' };
    }
    if (type === 7) {
      const parts = decodeUtf16(bytes).split('\0').filter((part) => part.length > 0);
      return { value: parts.join('\n'), valueType: 'multiString' };
    }

    // A type Windows Installer's Registry table cannot write. Fall back to the raw bytes as binary, and say so: a program that reads this value as its
    // real type will not get what the .reg file meant.
    const typeName = type === 11 ? 'REG_QWORD' : type === 0 ? 'REG_NONE' : `registry type ${type}`;
    return {
      value: bytesToHexString(bytes),
      valueType: 'binary',
      warning: `is ${typeName}, which Windows Installer cannot write. It is imported as binary (REG_BINARY), so a program expecting ${type === 11 ? 'a QWORD' : 'the original type'} will not read it correctly.`,
    };
  }

  if (rawValue.startsWith('hex:')) {
    return { value: bytesToHexString(parseHexBytes(rawValue.slice('hex:'.length))), valueType: 'binary' };
  }

  return null;
}

function parseHexBytes(value: string): number[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => parseInt(part, 16));
}

function decodeUtf16(bytes: number[]): string {
  let result = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    result += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  }
  return result;
}

function bytesToHexString(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}
