import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Basic client-side validation so the user gets immediate feedback
    // even when the API would return a more generic Unauthorized.
    if (!email.trim()) {
      setError('email is required')
      return
    }
    if (!password) {
      setError('password is required')
      return
    }

    setSubmitting(true)
    try {
      await login(email, password, rememberMe)
      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login">
      <h2>Login</h2>
      <form onSubmit={handleSubmit} noValidate>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            aria-label="Email"
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            aria-label="Password"
            autoComplete={rememberMe ? 'current-password' : 'current-password'}
          />
        </label>
        <label className="remember-me">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            aria-label="Remember me"
          />
          <span>Remember me</span>
        </label>
        {error && (
          <p className="error" role="alert" aria-live="polite">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Login'}
        </button>
        <p>
          No account? <Link to="/register">Create account</Link>
        </p>
      </form>
    </div>
  )
}

export default Login