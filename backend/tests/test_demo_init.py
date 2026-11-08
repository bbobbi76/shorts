"""Demo initialization guards and packaged assets, without modifying a real DB."""
import importlib.util
import re
from pathlib import Path
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def initializer():
    path = Path(__file__).resolve().parents[1] / "init_db.py"
    spec = importlib.util.spec_from_file_location("week6_init_db", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("existing", [False, True])
def test_demo_only_loads_into_new_database(initializer, monkeypatch, existing):
    conn = MagicMock()
    conn.__enter__.return_value = conn
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchall.return_value = [(name,) for name in ("users", "courses", "contents", "files", "categories")] if existing else []
    cur.nextset.return_value = None
    monkeypatch.setattr(initializer.pymysql, "connect", lambda **_: conn)
    monkeypatch.setattr(initializer.UiRecord.__table__, "create", MagicMock())
    load = MagicMock()
    monkeypatch.setattr(initializer, "load_demo", load)
    monkeypatch.setattr(initializer.sys, "argv", ["init_db.py", "--demo"])
    initializer.main()
    assert load.call_count == (0 if existing else 1)
    assert all("DROP TABLE" not in str(call) for call in cur.execute.call_args_list)


def test_demo_loader_executes_sql_and_copies_assets(initializer, monkeypatch, tmp_path):
    source = tmp_path / "demo"
    (source / "uploads" / "video").mkdir(parents=True)
    (source / "demo_data.sql").write_text("SELECT 1;", encoding="utf-8")
    (source / "uploads" / "video" / "sample.mp4").write_bytes(b"demo")
    target = tmp_path / "uploads"
    monkeypatch.setattr(initializer, "DEMO_DIR", source)
    monkeypatch.setattr(initializer, "UPLOAD_DIR", target)
    conn = MagicMock()
    conn.__enter__.return_value = conn
    cur = conn.cursor.return_value.__enter__.return_value
    cur.nextset.return_value = None
    monkeypatch.setattr(initializer.pymysql, "connect", lambda **_: conn)
    initializer.load_demo()
    cur.execute.assert_called_once_with("SELECT 1;")
    assert (target / "video" / "sample.mp4").read_bytes() == b"demo"


def test_every_demo_file_exists_with_declared_size(initializer):
    sql = (initializer.DEMO_DIR / "demo_data.sql").read_text(encoding="utf-8-sig")
    rows = re.findall(r"INSERT INTO `files` .*?VALUES \(\d+,'[^']*','[^']*','([^']*)','[^']*',(\d+),", sql)
    assert len(rows) == 38
    for name, size in rows:
        asset = initializer.DEMO_DIR / "uploads" / name
        assert asset.is_file(), name
        assert asset.stat().st_size == int(size), name
