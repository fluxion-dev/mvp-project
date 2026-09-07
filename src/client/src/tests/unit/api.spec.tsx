import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getStreams, createStream } from '../../services/api'

describe('api auth headers (issue #4 Option A — never send x-username)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response)
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does NOT send x-username when only username is stored (no token)', async () => {
    localStorage.setItem('mvp_username', 'TestUser')

    await getStreams()

    expect(fetch).toHaveBeenCalled()
    const [, init] = vi.mocked(fetch).mock.calls[0] as [unknown, RequestInit | undefined]
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers).not.toHaveProperty('x-username')
    expect(headers).not.toHaveProperty('Authorization')
    expect(headers).toEqual({})
  })

  it('sends Bearer token and NO x-username when token is stored', async () => {
    localStorage.setItem('mvp_token', 'jwt-token')
    localStorage.setItem('mvp_username', 'TestUser')

    await getStreams()

    const [, init] = vi.mocked(fetch).mock.calls[0] as [unknown, RequestInit | undefined]
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer jwt-token')
    expect(headers).not.toHaveProperty('x-username')
  })

  it('createStream does NOT send x-username when only username is stored', async () => {
    localStorage.setItem('mvp_username', 'TestUser')
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '1', name: 'x', messageCount: 0, activityLevel: 0 }),
    } as unknown as Response)

    await createStream('new-stream')

    const [, init] = vi.mocked(fetch).mock.calls[0] as [unknown, RequestInit | undefined]
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers).not.toHaveProperty('x-username')
  })
})
