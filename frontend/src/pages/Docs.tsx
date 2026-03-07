import { useEffect } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { NeonPanel, PageHeader, StatusBanner } from '../components/shared/ui-primitives'
import { collectDocsRoutePathViolations } from '../lib/docsPolicy'
import { DOCS_CONTENT } from '../reference/content'
import type { DocsContentBlock } from '../reference/content/schema'

type DocsShellPage = {
  slug: string
  title: string
  href: string
}

const DOCS_SHELL_PAGES: readonly DocsShellPage[] = [
  { slug: 'overview', title: 'Docs Overview', href: '/docs' },
  { slug: 'architecture', title: 'Architecture', href: '/docs/architecture' },
  { slug: 'data-flow', title: 'Data Flow', href: '/docs/data-flow' },
  { slug: 'api-and-contracts', title: 'API & Contracts', href: '/docs/api-and-contracts' },
  { slug: 'security', title: 'Security', href: '/docs/security' },
  { slug: 'operations', title: 'Operations', href: '/docs/operations' },
  { slug: 'troubleshooting', title: 'Troubleshooting', href: '/docs/troubleshooting' },
  { slug: 'getting-started', title: 'Getting Started', href: '/docs/getting-started' },
  { slug: 'submit-poc', title: 'Submit a PoC', href: '/docs/submit-poc' },
  { slug: 'explore-projects', title: 'Explore Projects', href: '/docs/explore-projects' },
  { slug: 'create-project', title: 'Create a Project', href: '/docs/create-project' },
  { slug: 'dashboard-and-leaderboard', title: 'Dashboard & Leaderboard', href: '/docs/dashboard-and-leaderboard' },
  { slug: 'glossary', title: 'Glossary', href: '/docs/glossary' },
]

const DOCS_OVERVIEW_PAGE = DOCS_SHELL_PAGES[0]

function normalizeDocsPath(pathname: string) {
  if (pathname === '/') {
    return pathname
  }

  return pathname.replace(/\/+$/, '') || '/'
}

function decodeDocsHash(hash: string) {
  if (!hash.startsWith('#')) {
    return ''
  }

  try {
    return decodeURIComponent(hash.slice(1)).trim()
  } catch {
    return ''
  }
}

function resolveDocsShellPage(pathname: string): DocsShellPage | null {
  if (pathname === '/docs') {
    return DOCS_OVERVIEW_PAGE
  }

  if (!pathname.startsWith('/docs/')) {
    return null
  }

  const slug = pathname.slice('/docs/'.length)
  if (slug.length === 0 || slug.includes('/')) {
    return null
  }

  return DOCS_SHELL_PAGES.find((page) => page.slug === slug) ?? null
}

function isInternalDocsHref(href: string) {
  return href.startsWith('/docs') && collectDocsRoutePathViolations(href).length === 0
}

function getTableRowKey(row: readonly string[], rowIndex: number) {
  return `${rowIndex}:${row.join('::')}`
}

function renderBlock(block: DocsContentBlock, index: number) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p key={index} className="text-[var(--color-text)] mb-4 leading-relaxed font-mono text-sm">
          {block.text}
        </p>
      )
    case 'list': {
      const ListTag = block.style === 'ordered' ? 'ol' : 'ul'
      const listClass = block.style === 'ordered' ? 'list-decimal' : 'list-disc'
      return (
        <ListTag key={index} className={`${listClass} list-outside ml-5 mb-4 space-y-2 text-[var(--color-text)] font-mono text-sm`}>
          {block.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static docs content
            <li key={i} className="pl-1 leading-relaxed">{item}</li>
          ))}
        </ListTag>
      )
    }
    case 'callout':
      return (
        <StatusBanner
          key={index}
          variant={block.tone}
          className="mb-4 mt-2"
          message={
            <div className="space-y-2">
              <strong className="block uppercase tracking-widest text-xs opacity-90">{block.title}</strong>
              <div className="space-y-2">
                {block.body.map((p, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Static docs content
                  <p key={i} className="leading-relaxed">{p}</p>
                ))}
              </div>
            </div>
          }
        />
      )
    case 'steps':
      return (
        <div key={index} className="space-y-4 mb-4 mt-4">
          {block.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static docs content
            <div key={i} className="flex gap-4">
              <div className="flex-shrink-0 w-6 h-6 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-dim)] flex items-center justify-center text-[var(--color-primary)] font-mono text-xs">
                {i + 1}
              </div>
              <div className="flex-1 pt-0.5">
                <h4 className="text-[var(--color-text)] font-mono text-sm uppercase tracking-wide mb-1">{item.title}</h4>
                <p className="text-[var(--color-text-dim)] font-mono text-sm leading-relaxed">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      )
    case 'code':
      return (
        <figure key={index} className="mb-4 overflow-hidden rounded border border-[var(--color-primary-dim)]">
          <div className="border-b border-[var(--color-primary-dim)] px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
            {block.language}
          </div>
          <pre className="overflow-x-auto px-3 py-3">
            <code className="block whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-[var(--color-text)]">
              {block.code}
            </code>
          </pre>
          {block.caption ? (
            <figcaption className="border-t border-[var(--color-primary-dim)] px-3 py-2 font-mono text-xs text-[var(--color-text-dim)]">
              {block.caption}
            </figcaption>
          ) : null}
        </figure>
      )
    case 'table':
      return (
        <figure key={index} className="mb-4 space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-left text-sm text-[var(--color-text)]">
              {block.caption ? (
                <caption className="mb-2 text-left font-mono text-xs text-[var(--color-text-dim)]">
                  {block.caption}
                </caption>
              ) : null}
              <thead>
                <tr className="border-b border-[var(--color-primary-dim)] text-[var(--color-text-dim)]">
                  {block.columns.map((column) => (
                    <th key={column} className="px-3 py-2 font-mono text-xs uppercase tracking-[0.18em]">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={getTableRowKey(row, rowIndex)} className="border-b border-[var(--color-primary-dim)] last:border-b-0">
                    {row.map((cell, cellIndex) => (
                      <td key={`${block.columns[cellIndex]}:${cell}`} className="px-3 py-2 leading-relaxed">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      )
    case 'link-list':
      return (
        <ul key={index} className="mb-4 space-y-3">
          {block.items.map((item) => {
            const linkClass = 'font-mono text-sm uppercase tracking-[0.12em] text-[var(--color-primary)] hover:text-[var(--color-text)]'

            return (
              <li key={`${item.href}-${item.title}`} className="rounded border border-[var(--color-primary-dim)] px-3 py-3">
                {isInternalDocsHref(item.href) ? (
                  <Link to={item.href} className={linkClass}>
                    {item.title}
                  </Link>
                ) : (
                  <a href={item.href} className={linkClass}>
                    {item.title}
                  </a>
                )}
                <p className="mt-2 font-mono text-sm leading-relaxed text-[var(--color-text-dim)]">{item.description}</p>
              </li>
            )
          })}
        </ul>
      )
    default:
      return null
  }
}

export function Docs() {
  const location = useLocation()
  const normalizedPath = normalizeDocsPath(location.pathname)
  const currentShellPage = resolveDocsShellPage(normalizedPath)
  const overviewContentPage = DOCS_CONTENT.find((entry) => entry.href === '/docs') ?? DOCS_CONTENT[0] ?? null
  const contentPage = DOCS_CONTENT.find((entry) => entry.href === normalizedPath)
    ?? DOCS_CONTENT.find((entry) => entry.slug === currentShellPage?.slug)
    ?? overviewContentPage
  const shouldNormalizePath = location.pathname !== normalizedPath
  const shouldRedirectToDocs = !currentShellPage && normalizedPath !== '/docs'
  const displayTitle = contentPage?.slug === currentShellPage?.slug ? contentPage.title : currentShellPage?.title ?? contentPage?.title ?? ''
  const displaySummary = contentPage?.summary ?? ''
  const displaySections = contentPage?.sections ?? []

  useEffect(() => {
    if (!contentPage || shouldNormalizePath || shouldRedirectToDocs) {
      return
    }

    const anchorId = decodeDocsHash(location.hash)
    if (anchorId.length === 0) {
      window.scrollTo({ top: 0, behavior: 'auto' })
      return
    }

    if (!displaySections.some((section) => section.anchor.id === anchorId)) {
      window.scrollTo({ top: 0, behavior: 'auto' })
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [contentPage, displaySections, location.hash, shouldNormalizePath, shouldRedirectToDocs])

  if (shouldNormalizePath) {
    return <Navigate to={`${normalizedPath}${location.search}${location.hash}`} replace />
  }

  if (shouldRedirectToDocs) {
    return <Navigate to="/docs" replace />
  }

  if (!currentShellPage || !contentPage) {
    return null
  }

  return (
    <div className="min-h-[calc(100vh-142px)] flex flex-col py-6" data-docs-route="page" data-docs-page={currentShellPage.slug}>
      <div className="container flex-1 flex flex-col gap-8 min-h-0 lg:flex-row">
        <aside className="w-full lg:w-64 lg:flex-shrink-0">
          <NeonPanel>
            <nav data-docs-nav="pages" aria-label="Docs pages" className="space-y-2">
              {DOCS_SHELL_PAGES.map((page) => {
                const isActivePage = page.slug === currentShellPage.slug

                return (
                  <Link
                    key={page.slug}
                    to={page.href}
                    aria-current={isActivePage ? 'page' : undefined}
                    className={[
                      'block rounded border px-3 py-2 font-mono text-sm no-underline transition-colors',
                      isActivePage
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-dim)] text-[var(--color-primary)]'
                        : 'border-[var(--color-primary-dim)] text-[var(--color-text-dim)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)]',
                    ].join(' ')}
                  >
                    {page.title}
                  </Link>
                )
              })}
            </nav>
          </NeonPanel>
        </aside>

        <div className="min-w-0 flex-1">
          <PageHeader title={displayTitle} subtitle={`> ${displaySummary}`} />

          <div className="max-w-4xl space-y-12 mt-8">
            {displaySections.map((section) => (
            <section key={section.id} id={section.anchor.id} className="scroll-mt-24 group">
              <div className="mb-4">
                <h2 className="text-xl font-mono uppercase tracking-[0.1em] text-[var(--color-primary)] mb-2 flex items-center gap-2">
                  {section.title}
                  <a href={`#${section.anchor.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-text-dim)] hover:text-[var(--color-primary)]">
                    #
                  </a>
                </h2>
                <p className="text-[var(--color-text-dim)] font-mono text-sm">
                  {section.summary}
                </p>
              </div>
              
              <NeonPanel>
                <div className="flex flex-col gap-2">
                  {section.blocks.map((block, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Static docs content blocks
                    <div key={index}>{renderBlock(block, index)}</div>
                  ))}
                </div>
              </NeonPanel>
            </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
