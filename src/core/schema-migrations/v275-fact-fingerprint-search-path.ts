import { FACT_FINGERPRINT_FUNCTION_STATEMENTS } from '../facts/withdrawal-schema.ts';
import type { Migration } from './types.ts';

// Applied by src/core/migrate.ts on the next initSchema(); see docs/ENGINES.md
// ("Canonical schema sources") for when schema.sql or a TS fragment also changes.
//
// The fact fingerprint SQL functions (gbrain_fact_fingerprint,
// gbrain_fact_fingerprint_v1, gbrain_fact_normalize) now pin
// `search_path = pg_catalog, public` in their definitions, like every gbrain
// plpgsql function (#5190). v211 re-created them without the pin, and a
// CREATE OR REPLACE drops a pin set by ALTER, so brains past v211 re-run the
// pinned definitions here. The bodies are unchanged: outputs stay
// byte-identical and idx_facts_withdrawal_fingerprint keeps serving lookups.
// Re-running sets the same definitions again.
export const v275: Migration = {
  version: 275,
  name: 'fact_fingerprint_search_path',
  idempotent: true,
  sql: FACT_FINGERPRINT_FUNCTION_STATEMENTS.join(';\n') + ';\n',
};
