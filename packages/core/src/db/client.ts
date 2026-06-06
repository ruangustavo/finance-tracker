import { LibsqlDialect } from "@libsql/kysely-libsql";
import { Kysely } from "kysely";
import type { MigrationProvider } from "kysely/migration";
import { Migrator } from "kysely/migration";
import { MIGRATIONS } from "./migrations/index.ts";
import type { Database, DB } from "./schema.ts";

const migrationProvider: MigrationProvider = {
  getMigrations: () => Promise.resolve(MIGRATIONS),
};

export const Db = {
  open(url: string): DB {
    return new Kysely<Database>({ dialect: new LibsqlDialect({ url }) });
  },

  async migrate(db: DB): Promise<void> {
    const migrator = new Migrator({ db, provider: migrationProvider });
    const { error } = await migrator.migrateToLatest();
    if (error !== undefined) {
      throw error;
    }
  },
} as const;
