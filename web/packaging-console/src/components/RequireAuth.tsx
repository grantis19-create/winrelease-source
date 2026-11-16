import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { getToken } from '../api/authToken'
import { getCurrentAccountId } from '../api/currentAccount'
import { isMvpMode } from '../mode'

export function RequireAuth({ children }: { children: ReactNode }) {
  // MVP mode has no login and no server-side accounts (docs/roadmap/free-compiler-mvp.md).
  if (!isMvpMode() && (!getToken() || !getCurrentAccountId())) {
    return <Navigate to="/login" replace />
  }
  return children
}
