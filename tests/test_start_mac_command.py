from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_mac_launcher_uses_dedicated_port_for_server_and_browser():
    script = (ROOT / "start_mac.command").read_text(encoding="utf-8")

    assert 'APP_PORT="5050"' in script
    assert 'APP_URL="http://127.0.0.1:$APP_PORT"' in script
    assert 'LIN_TOOLS_PORT="$APP_PORT" "$VENV_PYTHON" run_web.py &' in script
