let githubToken = typeof process.env.GITHUB_TOKEN === 'string' ? process.env.GITHUB_TOKEN.trim() : ''

export function hasGitHubToken(): boolean {
  return githubToken.length > 0
}

export function getGitHubToken(): string | undefined {
  return githubToken || undefined
}

export function setGitHubToken(token: string): void {
  githubToken = token.trim()
}

