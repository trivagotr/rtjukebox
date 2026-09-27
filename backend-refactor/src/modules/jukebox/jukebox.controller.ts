import type { RequestHandler } from 'express';
import { ValidationError } from '../../core/errors/app-error.js';
import type { AuthPrincipal } from '../../core/auth/auth.types.js';
import { adminSkipBodySchema, connectBodySchema, disconnectBodySchema, emptyQuerySchema, kioskAutoplayBodySchema, kioskHeartbeatBodySchema, kioskNowPlayingBodySchema, queueAddBodySchema, queueParamsSchema, queueVoteBodySchema } from './jukebox.schema.js';
import type { JukeboxService } from './jukebox.service.js';

export function createJukeboxController(service: JukeboxService) {
  const kioskHeartbeat: RequestHandler = async (req, res, next) => {
    const body = kioskHeartbeatBodySchema.safeParse(req.body);
    const credential = req.get('x-kiosk-credential')?.trim() || body.data?.device_pwd;
    if (!body.success || !credential || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid kiosk heartbeat request'));
    try { await service.kioskHeartbeat({ deviceId: body.data.device_id, credential }); return res.json({ success: true, data: null, message: 'Kiosk heartbeat updated' }); } catch (e) { return next(e); }
  };

  const kioskNowPlaying: RequestHandler = async (req, res, next) => {
    const body = kioskNowPlayingBodySchema.safeParse(req.body);
    const credential = req.get('x-kiosk-credential')?.trim() || body.data?.device_pwd;
    if (!body.success || !credential || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid now-playing update'));
    try { await service.updateNowPlaying({ deviceId: body.data.device_id, credential, songId: body.data.song_id }); return res.json({ success: true }); } catch (e) { return next(e); }
  };
  const autoplayTrigger: RequestHandler = async (req, res, next) => {
    const body = kioskAutoplayBodySchema.safeParse(req.body);
    const credential = req.get('x-kiosk-credential')?.trim() || body.data?.device_pwd;
    if (!body.success || !credential || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid autoplay request'));
    try {
      const result = await service.triggerAutoplay({ deviceId: body.data.device_id, credential });
      if (result.kind === 'queued') return res.json({ success: true, data: { song_title: result.title }, message: 'Autoplay song added to pending' });
      if (result.kind === 'already_queued') return res.json({ success: true, data: null, message: 'Queue already has a song' });
      if (result.kind === 'unconfigured') return res.json({ success: true, data: null, message: 'No autoplay playlist is configured' });
      return res.json({ success: true, data: null, message: 'No eligible playlist tracks found' });
    } catch (error) { return next(error); }
  };
  const adminSkip: RequestHandler = async (req, res, next) => {
    const body = adminSkipBodySchema.safeParse(req.body);
    if (!body.success || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid skip request'));
    try {
      const result = await service.adminSkip(body.data.device_id);
      res.locals.adminAudit = { action: 'JUKEBOX_SKIP', entityType: 'queue_item', entityId: result.queueItemId, metadata: { deviceId: result.deviceId } };
      return res.json({ success: true, data: null, message: 'Song skipped by admin' });
    } catch (e) { return next(e); }
  };
  const addSong: RequestHandler = async (req, res, next) => {
    const parsed = queueAddBodySchema.safeParse(req.body);
    if (!parsed.success || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid queue request'));
    if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required to add songs' });
    try {
      const result = await service.addSong({ deviceId: parsed.data.device_id, songId: parsed.data.song_id, spotifyUri: parsed.data.spotify_uri, userId: req.user.userId, guestFingerprint: req.get('x-guest-fingerprint')?.trim() });
      if (result.kind === 'not_found') return res.status(404).json({ success: false, error: 'Device or song not found' });
      if (result.kind === 'forbidden') return res.status(403).json({ success: false, error: 'An active device session is required' });
      if (result.kind === 'duplicate') return res.status(409).json({ success: false, error: 'Song is already in queue' });
      if (result.kind === 'recently_played') return res.status(409).json({ success: false, error: 'Song played recently', code: 'SONG_PLAYED_RECENTLY' });
      if (result.kind === 'user_limit') return res.status(403).json({ success: false, error: 'Queue limit reached (5 songs)', code: 'USER_QUEUE_LIMIT_REACHED' });
      if (result.kind === 'guest_limit') return res.status(403).json({ success: false, error: 'Guest daily song limit reached', code: 'GUEST_LIMIT_REACHED' });
      if (result.kind === 'fingerprint_required') return res.status(400).json({ success: false, error: 'Guest fingerprint required', code: 'GUEST_FINGERPRINT_REQUIRED' });
      if (result.kind === 'moderated') return res.status(403).json({ success: false, error: 'Song is blocked by content moderation' });
      return res.status(201).json({ success: true, data: { id: result.id, status: result.status }, message: 'Song added to queue' });
    } catch (error) { return next(error); }
  };

  const vote: RequestHandler = async (req, res, next) => {
    const parsed = queueVoteBodySchema.safeParse(req.body);
    if (!parsed.success || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid vote request'));
    if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required to vote' });
    try {
      const result = await service.vote({ userId: req.user.userId, deviceId: parsed.data.device_id, ...(parsed.data.queue_item_id ? { queueItemId: parsed.data.queue_item_id } : {}), ...(parsed.data.song_id ? { songId: parsed.data.song_id } : {}), vote: parsed.data.vote, isSuper: parsed.data.is_super });
      if (result.kind === 'not_found') return res.status(404).json({ success: false, error: 'Queue item not found' });
      if (result.kind === 'forbidden') return res.status(403).json({ success: false, error: 'An active device session is required' });
      if (result.kind === 'supervote_guest') return res.status(403).json({ success: false, error: 'Supervote requires a registered account' });
      if (result.kind === 'supervote_used') return res.status(403).json({ success: false, error: 'Daily supervote already used', code: 'SUPER_VOTE_COOLDOWN' });
      if (result.kind === 'direct') return res.json({ success: true, data: { score_updated: true, song_score_delta: result.scoreDelta }, message: 'Vote cast on song' });
      return res.json({ success: true, data: { upvotes: result.upvotes, downvotes: result.downvotes, song_score: result.score, user_vote: result.userVote, skipped: result.skipped }, message: result.skipped ? 'Song skipped by score threshold' : 'Vote cast successfully' });
    } catch (error) { return next(error); }
  };
  const connect: RequestHandler = async (req, res, next) => {
    const body = connectBodySchema.safeParse(req.body);
    if (!body.success || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid connect request'));
    const principal = req.user as AuthPrincipal | undefined;
    try {
      const result = await service.connect({ deviceCode: body.data.device_code, userId: principal?.userId });
      if (!result) return res.status(404).json({ success: false, error: 'Device not found' });
      return res.json({ success: true, data: result, message: 'Connected to device' });
    } catch (error) { return next(error); }
  };

  const disconnect: RequestHandler = async (req, res, next) => {
    const body = disconnectBodySchema.safeParse(req.body);
    const principal = req.user as AuthPrincipal | undefined;
    if (!body.success || !emptyQuerySchema.safeParse(req.query).success) return next(new ValidationError('Invalid device ID'));
    if (!principal) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
      await service.disconnect({ deviceId: body.data.device_id, userId: principal.userId });
      return res.json({ success: true, data: null, message: 'Disconnected from device' });
    } catch (error) { return next(error); }
  };

  const queue: RequestHandler = async (req, res, next) => {
    const params = queueParamsSchema.safeParse(req.params);
    if (!params.success || !emptyQuerySchema.safeParse(req.query).success) {
      return next(new ValidationError('Invalid queue request'));
    }
    const principal = req.user as AuthPrincipal | undefined;
    try {
      const state = await service.getQueue({
        deviceId: params.data.deviceId,
        userId: principal?.userId,
        isAdmin: principal?.roles.includes('ADMIN') ?? false,
        kioskCredential: req.get('x-kiosk-credential')?.trim(),
      });
      return res.json(state);
    } catch (error) { return next(error); }
  };
  return { queue, connect, disconnect, addSong, vote, kioskHeartbeat, kioskNowPlaying, autoplayTrigger, adminSkip };
}
