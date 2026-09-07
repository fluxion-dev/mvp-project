import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getStreams, deleteStream as apiDeleteStream, getMessages as apiGetMessages, deleteMessage as apiDeleteMessage, muteUser, banUser } from '../../services/api'

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

const AdminDashboard = () => {
  const [streams, setStreams] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [muteUserId, setMuteUserId] = useState<string | null>(null)
  const [banUserId, setBanUserId] = useState<string | null>(null)
  const { username, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchStreams() {
      try {
        const data = await getStreams()
        setStreams(data.map(s => s.id))
      } catch (err) {
        console.error(err)
      }
    }
    fetchStreams()
  }, [])

  const handleStreamSelect = async (streamId: string) => {
    setSelectedStream(streamId)
    try {
      const data = await apiGetMessages(streamId)
      setMessages(data)
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteStream = async (streamId: string) => {
    if (!confirm('Are you sure you want to delete this stream?')) return
    try {
      await apiDeleteStream(streamId)
      setStreams(streams.filter(id => id !== streamId))
      if (selectedStream === streamId) {
        setSelectedStream(null)
        setMessages([])
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return
    try {
      await apiDeleteMessage(messageId)
      setMessages(messages.filter(m => m.id !== messageId))
    } catch (err) {
      console.error(err)
    }
  }

  const handleMuteUser = async () => {
    if (!muteUserId) return
    try {
      await muteUser(muteUserId, 60)
      setMuteUserId(null)
    } catch (err) {
      console.error(err)
    }
  }

  const handleBanUser = async () => {
    if (!banUserId) return
    try {
      await banUser(banUserId, 7)
      setBanUserId(null)
    } catch (err) {
      console.error(err)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      
      <div className="admin-controls">
        <h3>Streams</h3>
        <ul>
          {streams.map(id => (
            <li key={id}>
              <span>Stream {id}</span>
              <button
                onClick={() => handleDeleteStream(id)}
                style={{ marginLeft: '10px', background: 'tomato', color: 'white' }}
                title="Delete stream"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>

        <h3>Messages</h3>
        {selectedStream && (
          <div>
            <p>Messages for stream: {selectedStream}</p>
            <ul>
              {messages.map((msg) => (
                <li key={msg.id} style={{ marginBottom: '10px', padding: '5px', background: '#f0f0f0' }}>
                  <strong>{msg.user.username}:</strong> {msg.content}
                  <br />
                  <small>{new Date(msg.createdAt).toLocaleTimeString()}</small>
                  <button
                    style={{ marginLeft: '10px', background: 'tomato', color: 'white', fontSize: '10px' }}
                    onClick={() => handleDeleteMessage(msg.id)}
                    title="Delete message"
                  >
                    Del
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h3>Moderation</h3>
        {selectedStream && (
          <div>
            <input
              type="text"
              placeholder="User ID to mute"
              onChange={e => setMuteUserId(e.target.value)}
              style={{ marginRight: '5px' }}
            />
            <button onClick={handleMuteUser} style={{ marginLeft: '5px' }}>Mute</button>
            
            <input
              type="text"
              placeholder="User ID to ban"
              onChange={e => setBanUserId(e.target.value)}
              style={{ marginRight: '5px' }}
            />
            <button onClick={handleBanUser}>Ban</button>
          </div>
        )}
      </div>

      {username && (
        <p>Logged in as: {username}</p>
      )}
      <button onClick={handleLogout} style={{ marginLeft: '10px' }}>Logout</button>
    </div>
  )
}

export default AdminDashboard
