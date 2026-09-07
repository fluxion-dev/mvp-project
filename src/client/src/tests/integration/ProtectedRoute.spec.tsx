import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAuth } from '../../context/AuthContext'
import { AuthProvider } from '../../context/AuthContext'
import React from 'react'

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('ProtectedRoute', () => {
  it('should have no token when unauthenticated', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.token).toBeUndefined()
  })

  it('should have token when authenticated', () => {
    localStorage.setItem('mvp_token', 'token')
    localStorage.setItem('mvp_userId', 'user-1')
    localStorage.setItem('mvp_username', 'TestUser')

    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.token).toBe('token')
  })
})
