"""Sharing tasks with teammates."""

from taskly.db.client import update
from taskly.db.teams import load_team
from taskly.services.task_service import compute_task_status, get_task


class SharePermissionError(Exception):
    pass


def check_permissions(task: dict, user_id: str) -> None:
    """Raise SharePermissionError unless ``user_id`` belongs to the task's team."""
    team = load_team(task["team_id"])
    if user_id not in team["member_ids"]:
        raise SharePermissionError(f'User "{user_id}" is not in team "{team["name"]}"')


def share_task(task_id: str, user_id: str, with_user_id: str) -> dict:
    """Share a task with a teammate. Finished tasks can't be shared."""
    task = get_task(task_id)
    if task is None:
        raise ValueError(f'No task "{task_id}"')
    check_permissions(task, user_id)
    if compute_task_status(task) == "done":
        raise ValueError("Finished tasks can't be shared")
    update("tasks", task["id"], shared_with=[*task["shared_with"], with_user_id])
    return task
