"""Execute the demo JavaScript; no npm installs or frontend changes required."""
from pathlib import Path
import shutil
import subprocess
import pytest


def test_demo_javascript_interactions():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js 없음: 데모 JS 상호작용 미검증")
    result = subprocess.run([node, "--test", str(Path(__file__).with_suffix(".cjs"))],
                            capture_output=True, text=True, encoding="utf-8", timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
