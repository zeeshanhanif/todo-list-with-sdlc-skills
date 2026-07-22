# Requirements Traceability Matrix

> Source: docs/srs.md (v1.0), docs/use-cases.md · Last updated: 2026-07-15
> Design ref filled by software-architecture (docs/architecture.md, 2026-07-15)
> for the requirements its ADRs / cross-cutting design address; `_TBD_` remains
> where concrete design is produced downstream (detailed-design / ux). Plan ref
> and Test ref are filled by planning and testing respectively, per the RTM
> column-ownership contract.
> Source key: **SI** = stakeholder interview (2026-07-15); **SEC** = security /
> OWASP best practice; **GOAL** = product goal/decision (§1.3); **PRIV** = privacy
> good practice. Design refs: **ADR-NNN** = docs/architecture.md §9; **arch §N** =
> docs/architecture.md section N.

## Functional requirements

| Req ID | Requirement (short) | Priority | Status | Source | Use case(s) | Design ref | Plan ref | Test ref |
| :----- | :------------------ | :------- | :----- | :----- | :---------- | :--------- | :------- | :------- |
| FR-AUTH-001 | Register with email + password | Must | Active | SI | UC-001 | features/FEAT-001-register/technical-design.md; features/FEAT-001-register/ui-design.md | FEAT-001 | features/FEAT-001-register/acceptance-report.md |
| FR-AUTH-002 | Reject duplicate email at registration | Must | Active | SI | UC-001 | features/FEAT-001-register/technical-design.md; features/FEAT-001-register/ui-design.md | FEAT-001 | features/FEAT-001-register/acceptance-report.md |
| FR-AUTH-003 | Validate email format | Must | Active | SI | UC-001 | features/FEAT-001-register/technical-design.md; features/FEAT-001-register/ui-design.md | FEAT-001 | features/FEAT-001-register/acceptance-report.md |
| FR-AUTH-004 | Enforce password policy | Must | Active | SEC | UC-001 | arch §8; features/FEAT-001-register/technical-design.md; features/FEAT-001-register/ui-design.md | FEAT-001 | features/FEAT-001-register/acceptance-report.md |
| FR-AUTH-005 | Send verification email (single-use, time-limited) | Must | Active | SI | UC-001, UC-002 | ADR-007; features/FEAT-001-register/technical-design.md; features/FEAT-001-register/ui-design.md; features/FEAT-007-email-delivery/technical-design.md | FEAT-001, FEAT-007 | features/FEAT-001-register/acceptance-report.md (partial); features/FEAT-007-email-delivery/acceptance-report.md (partial) |
| FR-AUTH-006 | Mark account verified on valid link | Must | Active | SI | UC-002 | _TBD_ | FEAT-002 | _TBD_ |
| FR-AUTH-007 | Require verification before sign-in | Must | Active | SI | UC-002, UC-003 | _TBD_ | FEAT-002, FEAT-003 | _TBD_ |
| FR-AUTH-008 | Resend verification email | Should | Active | SI | UC-002 | ADR-007 | FEAT-002 | _TBD_ |
| FR-AUTH-009 | Sign in with email + password | Must | Active | SI | UC-003 | ADR-005 | FEAT-003 | _TBD_ |
| FR-AUTH-010 | Generic failure msg (no enumeration) | Must | Active | SEC | UC-003 | arch §8 | FEAT-003 | _TBD_ |
| FR-AUTH-011 | Log out / terminate session | Must | Active | SI | UC-004 | ADR-005 | FEAT-004 | _TBD_ |
| FR-AUTH-012 | Forgot-password request (neutral response) | Must | Active | SI | UC-005 | arch §8 | FEAT-005 | _TBD_ |
| FR-AUTH-013 | Send single-use reset link | Must | Active | SI | UC-005 | ADR-007; features/FEAT-007-email-delivery/technical-design.md | FEAT-005, FEAT-007 | features/FEAT-007-email-delivery/acceptance-report.md (partial) |
| FR-AUTH-014 | Set new password via reset link | Must | Active | SI | UC-005 | ADR-005 | FEAT-005 | _TBD_ |
| FR-AUTH-015 | Change password (verify current) | Must | Active | SI | UC-006 | ADR-005 | FEAT-006 | _TBD_ |
| FR-AUTH-016 | Establish long-lived session on sign-in | Must | Active | SI | UC-003 | ADR-005 | FEAT-003 | _TBD_ |
| FR-AUTH-017 | Invalidate sessions on password change/reset | Must | Active | SEC | UC-005, UC-006 | ADR-005 | FEAT-005, FEAT-006 | _TBD_ |
| FR-AUTH-018 | Rate-limit auth endpoints | Must | Active | SEC | UC-003, UC-005 | arch §8 | FEAT-003 | _TBD_ |
| FR-AUTH-019 | Lockout/throttle after failed attempts | Must | Active | SEC | UC-003 | arch §8 | FEAT-003 | _TBD_ |
| FR-AUTHZ-001 | Require auth for all data operations | Must | Active | SEC | UC-003 (all auth UCs) | ADR-005; arch §8 | Foundations | _TBD_ |
| FR-AUTHZ-002 | User accesses only own data | Must | Active | SI | All authenticated UCs | ADR-003; arch §8 | Foundations | _TBD_ |
| FR-AUTHZ-003 | Reject others' resources w/o disclosure | Must | Active | SEC | All authenticated UCs | arch §8 | Foundations | _TBD_ |
| FR-AUTHZ-004 | Assign ownership at creation; no transfer | Must | Active | SI | UC-008, UC-009 | ADR-003 | Foundations | _TBD_ |
| FR-AUTHZ-005 | Server-authoritative authorization | Must | Active | SEC | All authenticated UCs | arch §8 | Foundations | _TBD_ |
| FR-PROF-001 | View profile (email, display name) | Must | Active | SI | UC-007 | _TBD_ | FEAT-008 | _TBD_ |
| FR-PROF-002 | Set/edit display name | Should | Active | SI | UC-007 | _TBD_ | FEAT-008 | _TBD_ |
| FR-PROF-003 | Set timezone (due/overdue calc) | Must | Active | SI | UC-007 | _TBD_ | FEAT-008 | _TBD_ |
| FR-PROF-004 | Select UI theme, persisted | Should | Active | SI | UC-007 | _TBD_ | FEAT-008 | _TBD_ |
| FR-PROF-005 | Persist settings across devices | Must | Active | SI | UC-007 | ADR-003 | FEAT-008 | _TBD_ |
| FR-LIST-001 | Create list with name | Must | Active | SI | UC-008 | ADR-003 | FEAT-009 | _TBD_ |
| FR-LIST-002 | Validate list name | Must | Active | SI | UC-008 | _TBD_ | FEAT-009 | _TBD_ |
| FR-LIST-003 | Auto-create default Inbox on registration | Must | Active | SI | UC-001 | ADR-003; features/FEAT-001-register/technical-design.md | FEAT-001 | features/FEAT-001-register/acceptance-report.md |
| FR-LIST-004 | Prevent deletion of Inbox (allow rename) | Must | Active | SI | UC-008 | ADR-003 | FEAT-009 | _TBD_ |
| FR-LIST-005 | View lists with active-task counts | Must | Active | SI | UC-008 | ADR-003 | FEAT-009 | _TBD_ |
| FR-LIST-006 | Rename a list | Must | Active | SI | UC-008 | ADR-003 | FEAT-009 | _TBD_ |
| FR-LIST-007 | Delete non-default list (cascade tasks) | Must | Active | SI | UC-008 | ADR-003 | FEAT-009 | _TBD_ |
| FR-LIST-008 | Manually reorder lists, persisted | Should | Active | SI | UC-008 | ADR-003 | FEAT-009 | _TBD_ |
| FR-LIST-009 | Task belongs to exactly one list | Must | Active | SI | UC-008, UC-009 | ADR-003 | FEAT-009, FEAT-010 | _TBD_ |
| FR-TASK-001 | Create task with title in a list | Must | Active | SI | UC-009 | ADR-003 | FEAT-010 | _TBD_ |
| FR-TASK-002 | Validate task title | Must | Active | SI | UC-009 | _TBD_ | FEAT-010 | _TBD_ |
| FR-TASK-003 | View tasks (active vs completed) | Must | Active | SI | UC-011, UC-013 | ADR-003 | FEAT-010, FEAT-012 | _TBD_ |
| FR-TASK-004 | View task details | Must | Active | SI | UC-010 | ADR-003 | FEAT-011 | _TBD_ |
| FR-TASK-005 | Edit task title | Must | Active | SI | UC-010 | ADR-003 | FEAT-011 | _TBD_ |
| FR-TASK-006 | Set/change/clear due date+time | Must | Active | SI | UC-009, UC-010 | ADR-003 | FEAT-011 | _TBD_ |
| FR-TASK-007 | Indicate overdue (user timezone) | Must | Active | SI | UC-010 | arch §8 | FEAT-011 | _TBD_ |
| FR-TASK-008 | Set priority (None/Low/Med/High) | Must | Active | SI | UC-009, UC-010 | ADR-003 | FEAT-011 | _TBD_ |
| FR-TASK-009 | Mark task complete (timestamp) | Must | Active | SI | UC-011 | ADR-003 | FEAT-012 | _TBD_ |
| FR-TASK-010 | Reopen completed task | Must | Active | SI | UC-011 | ADR-003 | FEAT-012 | _TBD_ |
| FR-TASK-011 | Completed tasks in collapsed section | Should | Active | SI | UC-011 | _TBD_ | FEAT-012 | _TBD_ |
| FR-TASK-012 | Manually reorder active tasks | Should | Active | SI | UC-010 | ADR-003 | FEAT-014 | _TBD_ |
| FR-TASK-013 | Soft-delete task (recoverable) | Must | Active | SI | UC-012 | ADR-003; arch §8 | FEAT-013 | _TBD_ |
| FR-TASK-014 | Restore (undo) soft-deleted task | Must | Active | SI | UC-012 | ADR-003 | FEAT-013 | _TBD_ |
| FR-TASK-015 | Purge soft-deleted after retention | Should | Active | PRIV | UC-012 | ADR-007; arch §8 | FEAT-020 | _TBD_ |
| FR-SRCH-001 | Keyword search across all lists | Must | Active | SI | UC-013 | arch §8 | FEAT-015 | _TBD_ |
| FR-SRCH-002 | Results show list + status | Must | Active | SI | UC-013 | _TBD_ | FEAT-015 | _TBD_ |
| FR-SRCH-003 | Filter by status | Must | Active | SI | UC-013 | _TBD_ | FEAT-015 | _TBD_ |
| FR-SRCH-004 | Filter by due date | Must | Active | SI | UC-013 | _TBD_ | FEAT-015 | _TBD_ |
| FR-SRCH-005 | Combine search + filters (conjunctive) | Should | Active | SI | UC-013 | _TBD_ | FEAT-015 | _TBD_ |
| FR-SRCH-006 | Empty-state message | Must | Active | SI | UC-013, UC-014 | _TBD_ | FEAT-015, FEAT-016 | _TBD_ |
| FR-SRCH-007 | Smart views (Today/Upcoming/Overdue/All) | Should | Active | SI | UC-014 | _TBD_ | FEAT-016 | _TBD_ |
| FR-SRCH-008 | Smart-view membership semantics | Should | Active | SI | UC-014 | _TBD_ | FEAT-016 | _TBD_ |
| FR-SRCH-009 | Paginate/lazy-load large views | Should | Active | SI | UC-013 | arch §8 | FEAT-015 | _TBD_ |
| FR-DATA-001 | Export all data as JSON | Must | Active | PRIV | UC-015 | _TBD_ | FEAT-017 | _TBD_ |
| FR-DATA-002 | Export includes lists + active/completed tasks | Must | Active | PRIV | UC-015 | _TBD_ | FEAT-017 | _TBD_ |
| FR-DATA-003 | Permanently delete account + data | Must | Active | PRIV | UC-016 | ADR-003 | FEAT-018 | _TBD_ |
| FR-DATA-004 | Confirm + re-enter password before delete | Must | Active | SEC | UC-016 | _TBD_ | FEAT-018 | _TBD_ |
| FR-DATA-005 | Terminate sessions; free email on delete | Must | Active | PRIV | UC-016 | ADR-005 | FEAT-018 | _TBD_ |
| FR-DATA-006 | Inform user deletion is permanent | Must | Active | PRIV | UC-016 | _TBD_ | FEAT-018 | _TBD_ |

## Non-functional requirements

| Req ID | Requirement (short) | Priority | Status | Source | Use case(s) | Design ref | Plan ref | Test ref |
| :----- | :------------------ | :------- | :----- | :----- | :---------- | :--------- | :------- | :------- |
| NFR-PERF-001 | p95 core ops < 300 ms | Must | Active | GOAL (G4) | — | arch §8, §10 | Foundations | _TBD_ |
| NFR-PERF-002 | FCP < 2.5 s, interactive < 3.5 s | Should | Active | GOAL (G4) | — | ADR-002; arch §8 | Foundations | _TBD_ |
| NFR-PERF-003 | p95 search < 500 ms @ 5k tasks | Should | Active | GOAL (G4) | UC-013 | ADR-003 | FEAT-015 | _TBD_ |
| NFR-PERF-004 | Cross-device sync < 5 s | Should | Active | GOAL (G3) | — | ADR-006 | FEAT-019 | _TBD_ |
| NFR-SCAL-001 | 10k users / 1k concurrent | Must | Active | GOAL | — | ADR-001; ADR-004 | Foundations | _TBD_ |
| NFR-SCAL-002 | 100 lists / 5k tasks per user | Should | Active | GOAL | — | ADR-003 | Foundations | _TBD_ |
| NFR-SCAL-003 | Horizontally scalable app tier | Should | Active | GOAL | — | ADR-004 | Foundations | _TBD_ |
| NFR-REL-001 | ≥ 99.9% monthly uptime | Must | Active | GOAL | — | ADR-004 | Foundations | _TBD_ |
| NFR-REL-002 | RPO ≤ 1h, RTO ≤ 4h | Must | Active | GOAL (G5) | — | ADR-003; arch §8 | Foundations | _TBD_ |
| NFR-REL-003 | Durable replicated storage; no single-node loss | Must | Active | GOAL (G5) | — | ADR-003; arch §8 | Foundations | _TBD_ |
| NFR-REL-004 | Graceful degradation on failure | Should | Active | GOAL | — | arch §8 | Foundations | _TBD_ |
| NFR-REL-005 | Zero-downtime deploys | Should | Active | GOAL | — | ADR-004 | Foundations | _TBD_ |
| NFR-SEC-001 | TLS 1.2+ in transit | Must | Active | SEC | — | arch §8 | Foundations | _TBD_ |
| NFR-SEC-002 | Encryption at rest | Must | Active | SEC | — | arch §8 | Foundations | _TBD_ |
| NFR-SEC-003 | Password policy (≥10, breach-checked) | Must | Active | SEC | UC-001, UC-005, UC-006 | arch §8 | Foundations | _TBD_ |
| NFR-SEC-004 | Link expiry (verify 24h, reset 1h) | Must | Active | SEC | UC-002, UC-005 | arch §8 | FEAT-002, FEAT-005 | _TBD_ |
| NFR-SEC-005 | Salted adaptive password hashing | Must | Active | SEC | — | arch §8 | Foundations | _TBD_ |
| NFR-SEC-006 | Rate limiting thresholds | Must | Active | SEC | UC-003 | arch §8 | FEAT-003 | _TBD_ |
| NFR-SEC-007 | Secure session tokens, CSRF, rotation | Must | Active | SEC | — | ADR-005 | Foundations | _TBD_ |
| NFR-SEC-008 | OWASP Top 10 protections | Must | Active | SEC | — | arch §8 | Foundations | _TBD_ |
| NFR-SEC-009 | Audit log security events ≥ 90 days | Should | Active | SEC | — | arch §8 | Foundations | _TBD_ |
| NFR-SEC-010 | Dependency vuln remediation SLA | Should | Active | SEC | — | arch §8 | Foundations | _TBD_ |
| NFR-USE-001 | Register + first task < 2 min | Should | Active | GOAL (G1) | UC-001, UC-009 | _TBD_ | FEAT-001, FEAT-010 | _TBD_ |
| NFR-USE-002 | Destructive actions require confirmation | Must | Active | SI | UC-008, UC-012, UC-016 | _TBD_ | Foundations | _TBD_ |
| NFR-USE-003 | Loading/empty/error states everywhere | Must | Active | SI | UC-013 | arch §8 | Foundations | _TBD_ |
| NFR-USE-004 | Accessibility best practices | Should | Active | SI | — | _TBD_ | Foundations | _TBD_ |
| NFR-COMPAT-001 | Latest 2 versions of major browsers | Must | Active | SI | — | ADR-002 | Foundations | _TBD_ |
| NFR-COMPAT-002 | Responsive 320px→desktop | Must | Active | SI | — | ADR-002 | Foundations | _TBD_ |
| NFR-COMPAT-003 | No browser plugins required | Should | Active | SI | — | ADR-002 | Foundations | _TBD_ |
| NFR-MAINT-001 | Core modules ≥ 70% test coverage | Should | Active | SI | — | ADR-001 | Foundations | _TBD_ |
| NFR-MAINT-002 | CI runs tests on every change | Should | Active | SI | — | arch §8 | Foundations | _TBD_ |
| NFR-MAINT-003 | Externalized config/secrets | Must | Active | SEC | — | arch §8 | Foundations | _TBD_ |
| NFR-PORT-001 | Containerized, cloud-deployable | Should | Active | SI | — | ADR-004 | Foundations | _TBD_ |
| NFR-OBS-001 | Structured centralized logging | Should | Active | SI | — | arch §8 | Foundations | _TBD_ |
| NFR-OBS-002 | Health-check endpoint | Should | Active | SI | — | arch §8 | Foundations | _TBD_ |
| NFR-OBS-003 | Latency/error metrics + alerting | Should | Active | SI | — | arch §8 | Foundations | _TBD_ |
| NFR-LOC-001 | Store UTC, display user timezone | Must | Active | SI | UC-007 | arch §8 | Foundations, FEAT-008 | _TBD_ |
| NFR-LOC-002 | English-only, strings externalized | Should | Active | SI | — | _TBD_ | Foundations | _TBD_ |
| NFR-COMP-001 | Privacy good practice; export/delete supported | Should | Active | PRIV | UC-015, UC-016 | _TBD_ | FEAT-017, FEAT-018 | _TBD_ |

## Coverage notes
- Every functional requirement traces to at least one use case.
- Cross-cutting authorization requirements (FR-AUTHZ-001/002/003/005) are exercised
  by all authenticated use cases (UC-006 through UC-016) and are not itemized per UC.
- NFRs marked "—" are system-wide quality attributes with no single actor-goal use
  case (expected per RTM guidance); they are verified by non-functional/quality tests.
- **Design ref** (filled 2026-07-15 by software-architecture): ADR refs point to
  docs/architecture.md §9; "arch §N" points to a cross-cutting design section.
  `_TBD_` marks requirements whose concrete design is produced downstream
  (detailed-design / ux-foundations) — expected, not a gap.
