import type { DB } from "../db/schema.ts";
import { Result } from "../result.ts";

export type Category = Readonly<{
  id: string;
  name: string;
}>;

export type UnknownCategory = Readonly<{
  kind: "UnknownCategory";
  name: string;
}>;

export const Category = {
  async findByName(db: DB, name: string): Promise<Result<Category, UnknownCategory>> {
    const row = await db
      .selectFrom("categories")
      .select(["id", "name"])
      .where("name", "=", name)
      .executeTakeFirst();
    if (row === undefined) {
      return Result.err({ kind: "UnknownCategory", name });
    }
    return Result.ok({ id: row.id, name: row.name });
  },

  async list(db: DB): Promise<readonly Category[]> {
    const rows = await db.selectFrom("categories").select(["id", "name"]).orderBy("name").execute();
    return rows.map((row) => ({ id: row.id, name: row.name }));
  },
} as const;
