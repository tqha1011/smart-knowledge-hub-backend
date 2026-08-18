export enum SystemRole {
  Admin = 'admin',
  Employee = 'employee',
}

export enum KnowledgeSpaceRole {
  Owner = 'Owner',
  Editor = 'Editor',
  Viewer = 'Viewer',
}

export enum KnowledgeSpaceType {
  DEPARTMENT = 'DEPARTMENT',
  POLICY = 'POLICY',
  HANDBOOK = 'HANDBOOK',
  ONBOARDING = 'ONBOARDING',
  SUPPORT = 'SUPPORT',
  GUIDELINE = 'GUIDELINE',
  GENERAL = 'GENERAL',
}

export enum CommonDocumentType {
  PDF = 'PDF',
  DOCX = 'DOCX',
  TXT = 'TXT',
  MD = 'MD',
}

export enum CommonDocumentStatus {
  Processing = 'Processing',
  Ready = 'Ready',
  Failed = 'Failed',
}

export enum CommonDocumentVisibility {
  Public = 'Public',
  Restricted = 'Restricted',
}

export enum CommonPermissionType {
  Read = 'Read',
  Edit = 'Edit',
  Manage = 'Manage',
}
