import React, { useState } from 'react'

const Login = () => {
  const [username, setUsername] = useState('')
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // login logic
  }
  return (
    <div className="login">
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          required
        />
        <button type="submit">Login</button>
      </form>
    </div>
  )
}

export default Login
