const API_BASE = 'http://localhost:5000'

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('mvp_token') ?? sessionStorage.getItem('mvp_token')
  if (token) return { Authorization: `Bearer ${token}` }
  return {}
}

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

export interface CreateStreamRequest {
  name: string
}

export interface MessageResponse {
  id: string
  content: string
  createdAt: string
  userId: string
  streamId: string
}

export interface User {
  id: string
  email: string
  displayName: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface RegisterRequest {
  email: string
  password: string
  displayName: string
}

export interface LoginRequest {
  email: string
  password: string
}

export const getStreams = async (): Promise<Stream[]> => {
  const res = await fetch(`${API_BASE}/api/streams`, {
    headers: getAuthHeaders()
  })
  if (!res.ok) throw new Error('Failed to fetch streams')
  return res.json()
}

export const createStream = async (name: string): Promise<Stream> => {
  const res = await fetch(`${API_BASE}/api/streams`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to create stream')
  return res.json()
}

export const addMessage = async (streamId: string, content: string): Promise<Message> => {
  const res = await fetch(`${API_BASE}/api/streams/${streamId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error('Failed to add message')
  return res.json()
}

export const deleteStream = async (streamId: string) => {
  const res = await fetch(`${API_BASE}/api/streams/${streamId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  })
  if (!res.ok) throw new Error('Failed to delete stream')
}

export const deleteMessage = async (messageId: string) => {
  const res = await fetch(`${API_BASE}/api/messages/${messageId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  })
  if (!res.ok) throw new Error('Failed to delete message')
}

export const getMessages = async (streamId: string): Promise<Message[]> => {
  const res = await fetch(`${API_BASE}/api/streams/${streamId}/messages`, {
    headers: getAuthHeaders()
  })
  if (!res.ok) throw new Error('Failed to fetch messages')
  return res.json()
}

export const muteUser = async (userId: string, durationMinutes: number = 60): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/admin/mute-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ userId, durationMinutes }),
  })
  if (!res.ok) throw new Error('Failed to mute user')
}

export const banUser = async (userId: string, durationDays: number = 7): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/admin/ban-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ userId, durationDays }),
  })
  if (!res.ok) throw new Error('Failed to ban user')
}

export const register = async (email: string, password: string, displayName: string): Promise<AuthResponse> => {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    const message =
      errorData.message ||
      (Array.isArray(errorData.errors) ? errorData.errors[0]?.description : undefined) ||
      errorData.error ||
      'Registration failed'
    throw new Error(message)
  }
  return res.json()
}

export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    const message =
      errorData.message ||
      errorData.error ||
      'Login failed'
    throw new Error(message)
  }
  return res.json()
}

export const logout = async (): Promise<void> => {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    })
  } catch (err) {
    console.warn('Logout request failed (best-effort, clearing local state anyway):', err)
  }
}
