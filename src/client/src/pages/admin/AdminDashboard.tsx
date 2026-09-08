import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getStreams, deleteStream as apiDeleteStream, getMessages as apiGetMessages, deleteMessage as apiDeleteMessage, muteUser, banUser, type Stream } from '../../services/api'

interface Message {
  id: string
  streamId: string
  content: string
  createdAt: string
  user: {
    id: string
    username: string
  }
}

// NOTE: No client-side requireAdmin gate here. JWTs carry no roles claim yet,
// so role gating would be speculative. Admin is enforced server-side and
// surfaces as 403 ("Admin only") messaging below.

const AdminDashboard = () => {
  const [streams, setStreams] = useState<Stream[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [streamsError, setStreamsError] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isMessagesLoading, setIsMessagesLoading] = useState(false)
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [muteUserId, setMuteUserId] = useState<string>('')
  const [banUserId, setBanUserId] = useState<string>('')
  const [muteDuration, setMuteDuration] = useState<string>('60')
  const [banDuration, setBanDuration] = useState<string>('7')
  const [moderationError, setModerationError] = useState<string | null>(null)
  const [moderationSuccess, setModerationSuccess] = useState<string | null>(null)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [deletingStreamIds, setDeletingStreamIds] = useState<string[]>([])
  const [deletingMessageIds, setDeletingMessageIds] = useState<string[]>([])
  const { username, logout } = useAuth()
  const navigate = useNavigate()

  async function fetchStreams() {
    setIsLoading(true)
    setStreamsError(null)
    try {
      const data = await getStreams()
      setStreams(data)
    } catch (err) {
      console.error(err)
      if ((err as { status?: number }).status === 401) {
        await logout()
        navigate('/login', { replace: true })
        return
      }
      setStreamsError(err instanceof Error ? err.message : 'Failed to fetch streams')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStreams()
  }, [])

  const handleStreamSelect = async (streamId: string) => {
    setSelectedStream(streamId)
    setAdminError(null)
    setIsMessagesLoading(true)
    try {
      const data = await apiGetMessages(streamId)
      setMessages(data)
    } catch (err) {
      console.error(err)
      if ((err as { status?: number }).status === 401) {
        await logout()
        navigate('/login', { replace: true })
        return
      }
      setAdminError(err instanceof Error ? err.message : 'Failed to fetch messages')
    } finally {
      setIsMessagesLoading(false)
    }
  }

  const handleDeleteStream = async (streamId: string) => {
    if (!window.confirm('Are you sure you want to delete this stream?')) return
    setAdminError(null)
    setDeletingStreamIds(prev => [...prev, streamId])
    try {
      await apiDeleteStream(streamId)
      setStreams(prev => prev.filter(s => s.id !== streamId))
      if (selectedStream === streamId) {
        setSelectedStream(null)
        setMessages([])
      }
    } catch (err) {
      console.error(err)
      const status = (err as { status?: number }).status
      if (status === 401) {
        await logout()
        navigate('/login', { replace: true })
        return
      }
      if (status === 403) {
        setAdminError('Admin only: you are not authorized to delete this stream')
      } else {
        setAdminError(err instanceof Error ? err.message : 'Failed to delete stream')
      }
    } finally {
      setDeletingStreamIds(prev => prev.filter(id => id !== streamId))
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return
    setAdminError(null)
    setDeletingMessageIds(prev => [...prev, messageId])
    try {
      await apiDeleteMessage(messageId)
      setMessages(prev => prev.filter(m => m.id !== messageId))
    } catch (err) {
      console.error(err)
      const status = (err as { status?: number }).status
      if (status === 401) {
        await logout()
        navigate('/login', { replace: true })
        return
      }
      if (status === 403) {
        setAdminError('Admin only: you are not authorized to delete this message')
      } else {
        setAdminError(err instanceof Error ? err.message : 'Failed to delete message')
      }
    } finally {
      setDeletingMessageIds(prev => prev.filter(id => id !== messageId))
    }
  }

  const handleMuteUser = async () => {
    const userId = muteUserId.trim()
    if (!userId) {
      setModerationSuccess(null)
      setModerationError('User ID is required')
      return
    }
    const duration = Number(muteDuration)
    if (!muteDuration.trim() || !Number.isFinite(duration) || duration <= 0) {
      setModerationSuccess(null)
      setModerationError('Duration must be a positive number')
      return
    }
    setModerationError(null)
    setModerationSuccess(null)
    try {
      await muteUser(userId, duration)
      setMuteUserId('')
      setMuteDuration('')
      setModerationSuccess('User muted successfully')
    } catch (err) {
      console.error(err)
      const status = (err as { status?: number }).status
      if (status === 401) {
        await logout()
        navigate('/login', { replace: true })
        return
      }
      if (status === 403) {
        setModerationError('Admin only: you are not authorized to mute this user')
      } else {
        setModerationError(err instanceof Error ? err.message : 'Failed to mute user')
      }
    }
  }

  const handleBanUser = async () => {
    const userId = banUserId.trim()
    if (!userId) {
      setModerationSuccess(null)
      setModerationError('User ID is required')
      return
    }
    const duration = Number(banDuration)
    if (!banDuration.trim() || !Number.isFinite(duration) || duration <= 0) {
      setModerationSuccess(null)
      setModerationError('Duration must be a positive number')
      return
    }
    setModerationError(null)
    setModerationSuccess(null)
    try {
      await banUser(userId, duration)
      setBanUserId('')
      setBanDuration('')
      setModerationSuccess('User banned successfully')
    } catch (err) {
      console.error(err)
      const status = (err as { status?: number }).status
      if (status === 401) {
        await logout()
        navigate('/login', { replace: true })
        return
      }
      if (status === 403) {
        setModerationError('Admin only: you are not authorized to ban this user')
      } else {
        setModerationError(err instanceof Error ? err.message : 'Failed to ban user')
      }
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      {adminError && <p role="alert" className="error-message">{adminError}</p>}

      <div className="admin-controls">
        <h3>Streams</h3>

        <label htmlFor="admin-stream-select">Select stream</label>
        <select
          id="admin-stream-select"
          className="admin-select"
          value={selectedStream ?? ''}
          disabled={isLoading || streams.length === 0}
          onChange={e => {
            if (e.target.value) void handleStreamSelect(e.target.value)
          }}
        >
          <option value="">-- Select a stream --</option>
          {streams.map(stream => (
            <option key={stream.id} value={stream.id}>
              {stream.name}
            </option>
          ))}
        </select>

        {isLoading && <p>Loading streams…</p>}
        {!isLoading && streamsError && (
          <>
            <p role="alert" className="error-message">{streamsError}</p>
            <button type="button" onClick={fetchStreams} className="stream-button-small">
              Retry
            </button>
          </>
        )}
        {!isLoading && !streamsError && streams.length === 0 && (
          <p>No streams yet. Create one from the dashboard to get started.</p>
        )}

        {!isLoading && !streamsError && streams.length > 0 && (
          <ul>
            {streams.map(stream => (
              <li key={stream.id} className="admin-stream-item">
                <span>{stream.name}</span>{' '}
                <span>{`Stream ${stream.id}`}</span>
                <button
                  onClick={() => handleStreamSelect(stream.id)}
                  title="View messages"
                  className="admin-button"
                >
                  View
                </button>
                <button
                  onClick={() => handleDeleteStream(stream.id)}
                  disabled={deletingStreamIds.includes(stream.id)}
                  title="Delete stream"
                  className="admin-button-danger"
                >
                  {deletingStreamIds.includes(stream.id) ? 'Deleting…' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3>Messages</h3>
        {selectedStream && (
          <div>
            <p>Messages for stream: {selectedStream}</p>
            {isMessagesLoading && <p>Loading messages…</p>}
            {!isMessagesLoading && messages.length === 0 && (
              <p>No messages yet in this stream.</p>
            )}
            <ul>
              {messages.map((msg) => (
                <li key={msg.id} className="admin-message-item">
                  <strong>{msg.user.username}:</strong> {msg.content}
                  <br />
                  <small>{new Date(msg.createdAt).toLocaleString()}</small>
                  <button
                    onClick={() => handleDeleteMessage(msg.id)}
                    disabled={deletingMessageIds.includes(msg.id)}
                    title="Delete message"
                    className="admin-button-danger-small"
                  >
                    {deletingMessageIds.includes(msg.id) ? 'Deleting…' : 'Delete'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h3>Moderation</h3>
        {selectedStream && (
          <div>
            {moderationError && <p role="alert" className="error-message">{moderationError}</p>}
            {moderationSuccess && <p role="status" className="success-message">{moderationSuccess}</p>}
            <input
              type="text"
              placeholder="User ID to mute"
              value={muteUserId}
              onChange={e => setMuteUserId(e.target.value)}
              className="admin-input"
            />
            <input
              type="text"
              placeholder="Mute duration (minutes)"
              value={muteDuration}
              onChange={e => setMuteDuration(e.target.value)}
              className="admin-input"
            />
            <button onClick={handleMuteUser} className="admin-button">Mute</button>

            <input
              type="text"
              placeholder="User ID to ban"
              value={banUserId}
              onChange={e => setBanUserId(e.target.value)}
              className="admin-input"
            />
            <input
              type="text"
              placeholder="Ban duration (days)"
              value={banDuration}
              onChange={e => setBanDuration(e.target.value)}
              className="admin-input"
            />
            <button onClick={handleBanUser} className="admin-button">Ban</button>
          </div>
        )}
      </div>

      {username && (
        <p>Logged in as: {username}</p>
      )}
      <button onClick={handleLogout} className="logout-button">Logout</button>
    </div>
  )
}

export default AdminDashboard
