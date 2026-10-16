# Completeness Release Gate

This is one consolidated acceptance gate, not a backlog of indefinite micro-slices.

## Goal and scope

**/goal:** Deliver a usable, local-first Chromium Manifest V3 job assistant that helps one user collect a truthful profile, review job pages, inspect application fields, approve safe values, fill only those approved values, preserve application history, recover local records, and finish submissions manually.

**/loop:** Inspect actual workflows, implement real missing behavior, integrate all surfaces, attack negative paths, run executable and browser gates, record evidence, recheck the exact candidate, and stop only at a verified acceptance boundary.

No mass submitting, CAPTCHA circumvention, authentication bypass, remote model requests without explicit review, or invented qualifications. Existing public documentation defines those boundaries. Publishing to the Chrome Web Store requires external credentials and is not silently inferred from a local build.

## Product completeness matrix

| End-to-end workflow | Source candidate | Executable acceptance |
| --- | --- | --- |
| Paste or import DOCX, parse and review profile, save, activate, switch | Implemented; profile and resume saves use one IndexedDB transaction | **Pending** |
| Analyze a real job page, reject false or empty detections, store and dedupe | Existing implementation reviewed | **Pending** |
| Save and manually check job-search URLs, preserve URL safety | Existing implementation reviewed | **Pending** |
| Detect fields, map only supported values, identify sensitive or unknown fields | Existing implementation reviewed | **Pending** |
| Explicit review and approval, exact page binding, no automatic submission | Existing implementation reviewed | **Pending** |
| Persist and resume sessions without reusing stale fill approvals | Existing implementation reviewed | **Pending** |
| Export a consistent snapshot of all seven IndexedDB stores | Implemented; size-limited with explicit refusal | **Pending** |
| Preview and atomically add validated records, preserve duplicates and roll back failures | Implemented; accepts older four-collection backups | **Pending** |
| Atomic targeted cleanup of profiles, searches, and job history | Implemented with transaction failure handling | **Pending** |
| Popup, side panel, Options, restricted-page fallback, error feedback | Source inspected; popup error handling hardened | **Pending** |

**Source candidate** means the code exists and was inspected. It does not mean the behavior passed executable validation.

## Mandatory local owner gates

Run against the **exact Git commit to be merged** in an isolated checkout, with synthetic fixtures and without production application data:

1. Capture the exact commit SHA, disk free space, Node/npm/Chromium versions, and working-tree cleanliness.
2. Run `npm ci` and `npm run validate:local` and record the exit codes. This includes TypeScript, Vitest, ESLint, Prettier, Vite builds, and built extension output checks. Fail the candidate if any step fails.
3. Inject database failures and conflicting IDs; assert preservation of every unaffected store and lack of partial writes. Run competing-restore regression.
4. Load `dist` as an unpacked extension in a **disposable** Chromium browser profile. Use only repository fake fixtures and fake profile records. Confirm manifest permissions and that browser-restricted pages fail closed.
5. Exercise profile import/save/select, job analysis, manual saved searches, form analysis, individual approvals, bulk-safe approvals, rejected/unknown/sensitive fields, partial-fill recovery, and explicit user-marked completion. Do **not** submit a real application.
6. Run export and import between two **isolated** disposable browser profiles. Compare records across all seven IndexedDB stores, including resume text, mappings, suggestions, and session evidence. Test older four-store backups, collisions, oversized files, malformed imports, and interrupted storage.
7. Inspect actual screenshots from the running extension at narrow popup width, regular Options, wide Options, side panel, and in-page assistant. Check overflow, focus states, keyboard access, readable text, and warning visibility. Static authoring screenshots do not substitute for this.
8. Confirm absence of uncontrolled network requests, sensitive logging, bundled remote scripts, automatic submissions, credential leakage, and accidental export to the repository.
9. Rerun the full gate after the last change and record the candidate SHA and proof. Never merge, push a release tag, or claim completeness after a failing or unexecuted gate.

## Current validation constraint

GitHub Actions is unavailable because of billing, so hosted workflow status is **not evidence of a passing candidate**. The current ChatGPT sandbox has Node and Chromium but cannot reach GitHub or the npm registry to download the repository/dependencies; the linked GitHub app can inspect and modify repository files but cannot execute local build commands. Do not claim the above tests have run.

Testing ownership belongs to the developer/agent, not to the user. The user has explicitly deferred manual acceptance until the product is complete. Do not request user testing of an unfinished candidate. If an executable environment remains unavailable, leave the work branch unmerged and report this as a blocker rather than marking success.

## Preservation and publication

Use non-destructive Git; preserve `main` until final proof; commit bounded changes with explanatory messages. Preserve all actual user data; test only with fake records and disposable browser profiles. Treat the seven IndexedDB stores as the canonical set defined by `INDEXED_DB.stores`. Browser settings and active profile selection are intentionally not transferred by local record backup. Future schema changes must explicitly migrate old exports without silently overwriting records.

### Release decision

**Not release ready until every mandatory local and Chromium gate above has passed on the exact candidate.** External publishing credentials can remain a separate owner action; they do not excuse build, feature, preservation, security, or browser regressions.
