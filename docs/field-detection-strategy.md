# Field Detection Strategy

Field detection is deterministic and review-first. The extension looks for useful form metadata on the current page after the user asks for analysis. It does not submit applications, click navigation, or bypass page protections.

## Signals

- Explicit labels
- Wrapping labels
- ARIA labels
- ARIA labelled-by and described-by references
- Placeholder text
- Name attributes
- ID attributes
- Autocomplete attributes
- Data test attributes when they provide a stable selector
- Nearby text
- Section headings
- Fieldset legends
- Select options
- Radio and checkbox group options
- Required status
- Visibility
- Disabled and read-only status
- Native control type or custom widget type

Autocomplete is weighted strongest. Explicit labels, fieldset legends, and ARIA labels are strong. Name and ID are useful but not enough by themselves for sensitive or ambiguous fields. Placeholder and nearby text are weaker. Section headings provide context, but they should not map every field in a section by themselves.

## Confidence

- `0.90` and above: fillable only after user approval.
- `0.70` to `0.89`: needs direct review.
- Below `0.70`: do not fill.

Sensitive fields always require direct review regardless of confidence.

The mapper avoids common false positives. For example, `statement` should not map to state, and `work` by itself should not map to work authorization.

## Fill Preview

The side panel turns mappings into fill-preview rows using the active profile. Each row shows the detected label, mapped profile field, confidence, warning, editable value, approval state, and fill result.

Safe high-confidence fields can be bulk-approved. Sensitive fields, file uploads, custom widgets, hidden fields, disabled fields, read-only fields, fields without stable selectors, unknown fields, and fields with no saved value are not bulk-approved.

Profile value resolution uses saved profile data only. It may split a two-part full name into first and last name. It does not invent missing values.

## Grouped Fields

Radio buttons and checkbox sets are grouped by name or fieldset context when reasonable. The preview shows one review row for the group instead of treating every option as a separate field. Filling matches the approved value to an option label or option value. If no safe match exists, the field is left for manual review.

## Custom Widgets

ARIA comboboxes, custom dropdown buttons, contenteditable fields, and ARIA radio/checkbox widgets are detected when possible. They are manual-only in this version. The extension does not click dropdowns or choose custom options because those controls vary widely and are easy to mis-handle.

## Iframes

Some applications place the actual form in an iframe. The extension warns when an iframe looks likely to contain application content. It does not force access to cross-origin frames or inject into every frame.

## Stable Selectors

Selectors prefer ID, data test attributes, name, autocomplete, and ARIA label when they are unique. `nth-of-type` is a last resort. Fields without a stable selector are marked for manual review instead of filled.

## Sensitive Fields

Sensitive fields include voluntary demographic fields, disability self-identification, veteran status, gender, race, ethnicity, pronouns, sponsorship, work authorization, SSN-like identifiers, and date-of-birth style fields.
