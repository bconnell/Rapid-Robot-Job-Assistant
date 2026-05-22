export interface FormFieldCandidate {
  selector: string;
  inputType?: string;
  tagName: string;
  labelText?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaLabelledBy?: string;
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
  required: boolean;
  visible: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  role?: string;
  controlFamily?:
    | 'native-input'
    | 'native-textarea'
    | 'native-select'
    | 'radio-group'
    | 'checkbox-group'
    | 'file-upload'
    | 'aria-combobox'
    | 'custom-select'
    | 'unknown-widget';
  candidateSource?: 'native-control' | 'aria-widget' | 'grouped-control';
  frameWarning?: string;
  stableSelector?: boolean;
}
