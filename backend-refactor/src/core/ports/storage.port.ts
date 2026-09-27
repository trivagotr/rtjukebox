export interface StoredObject {
  key: string;
  contentType: string;
  size: number;
}

export interface StorageService {
  put(input: {
    key: string;
    content: Uint8Array;
    contentType: string;
  }): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array | null>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}
