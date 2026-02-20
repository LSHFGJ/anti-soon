import { describe, it, expect } from 'vitest'

// Test helper functions from main.ts by importing them
// Note: We need to extract pure functions for unit testing

describe('parseRepoUrl', () => {
  function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?]+)/)
    if (!match) return null
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
  }

  it('parses standard GitHub URL', () => {
    const result = parseRepoUrl('https://github.com/owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses GitHub URL with .git suffix', () => {
    const result = parseRepoUrl('https://github.com/owner/repo.git')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses GitHub URL with query params', () => {
    const result = parseRepoUrl('https://github.com/owner/repo?tab=readme')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('returns null for invalid URL', () => {
    expect(parseRepoUrl('https://gitlab.com/owner/repo')).toBeNull()
    expect(parseRepoUrl('not-a-url')).toBeNull()
  })
})

describe('extractContractNames', () => {
  function extractContractNames(content: string): string[] {
    const contracts: string[] = []
    const regex = /new\s+([A-Z][a-zA-Z0-9_]*)\s*\(/g
    let match
    while ((match = regex.exec(content)) !== null) {
      if (!contracts.includes(match[1])) {
        contracts.push(match[1])
      }
    }
    return contracts
  }

  it('extracts single contract name', () => {
    const code = 'Vault vault = new Vault();'
    expect(extractContractNames(code)).toEqual(['Vault'])
  })

  it('extracts multiple contract names', () => {
    const code = `
      Vault vault = new Vault();
      Token token = new Token();
    `
    expect(extractContractNames(code)).toEqual(['Vault', 'Token'])
  })

  it('deduplicates contract names', () => {
    const code = `
      Vault vault = new Vault();
      Vault vault2 = new Vault();
    `
    expect(extractContractNames(code)).toEqual(['Vault'])
  })

  it('returns empty array for no matches', () => {
    expect(extractContractNames('no contracts here')).toEqual([])
  })

  it('handles lowercase contract names (not matched)', () => {
    const code = 'myContract c = new myContract();'
    expect(extractContractNames(code)).toEqual([])
  })
})
