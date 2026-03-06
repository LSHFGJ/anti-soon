import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { NeonPanel, PageHeader, StatusBanner } from '../components/shared/ui-primitives'
import { DOCS_CONTENT } from '../reference/content'
import type { DocsContentBlock } from '../reference/content/schema'

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
    default:
      return null
  }
}

export function Docs() {
  const location = useLocation()
  const normalizedPath = normalizeDocsPath(location.pathname)
  const page = DOCS_CONTENT.find((entry) => entry.href === normalizedPath)
  const shouldRedirectToDocs = !page && normalizedPath !== '/docs'

  useEffect(() => {
    if (!page || shouldRedirectToDocs) {
      return
    }

    const anchorId = decodeDocsHash(location.hash)
    if (anchorId.length === 0) {
      window.scrollTo({ top: 0, behavior: 'auto' })
      return
    }

    if (!page.sections.some((section) => section.anchor.id === anchorId)) {
      window.scrollTo({ top: 0, behavior: 'auto' })
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [location.hash, page, shouldRedirectToDocs])

  if (shouldRedirectToDocs) {
    return <Navigate to="/docs" replace />
  }

  if (!page) {
    return null
  }

  return (
    <div className="min-h-[calc(100vh-142px)] flex flex-col py-6" data-docs-route="page">
      <div className="container flex-1 flex flex-col min-h-0">
        <PageHeader title={page.title} subtitle={`> ${page.summary}`} />

        <div className="max-w-4xl space-y-12 mt-8">
          {page.sections.map((section) => (
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
  )
}
