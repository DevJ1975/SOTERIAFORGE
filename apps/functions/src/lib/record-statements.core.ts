import { z } from 'zod';
import { XAPI_TENANT_EXTENSION, tenantId as tenantIdSchema } from '@forge/shared';
import { parseCaller } from './authz';
import { FunctionsDomainError } from './errors';
import type { StatementDbPort } from './ports';

/** Inclusive batch-size cap per call. */
export const MAX_STATEMENTS_PER_BATCH = 50;

const recordStatementsInput = z.object({
  statements: z.array(z.unknown()).min(1).max(MAX_STATEMENTS_PER_BATCH),
  /** Only honoured for superadmin callers (who carry no tenantId claim). */
  tenantId: tenantIdSchema.optional(),
});
export type RecordStatementsInput = z.infer<typeof recordStatementsInput>;

export interface RecordStatementsResult {
  tenantId: string;
  written: number;
}

/**
 * Shallow structural check on one statement. Full xAPI validation is the
 * emitting client's job (see @forge/standards buildStatement) — the LRS store
 * only insists on the identity-critical fields plus the tenant scope.
 */
interface ShallowStatement extends Record<string, unknown> {
  id: string;
  actor: Record<string, unknown>;
  verb: { id: string };
  object: { id: string };
  context?: { extensions?: Record<string, unknown> };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shallowParseStatement(value: unknown, index: number): ShallowStatement {
  const fail = (detail: string): never => {
    throw new FunctionsDomainError('invalid-argument', `statements[${index}]: ${detail}`);
  };
  if (!isRecord(value)) fail('must be an object');
  const statement = value as Record<string, unknown>;
  if (typeof statement['id'] !== 'string' || statement['id'].length === 0) {
    fail('missing statement id');
  }
  if (!isRecord(statement['actor'])) fail('missing actor');
  const verb = statement['verb'];
  if (!isRecord(verb) || typeof verb['id'] !== 'string' || verb['id'].length === 0) {
    fail('missing verb.id');
  }
  const object = statement['object'];
  if (!isRecord(object) || typeof object['id'] !== 'string' || object['id'].length === 0) {
    fail('missing object.id');
  }
  return statement as ShallowStatement;
}

/** The tenant id a statement claims via its context extension, if any. */
function statementTenantOf(statement: ShallowStatement): unknown {
  const context = statement['context'];
  if (!isRecord(context)) return undefined;
  const extensions = context['extensions'];
  if (!isRecord(extensions)) return undefined;
  return extensions[XAPI_TENANT_EXTENSION];
}

/**
 * Pure core: persist a batch of client-emitted xAPI statements into the
 * per-tenant LRS store at /tenants/{tenantId}/xapiStatements/{statementId}.
 *
 * Any signed-in tenant-scoped role may record statements for their own tenant
 * (learners generate most of the traffic); superadmin must name the target
 * tenant explicitly. Every statement's tenant extension must equal the
 * resolved tenant — cross-tenant spoofing is rejected before any write.
 */
export async function recordStatementsCore(
  deps: { db: StatementDbPort },
  caller: unknown,
  rawInput: unknown,
): Promise<RecordStatementsResult> {
  const parsed = recordStatementsInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new FunctionsDomainError(
      'invalid-argument',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const input = parsed.data;

  const callerClaims = parseCaller(caller);
  if (!callerClaims) {
    throw new FunctionsDomainError(
      'permission-denied',
      'Caller is unauthenticated or has no valid role claims',
    );
  }

  let tenantId: string;
  if (callerClaims.role === 'superadmin') {
    if (!input.tenantId) {
      throw new FunctionsDomainError(
        'invalid-argument',
        'superadmin callers must pass an explicit tenantId',
      );
    }
    tenantId = input.tenantId;
  } else {
    if (!callerClaims.tenantId) {
      throw new FunctionsDomainError('permission-denied', 'Caller carries no tenantId claim');
    }
    tenantId = callerClaims.tenantId;
  }

  // Validate the whole batch before writing anything (all-or-nothing).
  const statements = input.statements.map((value, index) => {
    const statement = shallowParseStatement(value, index);
    if (statementTenantOf(statement) !== tenantId) {
      throw new FunctionsDomainError(
        'permission-denied',
        `statements[${index}]: tenant extension must equal '${tenantId}'`,
      );
    }
    return statement;
  });

  const receivedAt = new Date().toISOString();
  for (const statement of statements) {
    await deps.db.saveStatement(tenantId, statement.id, { ...statement, receivedAt });
  }

  return { tenantId, written: statements.length };
}
