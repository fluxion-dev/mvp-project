import React, { createContext, useContext, useState } from 'react'
import { AuthResponse, login as apiLogin, logout as apiLogout } from '../services/api'

interface AuthContextType {
  token: string | undefined
  userId: string | undefined
  username: string | undefined
  isAuthenticated: boolean
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  logout: () => Promise<void>
  setAuth: (data: AuthResponse, rememberMe?: boolean) => void
}

const AuthContext = createContext<AuthContextType>({
  token: undefined,
  userId: undefined,
  username: undefined,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  setAuth: () => {},
})

export const useAuth = () => useContext(AuthContext)

/**
 * Read stored auth state synchronously so the first render is already
 * authenticated. We honor the "remember me" preference: if the user
 * opted out of remembering, the credentials live only in sessionStorage.
 */
function readStoredAuth() {
  if (typeof window === 'undefined') {
    return { token: undefined, userId: undefined, username: undefined }
  }
  const remember = window.localStorage.getItem('mvp_remember') !== 'false'
  const storage = remember ? window.localStorage : window.sessionStorage
  return {
    token: storage.getItem('mvp_token') ?? undefined,
    userId: storage.getItem('mvp_userId') ?? undefined,
    username: storage.getItem('mvp_username') ?? undefined,
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  // Lazy initial state — runs once during the very first render so the
  // ProtectedRoute never sees a momentary unauthenticated state.
  const [initial] = useState(readStoredAuth)
  const [token, setToken] = useState<string | undefined>(initial.token)
  const [userId, setUserId] = useState<string | undefined>(initial.userId)
  const [username, setUsername] = useState<string | undefined>(initial.username)

  const login = async (email: string, password: string, rememberMe = true) => {
    const data = await apiLogin(email, password)
    setAuth(data, rememberMe)
  }

  const setAuth = (data: AuthResponse, rememberMe = true) => {
    setToken(data.token)
    setUserId(data.user.id)
    setUsername(data.user.displayName)
    if (rememberMe) {
      // Persist across browser sessions (default behavior).
      localStorage.setItem('mvp_token', data.token)
      localStorage.setItem('mvp_userId', data.user.id)
      localStorage.setItem('mvp_username', data.user.displayName)
      localStorage.setItem('mvp_remember', 'true')
      // Clear any stale session-only values.
      sessionStorage.removeItem('mvp_token')
      sessionStorage.removeItem('mvp_userId')
      sessionStorage.removeItem('mvp_username')
    } else {
      // Session-only persistence: the token survives a reload in the
      // same tab but is wiped when the tab closes. We also clear the
      // localStorage copy so a fresh load doesn't accidentally rehydrate.
      sessionStorage.setItem('mvp_token', data.token)
      sessionStorage.setItem('mvp_userId', data.user.id)
      sessionStorage.setItem('mvp_username', data.user.displayName)
      localStorage.setItem('mvp_remember', 'false')
      localStorage.removeItem('mvp_token')
      localStorage.removeItem('mvp_userId')
      localStorage.removeItem('mvp_username')
    }
  }

  const logout = async (): Promise<void> => {
    try {
      await apiLogout()
    } finally {
      setToken(undefined)
      setUserId(undefined)
      setUsername(undefined)
      localStorage.removeItem('mvp_token')
      localStorage.removeItem('mvp_userId')
      localStorage.removeItem('mvp_username')
      localStorage.removeItem('mvp_remember')
      sessionStorage.removeItem('mvp_token')
      sessionStorage.removeItem('mvp_userId')
      sessionStorage.removeItem('mvp_username')
    }
  }

  return (
    <AuthContext.Provider value={{ token, userId, username, isAuthenticated: !!token, login, logout, setAuth }}>
      {children}
    </AuthContext.Provider>
  )
}
