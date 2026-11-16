import type { WinReleaseManifest } from '../types/manifest'
import { propertiesOf } from './propertyCatalog'

/**
 * Registry keys, names and values are MSI "Formatted" text: Windows Installer swaps every [Name] for that property's value at install time,
 * and an unknown name becomes an empty string. So a .reg template's [ProductCode] works, but [PackageName] silently disappears (a key ending
 * in "\[PackageName]" is written as a key ending in "\"). These are the names that are always set during an install.
 */
const ALWAYS_SET = new Set([
  // Set by every WinRelease package.
  'ProductName', 'ProductCode', 'ProductVersion', 'ProductLanguage', 'Manufacturer', 'UpgradeCode', 'INSTALLFOLDER', 'TARGETDIR',
  'ALLUSERS', 'MSIINSTALLPERUSER', 'ARPPRODUCTICON', 'SourceDir', 'OriginalDatabase',
  // Windows Installer's own folder properties.
  'ProgramFilesFolder', 'ProgramFiles64Folder', 'ProgramFiles6432Folder', 'CommonFilesFolder', 'CommonFiles64Folder', 'CommonFiles6432Folder',
  'SystemFolder', 'System64Folder', 'System16Folder', 'System6432Folder', 'WindowsFolder', 'WindowsVolume', 'TempFolder', 'AppDataFolder',
  'LocalAppDataFolder', 'CommonAppDataFolder', 'DesktopFolder', 'StartMenuFolder', 'ProgramMenuFolder', 'StartupFolder', 'PersonalFolder',
  'FavoritesFolder', 'FontsFolder', 'SendToFolder', 'TemplateFolder', 'NetHoodFolder', 'PrintHoodFolder', 'RecentFolder', 'MyPicturesFolder',
  'AdminToolsFolder', 'ROOTDRIVE',
  // Windows Installer's own machine and user properties.
  'ComputerName', 'LogonUser', 'UserSID', 'UserLanguageID', 'SystemLanguageID', 'VersionNT', 'VersionNT64', 'WindowsBuild', 'ServicePackLevel',
  'Privileged', 'AdminUser', 'Intel', 'Intel64', 'Msix64', 'Date', 'Time', 'USERNAME', 'COMPANYNAME', 'INSTALLLEVEL',
])

/**
 * The [Name] references in `text` that nothing in this package sets. Skips Windows Installer's special forms ([#file], [!file], [$component],
 * [%ENV], [\x] escapes, [~] and numbered [1]) - only plain property names can go missing.
 */
export function unknownPropertyReferences(text: string, manifest: WinReleaseManifest): string[] {
  const authored = new Set(propertiesOf(manifest).map((p) => p.id))
  const unknown = new Set<string>()
  for (const match of text.matchAll(/\[([^[\]]+)\]/g)) {
    const name = match[1]
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) continue
    if (ALWAYS_SET.has(name) || authored.has(name)) continue
    unknown.add(name)
  }
  return [...unknown]
}

/** One sentence for the editor: which bracketed names in a registry entry will come out empty. */
export function unknownPropertyWarning(names: string[]): string {
  const list = names.map((n) => `[${n}]`).join(', ')
  return `${list} ${names.length === 1 ? "isn't a property" : "aren't properties"} this package sets, so Windows Installer will replace ${
    names.length === 1 ? 'it' : 'them'
  } with nothing. Add ${names.length === 1 ? 'it' : 'them'} under Advanced > Properties, or type the real text instead.`
}
