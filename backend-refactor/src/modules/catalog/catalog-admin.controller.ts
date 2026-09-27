import type { RequestHandler } from 'express';
import { ConflictError, NotFoundError, ServiceUnavailableError, ValidationError } from '../../core/errors/app-error.js';
import type { CatalogAdminRepository } from './ports/catalog-admin.repository.js';
import type { SpotifyCatalogProvider } from '../integrations/spotify/ports/spotify-catalog.port.js';
import { catalogAdminEmptySchema, catalogAdminIdSchema, playlistPreviewQuerySchema, songClassificationSchema } from './catalog-admin.schema.js';

export function createCatalogAdminController(repository: CatalogAdminRepository, spotify: SpotifyCatalogProvider) {
  const listSongs: RequestHandler = async (req, res, next) => {
    if (!catalogAdminEmptySchema.safeParse(req.query).success || !catalogAdminEmptySchema.safeParse(req.body ?? {}).success) return next(new ValidationError('Unexpected song-list input'));
    try { return res.json({ success: true, data: { songs: await repository.listSongs() }, message: 'Songs fetched' }); } catch (error) { return next(error); }
  };
  const classify: RequestHandler = async (req, res, next) => {
    const params = catalogAdminIdSchema.safeParse(req.params);
    const body = songClassificationSchema.safeParse(req.body);
    if (!params.success || !body.success || !catalogAdminEmptySchema.safeParse(req.query).success) return next(new ValidationError('Invalid song classification request'));
    try {
      const result = await repository.classifySong(params.data.id, body.data.visibility, body.data.asset_role);
      if (result.kind === 'not_found') return next(new NotFoundError('Song not found'));
      if (result.kind === 'not_local') return next(new ConflictError('Only local songs can be reclassified'));
      return res.json({ success: true, data: { song: { id: params.data.id, visibility: result.visibility, asset_role: result.assetRole } }, message: 'Song classification updated' });
    } catch (error) { return next(error); }
  };
  const remove: RequestHandler = async (req, res, next) => {
    const params = catalogAdminIdSchema.safeParse(req.params);
    if (!params.success || !catalogAdminEmptySchema.safeParse(req.query).success || !catalogAdminEmptySchema.safeParse(req.body ?? {}).success) return next(new ValidationError('Invalid song block request'));
    try { if (!await repository.blockSong(params.data.id)) return next(new NotFoundError('Song not found')); return res.json({ success: true, data: null, message: 'Song blocked' }); } catch (error) { return next(error); }
  };
  const playlistPreview: RequestHandler = async (req, res, next) => {
    const query = playlistPreviewQuerySchema.safeParse(req.query);
    if (!query.success || !catalogAdminEmptySchema.safeParse(req.body ?? {}).success) return next(new ValidationError('Invalid playlist preview query'));
    try { return res.json({ success: true, data: await spotify.getPlaylistPreview(query.data.url, 'TR'), message: 'Playlist details fetched' }); }
    catch (error) { return next(new ServiceUnavailableError('Spotify playlist could not be fetched', 'SPOTIFY_UNAVAILABLE', { cause: error })); }
  };
  return { listSongs, classify, remove, playlistPreview };
}
