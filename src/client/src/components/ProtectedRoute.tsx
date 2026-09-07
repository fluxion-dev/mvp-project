import React from 'react'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  // Simple auth check - in production would check token/session
  const isAuthenticated = true // placeholder
  return isAuthenticated ? children : <p>Please login</p>
}

export default ProtectedRoute
