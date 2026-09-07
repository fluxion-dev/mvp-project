import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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

interface StreamPageProps {
  stream: {
    id: string
    name: string
    messageCount: number
    activityLevel: number
  }
}

const StreamPage = () => {
  const { id: streamId } = useParams<{ id: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [content, setContent] = useState('')
  const { username } = useAuth()

  // Fetch messages when stream changes
  useEffect(() => {
    async function fetchMessages() {
      if (!streamId) return
      try {
        const data = await getMessages(streamId)
        setMessages(data)
      } catch (err) {
        console.error(err)
      }
    }
    fetchMessages()
  }, [streamId])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || !streamId) return
    try {
      const message = await addMessage(streamId, content)
      setMessages([...messages, message])
      setContent('')
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="stream-page">
      <h1>Stream: {messages[0]?.streamId || streamId}</h1>
      
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
          required
          disabled={!username}
        />
        <button type="submit" disabled={!username}>
          Post
        </button>
      </form>
    </div>
  )
}

export default StreamPage