/** A person in a fixture's git history. Always fictional, always an example.com address. */
export interface Person {
  name: string;
  email: string;
}

/** One change in a fixture commit. Contents are exact bytes: no line-ending conversion ever happens. */
export type Change =
  | { kind: "file"; path: string; contents: Uint8Array }
  | { kind: "symlink"; path: string; target: string }
  | { kind: "delete"; path: string };

export interface CommitSpec {
  message: string;
  author: Person;
  /** ISO 8601 with an explicit offset, e.g. `2025-01-06T09:12:00+00:00`. Used as author and committer date. */
  date: string;
  changes: Change[];
}

export interface FixtureDefinition {
  name: string;
  description: string;
  commits: CommitSpec[];
}
