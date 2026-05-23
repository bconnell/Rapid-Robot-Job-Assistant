# Application Workflow

The popup is the launcher. The in-page assistant is the main surface for live job and application pages.

## Normal Flow

1. Open a job or application page.
2. Click the extension.
3. Choose **Open Assistant On This Page**.
4. Click **Analyze Job**.
5. Import or review your profile before filling.
6. Click **Analyze Fields** on the application form.
7. Review suggested values.
8. Approve safe fields.
9. Click **Fill Approved**.
10. Submit manually yourself.

## In-Page Assistant

The in-page assistant appears as a small branded panel on the current page after a user action. It can be closed or minimized. It does not run on page load and it does not impersonate the site.

The assistant can analyze the current page, show field summaries, build a local fill preview, and fill approved fields. It does not click submit, apply, next, login, CAPTCHA, MFA, or bot-check controls.

## Profile Timing

A profile is not required to analyze a job page. A profile is needed before fill preview and filling because the assistant needs saved values to suggest field answers.

If no profile exists, the UI says **Profile Needed Before Fill**. That is an attention state, not an error.

## Full Assistant Tab And Side Panel

The full assistant tab is for profile review, saved data, diagnostics, and fallback guidance. It is not the preferred surface for live page work.

Side panel support is optional. Some Chromium browsers may not support it reliably. The in-page assistant is the recommended live workflow.

## Site Permission

Most normal pages can be analyzed from a user click through `activeTab`. If Chrome blocks access, use **Allow This Site**. It requests the current origin only, such as `https://example.com/*`.

## Manual Finish

The extension does not submit applications. The user handles login, CAPTCHA, MFA, final review, and submission.
