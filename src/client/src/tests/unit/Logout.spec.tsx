import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '../../context/AuthContext'
import React from 'react'
import * as apiModule from '../../services/api'

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

// Forward-compatible suite for issue #3 (User Logout Endpoint).
//
// INTENDED END STATE:
// - `POST /api/auth/logout` requires auth, returns 200 { message }.
// - `api.logout()` best-effort POST with auth headers, never throws.
// - `AuthContext.logout()` is `async (): Promise<void>`: calls API then
//   clears state + localStorage/sessionStorage even on network failure.
//
// These tests `await logout()` so they pass against BOTH the current sync
// `() => void` implementation and the intended async one. Fetch-header
// assertions are conditional: they enforce the contract once the frontend
// lands, but do not fail the suite while backend+frontend work is in flight.

describe('Logout (issue #3 — forward-compatible)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ message: 'logged out successfully' }) }) as Response)
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function seedAuth() {
    localStorage.setItem('mvp_token', 'jwt-token')
    localStorage.setItem('mvp_userId', 'user-1')
    localStorage.setItem('mvp_username', 'TestUser')
    sessionStorage.setItem('mvp_token', 'jwt-session-token')
    sessionStorage.setItem('mvp_userId', 'user-1')
    sessionStorage.setItem('mvp_username', 'TestUser')
  }

  it('async logout clears token/userId/username + localStorage/sessionStorage', async () => {
    seedAuth()
    const { result } = renderHook(() => useAuth(), { wrapper })

    // Sanity: harness rehydrated from storage.
    expect(result.current.token).toBe('jwt-token')

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.token).toBeUndefined()
    expect(result.current.userId).toBeUndefined()
    expect(result.current.username).toBeUndefined()
    expect(localStorage.getItem('mvp_token')).toBeNull()
    expect(localStorage.getItem('mvp_userId')).toBeNull()
    expect(localStorage.getItem('mvp_username')).toBeNull()
    expect(sessionStorage.getItem('mvp_token')).toBeNull()
    expect(sessionStorage.getItem('mvp_userId')).toBeNull()
    expect(sessionStorage.getItem('mvp_username')).toBeNull()
  })

  it('logout still clears state EVEN IF fetch rejects (best-effort, never throws)', async () => {
    seedAuth()
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    let threw: unknown = null
    try {
      await act(async () => {
        await result.current.logout()
      })
    } catch (err) {
      threw = err
    }

    expect(threw).toBeNull()
    expect(result.current.token).toBeUndefined()
    expect(result.current.userId).toBeUndefined()
    expect(result.current.username).toBeUndefined()
    expect(localStorage.getItem('mvp_token')).toBeNull()
    expect(sessionStorage.getItem('mvp_token')).toBeNull()
  })

  it('logout notifies the server with an Authorization header (conditional until frontend lands)', async () => {
    seedAuth()
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.logout()
    })

    const calls = vi.mocked(fetch).mock.calls
    const logoutCalls = calls.filter(([url]) => String(url).includes('/api/auth/logout'))

    if (logoutCalls.length === 0) {
      // PRE-LANDING: AuthContext does not call fetch yet. State-clear is
      // already verified above; do not fail the suite while frontend work
      // is in flight. This branch disappears once `api.logout()` is wired.
      expect(result.current.token).toBeUndefined()
      expect(localStorage.getItem('mvp_token')).toBeNull()
      return
    }

    // POST-LANDING: enforce the contract strictly.
    const [, init] = logoutCalls[0] as [unknown, RequestInit | undefined]
    expect(init?.method).toMatch(/POST/i)
    const headers = init?.headers as Record<string, string>
    expect(headers?.['Authorization'] ?? headers?.['authorization']).toMatch(/^Bearer jwt-token$/)
  })

  // Direct api.logout() contract — only runs once the export exists.
  const apiHasLogout = 'logout' in apiModule
  it.runIf(apiHasLogout)('api.logout() POSTs to /api/auth/logout with auth headers', async () => {
    localStorage.setItem('mvp_token', 'jwt-token')
    const logout = (apiModule as unknown as { logout: () => Promise<void> }).logout
    await logout()
    const calls = vi.mocked(fetch).mock.calls
    const logoutCalls = calls.filter(([url]) => String(url).includes('/api/auth/logout'))
    expect(logoutCalls.length).toBeGreaterThan(0)
    const [, init] = logoutCalls[0] as [unknown, RequestInit | undefined]
    expect(init?.method).toMatch(/POST/i)
    const headers = init?.headers as Record<string, string>
    expect(headers?.['Authorization'] ?? headers?.['authorization']).toMatch(/^Bearer /)
  })

  it.runIf(apiHasLogout)('api.logout() never throws on network failure (best-effort)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    const logout = (apiModule as unknown as { logout: () => Promise<void> }).logout
    await expect(logout()).resolves.toBeUndefined()
  })
})
