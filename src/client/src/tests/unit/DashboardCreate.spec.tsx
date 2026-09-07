import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Dashboard from '../../pages/Dashboard'
import { AuthProvider } from '../../context/AuthContext'

// Mock the api module so Dashboard unit tests don't hit a real network.
// getStreams/createStream are the only Dashboard dependencies; keep the
// rest (logout/login/register) as the real implementation.
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

describe('Dashboard create-stream hardening (issue #5) — Red', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(getStreams).mockReset()
    vi.mocked(createStream).mockReset()
    // Dashboard fetches the list on mount; default to empty.
    vi.mocked(getStreams).mockResolvedValue([])
    // Default create resolves so incidental calls (e.g. missing length guard)
    // don't crash the component on `undefined.id`; Red assertions still fail
    // on missing alert / unwanted call.
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

  it('shows inline validation error for empty name (currently silent return)', async () => {
    const user = userEvent.setup()
    renderDashboard()

    // Wait for initial fetch to settle so the Create button is stable.
    await waitFor(() => expect(getStreams).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: /^create$/i }))

    // Expected hardening: inline error with role="alert" (Login.tsx pattern).
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/name is required/i)
    expect(createStream).not.toHaveBeenCalled()
  })

  it('shows inline validation error for whitespace-only name', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await waitFor(() => expect(getStreams).toHaveBeenCalled())

    const input =
      screen.queryByLabelText(/stream name|new stream/i) ??
      screen.getByPlaceholderText(/create new stream/i)
    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/name is required/i)
    expect(createStream).not.toHaveBeenCalled()
  })

  it('rejects names longer than 100 chars and does NOT call createStream', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await waitFor(() => expect(getStreams).toHaveBeenCalled())

    const longName = 'a'.repeat(101)
    const input =
      screen.queryByLabelText(/stream name|new stream/i) ??
      screen.getByPlaceholderText(/create new stream/i)
    await user.type(input, longName)
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/100|too long|max/i)
    expect(createStream).not.toHaveBeenCalledWith(longName)
    expect(createStream).not.toHaveBeenCalled()
  })

  it('401 from createStream triggers logout + navigate to /login (currently swallowed)', async () => {
    const user = userEvent.setup()
    localStorage.setItem('mvp_token', 'expired-token')
    localStorage.setItem('mvp_userId', 'user-1')
    localStorage.setItem('mvp_username', 'TestUser')

    const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 })
    vi.mocked(createStream).mockRejectedValueOnce(unauthorized)

    renderDashboard()

    await waitFor(() => expect(getStreams).toHaveBeenCalled())

    const input =
      screen.queryByLabelText(/stream name|new stream/i) ??
      screen.getByPlaceholderText(/create new stream/i)
    await user.type(input, 'my-stream')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    // Expected hardening: session cleared and user sent to /login.
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeTruthy()
    })
    expect(localStorage.getItem('mvp_token')).toBeNull()
  })

  it('success appends stream to list, clears input and error/loading states', async () => {
    const user = userEvent.setup()
    vi.mocked(createStream).mockResolvedValueOnce({
      id: 's-1',
      name: 'my-stream',
      messageCount: 0,
      activityLevel: 0,
    })

    renderDashboard()

    await waitFor(() => expect(getStreams).toHaveBeenCalled())

    const input =
      screen.queryByLabelText(/stream name|new stream/i) ??
      screen.getByPlaceholderText(/create new stream/i)
    await user.type(input, 'my-stream')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(screen.getByText('my-stream')).toBeTruthy()
    })
    expect((input as HTMLInputElement).value).toBe('')
    // No lingering error or loading state after success (Login.tsx pattern:
    // error cleared on submit, submitting flag reset).
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      (screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement).disabled
    ).toBe(false)
  })

  it('input is accessible with maxLength=100 and aria-label', async () => {
    renderDashboard()

    await waitFor(() => expect(getStreams).toHaveBeenCalled())

    // Expected hardening: <label> or aria-label so getByLabelText works,
    // plus maxLength=100 to enforce the length rule at the input level.
    const input = screen.getByLabelText(/stream name|new stream/i) as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.getAttribute('maxlength') ?? input.maxLength.toString()).toMatch(/100/)
    expect(input.getAttribute('aria-label') ?? input.getAttribute('placeholder')).toBeTruthy()
  })

  it('disables the Create button while the request is in flight', async () => {
    const user = userEvent.setup()
    let resolveCreate!: (value: { id: string; name: string; messageCount: number; activityLevel: number }) => void
    vi.mocked(createStream).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve
      })
    )

    renderDashboard()

    await waitFor(() => expect(getStreams).toHaveBeenCalled())

    const input =
      screen.queryByLabelText(/stream name|new stream/i) ??
      screen.getByPlaceholderText(/create new stream/i)
    await user.type(input, 'my-stream')
    await user.click(screen.getByRole('button', { name: /create/i }))

    // Expected hardening: disabled + "Creating…" label (mirrors Login's
    // submitting pattern). Currently the button never disables → Red.
    const pendingButton = await screen.findByRole('button', { name: /creating|create/i })
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true)

    resolveCreate({ id: 's-1', name: 'my-stream', messageCount: 0, activityLevel: 0 })
    await waitFor(() => {
      expect(screen.getByText('my-stream')).toBeTruthy()
    })
  })
})

describe('api createStream error-status parsing (issue #5) — Red', () => {
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

    const promise = actual.createStream('my-stream')
    await expect(promise).rejects.toThrow(/unauthorized/i)
    await expect(promise).rejects.toMatchObject({ status: 401 })
  })
})
