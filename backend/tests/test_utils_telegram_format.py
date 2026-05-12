"""Unit tests for app/utils/telegram_format.py — pure functions, no I/O.

`markdown-it-py` lives in bot/ + scheduler/ requirements, not backend's. Skip
if it's missing from this venv (tests still run end-to-end from those services).
"""

import pytest

pytest.importorskip('markdown_it')

from app.utils.telegram_format import (  # noqa: E402
    md_to_tg_html,
    split_for_telegram,
    TG_MAX,
)


class TestMdToTgHtml:
    def test_bold_strong_normalised_to_b(self):
        out = md_to_tg_html('**bold**')
        assert '<b>bold</b>' in out
        assert '<strong>' not in out

    def test_italic_em_normalised_to_i(self):
        out = md_to_tg_html('*italic*')
        assert '<i>italic</i>' in out
        assert '<em>' not in out

    def test_inline_code(self):
        out = md_to_tg_html('`x = 1`')
        assert '<code>x = 1</code>' in out

    def test_code_block_with_lang_keeps_class(self):
        out = md_to_tg_html('```python\nprint(1)\n```')
        assert '<pre>' in out
        assert 'class="language-python"' in out

    def test_link_href_preserved(self):
        out = md_to_tg_html('[hi](https://example.com)')
        assert '<a href="https://example.com">hi</a>' in out

    def test_link_href_html_escaped(self):
        # href with a double-quote must be escaped to avoid breaking the attribute.
        out = md_to_tg_html('[x](https://example.com/?q="a")')
        assert '&quot;' in out
        assert '"a">' not in out  # raw unescaped should not appear

    def test_disallowed_tag_dropped(self):
        # Image tag is not in the allowlist; raw alt text should remain.
        # markdown-it renders ![alt](url) -> <img ...>; sanitizer drops the tag.
        out = md_to_tg_html('![alt](https://e.com/img.png)')
        assert '<img' not in out

    def test_paragraph_tags_replaced_with_newline(self):
        out = md_to_tg_html('para a\n\npara b')
        assert '<p>' not in out
        assert '</p>' not in out
        assert 'para a' in out and 'para b' in out

    def test_blockquote_kept(self):
        out = md_to_tg_html('> quoted')
        assert '<blockquote>' in out and 'quoted' in out

    def test_strikethrough_via_html_disabled(self):
        # html=False in markdown-it config, so raw <script> is escaped.
        out = md_to_tg_html('<script>alert(1)</script>')
        assert '<script>' not in out
        assert 'alert(1)' in out


class TestSplitForTelegram:
    def test_empty_returns_empty_list(self):
        assert split_for_telegram('') == []
        assert split_for_telegram(None) == []

    def test_short_returns_single_chunk(self):
        out = split_for_telegram('hi')
        assert out == ['hi']

    def test_splits_on_max_len(self):
        out = split_for_telegram('abcdef', max_len=2)
        assert out == ['ab', 'cd', 'ef']

    def test_uses_default_tg_max(self):
        big = 'x' * (TG_MAX + 100)
        chunks = split_for_telegram(big)
        assert len(chunks) == 2
        assert len(chunks[0]) == TG_MAX
        assert len(chunks[1]) == 100
