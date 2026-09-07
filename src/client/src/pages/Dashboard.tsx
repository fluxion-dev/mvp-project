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
    if (!newStreamName.trim()) return
    try {
      const stream = await createStream(newStreamName)
      setStreams([...streams, stream])
      setNewStreamName('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleLogout = () => {
    logout()
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
          onKeyDown={e => e.key === 'Enter' && handleCreateStream()}
          className="stream-input"
        />
        <button onClick={handleCreateStream} className="stream-button">Create</button>
      </div>

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
