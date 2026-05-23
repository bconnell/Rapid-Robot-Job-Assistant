# Application Workflow

The extension is meant to guide a reviewed workflow, not force one exact order. You can analyze a job before creating a profile. A saved profile is only required when you want useful fill-preview values.

## 1. Check The Current Page

Open the popup on a normal `http` or `https` job or application page. The popup shows whether the page is ready, blocked, or needs site permission. Chrome internal pages and extension pages cannot be analyzed.

If the workspace is open in a normal tab, it uses the saved target page instead of the workspace page. If no target is saved, it shows **No target page selected**. Go back to the job or application page, open the assistant from there, and choose **Use Current Page** before running analysis.

## 2. Analyze The Job

Use **Analyze Job Page** from the popup or workspace. The job is saved locally only after analysis succeeds. If the same job is analyzed again, the saved record is updated instead of duplicated.

After job analysis, the next step is to confirm your profile before filling. You can still analyze application fields before the profile is ready.

## 3. Confirm Or Import A Profile

If no active profile exists, the popup shows **Profile Needed Before Fill** and offers **Import or create profile**. This is not a blocker for job analysis.

If a profile exists, the popup shows **Profile ready** and changes the action to **Review profile**. Profile data stays local. Review it before using it to fill applications.

## 4. Analyze Application Fields

Open the application form and use **Analyze Fields**. The side panel shows a compact summary: fields found, safe fill candidates, manual-only fields, sensitive fields, and fields that need review.

If the page appears to use an iframe for the application form, the extension warns that missing fields may need to be opened directly or filled manually.

## 5. Review Suggested Values

Each detected field shows its label, mapped profile value, confidence, warning, mapping explanation, and editable fill value. Approve safe fields one by one or use the safe bulk-approve action. Sensitive fields, file uploads, custom dropdowns, hidden fields, disabled fields, read-only fields, unknown fields, unstable selectors, and missing values are not bulk-approved.

## 6. Fill Approved Fields

Click **Fill Approved Fields**. The extension fills approved fields only and shows per-field results. Text inputs, textareas, native selects, radio groups, and checkbox groups are filled only when the match is safe.

The extension does not click submit, apply, next, CAPTCHA, MFA, verification controls, custom dropdowns, or file upload controls.

## 7. Finish Manually

Handle login, CAPTCHA, MFA, final review, and submission yourself. You can save notes, mark the application submitted yourself, or mark it skipped.

## Workspace Fallback

If Chrome cannot open the side panel, use **Open Workspace In Tab**. The tab uses the same workspace UI and tries to remember the job or application page that opened it. If the workspace tab does not have a saved target page, it explains that directly instead of reporting the workspace as a bad web page.

Use **Use Current Page** from a normal job or application page to reset the target. Extension pages, Chrome internal pages, and file pages cannot become targets.

If analysis fails right after a code change, rebuild with `npm run build`, reload the unpacked extension from `dist`, reload the page, and try again.
