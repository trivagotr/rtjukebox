import type { RequestHandler } from 'express';
import { AppError, ValidationError } from '../../core/errors/app-error.js';
import { toRegisteredDeviceDto } from './devices.dto.js';
import { adminDeviceIdSchema, createAdminDeviceSchema, emptyQuerySchema, kioskRegistrationSchema, playbackTargetSchema, spotifyPlaybackTargetSchema, updateAdminDeviceSchema } from './devices.schema.js';
import type { DevicesService } from './devices.service.js';
import type { AuthPrincipal } from '../../core/auth/auth.types.js';
import { z } from 'zod';

export function createDevicesController(service: DevicesService) {
  const listAdmin: RequestHandler = async (req, res, next) => {
    if (!emptyQuerySchema.safeParse(req.query).success || !emptyQuerySchema.safeParse(req.body ?? {}).success) return next(new ValidationError('Invalid device-list request'));
    try { return res.json({ success: true, data: { devices: await service.listAdminDevices() }, message: 'Devices fetched' }); } catch (e) { return next(e); }
  };
  const createAdmin: RequestHandler = async (req, res, next) => {
    const body = createAdminDeviceSchema.safeParse(req.body);
    if (!body.success || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid device creation request'));
    try { return res.status(201).json({ success: true, data: { device: await service.createAdminDevice(body.data) }, message: 'Device created' }); } catch (e) { return next(e); }
  };
  const updateAdmin: RequestHandler = async (req, res, next) => {
    const params = adminDeviceIdSchema.safeParse(req.params);
    const body = updateAdminDeviceSchema.safeParse(req.body);
    if (!params.success || !body.success || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid device update request'));
    try { return res.json({ success: true, data: { device: await service.updateAdminDevice(params.data.id, body.data) }, message: 'Device updated' }); } catch (e) { return next(e); }
  };
  const logoutAll: RequestHandler = async (req, res, next) => {
    const params = adminDeviceIdSchema.safeParse(req.params);
    if (!params.success || !emptyQuerySchema.safeParse(req.query).success || !emptyQuerySchema.safeParse(req.body ?? {}).success) return next(new ValidationError('Invalid device-session request'));
    try { await service.logoutAllDeviceSessions(params.data.id); return res.json({ success: true, data: null, message: 'Device sessions revoked' }); } catch (e) { return next(e); }
  };
  const updatePlaybackTarget: RequestHandler = async (req, res, next) => {
    const params = adminDeviceIdSchema.safeParse(req.params);
    const body = spotifyPlaybackTargetSchema.safeParse(req.body);
    if (!params.success || !body.success || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid Spotify playback target request'));
    try { return res.json({ success: true, data: { device: await service.updateSpotifyPlaybackTarget(params.data.id, body.data) }, message: 'Spotify playback target updated' }); } catch (e) { return next(e); }
  };
  const updateGenericPlaybackTarget: RequestHandler = async (req, res, next) => {
    const params = adminDeviceIdSchema.safeParse(req.params);
    const body = playbackTargetSchema.safeParse(req.body);
    if (!params.success || !body.success || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid playback target request'));
    try { return res.json({ success: true, data: await service.updatePlaybackTarget(params.data.id, { provider: body.data.provider, targetId: body.data.target_id, playerName: body.data.player_name }), message: 'Playback target updated' }); } catch (e) { return next(e); }
  };
  const provisionKiosk: RequestHandler = async (req, res, next) => {
    const params = z.object({ id: z.string().uuid() }).strict().safeParse(req.params);
    const body = z.object({}).strict().safeParse(req.body ?? {});
    const query = z.object({}).strict().safeParse(req.query);
    const principal = req.user as AuthPrincipal | undefined;
    if (!params.success || !body.success || !query.success) return next(new ValidationError('Invalid provisioning request'));
    if (!principal) return next(new ValidationError('Authenticated administrator required'));
    try {
      const result = await service.provisionKiosk(params.data.id, principal.userId);
      return res.json({ success: true, data: result, message: 'One-time kiosk provisioning code created' });
    } catch (error) { return next(error); }
  };

  const list: RequestHandler = async (req, res, next) => {
    if (!emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Unexpected device query parameters'));
    try {
      return res.json({ success: true, data: { devices: await service.listPublicDevices() }, message: 'Devices fetched' });
    } catch (error) { return next(error); }
  };

  const registerKiosk: RequestHandler = async (req, res, next) => {
    const parsed = kioskRegistrationSchema.safeParse(req.body);
    if (!parsed.success || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('device_code and a kiosk credential or provisioning code are required'));
    try {
      const result = await service.registerKiosk(parsed.data);
      return res.json({ success: true, data: { device: toRegisteredDeviceDto(result.device), credential: result.credential }, message: 'Kiosk registered' });
    } catch (error) {
      if (error instanceof AppError && error.code === 'FORBIDDEN') {
        const code = error.message.startsWith('Device is inactive') ? 'DEVICE_INACTIVE'
          : error.message.startsWith('Kiosk credential') ? 'INVALID_CREDENTIAL' : 'INVALID_PROVISIONING_CODE';
        return res.status(error.statusCode).json({ success: false, error: error.message, code });
      }
      return next(error);
    }
  };

  return { list, registerKiosk, provisionKiosk, listAdmin, createAdmin, updateAdmin, logoutAll, updatePlaybackTarget, updateGenericPlaybackTarget };
}
