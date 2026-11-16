import { apiSend } from './client'

interface DevTokenResponse {
  token: string
  expiresAtUtc: string
}

/** POST /api/dev/token - Development-only (see src/WinRelease.API/DevAuth/DevAuthEndpoints.cs, ADR 0032). 404s against a non-Development API. */
export function requestDevToken(displayName: string): Promise<DevTokenResponse> {
  return apiSend<DevTokenResponse>('POST', '/api/dev/token', { displayName })
}
