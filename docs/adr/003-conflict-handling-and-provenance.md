# ADR-003: Conflict Handling and Data Provenance

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** Rashad, Lina, Ahmad, Yahya

## Context

Village information can come from books, archives, surveys, and oral accounts. These sources may give different accounts of the same place or event. Qaryati needs to retain the evidence behind each record, represent conflicting claims without silently replacing earlier evidence, and prevent reviewed information from being changed inappropriately.

## Decision

### Data provenance

Population, History, Landmarks, and Cultural Traits use the shared Source model. Each record references its source with `sourceId`. A source stores a title and type, with optional author, URL, and year. Heritage records have required Source relationships backed by database foreign keys.

Records that use the shared verification workflow also store `status`, `reviewedAt`, `reviewedById`, and `reviewNote`.

Public listings default to VERIFIED records. Population, History, Landmark, and Cultural Trait listings support explicit PENDING and REJECTED status filters for authenticated EDITOR, VERIFIER, and ADMIN users.

Public History, Landmark, and Cultural Trait GET-by-ID endpoints return VERIFIED records only. Population GET-by-ID allows access to unverified records only for authorized roles.

Heritage responses include source provenance information.

Records reference a dedicated Source table rather than repeating an unstructured source description. This gives records a consistent reference to source details and lets multiple records cite the same source without duplicating its metadata.

### Conflict handling

Records begin in `PENDING`. The shared verification rules allow `PENDING → VERIFIED`, `PENDING → REJECTED`, and `VERIFIED → REJECTED`; `REJECTED` is terminal. An invalid transition raises HTTP 409 Conflict in the service workflow.

Only PENDING Heritage records can be edited. VERIFIED Heritage records cannot be deleted; PENDING and REJECTED records can be deleted.

The Landmark and Cultural Trait services include the record's expected verification status in edit and review database updates. They check the affected-row count and return 409 if the status no longer matches. Deletion also limits the database operation to PENDING or REJECTED records and returns 409 if that condition no longer matches.

The policy for differing claims is to retain claims from different sources as separate records, not overwrite the evidence already recorded. Population also enforces at most one VERIFIED figure per village and reference year.

The Population Conflicts API provides a way to identify and inspect disagreements between population records:

`GET /api/v1/villages/:villageId/population-conflicts`

A reference year is considered conflicting when at least two records for the same village and year contain distinct population values.

The endpoint groups conflicting records by reference year and includes their values, verification statuses, and source provenance.

Conflict detection considers records across all verification statuses. Results are paginated by reference year and ordered deterministically.

Access is restricted to authenticated EDITOR, VERIFIER, and ADMIN users. The endpoint does not automatically select a correct population figure or resolve disagreements between sources.

### Authentication and authorization

Qaryati uses JWT-based authentication and an enforced role-based authorization system.

The global `JwtAuthGuard` processes authentication, and `RolesGuard` enforces permissions declared using `@Roles(...)`.

- Public endpoints remain accessible without authentication unless the requested data requires additional permissions.
- Requests requiring authentication return HTTP 401 when no valid token is provided.
- Authenticated users without the required role receive HTTP 403.
- Heritage verify and reject endpoints are enabled for authenticated VERIFIER and ADMIN users.
- Reviewer identity is obtained from the authenticated JWT user rather than trusted from client-supplied fields.
- Access to PENDING and REJECTED records through supported listing endpoints is restricted to EDITOR, VERIFIER, and ADMIN.

These controls protect review operations and unverified data while preserving public access to verified information.

## Alternatives considered

1. **Overwrite a record when a new source disagrees.** This keeps one current value, but discards the earlier claim and its connection to its source.
2. **Store source details in every record.** This avoids a separate lookup, but duplicates source metadata and can leave inconsistent descriptions when the same source is cited more than once.
3. **Update without checking verification state.** This is simpler, but a record could change after a service reads its state and before the write, including during review.
4. **Use source-linked records, shared verification rules, and conditional status-based updates (selected).** This retains source references, applies consistent review transitions, and prevents writes whose expected status has changed. Population conflict detection additionally identifies disagreements between reported values without automatically resolving them. The design does not provide a complete edit history or general contradiction detection across every module.

## Consequences and limitations

- Source-linked records make the evidence for a claim traceable, and shared verification rules give Population, History, and Heritage records a consistent review state machine.
- Heritage edit and delete rules protect verified records. Conditional status checks prevent an edit or review update from proceeding when the record's verification status changed during the operation.
- The Population Conflicts API identifies years with different reported population values and provides their source provenance. It does not automatically resolve these disagreements or detect all contradictions in History and Heritage.
- Status-based conditions do not prevent two simultaneous edits while a record remains PENDING. There is no general version-based optimistic locking.
- Reviewer fields describe the current review decision; they are not a complete historical audit trail.
- Heritage verify and reject HTTP endpoints are enabled for authenticated VERIFIER and ADMIN users, subject to the existing verification transition rules.
- The global `RolesGuard` enforces `@Roles` permissions. Requests without required authentication return HTTP 401, while authenticated users without the required role receive HTTP 403.
- Public access to verified records is preserved, while access to unverified records through supported reviewer endpoints is role-restricted.
- Conflicting claims are retained for review rather than automatically overwritten or resolved.

See the [architecture overview](../architecture.md), the [authentication documentation](../auth.md), the [shared verification transitions](../../src/modules/source/verification/verification-transitions.ts), the [Population service](../../src/modules/population/population.service.ts), the [Landmark service](../../src/modules/heritage/landmark.service.ts), and the [Cultural Trait service](../../src/modules/heritage/cultural-trait.service.ts).
