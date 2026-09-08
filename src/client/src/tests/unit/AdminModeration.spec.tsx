import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminDashboard from '../../pages/admin/AdminDashboard'
import { AuthProvider } from '../../context/AuthContext'

vi.mock('../../services/api', async () => {
  const actual =
    await vi.importActual<typeof import('../../services/api')>('../../services/api')
  return {
    ...actual,
    getStreams: vi.fn(),
    getMessages: vi.fn(),
    muteUser: vi.fn(),
    banUser: vi.fn(),
  }
})

import { getStreams, getMessages, muteUser, banUser } from '../../services/api'

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
    { id: 's-1', name: 'General', messageCount: 0, activityLevel: 0 },
    { id: 's-2', name: 'Random', messageCount: 0, activityLevel: 0 },
  ])
}

async function revealModeration() {
  expect(await screen.findByText('Stream s-1')).toBeTruthy()
  const viewButtons = screen.getAllByRole('button', { name: /view/i })
  fireEvent.click(viewButtons[0])
  expect(await screen.findByPlaceholderText('User ID to mute')).toBeTruthy()
  expect(screen.getByPlaceholderText('User ID to ban')).toBeTruthy()
}

describe('AdminDashboard moderation (issues #11 #12) — Red', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(getStreams).mockReset()
    vi.mocked(getMessages).mockReset()
    vi.mocked(muteUser).mockReset()
    vi.mocked(banUser).mockReset()
    mockStreams()
    vi.mocked(getMessages).mockResolvedValue([])
    vi.mocked(muteUser).mockResolvedValue(undefined)
    vi.mocked(banUser).mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('empty mute userId shows alert and does not call muteUser', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await revealModeration()

    const muteButton = screen.getByRole('button', { name: /^mute$/i })
    await user.click(muteButton)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/user id.*required|enter.*user|required/i)
    expect(muteUser).not.toHaveBeenCalled()
  })

  it('empty ban userId shows alert and does not call banUser', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await revealModeration()

    const banButton = screen.getByRole('button', { name: /^ban$/i })
    await user.click(banButton)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/user id.*required|enter.*user|required/i)
    expect(banUser).not.toHaveBeenCalled()
  })

  it('invalid mute duration shows alert and does not call muteUser', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await revealModeration()

    await user.type(screen.getByPlaceholderText('User ID to mute'), 'user-9')
    const durationInput = screen.getByPlaceholderText(/mute duration/i)
    await user.clear(durationInput)
    await user.type(durationInput, 'abc')

    await user.click(screen.getByRole('button', { name: /^mute$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/duration|invalid|positive/i)
    expect(muteUser).not.toHaveBeenCalled()
  })

  it('invalid ban duration shows alert and does not call banUser', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await revealModeration()

    await user.type(screen.getByPlaceholderText('User ID to ban'), 'user-9')
    const durationInput = screen.getByPlaceholderText(/ban duration/i)
    await user.clear(durationInput)
    await user.type(durationInput, '-3')

    await user.click(screen.getByRole('button', { name: /^ban$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/duration|invalid|positive/i)
    expect(banUser).not.toHaveBeenCalled()
  })

  it('mute success shows success and clears inputs', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await revealModeration()

    const userInput = screen.getByPlaceholderText('User ID to mute') as HTMLInputElement
    const durationInput = screen.getByPlaceholderText(/mute duration/i) as HTMLInputElement
    await user.type(userInput, 'user-9')
    await user.clear(durationInput)
    await user.type(durationInput, '30')

    await user.click(screen.getByRole('button', { name: /^mute$/i }))

    expect(muteUser).toHaveBeenCalledWith('user-9', 30)
    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/muted successfully|success/i)
    await waitFor(() => {
      expect(userInput.value).toBe('')
      expect(durationInput.value).toBe('')
    })
  })

  it('ban success shows success and clears inputs', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await revealModeration()

    const userInput = screen.getByPlaceholderText('User ID to ban') as HTMLInputElement
    const durationInput = screen.getByPlaceholderText(/ban duration/i) as HTMLInputElement
    await user.type(userInput, 'user-7')
    await user.clear(durationInput)
    await user.type(durationInput, '5')

    await user.click(screen.getByRole('button', { name: /^ban$/i }))

    expect(banUser).toHaveBeenCalledWith('user-7', 5)
    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/banned successfully|success/i)
    await waitFor(() => {
      expect(userInput.value).toBe('')
      expect(durationInput.value).toBe('')
    })
  })

  it('mute failure shows role=alert and preserves inputs', async () => {
    const user = userEvent.setup()
    vi.mocked(muteUser).mockRejectedValueOnce(new Error('Failed to mute user'))
    renderAdmin()
    await revealModeration()

    const userInput = screen.getByPlaceholderText('User ID to mute') as HTMLInputElement
    await user.type(userInput, 'user-9')
    const durationInput = screen.getByPlaceholderText(/mute duration/i) as HTMLInputElement
    await user.clear(durationInput)
    await user.type(durationInput, '30')

    await user.click(screen.getByRole('button', { name: /^mute$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/failed to mute|failed|error/i)
    expect(userInput.value).toBe('user-9')
  })

  it('401 from muteUser triggers logout + navigate to /login', async () => {
    const user = userEvent.setup()
    seedAuth()
    const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 })
    vi.mocked(muteUser).mockRejectedValueOnce(unauthorized)
    renderAdmin()
    await revealModeration()

    await user.type(screen.getByPlaceholderText('User ID to mute'), 'user-9')
    const durationInput = screen.getByPlaceholderText(/mute duration/i)
    await user.clear(durationInput)
    await user.type(durationInput, '30')

    await user.click(screen.getByRole('button', { name: /^mute$/i }))

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeTruthy()
    })
    expect(localStorage.getItem('mvp_token')).toBeNull()
  })

  it('403 from banUser shows Admin only alert', async () => {
    const user = userEvent.setup()
    const forbidden = Object.assign(new Error('Forbidden'), { status: 403 })
    vi.mocked(banUser).mockRejectedValueOnce(forbidden)
    renderAdmin()
    await revealModeration()

    await user.type(screen.getByPlaceholderText('User ID to ban'), 'user-9')
    const durationInput = screen.getByPlaceholderText(/ban duration/i)
    await user.clear(durationInput)
    await user.type(durationInput, '5')

    await user.click(screen.getByRole('button', { name: /^ban$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/admin only|forbidden|not authorized/i)
  })
})
