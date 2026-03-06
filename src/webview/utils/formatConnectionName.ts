import type { DbConnectionConfig } from "../../shared/types";

export function formatConnectionName(connection: DbConnectionConfig | null | undefined): string {
  if (!connection) return "this database";
  const label = connection.label?.trim() || "";
  const technical = `${connection.driver}@${connection.host}/${connection.database}`;
  const full = label || technical;
  return full === technical ? connection.database : full || "this database";
}
