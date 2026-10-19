from taskly.db.client import query


class TeamNotFound(Exception):
    pass


def load_team(team_id: str) -> dict:
    """Load a team by id. Raises TeamNotFound if it doesn't exist."""
    rows = query("teams", id=team_id)
    if not rows:
        raise TeamNotFound(f'No team "{team_id}"')
    return rows[0]
