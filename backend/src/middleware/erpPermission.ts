import axios from 'axios';
import { NextFunction, Response } from 'express';
import { db } from '../db';
import { AuthRequest } from './auth';
import {
    decryptErpToken,
    encryptErpToken,
    fetchErpIdentityProfile,
    isErpIdentityEnabled,
    refreshErpAccessToken,
} from '../services/erpIdentity';

const CACHE_SECONDS = 300;

export function requireErpPermission(permission: string) {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!isErpIdentityEnabled()) {
            return res.status(404).json({ error: 'ERP account linking is not enabled' });
        }

        const result = await db.query(
            `SELECT * FROM external_identities
             WHERE user_id = $1 AND provider = 'erp'`,
            [req.user?.id],
        );
        const identity = result.rows[0];
        if (!identity) {
            return res.status(403).json({ error: 'A linked ERP account is required' });
        }

        let permissions: string[] = Array.isArray(identity.permissions) ? identity.permissions : [];
        const cacheAge = (Date.now() - new Date(identity.last_verified_at).getTime()) / 1000;

        if (cacheAge > CACHE_SECONDS) {
            try {
                let accessToken = decryptErpToken(identity.access_token_ciphertext);
                if (new Date(identity.token_expires_at).getTime() <= Date.now() + 30_000) {
                    if (!identity.refresh_token_ciphertext) {
                        return res.status(401).json({ error: 'ERP authorization must be renewed' });
                    }
                    const refreshed = await refreshErpAccessToken(decryptErpToken(identity.refresh_token_ciphertext));
                    accessToken = refreshed.access_token;
                    identity.refresh_token_ciphertext = refreshed.refresh_token
                        ? encryptErpToken(refreshed.refresh_token)
                        : identity.refresh_token_ciphertext;
                    identity.token_expires_at = new Date(Date.now() + refreshed.expires_in * 1000);
                }

                const profile = await fetchErpIdentityProfile(accessToken);
                permissions = profile.permissions || [];
                await db.query(
                    `UPDATE external_identities SET
                        provider_email = $2, display_name = $3, roles = $4::jsonb,
                        permissions = $5::jsonb, authorization_version = $6,
                        access_token_ciphertext = $7, refresh_token_ciphertext = $8,
                        token_expires_at = $9, last_verified_at = NOW(), updated_at = NOW()
                     WHERE user_id = $1 AND provider = 'erp'`,
                    [
                        req.user!.id,
                        profile.email,
                        profile.name,
                        JSON.stringify(profile.roles || []),
                        JSON.stringify(permissions),
                        profile.authorization_version,
                        encryptErpToken(accessToken),
                        identity.refresh_token_ciphertext,
                        identity.token_expires_at,
                    ],
                );
            } catch (error) {
                if (axios.isAxiosError(error) && [400, 401, 403].includes(error.response?.status || 0)) {
                    return res.status(403).json({ error: 'ERP authorization was revoked' });
                }
                return res.status(503).json({ error: 'ERP authorization could not be verified' });
            }
        }

        if (!permissions.includes(permission)) {
            return res.status(403).json({ error: 'ERP permission denied' });
        }
        return next();
    };
}
