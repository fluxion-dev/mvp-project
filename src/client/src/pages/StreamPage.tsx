import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { addMessage, getMessages } from '../services/api'

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

const MAX_MESSAGE_LENGTH = 500

const StreamPage = () => {
  const { id: streamId } = useParams<{ id: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [content, setContent] = useState('')
  const [postError, setPostError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const { username, logout } = useAuth()
  const navigate = useNavigate()

  async function fetchMessages() {
    if (!streamId) return
    setListError(null)
    try {
      const data = await getMessages(streamId)
      setMessages(data)
      setListError(null)
    } catch (err) {
      console.error(err)
      if ((err as { status?: number }).status === 401) {
        await logout()
        navigate('/login', { replace: true })
        return
      }
      setListError(err instanceof Error ? err.message : 'Failed to fetch messages')
    }
  }

  // Fetch messages when stream changes
  useEffect(() => {
    fetchMessages()
  }, [streamId])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!streamId) return
    const trimmed = content.trim()
    if (!trimmed) {
      setPostError('Message is required')
      return
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      // NOTE: native maxLength handles normal typing; this guard covers
      // paste/programmatic values that bypass maxLength.
      setPostError('Message must be 500 characters or less')
      return
    }
    setPostError(null)
    setIsPosting(true)
    try {
      const message = await addMessage(streamId, trimmed)
      setMessages(prev => [...prev, message])
      setContent('')
      setPostError(null)
    } catch (err) {
      console.error(err)
      if ((err as { status?: number }).status === 401) {
        await logout()
        navigate('/login', { replace: true })
        return
      }
      setPostError(err instanceof Error ? err.message : 'Failed to add message')
    } finally {
      setIsPosting(false)
    }
  }

  return (
    <div className="stream-page">
      <h1>Stream: {messages[0]?.streamId || streamId}</h1>

      {listError && (
        <>
          <p role="alert" className="error-message">{listError}</p>
          <button type="button" onClick={fetchMessages} className="stream-button-small">
            Retry
          </button>
        </>
      )}

      <div className="message-list">
        {messages.map((message) => (
          <div key={message.id} className="message-item">
            <strong>{message.user.username}</strong>
            <span>{message.content}</span>
            <span className="message-time">{new Date(message.createdAt).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>

      {/* Message input form */}
      <form onSubmit={handleSendMessage} className="message-form">
        <input
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Add a message..."
          aria-label="Add a message"
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={!username || isPosting}
        />
        <button type="submit" disabled={!username || isPosting}>
          {isPosting ? 'Posting…' : 'Post'}
        </button>
      </form>
      {postError && <p role="alert" className="error-message">{postError}</p>}
    </div>
  )
}

export default StreamPage
