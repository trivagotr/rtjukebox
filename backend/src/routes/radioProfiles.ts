import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { ROLES } from '../middleware/rbac';
import { sendError, sendSuccess } from '../utils/response';

const router = Router();

type DbClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

type RadioProfileMode = 'create' | 'update';
type SlotType = 'jingle' | 'ad';

function normalizeOptionalPlaylistUri(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeOptionalPositiveInteger(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

export function normalizeRadioProfilePayload(
  mode: RadioProfileMode,
  input: {
    name?: unknown;
    autoplay_spotify_playlist_uri?: unknown;
    jingle_every_n_songs?: unknown;
    ad_break_interval_minutes?: unknown;
    is_active?: unknown;
  },
) {
  const normalized: Record<string, unknown> = {};

  if (mode === 'create' || input.name !== undefined) {
    const name = String(input.name ?? '').trim();
    if (!name) {
      throw new Error('Profile name required');
    }
    normalized.name = name;
  }

  const autoplaySpotifyPlaylistUri = normalizeOptionalPlaylistUri(input.autoplay_spotify_playlist_uri);
  if (autoplaySpotifyPlaylistUri !== undefined) {
    normalized.autoplaySpotifyPlaylistUri = autoplaySpotifyPlaylistUri;
  }

  const jingleEveryNSongs = normalizeOptionalPositiveInteger(input.jingle_every_n_songs, 'jingle_every_n_songs');
  if (jingleEveryNSongs !== undefined) {
    normalized.jingleEveryNSongs = jingleEveryNSongs;
  }

  const adBreakIntervalMinutes = normalizeOptionalPositiveInteger(input.ad_break_interval_minutes, 'ad_break_interval_minutes');
  if (adBreakIntervalMinutes !== undefined) {
    normalized.adBreakIntervalMinutes = adBreakIntervalMinutes;
  }

  if (input.is_active !== undefined) {
    normalized.isActive = Boolean(input.is_active);
  }

  return normalized;
}

export function normalizeDeviceOverridePayload(input: {
  override_enabled?: unknown;
  autoplay_spotify_playlist_uri?: unknown;
  jingle_every_n_songs?: unknown;
  ad_break_interval_minutes?: unknown;
}) {
  const normalized: Record<string, unknown> = {};

  if (input.override_enabled !== undefined) {
    normalized.overrideEnabled = Boolean(input.override_enabled);
  }

  const autoplaySpotifyPlaylistUri = normalizeOptionalPlaylistUri(input.autoplay_spotify_playlist_uri);
  if (autoplaySpotifyPlaylistUri !== undefined) {
    normalized.autoplaySpotifyPlaylistUri = autoplaySpotifyPlaylistUri;
  }

  const jingleEveryNSongs = normalizeOptionalPositiveInteger(input.jingle_every_n_songs, 'jingle_every_n_songs');
  if (jingleEveryNSongs !== undefined) {
    normalized.jingleEveryNSongs = jingleEveryNSongs;
  }

  const adBreakIntervalMinutes = normalizeOptionalPositiveInteger(input.ad_break_interval_minutes, 'ad_break_interval_minutes');
  if (adBreakIntervalMinutes !== undefined) {
    normalized.adBreakIntervalMinutes = adBreakIntervalMinutes;
  }

  return normalized as {
    overrideEnabled?: boolean;
    autoplaySpotifyPlaylistUri?: string | null;
    jingleEveryNSongs?: number | null;
    adBreakIntervalMinutes?: number | null;
  };
}

export async function listRadioProfiles(dbClient: DbClient) {
  const result = await dbClient.query(
    `SELECT rp.*,
            (SELECT COUNT(*) FROM radio_profile_assets rpa WHERE rpa.radio_profile_id = rp.id AND rpa.slot_type = 'jingle') AS jingle_count,
            (SELECT COUNT(*) FROM radio_profile_assets rpa WHERE rpa.radio_profile_id = rp.id AND rpa.slot_type = 'ad') AS ad_count
     FROM radio_profiles rp
     ORDER BY rp.name`
  );
  return result.rows;
}

export async function getRadioProfileById(dbClient: DbClient, radioProfileId: string) {
  const profileResult = await dbClient.query('SELECT * FROM radio_profiles WHERE id = $1', [radioProfileId]);
  if (profileResult.rows.length === 0) {
    throw new Error('Radio profile not found');
  }

  const assetsResult = await dbClient.query(
    `SELECT rpa.*, s.title, s.artist, s.source_type, s.visibility, s.asset_role, s.file_url
     FROM radio_profile_assets rpa
     JOIN songs s ON s.id = rpa.song_id
     WHERE rpa.radio_profile_id = $1
     ORDER BY rpa.slot_type, COALESCE(rpa.sort_order, 0), s.title`,
    [radioProfileId]
  );

  return {
    ...profileResult.rows[0],
    assets: assetsResult.rows,
  };
}

export async function createRadioProfile(dbClient: DbClient, payload: ReturnType<typeof normalizeRadioProfilePayload>) {
  const result = await dbClient.query(
    `INSERT INTO radio_profiles (
        name,
        autoplay_spotify_playlist_uri,
        jingle_every_n_songs,
        ad_break_interval_minutes,
        is_active
     ) VALUES ($1, $2, $3, $4, COALESCE($5, true))
     RETURNING *`,
    [
      payload.name,
      payload.autoplaySpotifyPlaylistUri ?? null,
      payload.jingleEveryNSongs ?? null,
      payload.adBreakIntervalMinutes ?? null,
      payload.isActive ?? true,
    ]
  );

  return result.rows[0];
}

export async function updateRadioProfile(dbClient: DbClient, params: {
  radioProfileId: string;
  payload: ReturnType<typeof normalizeRadioProfilePayload>;
}) {
  const existing = await dbClient.query('SELECT id FROM radio_profiles WHERE id = $1', [params.radioProfileId]);
  if (existing.rows.length === 0) {
    throw new Error('Radio profile not found');
  }

  const payload = params.payload;
  const result = await dbClient.query(
    `UPDATE radio_profiles
     SET name = CASE WHEN $2 THEN $3 ELSE name END,
         autoplay_spotify_playlist_uri = CASE WHEN $4 THEN $5 ELSE autoplay_spotify_playlist_uri END,
         jingle_every_n_songs = CASE WHEN $6 THEN $7 ELSE jingle_every_n_songs END,
         ad_break_interval_minutes = CASE WHEN $8 THEN $9 ELSE ad_break_interval_minutes END,
         is_active = CASE WHEN $10 THEN $11 ELSE is_active END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      params.radioProfileId,
      payload.name !== undefined,
      payload.name ?? null,
      payload.autoplaySpotifyPlaylistUri !== undefined,
      payload.autoplaySpotifyPlaylistUri ?? null,
      payload.jingleEveryNSongs !== undefined,
      payload.jingleEveryNSongs ?? null,
      payload.adBreakIntervalMinutes !== undefined,
      payload.adBreakIntervalMinutes ?? null,
      payload.isActive !== undefined,
      payload.isActive ?? null,
    ]
  );

  return result.rows[0];
}

export async function deleteRadioProfile(dbClient: DbClient, radioProfileId: string) {
  const result = await dbClient.query('DELETE FROM radio_profiles WHERE id = $1 RETURNING id', [radioProfileId]);
  if (result.rows.length === 0) {
    throw new Error('Radio profile not found');
  }
  return result.rows[0];
}

export async function attachRadioProfileAsset(dbClient: DbClient, params: {
  radioProfileId: string;
  songId: string;
  slotType: SlotType;
  sortOrder?: number | null;
}) {
  const profile = await dbClient.query('SELECT id FROM radio_profiles WHERE id = $1', [params.radioProfileId]);
  if (profile.rows.length === 0) {
    throw new Error('Radio profile not found');
  }

  const song = await dbClient.query(
    `SELECT id, source_type, visibility, asset_role, is_active, is_blocked
     FROM songs
     WHERE id = $1`,
    [params.songId]
  );

  if (song.rows.length === 0) {
    throw new Error('Song not found');
  }

  const songRow = song.rows[0];
  const isAttachable =
    songRow.source_type === 'local' &&
    songRow.visibility === 'hidden' &&
    songRow.asset_role === params.slotType &&
    songRow.is_blocked !== true &&
    songRow.is_active !== false;

  if (!isAttachable) {
    throw new Error('Only hidden local songs with matching asset_role can be attached');
  }

  const result = await dbClient.query(
    `INSERT INTO radio_profile_assets (radio_profile_id, song_id, slot_type, sort_order)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (radio_profile_id, song_id, slot_type)
     DO UPDATE SET sort_order = EXCLUDED.sort_order
     RETURNING *`,
    [params.radioProfileId, params.songId, params.slotType, params.sortOrder ?? null]
  );

  return result.rows[0];
}

export async function detachRadioProfileAsset(dbClient: DbClient, params: {
  radioProfileId: string;
  songId: string;
  slotType: SlotType;
}) {
  const result = await dbClient.query(
    `DELETE FROM radio_profile_assets
     WHERE radio_profile_id = $1 AND song_id = $2 AND slot_type = $3
     RETURNING *`,
    [params.radioProfileId, params.songId, params.slotType]
  );

  if (result.rows.length === 0) {
    throw new Error('Radio profile asset not found');
  }

  return result.rows[0];
}

export async function assignDeviceToRadioProfile(dbClient: DbClient, params: {
  deviceId: string;
  radioProfileId: string | null;
}) {
  const device = await dbClient.query('SELECT id FROM devices WHERE id = $1', [params.deviceId]);
  if (device.rows.length === 0) {
    throw new Error('Device not found');
  }

  if (params.radioProfileId) {
    const profile = await dbClient.query('SELECT id FROM radio_profiles WHERE id = $1', [params.radioProfileId]);
    if (profile.rows.length === 0) {
      throw new Error('Radio profile not found');
    }
  }

  const result = await dbClient.query(
    'UPDATE devices SET radio_profile_id = $2 WHERE id = $1 RETURNING id, radio_profile_id',
    [params.deviceId, params.radioProfileId]
  );

  return result.rows[0];
}

export async function updateDeviceRadioProfileOverride(dbClient: DbClient, params: {
  deviceId: string;
  overrideEnabled?: boolean;
  autoplaySpotifyPlaylistUri?: string | null;
  jingleEveryNSongs?: number | null;
  adBreakIntervalMinutes?: number | null;
}) {
  const device = await dbClient.query('SELECT id FROM devices WHERE id = $1', [params.deviceId]);
  if (device.rows.length === 0) {
    throw new Error('Device not found');
  }

  const result = await dbClient.query(
    `UPDATE devices
     SET override_enabled = CASE WHEN $2 THEN $3 ELSE override_enabled END,
         override_autoplay_spotify_playlist_uri = CASE WHEN $4 THEN $5 ELSE override_autoplay_spotify_playlist_uri END,
         override_jingle_every_n_songs = CASE WHEN $6 THEN $7 ELSE override_jingle_every_n_songs END,
         override_ad_break_interval_minutes = CASE WHEN $8 THEN $9 ELSE override_ad_break_interval_minutes END
     WHERE id = $1
     RETURNING id, override_enabled, override_autoplay_spotify_playlist_uri, override_jingle_every_n_songs, override_ad_break_interval_minutes`,
    [
      params.deviceId,
      params.overrideEnabled !== undefined,
      params.overrideEnabled ?? null,
      params.autoplaySpotifyPlaylistUri !== undefined,
      params.autoplaySpotifyPlaylistUri ?? null,
      params.jingleEveryNSongs !== undefined,
      params.jingleEveryNSongs ?? null,
      params.adBreakIntervalMinutes !== undefined,
      params.adBreakIntervalMinutes ?? null,
    ]
  );

  return result.rows[0];
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== ROLES.ADMIN) {
    return sendError(res, 'Unauthorized', 403);
  }
  next();
}

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const profiles = await listRadioProfiles(db);
    return sendSuccess(res, { profiles }, 'Radio profiles fetched');
  } catch (error) {
    console.error('List radio profiles error:', error);
    return sendError(res, 'Failed to fetch radio profiles', 500);
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const payload = normalizeRadioProfilePayload('create', req.body ?? {});
    const profile = await createRadioProfile(db, payload);
    return sendSuccess(res, { profile }, 'Radio profile created');
  } catch (error) {
    console.error('Create radio profile error:', error);
    return sendError(res, error instanceof Error ? error.message : 'Create failed', 400);
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const profile = await getRadioProfileById(db, req.params.id);
    return sendSuccess(res, { profile }, 'Radio profile fetched');
  } catch (error) {
    return sendError(res, error instanceof Error ? error.message : 'Fetch failed', error instanceof Error && error.message === 'Radio profile not found' ? 404 : 500);
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const payload = normalizeRadioProfilePayload('update', req.body ?? {});
    const profile = await updateRadioProfile(db, { radioProfileId: req.params.id, payload });
    return sendSuccess(res, { profile }, 'Radio profile updated');
  } catch (error) {
    return sendError(res, error instanceof Error ? error.message : 'Update failed', error instanceof Error && error.message === 'Radio profile not found' ? 404 : 400);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteRadioProfile(db, req.params.id);
    return sendSuccess(res, null, 'Radio profile deleted');
  } catch (error) {
    return sendError(res, error instanceof Error ? error.message : 'Delete failed', error instanceof Error && error.message === 'Radio profile not found' ? 404 : 400);
  }
});

router.post('/:id/assets', async (req: Request, res: Response) => {
  try {
    const { song_id, slot_type, sort_order } = req.body ?? {};
    if (!song_id || (slot_type !== 'jingle' && slot_type !== 'ad')) {
      return sendError(res, 'song_id and a valid slot_type are required', 400);
    }

    const asset = await attachRadioProfileAsset(db, {
      radioProfileId: req.params.id,
      songId: song_id,
      slotType: slot_type,
      sortOrder: sort_order ?? null,
    });
    return sendSuccess(res, { asset }, 'Radio profile asset attached');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Attach failed';
    const status = message === 'Radio profile not found' || message === 'Song not found' ? 404 : 400;
    return sendError(res, message, status);
  }
});

router.delete('/:id/assets/:songId/:slotType', async (req: Request, res: Response) => {
  try {
    const slotType = req.params.slotType;
    if (slotType !== 'jingle' && slotType !== 'ad') {
      return sendError(res, 'Invalid slot_type', 400);
    }

    await detachRadioProfileAsset(db, {
      radioProfileId: req.params.id,
      songId: req.params.songId,
      slotType,
    });
    return sendSuccess(res, null, 'Radio profile asset detached');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Detach failed';
    return sendError(res, message, message === 'Radio profile asset not found' ? 404 : 400);
  }
});

router.put('/devices/:deviceId/profile', async (req: Request, res: Response) => {
  try {
    const radioProfileId = req.body?.radio_profile_id ?? null;
    const device = await assignDeviceToRadioProfile(db, {
      deviceId: req.params.deviceId,
      radioProfileId,
    });
    return sendSuccess(res, { device }, 'Device profile assignment updated');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Assignment failed';
    const status = message === 'Device not found' || message === 'Radio profile not found' ? 404 : 400;
    return sendError(res, message, status);
  }
});

router.put('/devices/:deviceId/override', async (req: Request, res: Response) => {
  try {
    const payload = normalizeDeviceOverridePayload(req.body ?? {});
    const device = await updateDeviceRadioProfileOverride(db, {
      deviceId: req.params.deviceId,
      overrideEnabled: payload.overrideEnabled,
      autoplaySpotifyPlaylistUri: payload.autoplaySpotifyPlaylistUri,
      jingleEveryNSongs: payload.jingleEveryNSongs,
      adBreakIntervalMinutes: payload.adBreakIntervalMinutes,
    });
    return sendSuccess(res, { device }, 'Device override updated');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Override update failed';
    const status = message === 'Device not found' ? 404 : 400;
    return sendError(res, message, status);
  }
});

export default router;
