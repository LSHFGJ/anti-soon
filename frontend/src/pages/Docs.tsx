import { useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { collectDocsRoutePathViolations } from '../lib/docsPolicy'
import { DOCS_CONTENT } from '../reference/content'
import type { DocsContentBlock } from '../reference/content/schema'

type DocsShellPage = {
  slug: string
  title: string
  href: string
}

type MermaidModule = {
  default: {
    initialize: (config: Record<string, unknown>) => void
    render: (id: string, text: string) => Promise<{ svg: string }>
  }
}

let mermaidInstancePromise: Promise<MermaidModule['default']> | null = null
let hasInitializedMermaid = false

async function getMermaidInstance() {
  if (!mermaidInstancePromise) {
    mermaidInstancePromise = import('mermaid').then((mermaidModule) => mermaidModule.default as MermaidModule['default'])
  }

  const mermaid = await mermaidInstancePromise
  if (!hasInitializedMermaid) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        primaryColor: '#f8faf7',
        primaryTextColor: '#20272b',
        primaryBorderColor: '#9cb191',
        lineColor: '#4e6856',
        secondaryColor: '#eef2eb',
        tertiaryColor: '#f4f0e6',
        background: '#ffffff',
        mainBkg: '#f8faf7',
        secondBkg: '#eef2eb',
        tertiaryBkg: '#f4f0e6',
        textColor: '#20272b',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    })
    hasInitializedMermaid = true
  }

  return mermaid
}

const DOCS_SHELL_PAGES: readonly DocsShellPage[] = [
  { slug: 'overview', title: 'Docs Overview', href: '/docs' },
  { slug: 'why-antisoon', title: 'Why AntiSoon', href: '/docs/why-antisoon' },
  { slug: 'architecture', title: 'Architecture', href: '/docs/architecture' },
  { slug: 'data-flow', title: 'Data Flow', href: '/docs/data-flow' },
  { slug: 'security', title: 'Security', href: '/docs/security' },
  { slug: 'operations', title: 'Operations', href: '/docs/operations' },
  { slug: 'troubleshooting', title: 'Troubleshooting', href: '/docs/troubleshooting' },
  { slug: 'getting-started', title: 'Getting Started', href: '/docs/getting-started' },
  { slug: 'submit-poc', title: 'Submit a PoC', href: '/docs/submit-poc' },
  { slug: 'explore-projects', title: 'Explore Projects', href: '/docs/explore-projects' },
  { slug: 'create-project', title: 'Create a Project', href: '/docs/create-project' },
  { slug: 'dashboard-and-leaderboard', title: 'Dashboard & Leaderboard', href: '/docs/dashboard-and-leaderboard' },
  { slug: 'glossary', title: 'Glossary', href: '/docs/glossary' },
  { slug: 'deployments-and-repositories', title: 'Addresses', href: '/docs/deployments-and-repositories' },
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

function renderInlineDocsText(text: string) {
  const pattern = /(`[^`]+`|\\?\[[^\]]+\]\((https?:\/\/[^)]+|\/docs[^)]*)\))/g
  const nodes: React.ReactNode[] = []
  let cursor = 0

  for (const match of text.matchAll(pattern)) {
    const full = match[0]
    const index = match.index ?? 0

    if (index > cursor) {
      const plain = text.slice(cursor, index)
      nodes.push(<span key={`text-${cursor}`}>{plain}</span>)
    }

    if (full.startsWith('`') && full.endsWith('`')) {
      nodes.push(
        <code key={`code-${index}`} className="docs-reader-inline-code">
          {full.slice(1, -1)}
        </code>,
      )
    } else {
      const linkMatch = full.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        const [, label, href] = linkMatch
        if (isInternalDocsHref(href)) {
          nodes.push(
            <Link key={`link-${index}`} to={href} className="docs-reader-inline-link">
              {label}
            </Link>,
          )
        } else {
          nodes.push(
            <a key={`link-${index}`} href={href} className="docs-reader-inline-link" target="_blank" rel="noreferrer">
              {label}
            </a>,
          )
        }
      } else {
        nodes.push(<span key={`text-${index}`}>{full}</span>)
      }
    }

    cursor = index + full.length
  }

  if (cursor < text.length) {
    nodes.push(<span key={`text-${cursor}`}>{text.slice(cursor)}</span>)
  }

  return nodes
}

const CALLOUT_STYLES: Record<'info' | 'success' | 'warning' | 'error', string> = {
  info: 'border-[#cfd8f6] bg-[#eef4ff] text-[#25407a]',
  success: 'border-[#c8dfcc] bg-[#eef8f0] text-[#1f5b32]',
  warning: 'border-[#ead8b2] bg-[#fff8e8] text-[#7a5710]',
  error: 'border-[#edc9c6] bg-[#fff0ef] text-[#8a2f2f]',
}

function MermaidDiagram({ diagram, caption }: { diagram: string; caption?: string }) {
  const [isRendered, setIsRendered] = useState(false)
  const [hasError, setHasError] = useState(false)
  const diagramId = useId().replace(/:/g, '-')
  const renderTargetRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let isActive = true

    async function renderDiagram() {
      setIsRendered(false)
      setHasError(false)
      if (renderTargetRef.current) {
        renderTargetRef.current.innerHTML = ''
      }

      try {
        const mermaid = await getMermaidInstance()
        if ('fonts' in document && typeof document.fonts?.ready?.then === 'function') {
          await document.fonts.ready
        }
        const { svg: renderedSvg } = await mermaid.render(`docs-mermaid-${diagramId}`, diagram)
        if (!isActive) {
          return
        }
        if (renderTargetRef.current) {
          renderTargetRef.current.innerHTML = renderedSvg
        }
        setIsRendered(true)
        setHasError(false)
      } catch {
        if (!isActive) {
          return
        }
        if (renderTargetRef.current) {
          renderTargetRef.current.innerHTML = ''
        }
        setIsRendered(false)
        setHasError(true)
      }
    }

    renderDiagram()

    return () => {
      isActive = false
    }
  }, [diagram, diagramId])

  return (
    <figure className="docs-reader-block docs-reader-mermaid">
      <div className="docs-reader-block-label">
        Flowchart
      </div>
      <div
        className={[
          'px-4 py-4',
          isRendered ? 'overflow-x-auto' : '',
        ].join(' ')}
        data-docs-mermaid={isRendered ? 'rendered' : hasError ? 'error' : 'loading'}
      >
        {hasError ? (
          <div className="docs-reader-muted docs-reader-probe-state">
            Mermaid diagram failed to render in this environment.
          </div>
        ) : null}
        {!hasError && !isRendered ? (
          <div className="docs-reader-muted docs-reader-probe-state">
            Rendering diagram...
          </div>
        ) : null}
        <div
          ref={renderTargetRef}
          className={isRendered ? 'docs-reader-mermaid-target [&_svg]:h-auto [&_svg]:max-w-full' : 'hidden'}
        />
      </div>
      {caption ? (
        <figcaption className="docs-reader-block-caption">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

function renderBlock(block: DocsContentBlock, index: number) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p key={index} className="docs-reader-paragraph">
          {renderInlineDocsText(block.text)}
        </p>
      )
    case 'list': {
      const ListTag = block.style === 'ordered' ? 'ol' : 'ul'
      const listClass = block.style === 'ordered' ? 'list-decimal' : 'list-disc'
      return (
        <ListTag key={index} className={`docs-reader-list ${listClass} list-outside`}>
          {block.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static docs content
            <li key={i}>{renderInlineDocsText(item)}</li>
          ))}
        </ListTag>
      )
    }
    case 'callout':
      return (
        <div key={index} className={`docs-reader-callout ${CALLOUT_STYLES[block.tone]}`}>
          <strong className="docs-reader-callout-title">{block.title}</strong>
          <div className="space-y-2">
            {block.body.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Static docs content
              <p key={i} className="docs-reader-callout-body">{renderInlineDocsText(p)}</p>
            ))}
          </div>
        </div>
      )
    case 'steps':
      return (
        <div key={index} className="docs-reader-steps">
          {block.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static docs content
            <div key={i} className="docs-reader-step">
              <div className="docs-reader-step-index">
                {i + 1}
              </div>
              <div className="flex-1 pt-0.5 min-w-0">
                <h4 className="docs-reader-step-title">{renderInlineDocsText(item.title)}</h4>
                <p className="docs-reader-step-body">{renderInlineDocsText(item.body)}</p>
              </div>
            </div>
          ))}
        </div>
      )
    case 'code':
      return (
        <figure key={index} className="docs-reader-block docs-reader-code">
          <div className="docs-reader-block-label">
            {block.language}
          </div>
          <pre className="docs-reader-code-pre">
            <code className="docs-reader-code-content">
              {block.code}
            </code>
          </pre>
          {block.caption ? (
            <figcaption className="docs-reader-block-caption">
              {block.caption}
            </figcaption>
          ) : null}
        </figure>
      )
    case 'table':
      return (
        <figure key={index} className="docs-reader-block docs-reader-table-wrap">
          <div className="overflow-x-auto rounded-2xl border border-[var(--docs-border)] bg-[var(--docs-surface-strong)]">
            <table className="docs-reader-table w-full border-collapse text-left">
              {block.caption ? (
                <caption className="docs-reader-table-caption">
                  {block.caption}
                </caption>
              ) : null}
              <thead>
                <tr className="docs-reader-table-head-row">
                  {block.columns.map((column) => (
                    <th key={column} className="docs-reader-table-head-cell">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={getTableRowKey(row, rowIndex)} className="docs-reader-table-row">
                    {row.map((cell, cellIndex) => (
                      <td key={`${block.columns[cellIndex]}:${cell}`} className="docs-reader-table-cell">
                        {renderInlineDocsText(cell)}
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
        <ul key={index} className="docs-reader-link-list">
          {block.items.map((item) => {
            const linkClass = 'docs-reader-link-list-title'

            return (
              <li key={`${item.href}-${item.title}`} className="docs-reader-link-list-item">
                {isInternalDocsHref(item.href) ? (
                  <Link to={item.href} className={linkClass}>
                    {item.title}
                  </Link>
                ) : (
                  <a href={item.href} className={linkClass}>
                    {item.title}
                  </a>
                )}
                <p className="docs-reader-link-list-description">{renderInlineDocsText(item.description)}</p>
              </li>
            )
          })}
        </ul>
      )
    case 'mermaid':
      return <MermaidDiagram key={index} diagram={block.diagram} caption={block.caption} />
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

  const currentAnchorId = decodeDocsHash(location.hash)

  return (
    <div className="docs-reader-shell min-h-[calc(100vh-142px)] py-6" data-docs-route="page" data-docs-page={currentShellPage.slug}>
      <div className="container docs-reader-grid min-h-0">
        <aside className="docs-reader-sidebar-shell">
          <div className="docs-reader-sidebar-card">
            <div className="docs-reader-sidebar-label">Pages</div>
            <nav data-docs-nav="pages" aria-label="Docs pages" className="space-y-2">
              {DOCS_SHELL_PAGES.map((page) => {
                const isActivePage = page.slug === currentShellPage.slug

                return (
                  <Link
                    key={page.slug}
                    to={page.href}
                    aria-current={isActivePage ? 'page' : undefined}
                    className={[
                      'docs-reader-nav-link',
                      isActivePage
                        ? 'docs-reader-nav-link-active'
                        : 'docs-reader-nav-link-idle',
                    ].join(' ')}
                  >
                    {page.title}
                  </Link>
                )
              })}
            </nav>
          </div>
        </aside>

        <div className="docs-reader-main min-w-0">
          <header className="docs-reader-header" data-testid="page-header">
            <h1 className="docs-reader-title">{displayTitle}</h1>
          </header>

          <article className="docs-reader-article">
            {displaySections.map((section) => (
            <section key={section.id} id={section.anchor.id} className="docs-reader-section scroll-mt-24 group">
              <div className="docs-reader-section-header">
                <h2 className="docs-reader-section-title">
                  {section.title}
                  <a href={`#${section.anchor.id}`} className="docs-reader-section-anchor" aria-label={`Jump to ${section.title}`}>
                    #
                  </a>
                </h2>
              </div>
              <div className="docs-reader-section-body">
                  {section.blocks.map((block, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Static docs content blocks
                    <div key={index}>{renderBlock(block, index)}</div>
                  ))}
              </div>
            </section>
            ))}
          </article>
        </div>

        <aside className="docs-reader-toc-shell" aria-label="On this page">
          <div className="docs-reader-toc-card">
            <div className="docs-reader-sidebar-label">Outline</div>
            <nav className="space-y-1">
              {displaySections.map((section) => {
                const isActiveAnchor = currentAnchorId === section.anchor.id

                return (
                  <a
                    key={section.id}
                    href={`#${section.anchor.id}`}
                    className={[
                      'docs-reader-toc-link',
                      isActiveAnchor ? 'docs-reader-toc-link-active' : 'docs-reader-toc-link-idle',
                    ].join(' ')}
                  >
                    {section.anchor.label}
                  </a>
                )
              })}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  )
}
