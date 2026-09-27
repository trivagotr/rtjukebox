export interface AdminAuditRepository {
  record(input: { userId: string; action: string; entityType: string | null; entityId: string | null; ipAddress: string | null; metadata: Record<string, unknown> }): Promise<void>;
}
