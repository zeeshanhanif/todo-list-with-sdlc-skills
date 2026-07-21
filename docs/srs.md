# Software Requirements Specification: To-Do List Application

> Version: 1.0 · Status: Finalized · Last updated: 2026-07-15

## Revision History

| Version | Date | Author | Changes |
| :------ | :--- | :----- | :------ |
| 1.0 | 2026-07-15 | Requirements Engineering | Initial finalized specification. 68 functional requirements across 7 areas, 39 non-functional across 11 ISO 25010 categories, 10 external-interface requirements, 16 use cases. |

## 1. Introduction

### 1.1 Purpose
This document specifies the complete functional and non-functional requirements
for the **To-Do List Application** ("the system"), a multi-user, web-based
personal task manager. It is the single source of truth for downstream
architecture, UX, and implementation-planning work. The intended audience is the
product owner, architects, designers, developers, and testers.

### 1.2 Product vision & scope
**Vision.** A fast, reliable, no-friction web application that lets an individual
capture, organize, and complete their personal to-dos across all their devices.
The product competes on simplicity and speed rather than feature breadth.

**Problem.** People track tasks across scattered notes, memory, and disparate
apps. They need one private, always-in-sync place to keep their tasks, organized
into meaningful lists, with just enough structure (due dates, priorities) to stay
on top of what matters — without the complexity of heavyweight project tools.

**In scope (MVP).**
- User accounts with email/password authentication and cloud sync across devices.
- Each user's data is **private to that user** (no sharing or collaboration).
- Organizing tasks into **multiple named lists**.
- Task management: create, view, edit, complete/reopen, and delete tasks.
- **Due dates** and **priorities** on tasks.
- **Search and filtering** of tasks.
- Basic profile/settings and account self-service (change password, delete
  account, export data).

**Out of scope (deferred / future).** The following are explicitly *not* in the
MVP and are recorded so their absence is a decision, not an omission:
- Collaboration, sharing lists, assigning tasks to others, teams/organizations.
- Tags/labels, long notes/descriptions, subtasks/checklists.
- Recurring tasks.
- Reminders and notifications (email/push/SMS) — beyond transactional account
  emails such as verification and password reset.
- File/media attachments.
- Native mobile or desktop applications (web only; responsive web serves mobile
  browsers).
- Payments/billing (the MVP is free / not monetized).
- Admin/back-office console, reporting/analytics dashboards, public API.

**MVP boundary rationale.** The MVP delivers the full capture→organize→complete
loop for a single private user, with the account and sync foundation needed to be
trustworthy. Everything deferred above either adds a subsystem (notifications,
collaboration) or is non-essential structure (tags, subtasks) that can layer on
later without reworking the core.

### 1.3 Goals & success metrics
*(Proposed targets — to be confirmed by the product owner; see Appendix B.)*
- **G1 — Adoption:** a new visitor can register and create their first task in
  under 2 minutes.
- **G2 — Engagement:** ≥ 40% of registered users are active weekly (create,
  complete, or edit a task) within 8 weeks of launch.
- **G3 — Reliability of sync:** a task created on one device is visible on the
  user's other devices within 5 seconds of that device coming online (see
  NFR-PERF / NFR-REL).
- **G4 — Speed:** core interactions (add task, complete task, load a list) feel
  instant — see performance NFRs.
- **G5 — Trust:** zero data-loss incidents; users can export and delete their
  data on demand.

### 1.4 Definitions, acronyms & abbreviations
See Appendix A — Glossary.

### 1.5 References
- ISO/IEC/IEEE 29148:2018 — Requirements engineering.
- ISO/IEC 25010 — Systems and software quality models.
- OWASP Application Security Verification Standard (ASVS).
- WCAG 2.2 — Web Content Accessibility Guidelines.

## 2. Overall Description

### 2.1 Product perspective
The system is a **new, self-contained web application** with a browser-based
front end and a server-side back end with persistent storage (the "cloud"),
enabling multi-device sync. It is not a component of a larger system. External
dependencies at the requirements level are limited to a transactional **email
delivery service** (for verification and password-reset messages). External
actors are the **Registered User** and the **Visitor** (unauthenticated); the
**Email Service** is an external supporting system.

### 2.2 Product functions (summary)
The system provides these major capability areas (detailed in section 3.1):
1. **Authentication & Account Management** (`FR-AUTH`) — registration, email
   verification, sign-in/out, password recovery and change, session management.
2. **Authorization & Access Control** (`FR-AUTHZ`) — enforcing that each user can
   access only their own data.
3. **User Profile & Settings** (`FR-PROF`) — viewing/editing basic profile and
   preferences.
4. **Task Lists** (`FR-LIST`) — creating and managing multiple named lists.
5. **Tasks** (`FR-TASK`) — the core CRUD lifecycle plus completion, due dates,
   and priorities.
6. **Search, Filter & Sort** (`FR-SRCH`) — finding and ordering tasks.
7. **Account Data & Privacy** (`FR-DATA`) — account deletion and personal-data
   export.

### 2.3 User classes & characteristics
*(ux-foundations consumes this section.)*

- **Visitor (unauthenticated).** Anyone who reaches the site without signing in.
  Can register or sign in. No access to any task data. Technical proficiency:
  general public.
- **Registered User (primary persona).** An individual managing their own private
  tasks. Signed in via email/password. Expects speed, reliability, and their data
  to sync across the devices/browsers they use. Broad range of technical skill;
  the product must be usable by non-technical users. This is the only end-user
  role in the MVP.
- **System Administrator / Operator (out-of-band).** Operates and maintains the
  service (deployments, backups, incident response). Has no in-application admin
  UI in the MVP; acts through infrastructure and operational tooling. Listed for
  completeness; no functional requirements target an in-app admin console in this
  release.

### 2.4 Operating environment
- **Client:** modern evergreen web browsers on desktop and mobile — the latest
  two major versions of Chrome, Firefox, Safari, and Edge (see NFR-COMPAT). The UI
  is responsive for mobile-browser use.
- **Server:** a cloud-hosted back end with a persistent database and HTTPS-only
  access.
- **Connectivity:** primarily online. Offline support beyond browser caching is
  out of scope for the MVP (see Appendix B).

### 2.5 Constraints
- **Web only** in this release; no native app packaging.
- **Single private-user data model** — no data sharing between accounts.
- **Transactional email** is required for verification and password reset; the
  product depends on an external email provider.
- All access over **HTTPS/TLS**; no plaintext transport.
- The solution must be buildable and operable by a small team (favor managed
  services and mainstream, well-supported technologies) — *assumption, confirm.*

### 2.6 Assumptions & dependencies
- Users have a valid email address and access to it for verification and
  password reset.
- A third-party transactional email service is available and reliable.
- Users generally operate online; sync assumes network connectivity.
- The MVP is free to use; no billing or usage-cap enforcement is required.
- Data-volume per user is modest (hundreds to low-thousands of tasks), not
  bulk/enterprise scale — *confirm in Appendix B.*

## 3. Specific Requirements
### 3.1 Functional requirements

Requirements are grouped by capability area. Each has a stable ID, a testable
"shall" statement, a MoSCoW priority (Must / Should / Could), a Status (`Active`
by default), and supporting rules. IDs are never reused or renumbered.

#### 3.1.1 Authentication & Account Management (FR-AUTH)

| ID | Requirement | Priority | Status | Notes / rules |
| :-- | :---------- | :------- | :----- | :------------ |
| FR-AUTH-001 | The system shall allow a Visitor to register a new account using an email address and a password. | Must | Active | Email + password only; no social/SSO in MVP. |
| FR-AUTH-002 | The system shall reject registration if the email address is already associated with an existing account. | Must | Active | Email is the unique account identifier; comparison case-insensitive. |
| FR-AUTH-003 | The system shall validate the email address format and reject malformed addresses at registration. | Must | Active | Syntactic validation; deliverability confirmed via FR-AUTH-005. |
| FR-AUTH-004 | The system shall enforce the password strength policy on registration and on any password change or reset. | Must | Active | Policy defined in NFR-SEC-003. |
| FR-AUTH-005 | The system shall send a verification email containing a unique, single-use, time-limited link when an account is registered. | Must | Active | Link expires per NFR-SEC-004 (default 24h). |
| FR-AUTH-006 | The system shall mark an account as verified when the user follows a valid, unexpired verification link. | Must | Active | Expired/invalid links are rejected with an option to resend. |
| FR-AUTH-007 | The system shall require an account to be verified before the user can sign in and access task data. | Must | Active | Unverified sign-in attempts prompt to verify/resend. |
| FR-AUTH-008 | The system shall allow a user to request a new verification email (resend). | Should | Active | Rate-limited per FR-AUTH-017. |
| FR-AUTH-009 | The system shall allow a verified user to sign in with their email and password. | Must | Active | On success, establishes a session per FR-AUTH-014. |
| FR-AUTH-010 | The system shall reject sign-in with invalid credentials and return a generic failure message that does not reveal whether the email exists. | Must | Active | Prevents account enumeration. |
| FR-AUTH-011 | The system shall allow a signed-in user to log out, terminating their current session. | Must | Active | Session/token invalidated server-side. |
| FR-AUTH-012 | The system shall allow a user to request a password reset by submitting their email address ("forgot password"). | Must | Active | Always shows a neutral confirmation regardless of whether the email exists (no enumeration). |
| FR-AUTH-013 | The system shall send a password-reset email containing a unique, single-use, time-limited link to registered addresses only. | Must | Active | Link expires per NFR-SEC-004 (default 1h); single-use. |
| FR-AUTH-014 | The system shall allow a user with a valid reset link to set a new password, subject to the password policy (NFR-SEC-003). | Must | Active | Link consumed on success. |
| FR-AUTH-015 | The system shall allow a signed-in user to change their password by supplying their current password and a new password. | Must | Active | Current password must be verified; new password per NFR-SEC-003. |
| FR-AUTH-016 | The system shall establish an authenticated session on successful sign-in that persists until the user logs out or the credential is invalidated. | Must | Active | Long-lived sessions (per product decision); secure token handling and rotation per NFR-SEC. |
| FR-AUTH-017 | The system shall invalidate all of a user's existing sessions when their password is changed (FR-AUTH-015) or reset (FR-AUTH-014). | Must | Active | Forces re-authentication after a credential change. |
| FR-AUTH-018 | The system shall rate-limit authentication-related endpoints (sign-in, registration, verification resend, password-reset request). | Must | Active | Thresholds per NFR-SEC-006; mitigates brute force and abuse. |
| FR-AUTH-019 | The system shall temporarily lock or throttle sign-in for an account after a configurable number of consecutive failed attempts. | Must | Active | Default 5 attempts; lockout duration configurable; user informed how to proceed. |

**Note on deferred auth features.** Multi-factor authentication, social/SSO
login, "remember me" as a distinct feature, passwordless/magic-link, re-auth for
sensitive actions, and changing the account email address are **out of scope**
for the MVP (see §1.2). Account **deletion** and **data export** are specified in
§3.1.7 (FR-DATA).

#### 3.1.2 Authorization & Access Control (FR-AUTHZ)

The MVP has a single end-user role (Registered User) and a strictly private
per-user data model; there is no in-app admin role and no resource sharing.
Authorization therefore centers on authentication gating and resource ownership.

| ID | Requirement | Priority | Status | Notes / rules |
| :-- | :---------- | :------- | :----- | :------------ |
| FR-AUTHZ-001 | The system shall require an authenticated session for every operation that reads or modifies task data (lists, tasks, profile, settings). | Must | Active | Unauthenticated requests are rejected/redirected to sign-in. |
| FR-AUTHZ-002 | The system shall ensure that a user can access, view, and modify only the lists and tasks they own. | Must | Active | Ownership checked on every read/write; enforced server-side. |
| FR-AUTHZ-003 | The system shall reject any request to read or modify a resource the requester does not own, without disclosing the resource's existence. | Must | Active | Return not-found/forbidden uniformly to prevent enumeration of others' IDs. |
| FR-AUTHZ-004 | The system shall assign ownership of a list or task to the authenticated user who creates it, and shall not permit ownership transfer in the MVP. | Must | Active | No sharing/transfer in MVP. |
| FR-AUTHZ-005 | The system shall enforce authorization on the server for every protected action, independent of any client-side checks. | Must | Active | Client-side gating is convenience only; server is authoritative. |

#### 3.1.3 User Profile & Settings (FR-PROF)

| ID | Requirement | Priority | Status | Notes / rules |
| :-- | :---------- | :------- | :----- | :------------ |
| FR-PROF-001 | The system shall allow a signed-in user to view their profile, including their account email address and display name. | Must | Active | Email is read-only in the MVP (FR-AUTH note). |
| FR-PROF-002 | The system shall allow a user to set and edit a display name. | Should | Active | Length/character limits validated; may default to the local part of the email. |
| FR-PROF-003 | The system shall allow a user to set their timezone, and shall use it to compute due-date and overdue status. | Must | Active | Defaults to the browser-detected timezone at first sign-in; falls back to UTC. |
| FR-PROF-004 | The system shall allow a user to select a UI theme preference (light, dark, or match system) and shall persist it to their account. | Should | Active | Applied on load; persisted server-side so it follows the user across devices. |
| FR-PROF-005 | The system shall persist profile and settings changes to the user's account so they are consistent across all the user's devices. | Must | Active | Cloud-synced like task data. |

**Deferred profile/settings items.** Avatar/image upload, notification
preferences, and an in-app "sign out of all sessions / active-session
management" control are out of scope for the MVP. Password change lives in
§3.1.1 (FR-AUTH-015).

#### 3.1.4 Task Lists (FR-LIST)

A list is a named container that groups a user's tasks. Every user has a default
list plus any lists they create.

| ID | Requirement | Priority | Status | Notes / rules |
| :-- | :---------- | :------- | :----- | :------------ |
| FR-LIST-001 | The system shall allow a user to create a new list by providing a name. | Must | Active | See FR-LIST-002 for validation. |
| FR-LIST-002 | The system shall validate that a list name is non-empty and does not exceed the maximum length. | Must | Active | Default max 100 chars; leading/trailing whitespace trimmed; duplicate names permitted. |
| FR-LIST-003 | The system shall automatically create a default list named "Inbox" for each account upon registration. | Must | Active | Guarantees a destination for tasks from first use. |
| FR-LIST-004 | The system shall prevent deletion of the default (Inbox) list, while allowing it to be renamed. | Must | Active | Ensures at least one list always exists. |
| FR-LIST-005 | The system shall allow a user to view all of their lists, each showing a count of its active (incomplete) tasks. | Must | Active | Ordered per FR-LIST-008. |
| FR-LIST-006 | The system shall allow a user to rename any of their lists. | Must | Active | Subject to FR-LIST-002 validation. |
| FR-LIST-007 | The system shall allow a user to delete a non-default list, and shall permanently delete all tasks contained in that list. | Must | Active | Requires an explicit confirmation warning that contained tasks will be deleted. |
| FR-LIST-008 | The system shall allow a user to manually reorder their lists, and shall persist the chosen order across devices. | Should | Active | New lists appended to the end by default. |
| FR-LIST-009 | The system shall associate every task with exactly one list, assigned at task creation. | Must | Active | A task always belongs to one and only one list. |

**Deferred list items.** Moving a task from one list to another after creation,
nested lists/folders/projects, and sharing lists between users are out of scope
for the MVP (see §1.2).

#### 3.1.5 Tasks (FR-TASK)

A task is a single to-do item owned by a user and belonging to exactly one list.
It has a title, a completion status, and optional due date/time and priority.

| ID | Requirement | Priority | Status | Notes / rules |
| :-- | :---------- | :------- | :----- | :------------ |
| FR-TASK-001 | The system shall allow a user to create a task by entering a title, within a chosen list. | Must | Active | List defaults to Inbox if unspecified; created as active (incomplete). |
| FR-TASK-002 | The system shall validate that a task title is non-empty and does not exceed the maximum length. | Must | Active | Default max 500 chars; leading/trailing whitespace trimmed. |
| FR-TASK-003 | The system shall allow a user to view the tasks within a list, separating active from completed tasks. | Must | Active | Completed tasks presented per FR-TASK-011. |
| FR-TASK-004 | The system shall allow a user to view the details of an individual task (title, list, due date/time, priority, status). | Must | Active | |
| FR-TASK-005 | The system shall allow a user to edit a task's title. | Must | Active | Subject to FR-TASK-002 validation. |
| FR-TASK-006 | The system shall allow a user to set, change, or clear a task's due date and time; the due date/time is optional. | Must | Active | Interpreted in the user's timezone (FR-PROF-003). |
| FR-TASK-007 | The system shall indicate when an active task is overdue, determined by comparing its due date/time to the current time in the user's timezone. | Must | Active | Only active (incomplete) tasks can be overdue. |
| FR-TASK-008 | The system shall allow a user to set or change a task's priority to one of None, Low, Medium, or High. | Must | Active | Default is None on creation. |
| FR-TASK-009 | The system shall allow a user to mark an active task as completed, recording the completion timestamp. | Must | Active | Completing clears overdue indication. |
| FR-TASK-010 | The system shall allow a user to reopen a completed task, returning it to active status. | Must | Active | Clears the completion timestamp. |
| FR-TASK-011 | The system shall present completed tasks in a collapsed or hidden section, separate from active tasks, within a list. | Should | Active | User can expand to review/reopen completed tasks. |
| FR-TASK-012 | The system shall allow a user to manually reorder active tasks within a list, and shall persist the chosen order across devices. | Should | Active | New tasks appended to the active order by default; sort options per §3.1.6. |
| FR-TASK-013 | The system shall soft-delete a task on a delete action, removing it from normal views while retaining it in a recoverable state. | Must | Active | Not permanently destroyed immediately; see FR-TASK-015. |
| FR-TASK-014 | The system shall allow a user to restore (undo) a recently soft-deleted task, returning it to its original list and status. | Must | Active | Undo affordance provided immediately after deletion; restore available until purge. |
| FR-TASK-015 | The system shall permanently purge soft-deleted tasks after a defined retention period, after which they cannot be restored. | Should | Active | Default retention 30 days (see NFR data-retention); purge is irreversible. |

**Deferred task items.** Notes/long descriptions, subtasks/checklists, tags/
labels, recurring tasks, reminders/notifications, attachments, bulk actions on
multiple tasks, and moving a task between lists are out of scope for the MVP
(see §1.2).

#### 3.1.6 Search, Filter & Sort (FR-SRCH)

| ID | Requirement | Priority | Status | Notes / rules |
| :-- | :---------- | :------- | :----- | :------------ |
| FR-SRCH-001 | The system shall allow a user to search their tasks by keyword, matching against task titles across all of the user's lists. | Must | Active | Case-insensitive substring match; scoped to the requesting user (FR-AUTHZ-002). |
| FR-SRCH-002 | The system shall present each search result with the list it belongs to and its status. | Must | Active | Excludes soft-deleted tasks (FR-TASK-013). |
| FR-SRCH-003 | The system shall allow a user to filter tasks by status: active, completed, or overdue. | Must | Active | Overdue derived per FR-TASK-007. |
| FR-SRCH-004 | The system shall allow a user to filter tasks by due date: due today, upcoming, overdue, or no due date. | Must | Active | Date buckets computed in the user's timezone (FR-PROF-003). |
| FR-SRCH-005 | The system shall allow the keyword search and the available filters to be combined, returning tasks matching all active criteria. | Should | Active | Filters are conjunctive. |
| FR-SRCH-006 | The system shall display a clear empty-state message when a search or filter yields no matching tasks. | Must | Active | Empty/error/loading states are explicit requirements. |
| FR-SRCH-007 | The system shall provide cross-list smart views — Today, Upcoming, Overdue, and All — that aggregate matching tasks across all of the user's lists. | Should | Active | See FR-SRCH-008 for semantics. |
| FR-SRCH-008 | The system shall define smart-view membership as: **Today** = active tasks due within the current day; **Upcoming** = active tasks due after the current day; **Overdue** = active tasks past due; **All** = all active tasks. | Should | Active | Completed and soft-deleted tasks are excluded; computed in the user's timezone. |
| FR-SRCH-009 | The system shall paginate or incrementally load task views and search results that exceed a defined page size. | Should | Active | Default page size configurable; prevents unbounded rendering of large lists. |

**Deferred search items.** Filtering by priority, user-selectable sort options
(the default order is the manual order of FR-TASK-012), saved searches, and
faceted search are out of scope for the MVP.

#### 3.1.7 Account Data & Privacy (FR-DATA)

Covers personal-data portability and the right to be forgotten.

| ID | Requirement | Priority | Status | Notes / rules |
| :-- | :---------- | :------- | :----- | :------------ |
| FR-DATA-001 | The system shall allow a signed-in user to export all of their personal data — their lists and tasks — in JSON format. | Must | Active | Portable, machine-readable; scoped to the requesting user only. |
| FR-DATA-002 | The system shall include all of the user's current lists and their active and completed tasks in the export. | Must | Active | Purged soft-deleted tasks (FR-TASK-015) are not included. |
| FR-DATA-003 | The system shall allow a signed-in user to permanently delete their account, immediately removing the account and all associated data (lists, tasks, profile, settings). | Must | Active | Irreversible; no grace period in the MVP. |
| FR-DATA-004 | The system shall require an explicit confirmation, including re-entry of the current password, before executing account deletion. | Must | Active | Guards a destructive, irreversible action against accident/abuse. |
| FR-DATA-005 | The system shall terminate all of the user's sessions upon account deletion and disassociate the email address so it may be used to register a new account. | Must | Active | Post-deletion the email is no longer linked to any account. |
| FR-DATA-006 | The system shall inform the user, before and after deletion, that the action is permanent and their data cannot be recovered. | Must | Active | Clear irreversibility messaging. |

**Deferred data/privacy items.** Explicit Terms-of-Service / Privacy-Policy
consent capture, CSV export, a self-service account-reactivation/grace period,
and in-app viewing of an activity/audit history are out of scope for the MVP.
Security audit logging of sensitive actions is specified as a non-functional
requirement (see §3.3, NFR-SEC).

### 3.2 External interface requirements

Stated at the requirements level (the *what*, not detailed API/UI design, which is
downstream).

**3.2.1 User interfaces (UI-*).**
- UI-001 — The system shall provide a responsive web user interface operable in
  the browsers listed in NFR-COMPAT-001 across viewport widths from 320 px up
  (NFR-COMPAT-002).
- UI-002 — The interface shall be fully keyboard-operable and follow the
  accessibility practices in NFR-USE-004.
- UI-003 — The interface shall present explicit loading, empty, and error states
  for every data view (NFR-USE-003) and confirmation prompts for destructive
  actions (NFR-USE-002).

**3.2.2 Hardware interfaces.**
- HW-001 — The system requires no special client hardware beyond a standard
  network-connected device capable of running a supported browser. No direct
  hardware integrations (camera, printer, peripherals) are required in the MVP.

**3.2.3 Software & third-party interfaces (SW-*).**
- SW-001 — The system shall integrate with an external transactional **email
  delivery service** to send account-verification and password-reset messages
  (supports FR-AUTH-005, FR-AUTH-008, FR-AUTH-013). Provider TBD (Appendix B, Q7).
- SW-002 — Email delivery failures shall be handled gracefully (retry/queue) and
  shall not block the user's primary action beyond the affected email step.
- SW-003 — The system exposes **no public/partner API** in the MVP; all
  client-server communication is via the application's own internal interface.

**3.2.4 Communication interfaces (COM-*).**
- COM-001 — All client-server communication shall occur over HTTPS/TLS 1.2+
  (NFR-SEC-001).
- COM-002 — Client-server data exchange shall use a structured format (e.g., JSON
  over HTTPS).
- COM-003 — Communication with the email provider shall use the provider's secure
  API or authenticated SMTP over TLS.
### 3.3 Non-functional requirements

Organized by ISO/IEC 25010 quality category. Each NFR states a metric, a target,
and the condition under which it is measured. Numeric targets marked *(confirm)*
are proposed defaults pending product-owner confirmation (see Appendix B).

| ID | Category | Requirement (metric, target, condition) | Priority |
| :-- | :------- | :-------------------------------------- | :------- |
| NFR-PERF-001 | Performance | 95% of core interactive API operations (create/edit/complete a task, load a list) shall complete server-side within 300 ms at expected load. *(confirm)* | Must |
| NFR-PERF-002 | Performance | The web app shall reach first contentful paint within 2.5 s and become interactive within 3.5 s on a 10 Mbps connection. *(confirm)* | Should |
| NFR-PERF-003 | Performance | 95% of keyword searches shall return within 500 ms for a user with up to 5,000 tasks. *(confirm)* | Should |
| NFR-PERF-004 | Performance | A change made on one device shall be reflected on the user's other online devices within 5 s (supports goal G3). *(confirm)* | Should |
| NFR-SCAL-001 | Scalability | The system shall support at least 10,000 registered users and 1,000 concurrent active users at launch without breaching performance targets. *(confirm)* | Must |
| NFR-SCAL-002 | Scalability | The system shall sustain performance targets for a user holding up to 100 lists and 5,000 tasks. *(confirm)* | Should |
| NFR-SCAL-003 | Scalability | The application tier shall be horizontally scalable (stateless) so capacity can be added without redesign. | Should |
| NFR-REL-001 | Availability | The service shall achieve ≥ 99.9% monthly uptime (≈ 43 min/month max unplanned downtime). | Must |
| NFR-REL-002 | Reliability | User data shall be backed up such that recovery point objective (RPO) ≤ 1 hour and recovery time objective (RTO) ≤ 4 hours. *(confirm)* | Must |
| NFR-REL-003 | Reliability | Persistent data shall be stored durably with replication such that a single storage-node failure causes no data loss. | Must |
| NFR-REL-004 | Reliability | On backend or network failure, the client shall degrade gracefully, preserving unsynced local input where possible and showing a clear error state. | Should |
| NFR-REL-005 | Reliability | Deployments shall be performed without user-visible downtime (zero-downtime/rolling deploys). *(confirm)* | Should |
| NFR-SEC-001 | Security | All data in transit shall be encrypted using TLS 1.2 or higher; plaintext HTTP shall be redirected to HTTPS. | Must |
| NFR-SEC-002 | Security | All user data at rest shall be encrypted (e.g., AES-256). | Must |
| NFR-SEC-003 | Security | Passwords shall meet a minimum policy of ≥ 10 characters and shall be rejected if present in a known breached-password list (NIST-aligned). *(confirm)* | Must |
| NFR-SEC-004 | Security | Email verification links shall expire within 24 hours and password-reset links within 1 hour; both shall be single-use. *(confirm)* | Must |
| NFR-SEC-005 | Security | Passwords shall be stored only as salted hashes using a strong adaptive algorithm (e.g., bcrypt/scrypt/Argon2); plaintext or reversible storage is prohibited. | Must |
| NFR-SEC-006 | Security | Authentication endpoints shall be rate-limited (e.g., ≤ 10 failed sign-in attempts per account per 15 minutes and per-IP throttling), consistent with FR-AUTH-018/019. *(confirm)* | Must |
| NFR-SEC-007 | Security | Session credentials shall be transmitted only over secure, HTTP-only channels/cookies, with protection against CSRF and token rotation on privilege changes. | Must |
| NFR-SEC-008 | Security | The application shall implement protections against the OWASP Top 10 (injection, XSS, broken access control, etc.), verified before release. | Must |
| NFR-SEC-009 | Security | Security-relevant events (sign-in success/failure, password change/reset, account deletion) shall be recorded in an audit log retained for ≥ 90 days. *(confirm)* | Should |
| NFR-SEC-010 | Security | Known high/critical dependency vulnerabilities shall be remediated within a defined SLA (e.g., 30 days for high, 7 days for critical). *(confirm)* | Should |
| NFR-USE-001 | Usability | A first-time user shall be able to register and create their first task within 2 minutes (supports goal G1). | Should |
| NFR-USE-002 | Usability | Destructive actions (delete list, delete task, delete account) shall require explicit confirmation to prevent accidental data loss. | Must |
| NFR-USE-003 | Usability | Every list/search view shall present clear loading, empty, and error states. | Must |
| NFR-USE-004 | Accessibility | The UI shall follow accessibility best practices — full keyboard operability, sufficient colour contrast, and semantic markup. Formal WCAG 2.2 AA conformance is not targeted in the MVP (see Appendix B). | Should |
| NFR-COMPAT-001 | Compatibility | The app shall function correctly on the latest two major versions of Chrome, Firefox, Safari, and Edge. | Must |
| NFR-COMPAT-002 | Compatibility | The UI shall be responsive and usable on viewport widths from 320 px (mobile) to desktop. | Must |
| NFR-COMPAT-003 | Compatibility | The app shall not depend on browser plugins or extensions to function. | Should |
| NFR-MAINT-001 | Maintainability | Core modules (authentication, task/list CRUD) shall have automated test coverage ≥ 70%. *(confirm)* | Should |
| NFR-MAINT-002 | Maintainability | Automated tests shall run in CI on every change, gating merges/releases. | Should |
| NFR-MAINT-003 | Maintainability | Configuration and secrets shall be externalized (environment/secret store); no secrets shall be committed to source. | Must |
| NFR-PORT-001 | Portability | The application shall be containerized and deployable to a mainstream cloud provider without code changes. | Should |
| NFR-OBS-001 | Observability | The system shall emit structured logs for errors and key events to a centralized store. | Should |
| NFR-OBS-002 | Observability | The system shall expose a health-check endpoint for uptime monitoring. | Should |
| NFR-OBS-003 | Observability | The system shall collect request-latency and error-rate metrics and alert operators when error rate or p95 latency exceeds defined thresholds. *(confirm)* | Should |
| NFR-LOC-001 | Localization | All timestamps shall be stored in UTC and displayed in the user's selected timezone (FR-PROF-003). | Must |
| NFR-LOC-002 | Localization | The MVP UI shall be English-only, but user-facing strings shall be externalized so future localization does not require rearchitecting. | Should |
| NFR-COMP-001 | Compliance | The system shall follow general data-protection good practice (data minimization, secure deletion) and support user data export (FR-DATA-001) and deletion (FR-DATA-003); no formal certification (GDPR/CCPA/SOC 2) is targeted for the MVP. | Should |

### 3.4 Other requirements

**Data retention.**

| Data | Retention rule | Ref |
| :--- | :------------- | :-- |
| Soft-deleted tasks | Purged permanently 30 days after deletion. *(confirm)* | FR-TASK-015 |
| Deleted accounts | Data removed immediately on deletion (no retention). | FR-DATA-003 |
| Security audit logs | Retained ≥ 90 days. *(confirm)* | NFR-SEC-009 |
| Backups | Retained per operational policy (e.g., 30 days rolling). *(confirm)* | NFR-REL-002 |

**Legal.** Terms-of-Service / Privacy-Policy consent capture is deferred (see
§3.1.7). If required before launch, it will be added via the amendment process.

## Appendix A — Glossary

| Term | Definition |
| :--- | :--------- |
| Task | A single to-do item owned by a user; has a title, status, and optional due date and priority. |
| List | A named container that groups a user's tasks (e.g., "Work", "Shopping"). |
| Registered User | An authenticated end user who owns and manages their own private tasks. |
| Visitor | An unauthenticated person who can only register or sign in. |
| Completion | The state of a task marked done; a task may be reopened to active. |
| Cloud sync | Server-side persistence enabling a user's data to appear across their devices/browsers. |
| MVP | Minimum Viable Product — the lean initial release scope defined in §1.2. |

## Appendix B — Open questions / TBD

| # | Open question | Raised in |
| :- | :------------ | :-------- |
| Q1 | Success-metric targets in §1.3 are proposed defaults — confirm with product owner. | §1.3 |
| Q2 | Expected per-user data volume (task counts) to size performance/scalability NFRs. | §2.6 |
| Q3 | Technology/hosting constraints (preferred cloud, stack) — any hard constraints? | §2.5 |
| Q4 | Is any offline capability expected, or is online-only acceptable for MVP? | §2.4 |
| Q5 | Confirm whether formal WCAG 2.2 AA conformance should be a post-MVP goal. | NFR-USE-004 |
| Q6 | Confirm all NFR targets marked *(confirm)* — performance, retention, rate-limit, and coverage numbers are proposed defaults. | §3.3 |
| Q7 | Confirm the transactional email provider / any deliverability constraints. | §3.2 |
