import { apiGet, apiSend } from './client'
import type { AccountView, StorageConnectionRequest, WebhookConfigView } from '../types/domain'

export function createAccount(name: string): Promise<AccountView> {
  return apiSend<AccountView>('POST', '/api/accounts', { name })
}

export function getAccount(id: string): Promise<AccountView> {
  return apiGet<AccountView>(`/api/accounts/${id}`)
}

export function setAccountStorage(id: string, storage: StorageConnectionRequest): Promise<AccountView> {
  return apiSend<AccountView>('PUT', `/api/accounts/${id}/storage`, storage)
}

export function setAccountWebhook(id: string, webhook: WebhookConfigView | null): Promise<AccountView> {
  return apiSend<AccountView>('PUT', `/api/accounts/${id}/webhook`, webhook)
}
