import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StreamPage from '../../pages/StreamPage'
import { AuthProvider } from '../../context/AuthContext'

// Mock the api module so StreamPage unit tests don't hit a real network.
// getMessages/addMessage are the only StreamPage dependencies; keep the
// rest (logout/login/register) as the real implementation.
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

describe('StreamPage post message (issue #7) — Red', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(getMessages).mockReset()
    vi.mocked(addMessage).mockReset()
    // StreamPage fetches messages on mount; default to empty.
    vi.mocked(getMessages).mockResolvedValue([])
    // Default addMessage resolves so incidental calls don't crash on
    // `undefined.id`; Red assertions still fail on missing alert / call.
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

  it('shows inline validation error for empty content and does NOT call addMessage', async () => {
    const user = userEvent.setup()
    seedAuth()
    renderStreamPage()

    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('s-1'))

    // Submit with empty draft (required attribute would block native submit,
    // but programmatic submit / Enter still reaches the handler path).
    await user.click(screen.getByRole('button', { name: /^post$/i }))

    // Expected hardening: inline error with role="alert" (Login.tsx pattern).
    // Currently handleSendMessage silently returns → Red.
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/message is required|required|empty|enter/i)
    expect(addMessage).not.toHaveBeenCalled()
  })

  it('shows inline validation error for whitespace-only content', async () => {
    const user = userEvent.setup()
    seedAuth()
    renderStreamPage()

    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('s-1'))

    const input = getMessageInput()
    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: /^post$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/message is required|required|empty|enter/i)
    expect(addMessage).not.toHaveBeenCalled()
  })

  it('rejects messages longer than 500 chars and does NOT call addMessage', async () => {
    const user = userEvent.setup()
    seedAuth()
    renderStreamPage()

    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('s-1'))

    const longContent = 'a'.repeat(501)
    const input = getMessageInput()
    // Bypass native maxLength (jsdom truncates typed input, so user.type can
    // never exceed it). fireEvent.change sets the 501-char value directly so
    // the >500 guard is exercised (paste / programmatic path).
    fireEvent.change(input, { target: { value: longContent } })
    await user.click(screen.getByRole('button', { name: /^post$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/500|too long|max/i)
    expect(addMessage).not.toHaveBeenCalled()
  })

  it('success appends message without reload and clears the input', async () => {
    const user = userEvent.setup()
    seedAuth()
    vi.mocked(addMessage).mockResolvedValueOnce({
      id: 'm-1',
      streamId: 's-1',
      content: 'hello stream',
      createdAt: new Date().toISOString(),
      user: { id: 'user-1', username: 'TestUser' },
    })
    renderStreamPage()

    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('s-1'))
    const fetchCalls = vi.mocked(getMessages).mock.calls.length

    const input = getMessageInput()
    await user.type(input, 'hello stream')
    await user.click(screen.getByRole('button', { name: /^post$/i }))

    await waitFor(() => {
      expect(screen.getByText('hello stream')).toBeTruthy()
    })
    expect((input as HTMLInputElement).value).toBe('')
    // No full reload: getMessages not re-fetched after post.
    expect(vi.mocked(getMessages).mock.calls.length).toBe(fetchCalls)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows role=alert + preserves draft + retry works on post failure (non-401)', async () => {
    const user = userEvent.setup()
    seedAuth()
    vi.mocked(addMessage).mockRejectedValueOnce(new Error('Failed to add message'))
    vi.mocked(addMessage).mockResolvedValueOnce({
      id: 'm-2',
      streamId: 's-1',
      content: 'retry draft',
      createdAt: new Date().toISOString(),
      user: { id: 'user-1', username: 'TestUser' },
    })
    renderStreamPage()

    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('s-1'))

    const input = getMessageInput()
    await user.type(input, 'retry draft')
    await user.click(screen.getByRole('button', { name: /^post$/i }))

    // Expected: inline error with role="alert". Currently swallowed (Red).
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/failed|error|try again/i)
    // Draft preserved after failure.
    expect((input as HTMLInputElement).value).toBe('retry draft')

    // Retry succeeds (click Post again).
    await user.click(screen.getByRole('button', { name: /^post$/i }))
    await waitFor(() => {
      expect(screen.getByText('retry draft')).toBeTruthy()
    })
  })

  it('shows role=alert + retry on fetch failure and preserves draft across retry', async () => {
    const user = userEvent.setup()
    seedAuth()
    vi.mocked(getMessages).mockRejectedValueOnce(new Error('Failed to fetch messages'))
    vi.mocked(getMessages).mockResolvedValueOnce([])
    renderStreamPage()

    // Expected: inline error with role="alert" (Login.tsx pattern).
    // Currently fetch errors are console.error-only (Red).
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

  it('401 from addMessage triggers logout + navigate to /login (currently swallowed)', async () => {
    const user = userEvent.setup()
    seedAuth()

    const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 })
    vi.mocked(addMessage).mockRejectedValueOnce(unauthorized)
    renderStreamPage()

    await waitFor(() => expect(getMessages).toHaveBeenCalledWith('s-1'))

    const input = getMessageInput()
    await user.type(input, 'hello')
    await user.click(screen.getByRole('button', { name: /^post$/i }))

    // Expected hardening: session cleared and user sent to /login.
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeTruthy()
    })
    expect(localStorage.getItem('mvp_token')).toBeNull()
  })
})

describe('api addMessage error-status parsing (issue #7) — Red', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('throws error with status/message parsed from body (currently generic message)', async () => {
    const actual =
      await vi.importActual<typeof import('../../services/api')>('../../services/api')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      }) as unknown as Response)
    )

    const promise = actual.addMessage('s-1', 'hello')
    await expect(promise).rejects.toThrow(/unauthorized|failed to add message/i)
    await expect(promise).rejects.toMatchObject({ status: 401 })
  })
})
