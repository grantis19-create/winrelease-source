import { HELPER_IS_SIGNED, HELPER_PUBLISHER } from './helperLinks'

/**
 * Every sentence on the site that depends on whether the released Helper is code-signed lives here, so the switch is one line in helperLinks.ts
 * (HELPER_IS_SIGNED, with HELPER_PUBLISHER set to the certificate's company name) in the same commit as the first signed release
 * (docs/roadmap/signing-setup.md). A Helper counts as signed only when both are set, so the site can never say "signed by" with no name.
 */
export interface SigningState {
  signed: boolean
  publisher: string
}

export const signingNow: SigningState = { signed: HELPER_IS_SIGNED && HELPER_PUBLISHER.trim() !== '', publisher: HELPER_PUBLISHER.trim() }

/** Setup guide: what to expect when running the downloaded file for the first time. */
export function smartScreenAdvice(s: SigningState = signingNow): string {
  return s.signed
    ? `A newly released file can still make Windows SmartScreen say “Windows protected your PC” until it has built up a reputation: choose More info, then Run anyway. The publisher should read ${s.publisher}; if it says Unknown publisher, do not run it.`
    : 'Early builds are not code-signed yet, so Windows SmartScreen may say “Windows protected your PC”: choose More info, then Run anyway.'
}

/** Settings > What is the Helper: the line under the SHA-256. */
export function smartScreenWhy(s: SigningState = signingNow): string {
  return s.signed
    ? `It is signed by ${s.publisher}: right-click the file, choose Properties, then Digital Signatures to see the publisher.`
    : 'Early builds are not code-signed yet, which is why Windows SmartScreen asks you to confirm.'
}

/** Build Help > Disclaimer. */
export function disclaimerSigningLine(s: SigningState = signingNow): string {
  return s.signed
    ? `The Helper is signed by ${s.publisher}. Check the publisher in the file's Properties > Digital Signatures, and its SHA-256 against the value shown in Settings. Windows may still ask you to confirm a newly released file.`
    : 'This is an early release. The Helper is not code-signed yet, so Windows may warn before running it: check its SHA-256 against the value shown in Settings.'
}

/** Release notes > Known limitations. Null once signed: there is no longer a limitation to state. */
export function unsignedLimitation(s: SigningState = signingNow): string | null {
  return s.signed
    ? null
    : 'The Helper is an unsigned pre-release, so Windows may show an "unknown publisher" warning the first time you run it. Check the SHA-256 in the card above against your download.'
}

/** Release notes: the download card's subtitle after the date. */
export function releaseLabel(s: SigningState = signingNow): string {
  return s.signed ? `signed by ${s.publisher}` : 'pre-release, unsigned'
}

/** Front page: the sentence before the link to the release notes. */
export function landingNote(s: SigningState = signingNow): string {
  return s.signed ? `The Helper is signed by ${s.publisher}; its SHA-256 is on the` : 'The Helper is an unsigned pre-release; its SHA-256 is on the'
}
