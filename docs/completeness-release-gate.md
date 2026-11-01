# Completeness Release Gate

This is one consolidated acceptance gate, not a backlog of indefinite micro-slices.

## Goal and scope

**/goal:** Deliver a usable, local-first Chromium Manifest V3 job assistant that helps one user collect a truthful profile, review job pages, inspect application fields, approve safe values, fill only those approved values, preserve application history, recover local records, and finish submissions manually.

**/loop:** Inspect actual workflows, implement real missing behavior, integrate all surfaces, attack negative paths, run executable and browser gates, record evidence, recheck the exact candidate, and stop only at a verified acceptance boundary.

No mass submitting, CAPTCHA circumvention, authentication bypass, remote model requests without explicit review, or invented qualifications. Existing public documentation defines those boundaries. Publishing to the Chrome Web Store requires external credentials and is not silently inferred from a local build.

## Product completeness matrix

| End-to-end workflow                                                                      | Source candidate                                                    | Executable acceptance              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| Paste or import DOCX, parse and review profile, save, activate, switch                   | Implemented; profile and resume saves use one IndexedDB transaction | **PASS (2026-10-31 working tree)** |
| Analyze a real job page, reject false or empty detections, store and dedupe              | Existing implementation reviewed                                    | **PASS (2026-10-31 working tree)** |
| Save and manually check job-search URLs, preserve URL safety                             | Existing implementation reviewed                                    | **PASS (2026-10-31 working tree)** |
| Detect fields, map only supported values, identify sensitive or unknown fields           | Existing implementation reviewed                                    | **PASS (2026-10-31 working tree)** |
| Explicit review and approval, exact page binding, no automatic submission                | Existing implementation reviewed                                    | **PASS (2026-10-31 working tree)** |
| Persist and resume sessions without reusing stale fill approvals                         | Existing implementation reviewed                                    | **PASS (2026-10-31 working tree)** |
| Export a consistent snapshot of all seven IndexedDB stores                               | Implemented; size-limited with explicit refusal                     | **PASS (2026-10-31 working tree)** |
| Preview and atomically add validated records, preserve duplicates and roll back failures | Implemented; accepts older version-one four-collection backups      | **PASS (2026-10-31 working tree)** |
| Atomic targeted cleanup of profiles, searches, and job history                           | Implemented with transaction failure handling                       | **PASS (2026-10-31 working tree)** |
| Popup, side panel, Options, restricted-page fallback, error feedback                     | Source inspected; popup error handling hardened                     | **PASS (2026-10-31 working tree)** |

**Source candidate** means the code exists and was inspected. It does not mean the behavior passed executable validation.

The matrix results above describe the synthetic acceptance run on the pre-commit working tree based on 89ff06a. They are not hosted CI evidence. The exact committed candidate must still pass the numbered owner gates below before merge.

## Mandatory local owner gates

Run against the **exact Git commit to be merged** in an isolated checkout, with synthetic fixtures and without production application data:

1. Capture the exact commit SHA, disk free space, Node/npm/Chromium versions, and working-tree cleanliness.
2. Run `npm ci` and `npm run validate:local` and record the exit codes. This includes TypeScript, Vitest, ESLint, Prettier, Vite builds, and built extension output checks. Fail the candidate if any step fails.
3. Inject database failures and conflicting IDs; assert preservation of every unaffected store and lack of partial writes. Run competing-restore regression.
4. Load `dist` as an unpacked extension in a **disposable** Chromium browser profile. Use only repository fake fixtures and fake profile records. Confirm manifest permissions and that browser-restricted pages fail closed.
5. Exercise profile import/save/select, job analysis, manual saved searches, form analysis, individual approvals, bulk-safe approvals, rejected/unknown/sensitive fields, partial-fill recovery, and explicit user-marked completion. Do **not** submit a real application.
6. Run export and import between two **isolated** disposable browser profiles. Compare records across all seven IndexedDB stores, including resume text, mappings, suggestions, and session evidence. Test older four-store backups, collisions, oversized files, malformed imports, and interrupted storage.
7. Inspect actual screenshots from the running extension at narrow popup width, regular Options, wide Options, side panel, and in-page assistant. Check overflow, focus states, keyboard access, readable text, and warning visibility. Static authoring screenshots do not substitute for this.
8. Confirm absence of uncontrolled network requests, sensitive logging, bundled remote scripts, automatic submissions, credential leakage, and accidental export to the repository. Confirm bundled third-party license notices are present and reachable from Options.
9. Rerun the full gate after the last change and record the candidate SHA and proof. Never merge, push a release tag, or claim completeness after a failing or unexecuted gate.

## Recorded packaged-browser evidence

On 2026-10-31, Chrome for Testing 156.0.8078.47 loaded the exact production dist in a new disposable profile. Its manifest had no permanent host permissions; HTTP and HTTPS were declared only as optional host permissions. Before any grant, the exact production build showed the blocked-page state and disabled page-analysis action on the synthetic localhost page. A separate temporary copy of the same dist added only http://127.0.0.1/* as a required test permission; that copy exercised the full localhost workflow. The temporary permission override and all synthetic browser data stayed outside the repository.

The end-to-end run covered resume text and DOCX import, profile save and selection, saved-search creation, manual review, opening and deletion, job analysis, field detection, rejected unknown and sensitive fields, individual and bulk-safe approvals, partial-fill recovery, user-marked completion without a submit event, history, seven-store backup and cross-profile restore, legacy restore, malformed and oversized backup rejection, and injected restore failure/collision recovery. Actual screenshots were checked for popup, in-page assistant, side panel, and Options at narrow and wide desktop sizes; page overflow, unlabeled controls, focus visibility, page errors, and external requests were checked. Targeted Options cleanup was separately exercised for searches, job history, profiles and resumes, including rollback and retry after an injected IndexedDB failure. All used synthetic records; no application was submitted.

The native optional-origin consent prompt itself is **NOT RUN to completion**. A direct request in a fresh headless profile remained pending on Chrome's consent UI, which this background-only run does not accept. No origin permission was granted in that profile. The granted localhost access used by the interaction suite came only from the temporary test copy described above. This preserves the explicit user-consent boundary; the test does not claim that Chrome's native consent dialog was accepted.

## Candidate-specific hosted validation

A historical green workflow on an older main revision does not validate this candidate. After pushing the branch, inspect PR checks for the exact pushed head and current base; distinguish admission, skipped workflows, and executed steps from a passing product run. Local validation and packaged-browser evidence remain separate from hosted CI. Do not claim these results apply to a different source, manifest, dependency, or test harness revision.

Testing ownership belongs to the developer/agent, not to the user. The user has explicitly deferred manual acceptance until the product is complete. Do not request user testing of an unfinished candidate. If an executable environment remains unavailable, leave the work branch unmerged and report this as a blocker rather than marking success.

## Preservation and publication

Use non-destructive Git; preserve `main` until final proof; commit bounded changes with explanatory messages. Preserve all actual user data; test only with fake records and disposable browser profiles. Treat the seven IndexedDB stores as the canonical set defined by `INDEXED_DB.stores`. Actual browser settings and active profile selection are not transferred by local record backup; the schema includes only fixed local-only markers. Future schema changes must explicitly migrate old exports without silently overwriting records.

### Release decision

**Not release ready until every mandatory local and Chromium gate above has passed on the exact candidate.** External publishing credentials can remain a separate owner action; they do not excuse build, feature, preservation, security, or browser regressions.
