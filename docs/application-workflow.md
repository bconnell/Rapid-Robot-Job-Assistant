# Application Workflow

The popup is the launcher. The assistant panel or assistant tab is the working area.

The normal order is simple:

1. Open a job page.
2. Click **Analyze Job**.
3. Import or review your profile before filling.
4. Open the application form.
5. Click **Analyze Fields**.
6. Review suggested values.
7. Approve safe fields.
8. Click **Fill Approved**.
9. Submit manually yourself.

## Popup

The popup should show the current page status, profile status, recommended next action, and the main button without making the user scroll. It also shows the short flow:

Job -> Profile -> Fields -> Review -> Fill -> Submit manually

Use **Open Assistant** when you want the larger working area. If Chrome cannot open the side panel, the extension opens the full assistant tab automatically.

## Profile Timing

A profile is not required to analyze a job page. A profile is needed before fill preview and filling because the extension needs saved values to suggest field answers.

If no profile exists, the UI says **Profile Needed Before Fill**. That is an attention state, not an error.

## Assistant

The assistant shows the target page, profile status, recommended next action, and the current task controls at the top. It should not show every action button at once.

Use **Use This Page** from a normal job or application page when the assistant does not have a target page selected. Extension pages, Chrome internal pages, and local files cannot become targets.

## Site Permission

Most normal pages can be analyzed from a user click through `activeTab`. If Chrome blocks access, use **Allow This Site**. It requests the current origin only, such as `https://example.com/*`.

## Manual Finish

The extension does not click submit, apply, next, login, CAPTCHA, MFA, or bot-check controls. The user reviews the page and submits manually.
