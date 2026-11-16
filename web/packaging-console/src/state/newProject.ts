import { createEmptyManifest, type WinReleaseManifest } from '../types/manifest'
import { defaultTargetDirectory } from './installTargets'

/** A new project from the "New project" dialog (ADR 0049): identity filled in, install directory derived from it. */
export function buildNewProjectManifest(input: { name: string; manufacturer: string; version: string }): WinReleaseManifest {
  const name = input.name.trim()
  const manufacturer = input.manufacturer.trim()
  return {
    ...createEmptyManifest(),
    name,
    manufacturer,
    displayVersion: input.version.trim() || '1.0.0',
    targetDirectory: defaultTargetDirectory('', ''),
  }
}
