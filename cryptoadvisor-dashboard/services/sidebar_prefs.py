"""Per-user sidebar customization preferences."""

from services.user_data import load_user_data, save_user_data

NAMESPACE = "sidebar_prefs"

VALID_SECTIONS = [
    "Markets",
    "Portfolio",
    "DeFi & NFTs",
    "Tools",
    "Security",
    "AI Assistant",
    "Blockchain",
    "Exchange",
    "Account",
]

DEFAULT_PREFS = {
    "collapsed_sections": [],
    "pinned_pages": [],
    "hidden_sections": [],
}


def _ensure_defaults(prefs: dict) -> dict:
    """Fill in any missing keys with defaults."""
    for key, default in DEFAULT_PREFS.items():
        if key not in prefs:
            prefs[key] = list(default)
    return prefs


def get_sidebar_prefs(username: str) -> dict:
    """Return sidebar prefs for a user, with defaults if none saved."""
    data = load_user_data(username, NAMESPACE)
    if not data or not isinstance(data, dict):
        return {k: list(v) for k, v in DEFAULT_PREFS.items()}
    return _ensure_defaults(data)


def save_sidebar_prefs(username: str, prefs: dict) -> dict:
    """Validate and save sidebar prefs, returning the saved result."""
    clean = {}
    clean["collapsed_sections"] = [
        s for s in prefs.get("collapsed_sections", [])
        if isinstance(s, str) and s in VALID_SECTIONS
    ]
    clean["pinned_pages"] = [
        p for p in prefs.get("pinned_pages", [])
        if isinstance(p, str) and p.startswith("/")
    ]
    clean["hidden_sections"] = [
        s for s in prefs.get("hidden_sections", [])
        if isinstance(s, str) and s in VALID_SECTIONS
    ]
    save_user_data(username, NAMESPACE, clean)
    return clean


def toggle_pin(username: str, page_path: str) -> dict:
    """Toggle a page path in pinned_pages, returning updated prefs."""
    prefs = get_sidebar_prefs(username)
    pins = prefs["pinned_pages"]
    if page_path in pins:
        pins.remove(page_path)
    else:
        pins.append(page_path)
    prefs["pinned_pages"] = pins
    save_user_data(username, NAMESPACE, prefs)
    return prefs


def toggle_section_collapse(username: str, section_label: str) -> dict:
    """Toggle a section in collapsed_sections, returning updated prefs."""
    prefs = get_sidebar_prefs(username)
    collapsed = prefs["collapsed_sections"]
    if section_label in collapsed:
        collapsed.remove(section_label)
    else:
        if section_label in VALID_SECTIONS:
            collapsed.append(section_label)
    prefs["collapsed_sections"] = collapsed
    save_user_data(username, NAMESPACE, prefs)
    return prefs


def toggle_section_visibility(username: str, section_label: str) -> dict:
    """Toggle a section in hidden_sections, returning updated prefs."""
    prefs = get_sidebar_prefs(username)
    hidden = prefs["hidden_sections"]
    if section_label in hidden:
        hidden.remove(section_label)
    else:
        if section_label in VALID_SECTIONS:
            hidden.append(section_label)
    prefs["hidden_sections"] = hidden
    save_user_data(username, NAMESPACE, prefs)
    return prefs
