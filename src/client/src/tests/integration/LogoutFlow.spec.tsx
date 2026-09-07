import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import React from 'react'
import { AuthProvider, useAuth } from '../../context/AuthContext'
import ProtectedRoute from '../../components/ProtectedRoute'
import Login from '../../pages/Login'

// Issue #3: logout -> ProtectedRoute must redirect to /login.
// Issue #4 Option A: unauth renders <Navigate to="/login" replace /> with
// NO "Please login" flash. Harness wires real Routes so Navigate lands on
// the real Login form; LocationDisplay asserts the redirect target.

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

// Forward-compatible: the harness `await`s logout() so it works with both
// the current sync `() => void` and the intended `async (): Promise<void>`.

function Harness() {
  const { logout } = useAuth()
  const handleLogout = async () => {
    await logout()
  }
  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>Secret Dashboard</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />
      </Routes>
      <button type="button" onClick={handleLogout}>
        Logout
      </button>
      <LocationDisplay />
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
    expect(screen.getByTestId('location').textContent).toBe('/')
    expect(screen.queryByLabelText(/email/i)).toBeNull()
  })

  it('logout clears auth and redirects to /login with NO "Please login" flash', async () => {
    const user = userEvent.setup()
    renderHarness()

    expect(await screen.findByText('Secret Dashboard')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /logout/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/login')
    })
    // Real Login form is rendered — email field + heading prove the route.
    expect(screen.getByRole('heading', { name: /login/i })).toBeTruthy()
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.queryByText(/please login/i)).toBeNull()
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
      expect(screen.getByTestId('location').textContent).toBe('/login')
    })
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.queryByText(/please login/i)).toBeNull()
    expect(localStorage.getItem('mvp_token')).toBeNull()
  })
})
