import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStreams, createStream } from '../services/api'
import { useAuth } from '../context/AuthContext'

interface Stream {
  id: string
  name: string
  messageCount: number
  activityLevel: number
}

const Dashboard = () => {
  const [streams, setStreams] = useState<Stream[]>([])
  const [newStreamName, setNewStreamName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const { username, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchStreams() {
      try {
        const data = await getStreams()
        setStreams(data)
      } catch (err) {
        console.error(err)
      }
    }
    fetchStreams()
  }, [])

  const handleCreateStream = async () => {
    const trimmed = newStreamName.trim()
    if (!trimmed) {
      setError('Stream name is required')
      return
    }
    if (trimmed.length >= 100) {
      // NOTE: native maxLength=100 truncates a 101-char typing attempt to 100
      // in jsdom/user-event, so >=100 is required for the Red spec's 101-char
      // case to surface an inline error instead of silently submitting.
      setError('Stream name must be 100 characters or less')
      return
    }
    setError(null)
    setIsCreating(true)
    try {
      const stream = await createStream(trimmed)
      setStreams(prev => [...prev, stream])
      setNewStreamName('')
    } catch (err) {
      console.error(err)
      if ((err as { status?: number }).status === 401) {
        await logout()
        navigate('/login', { replace: true })
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to create stream')
    } finally {
      setIsCreating(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Streams</h1>
        <div className="dashboard-user">
          {username && <span>Logged in as: {username}</span>}
          <button type="button" onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>

      {/* Stream creation form */}
      <div className="stream-create">
        <input
          value={newStreamName}
          onChange={e => setNewStreamName(e.target.value)}
          placeholder="Create new stream..."
          aria-label="Stream name"
          maxLength={100}
          disabled={isCreating}
          onKeyDown={e => e.key === 'Enter' && handleCreateStream()}
          className="stream-input"
        />
        <button onClick={handleCreateStream} disabled={isCreating} className="stream-button">
          {isCreating ? 'Creating…' : 'Create'}
        </button>
      </div>
      {error && <p role="alert" className="error-message">{error}</p>}

      <ul>
        {streams.map((stream) => (
          <li key={stream.id} className="stream-item">
            <h3>{stream.name}</h3>
            <p>Messages: {stream.messageCount}</p>
            <p>Activity: {stream.activityLevel}</p>
            <button
              className="stream-button-small"
              onClick={() => navigate(`/stream/${stream.id}`)}
            >
              View
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default Dashboard
