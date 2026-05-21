export interface FormFieldCandidate {
  selector: string;
  inputType?: string;
  tagName: string;
  labelText?: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  nearbyText?: string;
  sectionHeading?: string;
  options: string[];
  required: boolean;
  visible: boolean;
}
