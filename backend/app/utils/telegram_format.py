"""Markdown -> Telegram-HTML allowlist converter + chunk splitter.

Telegram supports a small HTML subset: <b> <i> <u> <s> <code> <pre> <a> <blockquote>.
We render markdown via markdown-it-py, then walk the HTML and keep only allowed tags.
Anything else is replaced by its text content. < and > in raw text are escaped.

Shared by `bot/` (live chat streaming) and `scheduler/` (routine result delivery).
"""
import re
from html import escape
from markdown_it import MarkdownIt

TG_MAX = 4000

_md = MarkdownIt('commonmark', {'html': False, 'breaks': True, 'linkify': False})

_ALLOWED = {'b', 'strong', 'i', 'em', 'u', 's', 'code', 'pre', 'a', 'blockquote'}
_REPLACE = {'strong': 'b', 'em': 'i'}

_TAG_RE = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>')


def md_to_tg_html(md: str) -> str:
    raw = _md.render(md)
    return _sanitize(raw).strip()


def _sanitize(html: str) -> str:
    out = []
    pos = 0
    for m in _TAG_RE.finditer(html):
        out.append(html[pos:m.start()])
        closing, tag, attrs = m.group(1), m.group(2).lower(), (m.group(3) or '')
        if tag in _ALLOWED:
            tag_out = _REPLACE.get(tag, tag)
            if tag == 'a' and not closing:
                href_match = re.search(r'href="([^"]*)"', attrs)
                href = href_match.group(1) if href_match else ''
                out.append(f'<a href="{escape(href, quote=True)}">')
            elif tag == 'pre' and not closing:
                out.append('<pre>')
            elif tag == 'code' and not closing and 'class="language-' in attrs:
                cls = re.search(r'class="(language-[^"]*)"', attrs).group(1)
                out.append(f'<code class="{escape(cls, quote=True)}">')
            else:
                out.append(f'<{"/" if closing else ""}{tag_out}>')
        pos = m.end()
    out.append(html[pos:])
    return ''.join(out).replace('<p>', '').replace('</p>', '\n').replace('<br>', '\n').replace('<br />', '\n')


def split_for_telegram(text: str, max_len: int = TG_MAX):
    """Split plain text into chunks <= max_len for Telegram's 4096-char message cap.

    Caller is responsible for converting each chunk via md_to_tg_html before sending.
    Splits on hard char boundary; keeps things simple and safe for arbitrary input.
    """
    if not text:
        return []
    return [text[i:i + max_len] for i in range(0, len(text), max_len)]
