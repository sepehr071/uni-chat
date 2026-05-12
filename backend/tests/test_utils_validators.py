"""Unit tests for app/utils/validators.py — pure functions, no Flask/Mongo."""

from app.utils.validators import (
    validate_email_address,
    validate_password,
    validate_display_name,
    validate_config_name,
    validate_system_prompt,
)


class TestValidateEmail:
    def test_valid_email_returns_normalized(self):
        out = validate_email_address('foo@gmail.com')
        assert out == 'foo@gmail.com'

    def test_invalid_email_returns_none(self):
        assert validate_email_address('not-an-email') is None
        assert validate_email_address('') is None
        assert validate_email_address('no@host') is None


class TestValidatePassword:
    def test_too_short(self):
        ok, err = validate_password('abc1')
        assert ok is False and 'at least 8' in err

    def test_too_long(self):
        ok, err = validate_password('a1' + 'x' * 200)
        assert ok is False and 'less than 128' in err

    def test_missing_letter(self):
        ok, err = validate_password('12345678')
        assert ok is False and 'letter' in err

    def test_missing_digit(self):
        ok, err = validate_password('abcdefghij')
        assert ok is False and 'number' in err

    def test_valid_password(self):
        ok, err = validate_password('Abcdef12')
        assert ok is True and err is None


class TestValidateDisplayName:
    def test_empty_rejected(self):
        ok, err = validate_display_name('')
        assert ok is False and 'required' in err

    def test_whitespace_only_rejected(self):
        ok, err = validate_display_name('   ')
        assert ok is False

    def test_too_short(self):
        ok, err = validate_display_name('A')
        assert ok is False and 'at least 2' in err

    def test_too_long(self):
        ok, err = validate_display_name('x' * 51)
        assert ok is False and 'less than 50' in err

    def test_invalid_chars(self):
        ok, err = validate_display_name('Bad<Name>')
        assert ok is False and 'invalid characters' in err

    def test_unicode_allowed(self):
        ok, err = validate_display_name('سپهر رادمرد')
        assert ok is True and err is None

    def test_dash_dot_allowed(self):
        ok, _ = validate_display_name('J.R-Smith')
        assert ok is True


class TestValidateConfigName:
    def test_empty_rejected(self):
        ok, err = validate_config_name('')
        assert ok is False and 'required' in err

    def test_too_short(self):
        ok, _ = validate_config_name('a')
        assert ok is False

    def test_too_long(self):
        ok, _ = validate_config_name('x' * 101)
        assert ok is False

    def test_valid(self):
        ok, err = validate_config_name('My Config')
        assert ok is True and err is None


class TestValidateSystemPrompt:
    def test_empty_allowed(self):
        ok, err = validate_system_prompt('')
        assert ok is True

    def test_too_long_rejected(self):
        ok, err = validate_system_prompt('x' * 10001)
        assert ok is False and '10000' in err

    def test_boundary_allowed(self):
        ok, _ = validate_system_prompt('x' * 10000)
        assert ok is True
