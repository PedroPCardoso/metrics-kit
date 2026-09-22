import { basicTemplate } from './basic';
import { ecommerceTemplate } from './ecommerce';
import { saasTemplate } from './saas';
import type { ScaffoldTemplate } from './types';

const templates = [basicTemplate, ecommerceTemplate, saasTemplate] satisfies ScaffoldTemplate[];

export type TemplateName = (typeof templates)[number]['name'];

export function listTemplates(): ScaffoldTemplate[] {
  return templates;
}

export function getTemplate(name: string): ScaffoldTemplate {
  const template = templates.find((item) => item.name === name);
  if (!template) {
    throw new Error(`Unknown template "${name}". Available templates: ${templates.map((item) => item.name).join(', ')}`);
  }
  return template;
}
