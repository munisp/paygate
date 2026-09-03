/**
 * Minimal ambient typings for the optional `pg-mem` dev dependency.
 * pg-mem is only used by the Vitest in-memory PG harness (pgMemSetup.ts);
 * it is not installed in production images, so we declare the small API
 * surface we consume instead of depending on the package's own types.
 */
declare module "pg-mem" {
  export interface PgMemQueryResult {
    rows: any[];
    rowCount: number;
  }

  export interface PgMemClient {
    query(sql: string, params?: unknown[]): Promise<PgMemQueryResult>;
    end(): Promise<void>;
  }

  export interface PgMemAdapters {
    createPg(): {
      Pool: new () => PgMemClient;
      Client: new () => PgMemClient;
    };
  }

  export interface PgMemDb {
    adapters: PgMemAdapters;
  }

  export function newDb(): PgMemDb;
}
