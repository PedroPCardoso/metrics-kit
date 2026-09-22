export interface TemplateFile {
  path: string;
  content: string;
}

export interface ScaffoldTemplate {
  name: 'basic' | 'ecommerce' | 'saas';
  description: string;
  files: TemplateFile[];
}
