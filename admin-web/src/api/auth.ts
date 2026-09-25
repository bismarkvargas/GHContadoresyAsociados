import { get, post, tokenStore } from './client'
import type { AuthUser, LoginResponse } from '@/types'

export async function login(
  email: string,
  password: string,
  remember: boolean,
): Promise<LoginResponse> {
  const data = await post<LoginResponse>('/auth/login', { email, password })
  tokenStore.save(data.accessToken, data.refreshToken, remember)
  return data
}

export async function logout(): Promise<void> {
  try {
    await post('/auth/logout', { refreshToken: tokenStore.refresh })
  } finally {
    tokenStore.clear()
  }
}

export async function me(): Promise<{
  user: AuthUser
  roles: string[]
  permissions: string[]
}> {
  return get('/auth/me')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await post('/auth/change-password', { currentPassword, newPassword })
}

export async function forgotPassword(email: string): Promise<void> {
  await post('/auth/forgot-password', { email })
}
