import re


def slugify(text: str) -> str:
    """Turn a title into a URL-friendly slug: "Hello World" becomes "hello-world"."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.strip().lower())
    return slug.strip("-")
