import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminDashboard from '../../pages/admin/AdminDashboard'
import { AuthProvider } from '../../context/AuthContext'

// Mock the api module so AdminDashboard unit tests don't hit a real network.
// Only the AdminDashboard dependencies are mocked; rest stays real.
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

import { getStreams, deleteStream, getMessages, deleteMessage } from '../../services/api'

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

function seedAuth() {
  localStorage.setItem('mvp_token', 'valid-token')
  localStorage.setItem('mvp_userId', 'user-1')
  localStorage.setItem('mvp_username', 'AdminUser')
}

function mockStreams() {
  vi.mocked(getStreams).mockResolvedValue([
    { id: 's-1', name: 'General', messageCount: 1, activityLevel: 1 },
    { id: 's-2', name: 'Random', messageCount: 0, activityLevel: 0 },
  ])
}

function mockTwoMessages() {
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
}

async function selectStreamWithMessages() {
  // AdminDashboard must expose a way to view/select a stream so its
  // messages (and per-message delete buttons) become visible.
  const viewButton =
    screen.queryByRole('button', { name: /view|select|messages/i }) ??
    screen.getByText('Stream s-1')
  fireEvent.click(viewButton)
  expect(await screen.findByText('first message')).toBeTruthy()
}

describe('AdminDashboard delete stream/message (issues #9 #10) — Red', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(getStreams).mockReset()
    vi.mocked(deleteStream).mockReset()
    vi.mocked(getMessages).mockReset()
    vi.mocked(deleteMessage).mockReset()
    mockStreams()
    vi.mocked(getMessages).mockResolvedValue([])
    vi.mocked(deleteStream).mockResolvedValue(undefined)
    vi.mocked(deleteMessage).mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('delete stream success asks confirm and removes the stream from the list', async () => {
    const user = userEvent.setup()
    renderAdmin()

    expect(await screen.findByText('Stream s-1')).toBeTruthy()
    expect(screen.getByText('Stream s-2')).toBeTruthy()

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await user.click(deleteButtons[0])

    expect(window.confirm).toHaveBeenCalled()
    expect(deleteStream).toHaveBeenCalledWith('s-1')

    await waitFor(() => {
      expect(screen.queryByText('Stream s-1')).toBeNull()
    })
    expect(screen.getByText('Stream s-2')).toBeTruthy()
  })

  it('cancel via confirm=false makes no api call and preserves the list', async () => {
    const user = userEvent.setup()
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    renderAdmin()

    expect(await screen.findByText('Stream s-1')).toBeTruthy()

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await user.click(deleteButtons[0])

    expect(window.confirm).toHaveBeenCalled()
    expect(deleteStream).not.toHaveBeenCalled()
    expect(screen.getByText('Stream s-1')).toBeTruthy()
    expect(screen.getByText('Stream s-2')).toBeTruthy()
  })

  it('delete stream failure shows role=alert and preserves the list', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteStream).mockRejectedValueOnce(new Error('Failed to delete stream'))
    renderAdmin()

    expect(await screen.findByText('Stream s-1')).toBeTruthy()

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await user.click(deleteButtons[0])

    // Expected: inline error with role="alert" (Dashboard/StreamPage pattern).
    // Currently handleDeleteStream swallows via console.error only (Red).
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/failed to delete|failed|error/i)

    // List preserved after failure.
    expect(screen.getByText('Stream s-1')).toBeTruthy()
    expect(screen.getByText('Stream s-2')).toBeTruthy()
  })

  it('401 from deleteStream triggers logout + navigate to /login', async () => {
    const user = userEvent.setup()
    seedAuth()
    const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 })
    vi.mocked(deleteStream).mockRejectedValueOnce(unauthorized)
    renderAdmin()

    expect(await screen.findByText('Stream s-1')).toBeTruthy()

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await user.click(deleteButtons[0])

    // Expected hardening (follows Dashboard/StreamPage 401 pattern):
    // session cleared and user sent to /login. Currently swallowed (Red).
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeTruthy()
    })
    expect(localStorage.getItem('mvp_token')).toBeNull()
  })

  it('403 from deleteStream shows Admin only alert and preserves the list', async () => {
    const user = userEvent.setup()
    const forbidden = Object.assign(new Error('Forbidden'), { status: 403 })
    vi.mocked(deleteStream).mockRejectedValueOnce(forbidden)
    renderAdmin()

    expect(await screen.findByText('Stream s-1')).toBeTruthy()

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await user.click(deleteButtons[0])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/admin only|forbidden|not authorized/i)
    expect(screen.getByText('Stream s-1')).toBeTruthy()
  })

  it('delete button is disabled per-row while its delete is pending', async () => {
    const user = userEvent.setup()
    let resolveDelete!: () => void
    vi.mocked(deleteStream).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveDelete = resolve
      })
    )
    renderAdmin()

    expect(await screen.findByText('Stream s-1')).toBeTruthy()

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    const firstDelete = deleteButtons[0] as HTMLButtonElement
    await user.click(firstDelete)

    // Expected: per-row pending state disables only the in-flight row.
    // Currently no pending/disable handling (Red).
    await waitFor(() => {
      expect(firstDelete.disabled).toBe(true)
    })

    resolveDelete()
    await waitFor(() => {
      expect(screen.queryByText('Stream s-1')).toBeNull()
    })
  })

  it('delete message uses functional update so concurrent deletes both apply', async () => {
    mockTwoMessages()
    renderAdmin()

    expect(await screen.findByText('Stream s-1')).toBeTruthy()
    await selectStreamWithMessages()

    // Hold both deletes pending so they overlap; stale-closure
    // setMessages(messages.filter(...)) loses one update (Red).
    const resolvers: Array<() => void> = []
    vi.mocked(deleteMessage).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve)
        })
    )

    const delButtons = screen.getAllByRole('button', { name: /^del$/i })
    expect(delButtons).toHaveLength(2)

    fireEvent.click(delButtons[0])
    fireEvent.click(delButtons[1])

    await waitFor(() => {
      expect(deleteMessage).toHaveBeenCalledTimes(2)
    })

    resolvers.forEach((r) => r())

    await waitFor(() => {
      expect(screen.queryByText('first message')).toBeNull()
      expect(screen.queryByText('second message')).toBeNull()
    })
  })

  it('delete message failure shows role=alert and preserves the message', async () => {
    const user = userEvent.setup()
    mockTwoMessages()
    vi.mocked(deleteMessage).mockRejectedValueOnce(new Error('Failed to delete message'))
    renderAdmin()

    expect(await screen.findByText('Stream s-1')).toBeTruthy()
    await selectStreamWithMessages()

    const delButtons = screen.getAllByRole('button', { name: /^del$/i })
    await user.click(delButtons[0])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/failed to delete|failed|error/i)
    expect(screen.getByText('first message')).toBeTruthy()
    expect(screen.getByText('second message')).toBeTruthy()
  })
})
