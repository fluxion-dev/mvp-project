const API_BASE = 'http://localhost:5000'

export interface Stream {
  id: string
  name: string
  messageCount: number
  activityLevel: number
}

export interface Message {
  id: string
  streamId: string
  content: string
  createdAt: string
  user: {
    id: string
    username: string
  }
}

export const getStreams = async (): Promise<Stream[]> => {
  const res = await fetch(`${API_BASE}/api/streams`)
  if (!res.ok) throw new Error('Failed to fetch streams')
  return res.json()
}

export const createStream = async (name: string): Promise<Stream> => {
  const res = await fetch(`${API_BASE}/api/streams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to create stream')
  return res.json()
}

export const addMessage = async (streamId: string, content: string): Promise<Message> => {
  const res = await fetch(`${API_BASE}/api/streams/${streamId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error('Failed to add message')
  return res.json()
}

export const deleteStream = async (streamId: string) => {
  const res = await fetch(`${API_BASE}/api/streams/${streamId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete stream')
}

export const deleteMessage = async (messageId: string) => {
  const res = await fetch(`${API_BASE}/api/messages/${messageId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete message')
}
