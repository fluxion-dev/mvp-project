import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getStreams, createStream, type Stream } from '../services/api'
import { useAuth } from '../context/AuthContext'

const MAX_STREAM_NAME_LENGTH = 100

const Dashboard = () => {
  const [streams, setStreams] = useState<Stream[]>([])
  const [newStreamName, setNewStreamName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const { username, logout } = useAuth()
  const navigate = useNavigate()

  async function fetchStreams() {
    setIsLoading(true)
    setListError(null)
    try {
      const data = await getStreams()
      setStreams(data)
      setListError(null)
    } catch (err) {
      console.error(err)
      if ((err as { status?: number }).status === 401) {
        await logout()
        navigate('/login', { replace: true })
        return
      }
      setListError(err instanceof Error ? err.message : 'Failed to fetch streams')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStreams()
  }, [])

  const handleCreateStream = async () => {
    const trimmed = newStreamName.trim()
    if (!trimmed) {
      setError('Stream name is required')
      return
    }
    if (trimmed.length > MAX_STREAM_NAME_LENGTH) {
      // NOTE: native maxLength handles normal typing; this guard covers
      // paste/programmatic values that bypass maxLength and aligns with
      // backend [StringLength(100)] (100 allowed, 101 rejected).
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
          {/* Always show for MVP; backend 403 guards admin actions (no JWT roles yet). */}
          <Link to="/admin" className="admin-link">
            Admin
          </Link>
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
          maxLength={MAX_STREAM_NAME_LENGTH}
          disabled={isCreating}
          onKeyDown={e => e.key === 'Enter' && handleCreateStream()}
          className="stream-input"
        />
        <button onClick={handleCreateStream} disabled={isCreating} className="stream-button">
          {isCreating ? 'Creating…' : 'Create'}
        </button>
      </div>
      {error && <p role="alert" className="error-message">{error}</p>}

      {isLoading && <p>Loading streams…</p>}
      {!isLoading && listError && (
        <>
          <p role="alert" className="error-message">{listError}</p>
          <button type="button" onClick={fetchStreams} className="stream-button-small">
            Retry
          </button>
        </>
      )}
      {!isLoading && !listError && streams.length === 0 && (
        <p>No streams yet. Create your first stream above to get started.</p>
      )}

      {!isLoading && !listError && streams.length > 0 && (
      <ul>
        {streams.map((stream) => (
          <li key={stream.id} className="stream-item">
            <Link to={`/stream/${stream.id}`}>
              <h3>{stream.name}</h3>
              <p>Messages: {stream.messageCount}</p>
              <p>Activity: {stream.activityLevel}</p>
            </Link>
          </li>
        ))}
      </ul>
      )}
    </div>
  )
}

export default Dashboard
