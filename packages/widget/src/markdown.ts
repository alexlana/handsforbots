const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]!)

function safeUrl(url: string): string | undefined {
  const trimmed = url.trim()
  return /^(https?:|mailto:|tel:|\/|#|\.\/)/i.test(trimmed) ? trimmed : undefined
}

function inline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
      // href is already HTML-escaped; unescape &amp; only for the scheme check.
      const url = safeUrl(href.replace(/&amp;/g, '&'))
      return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : match
    })
}

/**
 * Small, safe Markdown subset (bold, italic, code, links, lists, paragraphs).
 * All text is escaped first; only these tags are produced.
 */
export function renderMarkdown(text: string): string {
  const blocks = escapeHtml(text.replace(/\r\n/g, '\n')).split(/\n{2,}/)
  return blocks
    .map((block) => {
      const lines = block.split('\n')
      if (lines.every((l) => /^\s*[-*] /.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`
      }
      if (lines.every((l) => /^\s*\d+[.)] /.test(l))) {
        return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)] /, ''))}</li>`).join('')}</ol>`
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`
    })
    .join('')
}
