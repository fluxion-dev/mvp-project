import React, { createContext, useContext, useState } from 'react'

const AuthContext = createContext({
  username: string | undefined,
  login: (username: string) => void,
  logout: () => void,
})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [username, setUsername] = useState<string | undefined>(undefined)
  const login = (name: string) => setUsername(name)
  const logout = () => setUsername(undefined)

  return (
    <AuthContext.Provider value={{ username, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
