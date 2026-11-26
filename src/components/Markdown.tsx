import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo } from 'react'

marked.setOptions({ gfm: true, breaks: true })

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text || '', { async: false }) as string
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
  }, [text])

  return <div className={`prose-note ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
