import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminDashboard from '../../pages/admin/AdminDashboard'
import { AuthProvider } from '../../context/AuthContext'

// Mock the api module so AdminDashboard unit tests don't hit a real network.
vi.mock('../../services/api', async () => {
  const actual =
    await vi.importActual<typeof import('../../services/api')>('../../services/api')
  return {
    ...actual,
    getStreams: vi.fn(),
    deleteStream: vi.fn(),
    getMessages: vi.fn(),
    deleteMessage: vi.fn(),
  }
})

import { getStreams, getMessages } from '../../services/api'

function renderAdmin(initialEntries: string[] = ['/admin']) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  )
}

function mockStreams() {
  vi.mocked(getStreams).mockResolvedValue([
    { id: 's-1', name: 'General', messageCount: 1, activityLevel: 1 },
    { id: 's-2', name: 'Random', messageCount: 0, activityLevel: 0 },
  ])
}

describe('AdminDashboard hardening (issue #16) — Red', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(getStreams).mockReset()
    vi.mocked(getMessages).mockReset()
    mockStreams()
    vi.mocked(getMessages).mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders stream names (not just Stream {id})', async () => {
    renderAdmin()
    // Streams carry names; admin list must surface them.
    // Current: stores string[] ids and renders `Stream {id}`, dropping name (Red).
    expect(await screen.findByText('General')).toBeTruthy()
    expect(screen.getByText('Random')).toBeTruthy()
  })

  it('View button loads messages for the selected stream', async () => {
    vi.mocked(getMessages).mockResolvedValue([
      {
        id: 'm-1',
        streamId: 's-1',
        content: 'hello admin',
        createdAt: new Date().toISOString(),
        user: { id: 'user-1', username: 'alice' },
      },
    ])
    renderAdmin()
    expect(await screen.findByText('General')).toBeTruthy()

    const viewButtons = screen.getAllByRole('button', { name: /view|select/i })
    fireEvent.click(viewButtons[0])

    expect(await screen.findByText('hello admin')).toBeTruthy()
    expect(getMessages).toHaveBeenCalledWith('s-1')
  })

  it('Select dropdown loads messages for the chosen stream', async () => {
    vi.mocked(getMessages).mockResolvedValue([
      {
        id: 'm-9',
        streamId: 's-2',
        content: 'select-loaded message',
        createdAt: new Date().toISOString(),
        user: { id: 'user-2', username: 'bob' },
      },
    ])
    renderAdmin()
    expect(await screen.findByText('General')).toBeTruthy()

    // Expected: a labeled Select wired to handleStreamSelect.
    // Currently no Select element exists (Red).
    const select = screen.getByLabelText(/select stream/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 's-2' } })

    expect(await screen.findByText('select-loaded message')).toBeTruthy()
    expect(getMessages).toHaveBeenCalledWith('s-2')
  })

  it('shows loading indicator while streams promise is pending', async () => {
    let resolveFetch!: (value: { id: string; name: string; messageCount: number; activityLevel: number }[]) => void
    vi.mocked(getStreams).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve
      })
    )
    renderAdmin()

    // Expected: loading state. Currently missing (Red).
    expect(screen.getByText(/loading/i)).toBeTruthy()

    resolveFetch([{ id: 's-1', name: 'General', messageCount: 0, activityLevel: 0 }])
    await waitFor(() => {
      expect(screen.getByText('General')).toBeTruthy()
    })
  })

  it('shows empty guidance when fetch resolves to []', async () => {
    vi.mocked(getStreams).mockResolvedValue([])
    renderAdmin()

    await waitFor(() => expect(getStreams).toHaveBeenCalled())

    // Expected: empty-state guidance. Currently bare <ul> (Red).
    expect(await screen.findByText(/no streams/i)).toBeTruthy()
  })

  it('shows role=alert + Retry on fetch failure and recovers on retry', async () => {
    const user = userEvent.setup()
    vi.mocked(getStreams).mockRejectedValueOnce(new Error('Failed to fetch streams'))
    vi.mocked(getStreams).mockResolvedValueOnce([
      { id: 's-1', name: 'General', messageCount: 0, activityLevel: 0 },
    ])
    renderAdmin()

    // Expected: inline error with role="alert" (Dashboard pattern). Currently swallowed (Red).
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/failed to fetch|failed to load|error/i)

    const retryButton = screen.getByRole('button', { name: /retry|try again/i })
    await user.click(retryButton)

    await waitFor(() => {
      expect(getStreams).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('General')).toBeTruthy()
  })

  it('message delete buttons say Delete (not Del)', async () => {
    vi.mocked(getMessages).mockResolvedValue([
      {
        id: 'm-1',
        streamId: 's-1',
        content: 'first message',
        createdAt: new Date().toISOString(),
        user: { id: 'user-1', username: 'alice' },
      },
      {
        id: 'm-2',
        streamId: 's-1',
        content: 'second message',
        createdAt: new Date().toISOString(),
        user: { id: 'user-2', username: 'bob' },
      },
    ])
    renderAdmin()
    expect(await screen.findByText('General')).toBeTruthy()

    const viewButtons = screen.getAllByRole('button', { name: /view|select/i })
    fireEvent.click(viewButtons[0])
    expect(await screen.findByText('first message')).toBeTruthy()

    // Expected: full "Delete" labels. Currently abbreviated "Del" (Red).
    expect(screen.queryByRole('button', { name: /^del$/i })).toBeNull()
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    // 2 stream rows + 2 message rows = 4 Delete buttons.
    expect(deleteButtons).toHaveLength(4)
  })
})
