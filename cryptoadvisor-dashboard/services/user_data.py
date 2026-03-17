"""Per-user JSON data storage utility."""

import json
from pathlib import Path
from fastapi import Request
from config import BASE_DIR
from services.sanitize import sanitize_filename

DATA_DIR = BASE_DIR / "data"


def get_username(request: Request) -> str:
    user = getattr(request.state, "user", {})
    return user.get("sub", "anonymous")


def load_user_data(username: str, namespace: str) -> list | dict:
    username = sanitize_filename(username)
    namespace = sanitize_filename(namespace)
    path = DATA_DIR / namespace / f"{username}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())


def save_user_data(username: str, namespace: str, data: list | dict) -> None:
    username = sanitize_filename(username)
    namespace = sanitize_filename(namespace)
    dir_path = DATA_DIR / namespace
    dir_path.mkdir(parents=True, exist_ok=True)
    (dir_path / f"{username}.json").write_text(json.dumps(data, indent=2))


def load_shared_data(name: str) -> list | dict:
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())


def save_shared_data(name: str, data: list | dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / f"{name}.json").write_text(json.dumps(data, indent=2))
