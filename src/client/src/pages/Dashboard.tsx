import React from 'react'

interface Stream {
  id: string
  name: string
  messageCount: number
  activityLevel: number
}

const Dashboard = ({ streams }: { streams: Stream[] }) => {
  return (
    <div className="dashboard">
      <h1>Streams</h1>
      <ul>
        {streams.map((stream) => (
          <li key={stream.id} className="stream-item">
            <h3>{stream.name}</h3>
            <p>Messages: {stream.messageCount}</p>
            <p>Activity: {stream.activityLevel}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default Dashboard
