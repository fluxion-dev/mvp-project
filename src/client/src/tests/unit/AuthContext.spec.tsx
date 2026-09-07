import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuth } from '../../context/AuthContext'
import { AuthProvider } from '../../context/AuthContext'
import React from 'react'

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('should initialize with no auth state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.token).toBeUndefined()
    expect(result.current.userId).toBeUndefined()
    expect(result.current.username).toBeUndefined()
  })

  it('should restore auth from localStorage on init', () => {
    localStorage.setItem('mvp_token', 'test-token')
    localStorage.setItem('mvp_userId', 'user-123')
    localStorage.setItem('mvp_username', 'TestUser')

    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.token).toBe('test-token')
    expect(result.current.userId).toBe('user-123')
    expect(result.current.username).toBe('TestUser')
  })

  it('should set auth on login', async () => {
    // Mock the API login to return a token
    const mockLogin = async () => ({
      token: 'mock-jwt-token',
      user: { id: 'user-1', email: 'test@example.com', displayName: 'Test User' },
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      result.current.setAuth(await mockLogin())
    })

    expect(localStorage.getItem('mvp_token')).toBe('mock-jwt-token')
    expect(localStorage.getItem('mvp_userId')).toBe('user-1')
  })

  it('should set auth via setAuth', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      result.current.setAuth({
        token: 'jwt-token',
        user: { id: 'user-1', email: 'test@example.com', displayName: 'Test User' },
      })
    })

    expect(result.current.token).toBe('jwt-token')
    expect(result.current.userId).toBe('user-1')
    expect(result.current.username).toBe('Test User')
    expect(localStorage.getItem('mvp_token')).toBe('jwt-token')
  })

  // Forward-compatible with issue #3 intended `async logout(): Promise<void>`
  // (await works against both the current sync impl and the future async one).
  it('should clear auth on logout', async () => {
    localStorage.setItem('mvp_token', 'token')
    localStorage.setItem('mvp_userId', 'user-1')
    localStorage.setItem('mvp_username', 'TestUser')

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.token).toBeUndefined()
    expect(result.current.userId).toBeUndefined()
    expect(result.current.username).toBeUndefined()
    expect(localStorage.getItem('mvp_token')).toBeNull()
    expect(localStorage.getItem('mvp_userId')).toBeNull()
    expect(localStorage.getItem('mvp_username')).toBeNull()
  })

  // Issue #4 Option A: AuthContext must expose isAuthenticated = !!token.
  describe('isAuthenticated (issue #4 Option A)', () => {
    it('is false when unauthenticated', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('is true when token is present', () => {
      localStorage.setItem('mvp_token', 'test-token')
      localStorage.setItem('mvp_userId', 'user-123')
      localStorage.setItem('mvp_username', 'TestUser')

      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(result.current.isAuthenticated).toBe(true)
    })
  })
})
