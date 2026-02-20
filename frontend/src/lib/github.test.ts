import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  initGitHubOAuth,
  getGitHubToken,
  getStoredGitHubToken,
  getRepos,
  clearGitHubToken,
  type GitHubRepo
} from './github'

const mockSessionStorage = new Map<string, string>()

Object.defineProperty(global, 'sessionStorage', {
  value: {
    clear: () => mockSessionStorage.clear(),
    getItem: (key: string) => mockSessionStorage.get(key) ?? null,
    setItem: (key: string, value: string) => mockSessionStorage.set(key, value),
    removeItem: (key: string) => mockSessionStorage.delete(key)
  },
  writable: true
})

Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'test-state')
  },
  writable: true
})

const GITHUB_CLIENT_ID = 'test_client_id'
const GITHUB_REDIRECT_URI = 'http://localhost:5173/callback'
const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize'

vi.mock('../config', () => ({
  GITHUB_CLIENT_ID,
  GITHUB_REDIRECT_URI,
  GITHUB_SCOPE: 'public_repo',
  GITHUB_OAUTH_URL,
  GITHUB_API_URL: 'https://api.github.com'
}))

describe('github.ts', () => {
  beforeEach(() => {
    mockSessionStorage.clear()
    vi.clearAllMocks()
  })

  describe('initGitHubOAuth', () => {
    it('should generate OAuth URL and redirect', () => {
      const mockLocation = { href: '' }
      Object.defineProperty(global, 'window', {
        value: { location: mockLocation, crypto },
        writable: true
      })

      initGitHubOAuth()

      expect(crypto.randomUUID).toHaveBeenCalled()
      expect(sessionStorage.getItem('github_oauth_state')).toBe('test-state')

      const redirectUrl = mockLocation.href
      expect(redirectUrl).toContain(GITHUB_OAUTH_URL)
      expect(redirectUrl).toContain(`client_id=${GITHUB_CLIENT_ID}`)
      expect(redirectUrl).toContain(`redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI)}`)
      expect(redirectUrl).toContain('scope=public_repo')
      expect(redirectUrl).toContain('state=test-state')
    })
  })

  describe('getGitHubToken', () => {
    it('should extract token from URL fragment with valid state', () => {
      const mockLocation = {
        hash: '#access_token=test_token&state=test-state&token_type=bearer'
      }
      Object.defineProperty(global, 'window', { value: { location: mockLocation }, writable: true })
      sessionStorage.setItem('github_oauth_state', 'test-state')

      const token = getGitHubToken()

      expect(token).toBe('test_token')
      expect(sessionStorage.getItem('github_oauth_state')).toBeNull()
      expect(getStoredGitHubToken()).toBe('test_token')
    })

    it('should return null when token is missing', () => {
      const mockLocation = { hash: '#state=test-state&token_type=bearer' }
      Object.defineProperty(global, 'window', { value: { location: mockLocation }, writable: true })
      sessionStorage.setItem('github_oauth_state', 'test-state')

      const token = getGitHubToken()

      expect(token).toBeNull()
      expect(getStoredGitHubToken()).toBeNull()
    })

    it('should return null when state does not match', () => {
      const mockLocation = { hash: '#access_token=test_token&state=wrong-state' }
      Object.defineProperty(global, 'window', { value: { location: mockLocation }, writable: true })
      sessionStorage.setItem('github_oauth_state', 'correct-state')

      const token = getGitHubToken()

      expect(token).toBeNull()
      expect(getStoredGitHubToken()).toBeNull()
    })

    it('should return null when stored state is missing', () => {
      const mockLocation = { hash: '#access_token=test_token&state=test-state' }
      Object.defineProperty(global, 'window', { value: { location: mockLocation }, writable: true })

      const token = getGitHubToken()

      expect(token).toBeNull()
    })
  })

  describe('getStoredGitHubToken', () => {
    it('should return stored token', () => {
      sessionStorage.setItem('github_access_token', 'stored_token')
      expect(getStoredGitHubToken()).toBe('stored_token')
    })

    it('should return null when no token is stored', () => {
      expect(getStoredGitHubToken()).toBeNull()
    })
  })

  describe('clearGitHubToken', () => {
    it('should remove stored token', () => {
      sessionStorage.setItem('github_access_token', 'test_token')
      clearGitHubToken()
      expect(getStoredGitHubToken()).toBeNull()
    })
  })

  describe('getRepos', () => {
    it('should fetch user repos successfully', async () => {
      const mockRepos: GitHubRepo[] = [
        {
          id: 1,
          name: 'repo1',
          full_name: 'user/repo1',
          owner: { login: 'user', id: 1 },
          description: 'Test repo 1',
          language: 'TypeScript',
          stargazers_count: 10,
          forks_count: 5,
          html_url: 'https://github.com/user/repo1',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z'
        },
        {
          id: 2,
          name: 'repo2',
          full_name: 'user/repo2',
          owner: { login: 'user', id: 1 },
          description: null,
          language: 'JavaScript',
          stargazers_count: 5,
          forks_count: 2,
          html_url: 'https://github.com/user/repo2',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z'
        }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockRepos
      }) as any

      const repos = await getRepos('test_token')

      expect(repos).toEqual(mockRepos)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/user/repos',
        {
          headers: {
            Authorization: 'Bearer test_token',
            Accept: 'application/vnd.github.v3+json'
          }
        }
      )
    })

    it('should throw error when API call fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      }) as any

      await expect(getRepos('invalid_token')).rejects.toThrow('GitHub API error: 401 Unauthorized')
    })
  })
})
