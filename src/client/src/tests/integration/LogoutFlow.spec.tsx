import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { AuthProvider, useAuth } from '../../context/AuthContext'
import ProtectedRoute from '../../components/ProtectedRoute'

// Issue #3: logout -> ProtectedRoute must redirect to /login.
// Forward-compatible: the harness `await`s logout() so it works with both
// the current sync `() => void` and the intended `async (): Promise<void>`.

function Harness() {
  const { logout } = useAuth()
  const handleLogout = async () => {
    await logout()
  }
  return (
    <>
      <ProtectedRoute>
        <div>Secret Dashboard</div>
      </ProtectedRoute>
      <button type="button" onClick={handleLogout}>
        Logout
      </button>
    </>
  )
}

function renderHarness() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Harness />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('LogoutFlow (issue #3 — logout redirects protected tree to /login)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    // Best-effort server notify (intended state) resolves successfully.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ message: 'logged out successfully' }) }) as Response)
    )
    localStorage.setItem('mvp_token', 'token')
    localStorage.setItem('mvp_userId', 'user-1')
    localStorage.setItem('mvp_username', 'TestUser')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows protected content while authenticated', async () => {
    renderHarness()
    expect(await screen.findByText('Secret Dashboard')).toBeTruthy()
    expect(screen.queryByText(/please login/i)).toBeNull()
  })

  it('logout clears auth and ProtectedRoute renders "Please login"', async () => {
    const user = userEvent.setup()
    renderHarness()

    expect(await screen.findByText('Secret Dashboard')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /logout/i }))

    await waitFor(() => {
      expect(screen.getByText(/please login/i)).toBeTruthy()
    })
    expect(screen.queryByText('Secret Dashboard')).toBeNull()
    expect(localStorage.getItem('mvp_token')).toBeNull()
    expect(localStorage.getItem('mvp_userId')).toBeNull()
    expect(localStorage.getItem('mvp_username')).toBeNull()
  })

  it('logout still redirects even if the server notify fails (best-effort)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    const user = userEvent.setup()
    renderHarness()

    expect(await screen.findByText('Secret Dashboard')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /logout/i }))

    await waitFor(() => {
      expect(screen.getByText(/please login/i)).toBeTruthy()
    })
    expect(localStorage.getItem('mvp_token')).toBeNull()
  })
})
