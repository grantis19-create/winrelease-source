/**
 * Mirrors WinRelease.Core.Manifest.VersionMapper.IsWellFormedProductVersion - Windows Installer's own
 * limits for Package/@Version (verified: wix 7.0.0 warns WIX1148 "unpredictable and undefined" beyond
 * them): exactly 3 numeric segments, major and minor 0-255, build 0-65535.
 */
export function isWellFormedProductVersion(version: string): boolean {
  const segments = version.split('.')
  if (segments.length !== 3) return false

  const maximums = [255, 255, 65535]
  return segments.every((segment, i) => /^\d+$/.test(segment) && Number(segment) <= maximums[i])
}

/**
 * Plain-language, non-blocking advice for a Product Version outside Windows Installer's documented range (ADR 0094).
 * The build still goes ahead - wix only warns - so this explains rather than forbids. Null when the version is fine.
 */
export function productVersionAdvice(version: string): string | null {
  if (version.trim() === '' || isWellFormedProductVersion(version)) return null

  return (
    `"${version}" isn't the usual major.minor.build (like 1.0.0, major and minor up to 255, build up to 65535). ` +
    'It will still build, but Windows Installer may treat it as unusual: validation tools such as Orca can flag it, and upgrades from or to this version might not behave as you expect.'
  )
}
