"""Unit tests for app/utils/network.py — DNS-resolved guard."""

import socket
from unittest.mock import patch

from app.utils.network import is_internal_host, validate_external_https


def _addrinfo(ip: str):
    """Build a minimal getaddrinfo return matching the (..., (ip, port)) shape."""
    return [(socket.AF_INET, 0, 0, '', (ip, 0))]


class TestIsInternalHost:
    def test_blank_host_is_internal(self):
        assert is_internal_host('') is True
        assert is_internal_host(None) is True

    def test_unresolvable_treated_as_internal(self):
        with patch('app.utils.network.socket.getaddrinfo', side_effect=socket.gaierror()):
            assert is_internal_host('nope.invalid') is True

    def test_loopback_blocked(self):
        with patch('app.utils.network.socket.getaddrinfo', return_value=_addrinfo('127.0.0.1')):
            assert is_internal_host('localhost') is True

    def test_private_blocked(self):
        with patch('app.utils.network.socket.getaddrinfo', return_value=_addrinfo('10.0.0.1')):
            assert is_internal_host('intranet') is True
        with patch('app.utils.network.socket.getaddrinfo', return_value=_addrinfo('192.168.1.1')):
            assert is_internal_host('lan') is True

    def test_link_local_blocked(self):
        with patch('app.utils.network.socket.getaddrinfo', return_value=_addrinfo('169.254.0.1')):
            assert is_internal_host('linklocal') is True

    def test_public_ip_allowed(self):
        with patch('app.utils.network.socket.getaddrinfo', return_value=_addrinfo('8.8.8.8')):
            assert is_internal_host('public.example.com') is False


class TestValidateExternalHttps:
    def test_rejects_http(self):
        ok, reason = validate_external_https('http://example.com')
        assert ok is False and reason == 'must_be_https'

    def test_rejects_missing_host(self):
        ok, reason = validate_external_https('https://')
        assert ok is False and reason == 'no_host'

    def test_rejects_internal_host(self):
        with patch('app.utils.network.socket.getaddrinfo', return_value=_addrinfo('10.0.0.5')):
            ok, reason = validate_external_https('https://intranet.local/x')
            assert ok is False and reason == 'internal_host'

    def test_accepts_public_https(self):
        with patch('app.utils.network.socket.getaddrinfo', return_value=_addrinfo('1.2.3.4')):
            ok, reason = validate_external_https('https://example.com/path')
            assert ok is True and reason == ''
