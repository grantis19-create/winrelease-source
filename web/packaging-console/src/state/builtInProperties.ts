import type { WinReleaseManifest } from '../types/manifest'

export interface BuiltInProperty {
  id: string
  /** What goes in the MSI's Property table, or null when the property is left out on purpose (shown with `absentNote`). */
  value: string | null
  absentNote?: string
  /** Which setting in the editor decides it. */
  setBy: string
}

/**
 * The properties WinRelease writes into every MSI itself, as WxsGenerator (and WiX for its Package attributes) produce them - so a packager
 * who opens the MSI in Orca is not surprised, and knows which setting to change. Checked against real wix 7 builds (2026-10-29): per-machine
 * writes ALLUSERS=1, per-user writes no ALLUSERS at all; ProductLanguage is 1033 with the installer screens (WixUI is English), 0 without;
 * the screens also add ARPNOMODIFY=1 and WIXUI_INSTALLDIR, plus internal ones (DefaultUIFont, ErrorDialog, ...) not listed here.
 * The Properties toggles and custom properties are listed by the section itself, not here.
 */
export function builtInProperties(
  manifest: WinReleaseManifest,
  resolved: { productCode?: string; productVersion?: string } = {},
): BuiltInProperty[] {
  const app = manifest.appInfo
  // Absent means on (new projects show the wizard), the same rule the App Info checkbox uses.
  const wizard = app.installWizard !== false
  const rows: BuiltInProperty[] = [
    app.installScope === 'perUser'
      ? { id: 'ALLUSERS', value: null, absentNote: 'not set - a per-user install', setBy: 'App Info > Install Scope' }
      : { id: 'ALLUSERS', value: '1', setBy: 'App Info > Install Scope (per-machine)' },
    { id: 'ProductName', value: manifest.name, setBy: 'General > Product Name' },
    { id: 'Manufacturer', value: manifest.manufacturer, setBy: 'General > Manufacturer' },
    {
      id: 'ProductVersion',
      value: manifest.productVersion || resolved.productVersion || manifest.displayVersion,
      setBy: 'General > Product Version',
    },
    {
      id: 'ProductCode',
      value: (manifest.productCode || resolved.productCode || '').toUpperCase() || null,
      absentNote: 'worked out from the Upgrade Code and version - shown once the Helper has checked the project',
      setBy: 'General > Product Code',
    },
    { id: 'UpgradeCode', value: `{${manifest.upgradeCode.toUpperCase().replace(/[{}]/g, '')}}`, setBy: 'General > Upgrade Code' },
    {
      id: 'ProductLanguage',
      value: wizard ? '1033' : '0',
      setBy: wizard ? 'App Info > Show an install wizard (its screens are English)' : 'WinRelease (0 = language neutral)',
    },
  ]

  const arpText: [string, string | null | undefined, string][] = [
    ['ARPHELPLINK', app.supportUrl, 'Support Link'],
    ['ARPURLUPDATEINFO', app.updateUrl, 'Update Info Link'],
    ['ARPURLINFOABOUT', app.aboutUrl, 'Website / Home Page'],
    ['ARPHELPTELEPHONE', app.supportPhone, 'Support Telephone'],
    ['ARPCONTACT', app.contact, 'Contact Person'],
    ['ARPCOMMENTS', app.comments, 'Comments / Description'],
  ]
  for (const [id, value, label] of arpText) {
    if (value) rows.push({ id, value, setBy: `App Info > ${label}` })
  }

  if (app.disableModify || wizard) {
    rows.push({ id: 'ARPNOMODIFY', value: '1', setBy: wizard ? 'App Info > Show an install wizard (it has no Modify page)' : 'App Info > Disable Modify Button' })
  }
  if (app.disableRepair) rows.push({ id: 'ARPNOREPAIR', value: '1', setBy: 'App Info > Disable Repair Button' })
  if (app.disableRemove) rows.push({ id: 'ARPNOREMOVE', value: '1', setBy: 'App Info > Disable Remove / Uninstall Button' })
  if (app.hideFromControlPanel) rows.push({ id: 'ARPSYSTEMCOMPONENT', value: '1', setBy: 'App Info > Do not show in Installed Apps' })
  if (app.iconPath || app.autoExtractIcon) {
    rows.push({ id: 'ARPPRODUCTICON', value: '(the app icon)', setBy: app.iconPath ? 'App Info > App / Control Panel Icon' : 'App Info > App / Control Panel Icon (from the main exe, when it has one)' })
  }
  if (wizard) rows.push({ id: 'WIXUI_INSTALLDIR', value: 'INSTALLFOLDER', setBy: 'App Info > Show an install wizard (its folder page)' })

  return rows
}
