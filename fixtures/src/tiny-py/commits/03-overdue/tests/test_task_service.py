from taskly.services.task_service import compute_task_status


def test_open_without_due_date():
    assert compute_task_status({"done": False}) == "open"


def test_done_on_time():
    assert compute_task_status({"due_date": 10, "done": True, "done_at": 5}) == "done"


def test_late_after_due_date():
    assert compute_task_status({"due_date": 10, "done": True, "done_at": 20}) == "late"


def test_overdue_when_open_past_due_date():
    assert compute_task_status({"due_date": 1, "done": False}) == "overdue"
