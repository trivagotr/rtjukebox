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
  delete(key: string): Promise<void>;
}
