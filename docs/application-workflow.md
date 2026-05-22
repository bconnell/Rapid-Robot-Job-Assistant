# Application Workflow

## 1. Import Profile

Open Options. Paste resume text or import a `.docx` file. The extension extracts text locally and does not store the original file blob.

After parsing, review the compact parser summary. It shows whether contact data and summary were found, plus counts for skills, experience, education, and certifications. Warnings point to fields that need manual review. The parser separates common degree, field, school, date, and certification patterns, but the saved profile is still only a draft until you review it.

## 2. Review And Edit

Review the parsed profile before using it. Edit contact details, links, summary, skills, experience, education, certifications, work authorization, sponsorship, desired titles, desired salary, and start date. Save the profile locally.

## 3. Analyze Job

Open a job page and use the side panel to analyze it. If the site needs permission, click **Allow This Site** and retry analysis. Permission is site-specific and user-controlled. If permission is denied, the extension cannot analyze or fill that site.

The job is saved locally only after analysis succeeds. If the same job is analyzed again, the saved record is updated instead of duplicated.

## 4. Analyze Fields

Open an application page and analyze fields. The extension creates or updates a local application session only after field analysis succeeds. Restricted pages and permission failures do not create empty sessions.

## 5. Review Fill Preview

Each detected field shows its label, mapped profile value, confidence, warning, and editable fill value. Approve safe fields one by one or use the safe bulk-approve action. Sensitive fields, file uploads, hidden fields, unknown fields, and missing values are not bulk-approved.

## 6. Fill Approved Fields

Click **Fill Approved Fields**. The extension fills approved fields only and shows per-field results. It does not click submit, apply, next, CAPTCHA, MFA, or verification controls.

## 7. Finish Manually

Handle CAPTCHA, login, MFA, final review, and submission yourself. You can save notes, mark the application submitted yourself, or mark it skipped.
