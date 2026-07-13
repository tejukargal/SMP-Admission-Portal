// Sanitize-on-render helpers for circular bodies (HTML authored via the
// RichTextEditor). Ported from the SMP Connect app with extra hardening:
// script/iframe/object/embed tags, on* handlers and javascript: URLs are
// stripped before the HTML ever reaches dangerouslySetInnerHTML.

/** Removes dangerous tags/attributes from an HTML string. */
export function sanitizeHtmlContent(html: string): string {
  if (!html) return '';
  let out = html;
  // Strip script/style/iframe/object/embed blocks entirely (incl. content).
  out = out.replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, '');
  // Strip any leftover self-closing/unclosed dangerous tags.
  out = out.replace(/<\/?(script|style|iframe|object|embed|form|input|link|meta)\b[^>]*>/gi, '');
  // Strip inline event handlers: onclick="..."/onerror='...'/onload=x
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Neutralize javascript:/data:text URLs in href/src.
  out = out.replace(/\s(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '');
  out = out.replace(/\s(href|src)\s*=\s*("data:text\/html[^"]*"|'data:text\/html[^']*')/gi, '');
  return out;
}

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Wraps bare URLs in plain-text segments with styled anchor tags. */
export function linkifyUrls(html: string): string {
  // Split on tags so we only linkify text nodes, not attribute values.
  return html.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith('<')) return part;
    return part.replace(URL_RE, (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${url}</a>`);
  }).join('');
}

/** Sanitized + linkified HTML ready for dangerouslySetInnerHTML. */
export function renderHtmlContent(html: string): { __html: string } {
  return { __html: linkifyUrls(sanitizeHtmlContent(html)) };
}

/** Plain-text version of an HTML string — for card previews and "body is non-empty" validation. */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Circular display date, e.g. "13 Jul 2026". Falls back to the raw string if unparseable. */
export function formatCircularDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Human-readable file size, e.g. "482 KB" / "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
