export interface TemplateRecord {
  id: string;
}

export interface TemplateReader {
  findById(id: string): Promise<TemplateRecord | null>;
}

export interface TemplateWriter {
  create(input: Omit<TemplateRecord, 'id'>): Promise<TemplateRecord>;
}

export interface TemplateRepository extends TemplateReader, TemplateWriter {}
