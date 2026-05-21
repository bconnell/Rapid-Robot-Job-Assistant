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
- Required status
- Visibility

## Confidence

- `0.90` and above: fillable only after user approval.
- `0.70` to `0.89`: needs direct review.
- Below `0.70`: do not fill.

Sensitive fields always require direct review regardless of confidence.

## Sensitive Fields

Sensitive fields include voluntary demographic fields, disability self-identification, veteran status, sponsorship, work authorization, SSN-like identifiers, and date-of-birth style fields.
