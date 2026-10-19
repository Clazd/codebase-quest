"""A tiny in-memory table store."""

_tables: dict[str, list[dict]] = {}


def _table(name: str) -> list[dict]:
    return _tables.setdefault(name, [])


def query(name: str, **where) -> list[dict]:
    """Return every row of ``name`` whose fields equal all of ``where``."""
    return [row for row in _table(name) if all(row.get(k) == v for k, v in where.items())]


def insert(name: str, row: dict) -> dict:
    _table(name).append(row)
    return row


def update(name: str, row_id: str, **changes) -> dict | None:
    for row in _table(name):
        if row["id"] == row_id:
            row.update(changes)
            return row
    return None
