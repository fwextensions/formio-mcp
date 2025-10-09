/**
 * Form.io Type Definitions
 */

export interface FormioConfig {
  baseUrl: string;
  projectUrl: string;
  apiKey?: string;
  token?: string;
}

export interface FormioComponent {
  type: string;
  key: string;
  label?: string;
  placeholder?: string;
  description?: string;
  tooltip?: string;
  required?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  unique?: boolean;
  persistent?: boolean;
  protected?: boolean;
  defaultValue?: any;
  validate?: {
    required?: boolean;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    custom?: string;
    customPrivate?: boolean;
    [key: string]: any;
  };
  conditional?: {
    show?: boolean;
    when?: string;
    eq?: string;
    [key: string]: any;
  };
  input?: boolean;
  tableView?: boolean;
  [key: string]: any;
}

export interface FormioForm {
  _id?: string;
  title: string;
  name: string;
  path: string;
  type?: 'form' | 'resource';
  display?: 'form' | 'wizard' | 'pdf';
  components: FormioComponent[];
  tags?: string[];
  settings?: {
    [key: string]: any;
  };
  properties?: {
    [key: string]: any;
  };
  created?: string;
  modified?: string;
  machineName?: string;
}

export interface FormioSubmission {
  _id?: string;
  data: {
    [key: string]: any;
  };
  metadata?: {
    [key: string]: any;
  };
  state?: string;
  created?: string;
  modified?: string;
  form?: string;
}

export interface FormioListResponse<T> {
  data: T[];
  total?: number;
  limit?: number;
  skip?: number;
}

export interface FormioError {
  message: string;
  name?: string;
  details?: any;
}
