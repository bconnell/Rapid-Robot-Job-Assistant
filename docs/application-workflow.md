# Application Workflow

## 1. Import Profile

Open Options. Paste resume text or import a `.docx` file. The extension extracts text locally and does not store the original file blob.

After parsing, review the compact parser summary. It shows whether contact data and summary were found, plus counts for skills, experience, education, and certifications. Warnings point to fields that need manual review. The parser separates common degree, field, school, date, certification, and experience patterns, but the saved profile is still only a draft until you review it.

## 2. Review And Edit

Review the parsed profile before using it. Edit contact details, links, summary, skills, experience, education, certifications, work authorization, sponsorship, desired titles, desired salary, and start date. Inferred experience entries should be corrected before they are used for applications. Save the profile locally.

## 3. Analyze Job

Open a job page and use the side panel to analyze it. On normal web pages, try **Analyze Job Page** first. If Chrome blocks page access, click **Allow This Site** and retry analysis. Site permission is current-origin only and user-controlled. It is not always required.

The job is saved locally only after analysis succeeds. If the same job is analyzed again, the saved record is updated instead of duplicated.

## 4. Analyze Fields

Open an application page and analyze fields. If permission is denied, one-off analysis may still work from the button, but some pages may require allowing the current site. The extension creates or updates a local application session only after field analysis succeeds. Restricted pages and failed commands do not create empty sessions.

The side panel shows a compact field summary after analysis: fields found, safe fill candidates, manual-only fields, sensitive fields, and fields that still need review. Page warnings appear near the status banner. If the page appears to use an iframe for the application form, the extension explains that missing fields may need to be opened directly or filled manually.

## 5. Review Fill Preview

Each detected field shows its label, mapped profile value, confidence, warning, mapping explanation, and editable fill value. Approve safe fields one by one or use the safe bulk-approve action. Sensitive fields, file uploads, custom dropdowns, hidden fields, disabled fields, read-only fields, unknown fields, unstable selectors, and missing values are not bulk-approved.

Custom widgets and file uploads are manual-only in this version. The extension detects them so the preview is honest, but it does not click custom dropdowns or upload files.

## 6. Fill Approved Fields

Click **Fill Approved Fields**. The extension fills approved fields only and shows per-field results. Text inputs, textareas, native selects, radio groups, and checkbox groups are filled only when the match is safe. It does not click submit, apply, next, CAPTCHA, MFA, verification controls, custom dropdowns, or file upload controls.

## 7. Finish Manually

Handle CAPTCHA, login, MFA, final review, and submission yourself. You can save notes, mark the application submitted yourself, or mark it skipped.
