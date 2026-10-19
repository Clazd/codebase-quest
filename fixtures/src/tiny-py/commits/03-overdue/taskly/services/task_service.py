"""Creating tasks and working out their status."""

import time

from taskly.db.client import insert, query, update
from taskly.utils.slugify import slugify

_next_id = 1


def compute_task_status(task: dict) -> str:
    if not task.get("due_date"):
        return "open"
    if task["done"]:
        if task["done_at"] > task["due_date"]:
            return "late"
        return "done"
    now = time.time()
    if now > task["due_date"]:
        return "overdue"
    return "open"


def create_task(title: str, team_id: str, owner_id: str, due_date: float | None = None) -> dict:
    global _next_id
    task = {
        "id": f"task-{_next_id}",
        "title": title,
        "slug": slugify(title),
        "team_id": team_id,
        "owner_id": owner_id,
        "due_date": due_date,
        "done": False,
        "done_at": None,
        "shared_with": [],
    }
    _next_id += 1
    return insert("tasks", task)


def get_task(task_id: str) -> dict | None:
    rows = query("tasks", id=task_id)
    return rows[0] if rows else None


def complete_task(task_id: str, at: float) -> dict | None:
    return update("tasks", task_id, done=True, done_at=at)
