import type {
  TemplateReader,
  TemplateRecord,
  TemplateWriter,
} from './ports/template.repository.js';

export class TemplateService {
  constructor(
    private readonly reader: TemplateReader,
    private readonly writer: TemplateWriter,
  ) {}

  findById(id: string): Promise<TemplateRecord | null> {
    return this.reader.findById(id);
  }

  create(input: Omit<TemplateRecord, 'id'>): Promise<TemplateRecord> {
    return this.writer.create(input);
  }
}
