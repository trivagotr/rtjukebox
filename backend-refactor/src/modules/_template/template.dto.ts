import type { TemplateRecord } from './ports/template.repository.js';

export interface TemplateDto {
  id: string;
}

export function toTemplateDto(record: TemplateRecord): TemplateDto {
  return { id: record.id };
}
