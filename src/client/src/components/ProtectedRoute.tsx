import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { token } = useAuth()
  const navigate = useNavigate()

  // Redirect unauthenticated users to /login. We perform the navigation
  // inside useEffect rather than during render to avoid React warnings
  // about state updates during render and to prevent render loops.
  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
    }
  }, [token, navigate])

  if (!token) {
    return <div>Please login</div>
  }

  return children
}

export default ProtectedRoute
