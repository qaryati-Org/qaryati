# ADR-003: Conflict Handling and Data Provenance

- **Status:** Proposed
- **Date:** 2026-11-27
- **Deciders:** Qaryati team (confirmation pending)

## Context

Village information can come from books, archives, surveys, and oral
accounts. These sources may give different accounts of the same place or
event. Qaryati needs to retain the evidence behind each record, represent
conflicting claims without silently replacing earlier evidence, and prevent
reviewed information from being changed inappropriately.

## Decision

### Data provenance

Population, History, Landmarks, and Cultural Traits use the shared Source
model. Each record references its source with `sourceId`. A source stores a
title and type, with optional author, URL, and year. Heritage records have
required Source relationships backed by database foreign keys.

Records that use the shared verification workflow also store `status`,
`reviewedAt`, `reviewedById`, and `reviewNote`. Public Landmark and Cultural
Trait listings return only VERIFIED records and include source information in
each response.

Records reference a dedicated Source table rather than repeating an
unstructured source description. This gives records a consistent reference to
source details and lets multiple records cite the same source without
duplicating its metadata.

### Conflict handling

Records begin in `PENDING`. The shared verification rules allow
`PENDING → VERIFIED`, `PENDING → REJECTED`, and `VERIFIED → REJECTED`;
`REJECTED` is terminal. An invalid transition raises HTTP 409 Conflict in the
service workflow.

Only PENDING Heritage records can be edited. VERIFIED Heritage records cannot
be deleted; PENDING and REJECTED records can be deleted.

The Landmark and Cultural Trait services include the record's expected
verification status in edit and review database updates. They check the
affected-row count and return 409 if the status no longer matches. Deletion
also limits the database operation to PENDING or REJECTED records and returns
409 if that condition no longer matches.

The policy for differing claims is to retain claims from different sources as
separate records, not overwrite the evidence already recorded. Population
also enforces at most one VERIFIED figure per village and reference year.

## Alternatives considered

1. **Overwrite a record when a new source disagrees.** This keeps one current
   value, but discards the earlier claim and its connection to its source.
2. **Store source details in every record.** This avoids a separate lookup,
   but duplicates source metadata and can leave inconsistent descriptions
   when the same source is cited more than once.
3. **Update without checking verification state.** This is simpler, but a
   record could change after a service reads its state and before the write,
   including during review.
4. **Use source-linked records, shared verification rules, and conditional
   status-based updates (selected).** This retains source references, applies
   consistent review transitions, and prevents writes whose expected status
   has changed. It does not automatically identify contradictions or record
   every edit.

## Consequences and limitations

- Source-linked records make the evidence for a claim traceable, and shared
  verification rules give Population, History, and Heritage records a
  consistent review state machine.
- Heritage edit and delete rules protect verified records. Conditional status
  checks prevent an edit or review update from proceeding when the record's
  verification status changed during the operation.
- The services do not automatically detect contradictions between sources.
- Status-based conditions do not prevent two simultaneous edits while a
  record remains PENDING. There is no general version-based optimistic
  locking.
- Reviewer fields describe the current review decision; they are not a
  complete historical audit trail.
- Heritage verify and reject HTTP endpoints currently return 401 until
  trusted authentication is implemented. Although the service review
  workflow and transition rules exist, those endpoints do not currently
  expose them.
- `@Roles` metadata on create, update, and delete is not an enforced
  permission check yet: the global `RolesGuard` currently allows requests.

See the [architecture overview](../architecture.md), the [shared verification
transitions](../../src/modules/source/verification/verification-transitions.ts),
the [Landmark service](../../src/modules/heritage/landmark.service.ts), and
the [Cultural Trait service](../../src/modules/heritage/cultural-trait.service.ts).
