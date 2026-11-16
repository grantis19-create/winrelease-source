// GUID helpers for the Product Code / Upgrade Code fields (ADR 0054). One convention everywhere:
// UPPERCASE, 8-4-4-4-12, no braces - what the compiled MSI shows and what msiexec/Intune expect.

const GUID_PATTERN = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/

/** A fresh random (RFC 4122 version 4) GUID from the browser's cryptographic generator, uppercase. */
export function newGuid(): string {
  return crypto.randomUUID().toUpperCase()
}

/** Trims, strips `{}` braces and uppercases - safe to call on anything a user pastes. */
export function normalizeGuid(raw: string): string {
  return raw.trim().replace(/^\{|\}$/g, '').trim().toUpperCase()
}

export function isGuid(raw: string): boolean {
  return GUID_PATTERN.test(normalizeGuid(raw))
}

/** Brings a manifest's identifying GUIDs into the one UPPERCASE convention (older projects stored them lowercase). Leaves anything that isn't a GUID alone. */
export function normalizeManifestGuids<T extends { upgradeCode: string; productCode?: string | null }>(manifest: T): T {
  return {
    ...manifest,
    upgradeCode: isGuid(manifest.upgradeCode) ? normalizeGuid(manifest.upgradeCode) : manifest.upgradeCode,
    productCode: manifest.productCode && isGuid(manifest.productCode) ? normalizeGuid(manifest.productCode) : manifest.productCode,
  }
}
