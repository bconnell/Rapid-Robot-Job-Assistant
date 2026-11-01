export interface FormFieldCandidate {
  selector: string;
  inputType?: string;
  tagName: string;
  labelText?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaLabelledBy?: string;
  formContext?: string;
  domIdentity?: number;
  placeholder?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  dataTestId?: string;
  nearbyText?: string;
  sectionHeading?: string;
  groupName?: string;
  groupLabel?: string;
  fieldsetLegend?: string;
  options: string[];
  optionValues?: string[];
  optionCount?: number;
  optionListComplete?: boolean;
  groupMemberCount?: number;
  groupMemberIdentities?: number[];
  required: boolean;
  visible: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  role?: string;
  controlFamily?:
    | 'native-input'
    | 'native-textarea'
    | 'native-select'
    | 'native-multi-select'
    | 'radio-group'
    | 'checkbox-group'
    | 'file-upload'
    | 'aria-combobox'
    | 'custom-select'
    | 'unknown-widget';
  candidateSource?: 'native-control' | 'aria-widget' | 'grouped-control';
  frameWarning?: string;
  stableSelector?: boolean;
  /** False or absent means classifier-relevant DOM context may be incomplete. */
  classificationContextComplete?: boolean;
}
