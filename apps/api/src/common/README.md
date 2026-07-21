# API cross-cutting concerns (foundations)

Wired up alongside the skeleton / first authenticated slice, not as feature
modules:

- `authz/` — the ownership guard scoping every data query to
  `owner_id = current_user`, uniform not-found for missing-or-forbidden
  (**FR-AUTHZ-001..005**; architecture §8). Exercised by every authenticated
  slice. Placed in foundations per the implementation plan §6.
- `audit/` — append-only security audit log for sign-in / password / deletion
  events, retained ≥ 90 days (**NFR-SEC-009**; architecture §8).

These are stubs in the skeleton; their hooks land with the auth foundation.
