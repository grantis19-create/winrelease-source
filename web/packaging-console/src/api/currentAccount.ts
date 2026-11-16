import { isMvpMode } from '../mode'
import { LOCAL_ACCOUNT_ID } from '../state/localProjects'

const STORAGE_KEY = 'winrelease.accountId'

/**
 * The Console assumes a single working Account per browser (see ADR 0032 -
 * Account has no ownership tie to the JWT subject yet, so there's no "list my
 * accounts" to switch between). Created once on first use and remembered here.
 * MVP mode has no Accounts at all, so it always reports a fixed local one.
 */
export function getCurrentAccountId(): string | null {
  if (isMvpMode()) return LOCAL_ACCOUNT_ID
  return localStorage.getItem(STORAGE_KEY)
}

export function setCurrentAccountId(accountId: string): void {
  localStorage.setItem(STORAGE_KEY, accountId)
}
