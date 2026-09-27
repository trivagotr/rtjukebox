import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { AdminAuditRepository } from '../ports/admin-audit.repository.js';

export class PrismaAdminAuditRepository implements AdminAuditRepository {
  constructor(private readonly client: PrismaClient) {}

  async record(input: { userId: string; action: string; entityType: string | null; entityId: string | null; ipAddress: string | null; metadata: Record<string, unknown> }) {
    await this.client.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: { ...input.metadata, ipAddress: input.ipAddress } as Prisma.InputJsonObject,
      },
    });
  }
}
