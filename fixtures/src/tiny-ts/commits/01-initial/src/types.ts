export type TaskStatus = "open" | "done" | "late" | "overdue";

/** Either still open, or done at a known time (milliseconds since the epoch). */
export type Completion = { done: false } | { done: true; doneAt: number };

/** The fields that decide a task's status. */
export type StatusFields = { dueDate?: number } & Completion;

export type Task = {
  id: string;
  title: string;
  slug: string;
  teamId: string;
  ownerId: string;
  sharedWith: string[];
  archived: boolean;
} & StatusFields;

export type Team = {
  id: string;
  name: string;
  memberIds: string[];
};
