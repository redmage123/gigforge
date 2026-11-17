"""Per-user and shared JSON records, stored through services.store (Postgres in production)."""

from fastapi import Request

from config import BASE_DIR
from services import store

DATA_DIR = BASE_DIR / "data"  # file backend location (local dev, tests) and file caches


def get_username(request: Request) -> str:
    user = getattr(request.state, "user", {})
    return user.get("sub", "anonymous")


def load_user_data(username: str, namespace: str) -> list | dict:
    return store.get(namespace, username, [])


def save_user_data(username: str, namespace: str, data: list | dict) -> None:
    store.put(namespace, username, data)


def update_user_data(username: str, namespace: str, fn, default=None):
    """Atomic read-modify-write of one user's record."""
    return store.update(namespace, username, fn, [] if default is None else default)


def load_shared_data(name: str) -> list | dict:
    return store.get(store.SHARED, name, [])


def save_shared_data(name: str, data: list | dict) -> None:
    store.put(store.SHARED, name, data)


def update_shared_data(name: str, fn, default=None):
    return store.update(store.SHARED, name, fn, [] if default is None else default)


def users_with(namespace: str) -> list[str]:
    """Usernames that have a record in this namespace (replaces globbing the data folder)."""
    return store.keys(namespace)
