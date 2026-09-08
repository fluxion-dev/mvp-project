import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StreamPage from '../../pages/StreamPage'
import { AuthProvider } from '../../context/AuthContext'

// Mock the api module so StreamPage unit tests don't hit a real network.
// Follows StreamPost.spec.tsx pattern: only getMessages/addMessage mocked.
vi.mock('../../services/api', async () => {
  const actual =
    await vi.importActual<typeof import('../../services/api')>('../../services/api')
  return {
    ...actual,
    getMessages: vi.fn(),
    addMessage: vi.fn(),
  }
})

import { getMessages, addMessage } from '../../services/api'

function renderStreamPage(initialEntries: string[] = ['/stream/s-1']) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/stream/:id" element={<StreamPage />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  )
}

function seedAuth() {
  localStorage.setItem('mvp_token', 'valid-token')
  localStorage.setItem('mvp_userId', 'user-1')
  localStorage.setItem('mvp_username', 'TestUser')
}

function getMessageInput() {
  return (
    screen.queryByLabelText(/message|add a message/i) ??
    screen.getByPlaceholderText(/add a message/i)
  )
}

describe('StreamPage view messages (issue #8) — Red', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(getMessages).mockReset()
    vi.mocked(addMessage).mockReset()
    // Default addMessage resolves so the post form never crashes on
    // `undefined.id` during view-focused tests.
    vi.mocked(addMessage).mockResolvedValue({
      id: 'dummy',
      streamId: 's-1',
      content: 'dummy',
      createdAt: new Date().toISOString(),
      user: { id: 'user-1', username: 'TestUser' },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading indicator while messages promise is pending', async () => {
    let resolveFetch!: (value: {
      id: string
      streamId: string
      content: string
      createdAt: string
      user: { id: string; username: string }
    }[]) => void
    vi.mocked(getMessages).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve
      })
    )

    renderStreamPage()

    // Expected: loading state (e.g. "Loading messages…"). Currently missing (Red).
    expect(screen.getByText(/loading/i)).toBeTruthy()

    resolveFetch([
      {
        id: 'm-1',
        streamId: 's-1',
        content: 'hello',
        createdAt: new Date().toISOString(),
        user: { id: 'user-1', username: 'alice' },
      },
    ])
    await waitFor(() => {
      expect(screen.getByText('hello')).toBeTruthy()
    })
  })

  it('shows empty guidance when fetch resolves to []', async () => {
    vi.mocked(getMessages).mockResolvedValue([])

    renderStreamPage()

    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('s-1'))

    // Expected: empty-state guidance. Currently bare .message-list div (Red).
    expect(await screen.findByText(/no messages yet/i)).toBeTruthy()
  })

  it('renders author + timestamp for each message', async () => {
    const createdAt = new Date('2026-01-02T15:04:05.000Z').toISOString()
    vi.mocked(getMessages).mockResolvedValue([
      {
        id: 'm-1',
        streamId: 's-1',
        content: 'hello stream',
        createdAt,
        user: { id: 'user-1', username: 'alice' },
      },
      {
        id: 'm-2',
        streamId: 's-1',
        content: 'second message',
        createdAt,
        user: { id: 'user-2', username: 'bob' },
      },
    ])

    renderStreamPage()

    // Author + content visible per message.
    expect(await screen.findByText('alice')).toBeTruthy()
    expect(screen.getByText('bob')).toBeTruthy()
    expect(screen.getByText('hello stream')).toBeTruthy()
    expect(screen.getByText('second message')).toBeTruthy()
    // Timestamp rendered alongside each message (toLocaleTimeString path).
    const expectedTime = new Date(createdAt).toLocaleTimeString()
    expect(screen.getAllByText(expectedTime)).toHaveLength(2)
  })

  it('shows role=alert + Retry on fetch failure and preserves draft across retry', async () => {
    const user = userEvent.setup()
    seedAuth()
    vi.mocked(getMessages).mockRejectedValueOnce(new Error('Failed to fetch messages'))
    vi.mocked(getMessages).mockResolvedValueOnce([])

    renderStreamPage()

    // Expected: inline error with role="alert" (DashboardList pattern).
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/failed to fetch|failed to load|error|try again/i)

    const retryButton = screen.getByRole('button', { name: /retry|try again/i })
    expect(retryButton).toBeTruthy()

    // Draft typed before retry survives the error + retry cycle.
    const input = getMessageInput()
    await user.type(input, 'my-draft')

    await user.click(retryButton)

    await waitFor(() => {
      expect(getMessages).toHaveBeenCalledTimes(2)
    })
    expect((input as HTMLInputElement).value).toBe('my-draft')
  })

  it('401 from getMessages triggers logout + navigate to /login', async () => {
    seedAuth()

    const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 })
    vi.mocked(getMessages).mockRejectedValueOnce(unauthorized)

    renderStreamPage()

    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('s-1'))

    // Expected hardening (follows StreamPost 401 pattern):
    // session cleared and user sent to /login.
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeTruthy()
    })
    expect(localStorage.getItem('mvp_token')).toBeNull()
  })

  it('404 from getMessages shows Stream not found (getMessages attaches status)', async () => {
    // getMessages attaches .status like addMessage does post-#7, so the page
    // can branch on 404. Generic message forces the page to map 404 itself.
    const notFound = Object.assign(new Error('Not Found'), { status: 404 })
    vi.mocked(getMessages).mockRejectedValueOnce(notFound)

    renderStreamPage()

    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('s-1'))

    // Expected: distinct 404 empty-state, not the generic fetch error (Red).
    expect(await screen.findByText(/stream not found/i)).toBeTruthy()
  })
})
