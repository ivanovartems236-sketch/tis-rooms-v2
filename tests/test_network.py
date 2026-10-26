"""Сетевые сбои: один повтор в http_get и понятный fail() вместо traceback."""
import io
import os
import socket
import sys
import urllib.error

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "scraper"))
import build  # noqa: E402
import rasp  # noqa: E402

DNS = urllib.error.URLError(socket.gaierror(-5, "No address associated with hostname"))


@pytest.fixture
def net(monkeypatch):
    """Подменяет urlopen: отдаёт по очереди заданные ответы (bytes) или ошибки."""
    def setup(*answers):
        calls, queue = [], list(answers)

        def urlopen(req, timeout=None):
            calls.append(req.full_url)
            a = queue.pop(0)
            if isinstance(a, Exception):
                raise a
            return io.BytesIO(a)

        monkeypatch.setattr(rasp.urllib.request, "urlopen", urlopen)
        return calls

    monkeypatch.setattr(rasp.time, "sleep", lambda s: None)
    return setup


def http(code):
    return urllib.error.HTTPError("https://stis.su/x", code, "err", {}, None)


def test_retry_after_dns_error(net):
    calls = net(DNS, b"ok")
    assert rasp.http_get("https://stis.su/schedule") == b"ok"
    assert len(calls) == 2


def test_only_one_retry(net):
    calls = net(DNS, DNS, b"never")
    with pytest.raises(urllib.error.URLError):
        rasp.http_get("https://stis.su/schedule")
    assert len(calls) == 2


def test_retry_on_5xx_not_on_404(net):
    calls = net(http(503), b"ok")
    assert rasp.http_get("https://stis.su/a") == b"ok"
    assert len(calls) == 2
    calls = net(http(404), b"never")
    with pytest.raises(urllib.error.HTTPError):
        rasp.http_get("https://stis.su/a")
    assert len(calls) == 1


def test_download_stops_on_first_error(net, tmp_path):
    page = b'<a href="/f/a.xls">a</a><a href="/f/b.xls">b</a><a href="/f/c.xls">c</a>'
    calls = net(page, http(404), DNS, DNS, b"never")
    ok, failed = rasp.download_all(str(tmp_path), log=lambda s: None)
    assert (ok, failed) == (0, 1)
    assert len(calls) == 4  # страница, 404 без повтора, b — два раза, c не трогаем


def test_build_fails_cleanly_when_site_down(monkeypatch):
    def down(folder):
        raise DNS

    monkeypatch.setattr(build.rasp, "download_all", down)
    monkeypatch.setattr(sys, "argv", ["build.py"])
    monkeypatch.delenv("TG_TOKEN", raising=False)
    with pytest.raises(SystemExit) as e:
        build.main()
    assert str(e.value) == "stis.su недоступен: gaierror: [Errno -5] No address associated with hostname"


def test_net_reason():
    assert build.net_reason(http(502)) == "HTTP 502"
    assert build.net_reason(TimeoutError()) == "TimeoutError"
