import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import Register from '../../pages/Register'
import { AuthProvider } from '../../context/AuthContext'

// Mock the api module so we don't hit a real network in unit tests
vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api')
  return {
    ...actual,
    register: vi.fn(),
  }
})

import { register } from '../../services/api'

function renderRegister() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/register']}>
        <Register />
      </MemoryRouter>
    </AuthProvider>
  )
}

describe('Register page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(register).mockReset()
  })

  it('renders the registration form with all three fields and a submit button', () => {
    renderRegister()
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.getByLabelText(/password/i)).toBeTruthy()
    expect(screen.getByLabelText(/display name/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /register/i })).toBeTruthy()
  })

  it('shows a link to the login page for existing users', () => {
    renderRegister()
    expect(screen.getByRole('link', { name: /login/i })).toBeTruthy()
  })

  it('calls the API and persists auth on successful registration', async () => {
    const user = userEvent.setup()
    vi.mocked(register).mockResolvedValueOnce({
      token: 'jwt-token',
      user: { id: 'user-1', email: 'a@b.com', displayName: 'A B' },
    })

    renderRegister()

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.type(screen.getByLabelText(/display name/i), 'A B')
    await user.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('a@b.com', 'SecurePass123!', 'A B')
    })
    expect(localStorage.getItem('mvp_token')).toBe('jwt-token')
    expect(localStorage.getItem('mvp_userId')).toBe('user-1')
    expect(localStorage.getItem('mvp_username')).toBe('A B')
  })

  it('displays the server error message when registration fails', async () => {
    const user = userEvent.setup()
    vi.mocked(register).mockRejectedValueOnce(new Error('email is required'))

    renderRegister()

    await user.click(screen.getByRole('button', { name: /register/i }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toMatch(/email is required/i)
  })

  it('displays a fallback message when the thrown error has no message', async () => {
    const user = userEvent.setup()
    vi.mocked(register).mockRejectedValueOnce(new Error())

    renderRegister()

    await user.click(screen.getByRole('button', { name: /register/i }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toMatch(/registration failed/i)
  })

  it('disables the submit button while the request is in flight', async () => {
    const user = userEvent.setup()
    let resolveRegister: (value: any) => void = () => {}
    vi.mocked(register).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRegister = resolve
      })
    )

    renderRegister()

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!')
    await user.type(screen.getByLabelText(/display name/i), 'A B')

    await user.click(screen.getByRole('button', { name: /register/i }))

    // After click, button text changes to "Registering..." and is disabled
    const button = await screen.findByRole('button', { name: /registering/i })
    expect((button as HTMLButtonElement).disabled).toBe(true)

    // Resolve inside act so React state updates don't leak warnings
    await waitFor(() => {
      resolveRegister({
        token: 't',
        user: { id: '1', email: 'a@b.com', displayName: 'A B' },
      })
    })
  })
})