import type { Team } from "../types";
import { query } from "./client";

export class TeamNotFoundError extends Error {}

/** Loads a team by id. Throws if it doesn't exist. */
export function loadTeam(teamId: string): Team {
  const [team] = query<Team>("teams", { id: teamId });
  if (!team) throw new TeamNotFoundError(`No team "${teamId}"`);
  return team;
}
