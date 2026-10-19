# Taskly

A small to-do API for teams. Tasks belong to a team, can have a due date, and
can be shared with teammates.

## Run

```sh
npm install
npm run build
npm start
npm test
```

Set `TASKLY_SNAPSHOT=path/to/snapshot.json` to start with saved data.

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/tasks` | Tasks you own or that were shared with you |
| POST | `/tasks` | Create a task (`title`, `teamId`, optional `dueDate`) |
| GET | `/tasks/:id` | One task, with its status |
| POST | `/tasks/:id/complete` | Mark a task as done |
| POST | `/tasks/:id/share` | Share a task with a teammate (`userId`) |

Send your user id in the `x-user-id` header.

## Task status

A task is `open`, `done`, `late` (finished after its due date) or `overdue`
(still open after its due date). See `computeTaskStatus` in
`src/services/taskService.ts`.
