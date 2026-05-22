# Field Detection Strategy

Batch 1 uses deterministic field detection and mapping.

## Signals

- Explicit labels
- Wrapping labels
- ARIA labels
- Placeholder text
- Name attributes
- ID attributes
- Autocomplete attributes
- Nearby text
- Section headings
- Select options
- Radio and checkbox group options
- Required status
- Visibility

## Confidence

- `0.90` and above: fillable only after user approval.
- `0.70` to `0.89`: needs direct review.
- Below `0.70`: do not fill.

Sensitive fields always require direct review regardless of confidence.

## Fill Preview

The side panel turns mappings into fill-preview rows using the active profile. Each row shows the detected label, mapped profile field, confidence, warning, editable value, approval state, and fill result.

Safe high-confidence fields can be bulk-approved. Sensitive fields, file uploads, hidden fields, unknown fields, and fields with no saved value are not bulk-approved.

Profile value resolution uses saved profile data only. It may split a two-part full name into first and last name. It does not invent missing values.

## Sensitive Fields

Sensitive fields include voluntary demographic fields, disability self-identification, veteran status, sponsorship, work authorization, SSN-like identifiers, and date-of-birth style fields.
