import { useState, useEffect } from 'react'
import { getRepos, GitHubRepo } from '../lib/github'

interface RepoPickerProps {
  token: string
  onSelect: (repo: GitHubRepo) => void
  selectedRepo?: GitHubRepo | null
}

export function RepoPicker({ token, onSelect, selectedRepo }: RepoPickerProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRepos() {
      try {
        setIsLoading(true)
        setError(null)
        const data = await getRepos(token)
        // Sort by updated_at descending
        const sorted = data.sort((a, b) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        setRepos(sorted)
        setFilteredRepos(sorted)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch repositories')
      } finally {
        setIsLoading(false)
      }
    }

    if (token) {
      fetchRepos()
    }
  }, [token])

  useEffect(() => {
    if (!search.trim()) {
      setFilteredRepos(repos)
    } else {
      const query = search.toLowerCase()
      setFilteredRepos(
        repos.filter(r => 
          r.name.toLowerCase().includes(query) ||
          r.full_name.toLowerCase().includes(query) ||
          (r.description?.toLowerCase().includes(query))
        )
      )
    }
  }, [search, repos])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-gray-400">Loading repositories...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 border border-red-500/50 bg-red-500/10 text-red-400">
        <p className="font-medium">Error loading repositories</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repositories..."
          className="w-full px-4 py-2 pl-10 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
        />
        <svg 
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Repository List */}
      <div className="max-h-96 overflow-y-auto space-y-2">
        {filteredRepos.length === 0 ? (
          <p className="text-center py-8 text-gray-500">
            {repos.length === 0 ? 'No repositories found' : 'No matching repositories'}
          </p>
        ) : (
          filteredRepos.map((repo) => (
            <button
              key={repo.id}
              onClick={() => onSelect(repo)}
              className={`w-full text-left p-4 border transition-all duration-200 ${
                selectedRepo?.id === repo.id
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">{repo.full_name}</span>
                    {repo.language && (
                      <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300">
                        {repo.language}
                      </span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">{repo.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z" />
                      </svg>
                      {repo.stargazers_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 .5a7.5 7.5 0 00-5.264 12.865l-.263 3.885 3.885-.263A7.5 7.5 0 108 .5z" />
                      </svg>
                      {repo.forks_count}
                    </span>
                    <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {selectedRepo?.id === repo.id && (
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      <p className="text-sm text-gray-500">
        {filteredRepos.length} of {repos.length} repositories
      </p>
    </div>
  )
}
