import { GITHUB_CLIENT_ID, GITHUB_REDIRECT_URI, GITHUB_SCOPE, GITHUB_OAUTH_URL, GITHUB_API_URL } from '../config'

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  owner: {
    login: string
    id: number
  }
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  html_url: string
  created_at: string
  updated_at: string
}

const GITHUB_TOKEN_KEY = 'github_access_token'

export function initGitHubOAuth() {
  const state = crypto.randomUUID()
  sessionStorage.setItem('github_oauth_state', state)

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: GITHUB_SCOPE,
    state,
    allow_signup: 'true'
  })

  const authUrl = `${GITHUB_OAUTH_URL}?${params.toString()}`
  window.location.href = authUrl
}

export function getGitHubToken(): string | null {
  const hash = window.location.hash.substring(1)
  const params = new URLSearchParams(hash)
  const token = params.get('access_token')
  const state = params.get('state')
  const storedState = sessionStorage.getItem('github_oauth_state')

  if (!token || !state || state !== storedState) {
    return null
  }

  sessionStorage.setItem(GITHUB_TOKEN_KEY, token)
  sessionStorage.removeItem('github_oauth_state')

  return token
}

export function getStoredGitHubToken(): string | null {
  return sessionStorage.getItem(GITHUB_TOKEN_KEY)
}

export async function getRepos(token: string): Promise<GitHubRepo[]> {
  const response = await fetch(`${GITHUB_API_URL}/user/repos`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export function clearGitHubToken() {
  sessionStorage.removeItem(GITHUB_TOKEN_KEY)
}
