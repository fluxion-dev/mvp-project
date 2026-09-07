import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Dashboard from '../../pages/Dashboard'
import { AuthProvider } from '../../context/AuthContext'

// Mock the api module so Dashboard unit tests don't hit a real network.
// Follows DashboardCreate.spec.tsx pattern: only getStreams/createStream mocked.
vi.mock('../../services/api', async () => {
  const actual =
    await vi.importActual<typeof import('../../services/api')>('../../services/api')
  return {
    ...actual,
    getStreams: vi.fn(),
    createStream: vi.fn(),
  }
})

import { getStreams, createStream } from '../../services/api'

function renderDashboard(initialEntries: string[] = ['/']) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/stream/:id" element={<div>Stream Detail</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  )
}

describe('Dashboard streams list (issue #6) — Red', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(getStreams).mockReset()
    vi.mocked(createStream).mockReset()
    vi.mocked(createStream).mockResolvedValue({
      id: 'dummy',
      name: 'dummy',
      messageCount: 0,
      activityLevel: 0,
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders mocked list with name/activity and Link navigates to /stream/:id', async () => {
    const user = userEvent.setup()
    vi.mocked(getStreams).mockResolvedValue([
      { id: 's-1', name: 'General', messageCount: 5, activityLevel: 3 },
      { id: 's-2', name: 'Announcements', messageCount: 2, activityLevel: 1 },
    ])

    renderDashboard()

    // Names + activity metadata visible.
    expect(await screen.findByText('General')).toBeTruthy()
    expect(screen.getByText('Announcements')).toBeTruthy()
    expect(screen.getAllByText(/activity:/i)).toHaveLength(2)

    // Expected: Link cards (accessible links) to the detail route.
    // Current: <button>View → navigate() — no <a href>, so getByRole('link') fails (Red).
    const generalLink = screen.getByRole('link', { name: /general/i })
    expect(generalLink.getAttribute('href')).toBe('/stream/s-1')

    await user.click(generalLink)
    await waitFor(() => {
      expect(screen.getByText('Stream Detail')).toBeTruthy()
    })
  })

  it('shows loading indicator while streams promise is pending', async () => {
    let resolveFetch!: (value: { id: string; name: string; messageCount: number; activityLevel: number }[]) => void
    vi.mocked(getStreams).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve
      })
    )

    renderDashboard()

    // Expected: loading state (e.g. "Loading streams…"). Currently missing (Red).
    expect(screen.getByText(/loading/i)).toBeTruthy()

    resolveFetch([{ id: 's-1', name: 'General', messageCount: 0, activityLevel: 0 }])
    await waitFor(() => {
      expect(screen.getByText('General')).toBeTruthy()
    })
  })

  it('shows empty guidance when fetch resolves to []', async () => {
    vi.mocked(getStreams).mockResolvedValue([])

    renderDashboard()

    await waitFor(() => expect(getStreams).toHaveBeenCalled())

    // Expected: empty-state guidance. Currently bare <ul> (Red).
    expect(await screen.findByText(/no streams yet/i)).toBeTruthy()
  })

  it('shows role=alert + retry on fetch failure and preserves state across retry', async () => {
    const user = userEvent.setup()
    vi.mocked(getStreams).mockRejectedValueOnce(new Error('Failed to fetch streams'))
    vi.mocked(getStreams).mockResolvedValueOnce([
      { id: 's-1', name: 'General', messageCount: 0, activityLevel: 0 },
    ])

    renderDashboard()

    // Expected: inline error with role="alert" (Login.tsx pattern). Currently swallowed (Red).
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/failed to fetch|failed to load|error|try again/i)

    const retryButton = screen.getByRole('button', { name: /retry|try again/i })
    expect(retryButton).toBeTruthy()

    // State preserved: typed draft survives the error + retry cycle.
    const input =
      screen.queryByLabelText(/stream name|new stream/i) ??
      screen.getByPlaceholderText(/create new stream/i)
    await user.type(input, 'my-draft')

    await user.click(retryButton)

    await waitFor(() => {
      expect(getStreams).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.getByText('General')).toBeTruthy()
    })
    expect((input as HTMLInputElement).value).toBe('my-draft')
  })

  it('401 from getStreams triggers logout + navigate to /login', async () => {
    localStorage.setItem('mvp_token', 'expired-token')
    localStorage.setItem('mvp_userId', 'user-1')
    localStorage.setItem('mvp_username', 'TestUser')

    const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 })
    vi.mocked(getStreams).mockRejectedValueOnce(unauthorized)

    renderDashboard()

    await waitFor(() => expect(getStreams).toHaveBeenCalled())

    // Expected hardening (follows handleCreateStream 401 pattern from issue #5):
    // session cleared and user sent to /login. Currently swallowed (Red).
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeTruthy()
    })
    expect(localStorage.getItem('mvp_token')).toBeNull()
  })
})
