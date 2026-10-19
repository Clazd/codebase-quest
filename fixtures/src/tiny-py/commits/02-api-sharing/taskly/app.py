"""Flask routes for Taskly."""

import time

from flask import Flask, jsonify, request

from taskly.services.share_service import SharePermissionError, share_task
from taskly.services.task_service import complete_task, compute_task_status, create_task, get_task

app = Flask(__name__)


def present(task: dict) -> dict:
    return {**task, "status": compute_task_status(task)}


def current_user() -> str:
    return request.headers.get("x-user-id", "anonymous")


@app.post("/tasks")
def create_task_route():
    body = request.get_json()
    task = create_task(body["title"], body["team_id"], current_user(), body.get("due_date"))
    return jsonify(present(task)), 201


@app.get("/tasks/<task_id>")
def get_task_route(task_id: str):
    task = get_task(task_id)
    if task is None:
        return jsonify(error="Task not found"), 404
    return jsonify(present(task))


@app.post("/tasks/<task_id>/complete")
def complete_task_route(task_id: str):
    task = complete_task(task_id, time.time())
    if task is None:
        return jsonify(error="Task not found"), 404
    return jsonify(present(task))


@app.post("/tasks/<task_id>/share")
def share_task_route(task_id: str):
    try:
        task = share_task(task_id, current_user(), request.get_json()["user_id"])
    except SharePermissionError as error:
        return jsonify(error=str(error)), 403
    return jsonify(present(task))


if __name__ == "__main__":
    app.run()
