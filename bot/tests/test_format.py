from bot.services.format import md_to_tg_html


def test_bold_and_italic():
    assert md_to_tg_html('**bold** and *italic*') == '<b>bold</b> and <i>italic</i>'

def test_inline_code():
    assert md_to_tg_html('use `foo()`') == 'use <code>foo()</code>'

def test_fenced_code_block_with_lang():
    src = '```python\nprint(1)\n```'
    out = md_to_tg_html(src)
    assert '<pre><code class="language-python">' in out
    assert 'print(1)' in out

def test_link():
    assert md_to_tg_html('[x](https://e.com)') == '<a href="https://e.com">x</a>'

def test_disallowed_tag_stripped():
    out = md_to_tg_html('# Heading')
    assert '<h1>' not in out
    assert 'Heading' in out

def test_html_escapes_unsafe_chars():
    assert md_to_tg_html('a < b') == 'a &lt; b'
