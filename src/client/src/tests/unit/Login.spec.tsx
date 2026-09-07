import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import Login from '../../pages/Login'
import { AuthProvider } from '../../context/AuthContext'

// Mock the api module so we don't hit a real network in unit tests.
vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api')
  return {
    ...actual,
    login: vi.fn(),
  }
})

import { login } from '../../services/api'

function renderLogin(initialPath = '/login') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Login />
      </MemoryRouter>
    </AuthProvider>
  )
}

describe('Login page', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(login).mockReset()
  })

  it('renders the login form with email, password, remember me, and submit', () => {
    renderLogin()
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.getByLabelText(/password/i)).toBeTruthy()
    expect(screen.getByLabelText(/remember me/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^login$/i })).toBeTruthy()
  })

  it('shows a link to the registration page for new users', () => {
    renderLogin()
    expect(screen.getByRole('link', { name: /create account/i })).toBeTruthy()
  })

  it('calls the API and persists auth on successful login (remember me default = off)', async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockResolvedValueOnce({
      token: 'jwt-token',
      user: { id: 'user-1', email: 'a@b.com', displayName: 'A B' },
    })

    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: /^login$/i }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('a@b.com', 'SecurePass123!')
    })
    // By default remember-me is off → session-scoped persistence. The
    // token lives in sessionStorage only and the remember flag is false.
    expect(localStorage.getItem('mvp_token')).toBeNull()
    expect(localStorage.getItem('mvp_remember')).toBe('false')
    expect(sessionStorage.getItem('mvp_token')).toBe('jwt-token')
    expect(sessionStorage.getItem('mvp_userId')).toBe('user-1')
    expect(sessionStorage.getItem('mvp_username')).toBe('A B')
  })

  it('persists auth across browser sessions when remember me is checked', async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockResolvedValueOnce({
      token: 'jwt-token',
      user: { id: 'user-1', email: 'a@b.com', displayName: 'A B' },
    })

    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.click(screen.getByLabelText(/remember me/i))
    await user.click(screen.getByRole('button', { name: /^login$/i }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('a@b.com', 'SecurePass123!')
    })
    expect(localStorage.getItem('mvp_remember')).toBe('true')
    expect(localStorage.getItem('mvp_token')).toBe('jwt-token')
  })

  it('shows client-side validation error for empty email', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/password/i), 'pw')
    await user.click(screen.getByRole('button', { name: /^login$/i }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toMatch(/email is required/i)
    expect(login).not.toHaveBeenCalled()
  })

  it('shows client-side validation error for empty password', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.click(screen.getByRole('button', { name: /^login$/i }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toMatch(/password is required/i)
    expect(login).not.toHaveBeenCalled()
  })

  it('displays the server error message when login fails', async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockRejectedValueOnce(new Error('invalid email or password'))

    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'bad@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /^login$/i }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toMatch(/invalid email or password/i)
  })

  it('displays a fallback message when the thrown error has no message', async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockRejectedValueOnce(new Error())

    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'pw')
    await user.click(screen.getByRole('button', { name: /^login$/i }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toMatch(/login failed/i)
  })

  it('disables the submit button while the request is in flight', async () => {
    const user = userEvent.setup()
    let resolveLogin: (value: any) => void = () => {}
    vi.mocked(login).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLogin = resolve
      })
    )

    renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')

    await user.click(screen.getByRole('button', { name: /^login$/i }))

    const button = await screen.findByRole('button', { name: /logging in/i })
    expect((button as HTMLButtonElement).disabled).toBe(true)

    await waitFor(() => {
      resolveLogin({
        token: 't',
        user: { id: '1', email: 'a@b.com', displayName: 'A B' },
      })
    })
  })
})