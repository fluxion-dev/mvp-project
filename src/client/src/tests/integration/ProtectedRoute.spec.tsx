import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '../../components/ProtectedRoute'
import { AuthProvider } from '../../context/AuthContext'

function renderProtected(initialEntries: string[]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  )
}

describe('ProtectedRoute (issue #4 Option A)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('redirects unauthenticated users to /login with NO "Please login" flash', async () => {
    // Direct render (no /login Route to unmount onto): old
    // useEffect+navigate+div implementation stays mounted and shows the
    // "Please login" flash here. Option A (<Navigate replace />) renders
    // null and never shows the flash — so this assertion Reds now.
    const { unmount } = render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/protected']}>
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        </MemoryRouter>
      </AuthProvider>
    )
    expect(screen.queryByText(/please login/i)).toBeNull()
    unmount()

    // Full route integration: must land on /login.
    renderProtected(['/protected'])
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeTruthy()
    })
    expect(screen.queryByText('Protected Content')).toBeNull()
  })

  it('renders children when authenticated', async () => {
    localStorage.setItem('mvp_token', 'test-token')
    localStorage.setItem('mvp_userId', 'user-1')
    localStorage.setItem('mvp_username', 'TestUser')

    renderProtected(['/protected'])

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeTruthy()
    })
    expect(screen.queryByText('Login Page')).toBeNull()
    expect(screen.queryByText(/please login/i)).toBeNull()
  })
})
