import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createDocument } from 'zod-openapi';
import { registerRequestSchema, loginRequestSchema, guestRequestSchema, refreshRequestSchema } from '../src/modules/identity/identity.schema.js';
import { meQuerySchema, leaderboardQuerySchema, profilePayloadSchema } from '../src/modules/users/users.schema.js';
import { queueAddBodySchema, queueVoteBodySchema, kioskHeartbeatBodySchema, kioskNowPlayingBodySchema, kioskAutoplayBodySchema, connectBodySchema, disconnectBodySchema } from '../src/modules/jukebox/jukebox.schema.js';
import { createAdminDeviceSchema, updateAdminDeviceSchema, kioskRegistrationSchema, playbackTargetSchema, spotifyPlaybackTargetSchema } from '../src/modules/devices/devices.schema.js';
import { catalogQuerySchema } from '../src/modules/catalog/catalog.schema.js';
import { podcastListQuerySchema } from '../src/modules/podcasts/podcasts.schema.js';
import { createFeedSchema, syncFeedSchema } from '../src/modules/podcasts/podcast-feeds.schema.js';
import { historyParamsSchema } from '../src/modules/radio/radio.schema.js';
import { createProfileSchema, updateProfileSchema, attachAssetSchema, deviceProfileSchema, deviceOverrideSchema, profileIdSchema } from '../src/modules/radio/radio-profiles.schema.js';
import { blockArtistSchema, moderationSettingsSchema, blockedKeywordSchema, moderationTestSchema } from '../src/modules/catalog/moderation/moderation-admin.schema.js';
import { songClassificationSchema, playlistPreviewQuerySchema } from '../src/modules/catalog/catalog-admin.schema.js';

const ok = { description: 'Successful response' };
const accepted = { description: 'Job accepted' };
const idParams = z.object({ id: z.string().uuid() }).strict();
const deviceIdParams = z.object({ deviceId: z.string().uuid() }).strict();
const jobIdParams = z.object({ jobId: z.string().min(1).max(128) }).strict();
const callbackQuery = z.object({ code: z.string().optional(), error: z.string().optional(), state: z.string().min(1) }).strict();
const returnOriginQuery = z.object({ return_origin: z.string().url().optional() }).strict();
const spotifyDeviceIdQuery = z.object({ device_id: z.string().uuid() }).strict();
const playbackDevicesQuery = z.object({ kiosk_device_id: z.string().uuid().optional() }).strict();
const kioskDeviceBody = z.object({ device_id: z.string().uuid(), device_pwd: z.string().optional(), return_origin: z.string().optional() }).strict();
const kioskDeviceStatusBody = z.object({ device_id: z.string().uuid(), device_pwd: z.string().optional() }).strict();
const kioskRegistrationBody = z.object({ device_id: z.string().uuid(), device_pwd: z.string().optional(), spotify_device_id: z.string().nullable().optional(), player_name: z.string().nullable().optional(), is_active: z.boolean().optional() }).strict();
const lyricsQuery = z.object({ title: z.string().min(1), artist: z.string().min(1), duration: z.coerce.number().positive().optional() }).strict();
const auth = [{ bearerAuth: [] }];
const admin = [{ bearerAuth: [] }];
const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

const paths = {
  '/auth/register': { post: { summary: 'Register an account', requestBody: json(registerRequestSchema), responses: { '201': ok, '400': { description: 'Invalid registration' } } } },
  '/auth/login': { post: { summary: 'Create a user session', requestBody: json(loginRequestSchema), responses: { '200': ok, '401': { description: 'Invalid credentials' } } } },
  '/auth/guest': { post: { summary: 'Create a guest session', requestBody: json(guestRequestSchema), responses: { '201': ok } } },
  '/auth/refresh': { post: { summary: 'Rotate a refresh token', requestBody: json(refreshRequestSchema), responses: { '200': ok, '401': { description: 'Invalid refresh token' } } } },
  '/auth/logout': { post: { summary: 'Revoke a refresh token', requestBody: json(refreshRequestSchema), responses: { '200': ok } } },
  '/auth/me': { get: { summary: 'Read the authenticated user', security: auth, responses: { '200': ok } } },
  '/users/me': { get: { summary: 'Read user and optional profile', security: auth, requestParams: { query: meQuerySchema }, responses: { '200': ok } }, patch: { summary: 'Update profile fields', security: auth, requestBody: json(profilePayloadSchema), responses: { '200': ok } } },
  '/users/me/profile': { get: { summary: 'Read profile', security: auth, responses: { '200': ok } }, patch: { summary: 'Update profile', security: auth, requestBody: json(profilePayloadSchema), responses: { '200': ok } } },
  '/users/me/favorites': { patch: { summary: 'Update favorites', security: auth, requestBody: json(profilePayloadSchema), responses: { '200': ok } } },
  '/users/leaderboard': { get: { summary: 'Read the total leaderboard', requestParams: { query: leaderboardQuerySchema }, responses: { '200': ok } } },
  '/users/me/avatar': { post: { summary: 'Upload a profile avatar', security: auth, requestBody: { content: { 'multipart/form-data': { schema: z.object({ avatar: z.string() }).strict() } } }, responses: { '200': ok } } },
  '/auth/upload-avatar': { post: { summary: 'Legacy avatar upload alias', security: auth, requestBody: { content: { 'multipart/form-data': { schema: z.object({ avatar: z.string() }).strict() } } }, responses: { '200': ok } } },
  '/profile/me': { get: { summary: 'Legacy profile read alias', security: auth, responses: { '200': ok } }, patch: { summary: 'Legacy profile update alias', security: auth, requestBody: json(profilePayloadSchema), responses: { '200': ok } } },
  '/profile/favorites': { patch: { summary: 'Legacy favorites update alias', security: auth, requestBody: json(profilePayloadSchema), responses: { '200': ok } } },
  '/jukebox/connect': { post: { summary: 'Connect a user session to a device', requestBody: json(connectBodySchema), responses: { '200': ok } } },
  '/jukebox/queue': { post: { summary: 'Add a song to a device queue', requestBody: json(queueAddBodySchema), responses: { '201': ok } } },
  '/jukebox/vote': { post: { summary: 'Vote on a queued song', security: auth, requestBody: json(queueVoteBodySchema), responses: { '200': ok } } },
  '/jukebox/queue/{deviceId}': { get: { summary: 'Read a device queue', requestParams: { path: deviceIdParams }, responses: { '200': ok } } },
  '/jukebox/disconnect': { post: { summary: 'Disconnect a user session', requestBody: json(disconnectBodySchema), responses: { '200': ok } } },
  '/jukebox/kiosk/heartbeat': { post: { summary: 'Update kiosk heartbeat', requestBody: json(kioskHeartbeatBodySchema), responses: { '200': ok } } },
  '/jukebox/kiosk/now-playing': { post: { summary: 'Update the active track', requestBody: json(kioskNowPlayingBodySchema), responses: { '200': ok } } },
  '/jukebox/autoplay/trigger': { post: { summary: 'Queue autoplay for a kiosk', requestBody: json(kioskAutoplayBodySchema), responses: { '200': ok, '202': accepted } } },
  '/admin/jukebox/skip': { post: { summary: 'Skip the current track', security: admin, responses: { '200': ok } } },
  '/jukebox/devices': { get: { summary: 'List devices', responses: { '200': ok } } },
  '/jukebox/kiosk/register': { post: { summary: 'Register a kiosk', requestBody: json(kioskRegistrationSchema), responses: { '200': ok } } },
  '/admin/jukebox/devices': { get: { summary: 'Admin device list', security: admin, responses: { '200': ok } }, post: { summary: 'Create a device', security: admin, requestBody: json(createAdminDeviceSchema), responses: { '201': ok } } },
  '/admin/jukebox/devices/{id}': { patch: { summary: 'Update a device', security: admin, requestParams: { path: idParams }, requestBody: json(updateAdminDeviceSchema), responses: { '200': ok } } },
  '/admin/jukebox/devices/{id}/provision': { post: { summary: 'Issue a one-time kiosk provisioning code', security: admin, requestParams: { path: idParams }, responses: { '200': ok } } },
  '/admin/jukebox/devices/{id}/logout-all': { post: { summary: 'Revoke all kiosk sessions', security: admin, requestParams: { path: idParams }, responses: { '200': ok } } },
  '/admin/jukebox/devices/{id}/spotify-playback-target': { put: { summary: 'Set a kiosk Spotify target (legacy contract)', security: admin, requestParams: { path: idParams }, requestBody: json(spotifyPlaybackTargetSchema), responses: { '200': ok } } },
  '/admin/jukebox/devices/{id}/playback-target': { patch: { summary: 'Set a provider-neutral playback target', security: admin, requestParams: { path: idParams }, requestBody: json(playbackTargetSchema), responses: { '200': ok } } },
  '/jukebox/songs': { get: { summary: 'Search catalog songs', requestParams: { query: catalogQuerySchema }, responses: { '200': ok } } },
  '/admin/jukebox/songs': { get: { summary: 'List managed songs', security: admin, responses: { '200': ok } } },
  '/admin/jukebox/songs/{id}/classification': { patch: { summary: 'Update song visibility and role', security: admin, requestParams: { path: idParams }, requestBody: json(songClassificationSchema), responses: { '200': ok } } },
  '/admin/jukebox/songs/{id}': { delete: { summary: 'Soft-delete a managed song', security: admin, requestParams: { path: idParams }, responses: { '200': ok } } },
  '/admin/jukebox/playlist-preview': { get: { summary: 'Preview Spotify playlist tracks', security: admin, requestParams: { query: playlistPreviewQuerySchema }, responses: { '200': ok } } },
  '/admin/jukebox/upload-song': { post: { summary: 'Upload an audio file for inspection', security: admin, requestBody: { content: { 'multipart/form-data': { schema: z.object({ song: z.string() }).strict() } } }, responses: { '201': ok } } },
  '/admin/jukebox/scan-folder': { post: { summary: 'Queue a managed storage scan', security: admin, responses: { '202': accepted } } },
  '/admin/jukebox/process-song': { post: { summary: 'Queue audio inspection and metadata extraction', security: admin, requestBody: json(z.object({ song_id: z.string().uuid() }).strict()), responses: { '202': accepted } } },
  '/admin/jukebox/sync-metadata': { post: { summary: 'Queue Spotify metadata synchronization', security: admin, responses: { '202': accepted } } },
  '/admin/jukebox/blocked': { get: { summary: 'List blocked catalog items', security: admin, responses: { '200': ok } } },
  '/admin/jukebox/moderation/settings': { get: { summary: 'Read moderation settings', security: admin, responses: { '200': ok } }, put: { summary: 'Update moderation settings', security: admin, requestBody: json(moderationSettingsSchema), responses: { '200': ok } } },
  '/admin/jukebox/moderation/keywords': { get: { summary: 'List moderation keywords', security: admin, responses: { '200': ok } }, post: { summary: 'Create a moderation keyword', security: admin, requestBody: json(blockedKeywordSchema), responses: { '201': ok } } },
  '/admin/jukebox/moderation/keywords/{id}': { delete: { summary: 'Delete a moderation keyword', security: admin, requestParams: { path: idParams }, responses: { '200': ok } } },
  '/admin/jukebox/moderation/test': { post: { summary: 'Test moderation rules', security: admin, requestBody: json(moderationTestSchema), responses: { '200': ok } } },
  '/admin/jukebox/artists/block': { post: { summary: 'Block a catalog artist', security: admin, requestBody: json(blockArtistSchema), responses: { '201': ok } } },
  '/admin/jukebox/artists/{id}/block': { delete: { summary: 'Unblock a catalog artist', security: admin, requestParams: { path: idParams }, responses: { '200': ok } } },
  '/admin/jukebox/songs/{id}/block': { post: { summary: 'Block a catalog song', security: admin, requestParams: { path: idParams }, responses: { '200': ok } }, delete: { summary: 'Unblock a catalog song', security: admin, requestParams: { path: idParams }, responses: { '200': ok } } },
  '/radio/status': { get: { summary: 'Read radio status', responses: { '200': ok } } },
  '/radio/schedule': { get: { summary: 'Read radio schedule', responses: { '200': ok } } },
  '/radio/history/{channelId}': { get: { summary: 'Read channel history', requestParams: { path: historyParamsSchema }, responses: { '200': ok } } },
  '/admin/radio-profiles': { get: { summary: 'List radio profiles', security: admin, responses: { '200': ok } }, post: { summary: 'Create a radio profile', security: admin, requestBody: json(createProfileSchema), responses: { '201': ok } } },
  '/admin/radio-profiles/{id}': { get: { summary: 'Read a radio profile', security: admin, requestParams: { path: profileIdSchema }, responses: { '200': ok } }, put: { summary: 'Update a radio profile', security: admin, requestParams: { path: profileIdSchema }, requestBody: json(updateProfileSchema), responses: { '200': ok } }, delete: { summary: 'Delete a radio profile', security: admin, requestParams: { path: profileIdSchema }, responses: { '200': ok } } },
  '/admin/radio-profiles/{id}/assets': { post: { summary: 'Attach a jingle or ad asset', security: admin, requestParams: { path: profileIdSchema }, requestBody: json(attachAssetSchema), responses: { '200': ok } } },
  '/admin/radio-profiles/{id}/assets/{songId}/{slotType}': { delete: { summary: 'Detach a jingle or ad asset', security: admin, requestParams: { path: z.object({ id: z.string().uuid(), songId: z.string().uuid(), slotType: z.enum(['jingle', 'ad']) }).strict() }, responses: { '200': ok } } },
  '/admin/radio-profiles/devices/{deviceId}/profile': { put: { summary: 'Assign a radio profile to a device', security: admin, requestParams: { path: z.object({ deviceId: z.string().uuid() }).strict() }, requestBody: json(deviceProfileSchema), responses: { '200': ok } } },
  '/admin/radio-profiles/devices/{deviceId}/override': { put: { summary: 'Set radio playback overrides', security: admin, requestParams: { path: z.object({ deviceId: z.string().uuid() }).strict() }, requestBody: json(deviceOverrideSchema), responses: { '200': ok } } },
  '/spotify/callback': { get: { summary: 'Complete administrator Spotify authorization', requestParams: { query: callbackQuery }, responses: { '200': { description: 'Authorization result page' } } } },
  '/spotify/device-auth/callback': { get: { summary: 'Complete kiosk Spotify authorization', requestParams: { query: callbackQuery }, responses: { '200': { description: 'Authorization result page' } } } },
  '/admin/spotify/auth': { get: { summary: 'Begin Spotify authorization', security: admin, requestParams: { query: returnOriginQuery }, responses: { '303': { description: 'Redirect to Spotify' } } } },
  '/admin/spotify/status': { get: { summary: 'Read Spotify authorization status', security: admin, responses: { '200': ok } } },
  '/admin/spotify/app-config': { get: { summary: 'Read masked Spotify app configuration', security: admin, responses: { '200': ok } }, put: { summary: 'Update Spotify app configuration', security: admin, requestBody: json(z.object({ client_id: z.string().min(1), client_secret: z.string().optional() }).strict()), responses: { '200': ok } } },
  '/admin/spotify/device-auth/start': { post: { summary: 'Begin Spotify device authorization', security: admin, requestBody: json(z.object({ device_id: z.string().uuid(), return_origin: z.string().optional() }).strict()), responses: { '200': ok } } },
  '/admin/spotify/device-auth/status': { get: { summary: 'Read device Spotify authorization status', security: admin, requestParams: { query: spotifyDeviceIdQuery }, responses: { '200': ok } } },
  '/admin/spotify/device-auth/{deviceId}': { delete: { summary: 'Revoke kiosk Spotify authorization', security: admin, requestParams: { path: z.object({ deviceId: z.string().uuid() }).strict() }, responses: { '200': ok } } },
  '/admin/spotify/playback-devices': { get: { summary: 'List available Spotify Connect devices', security: admin, requestParams: { query: playbackDevicesQuery }, responses: { '200': ok } } },
  '/jukebox/kiosk/spotify-token': { post: { summary: 'Issue a scoped kiosk Spotify token', requestBody: json(kioskDeviceStatusBody), responses: { '200': ok } } },
  '/jukebox/kiosk/spotify-device-auth/status': { post: { summary: 'Read kiosk Spotify authorization status', requestBody: json(kioskDeviceStatusBody), responses: { '200': ok } } },
  '/jukebox/kiosk/spotify-device-auth/start': { post: { summary: 'Start kiosk Spotify authorization', requestBody: json(kioskDeviceBody), responses: { '200': ok } } },
  '/jukebox/kiosk/spotify-device': { post: { summary: 'Register kiosk playback device', requestBody: json(kioskRegistrationBody), responses: { '200': ok } } },
  '/jukebox/kiosk/playback-state/{deviceId}': { get: { summary: 'Read playback state for an authorized device', requestParams: { path: deviceIdParams }, responses: { '200': ok } } },
  '/jukebox/lyrics': { get: { summary: 'Fetch song lyrics', requestParams: { query: lyricsQuery }, responses: { '200': ok } } },
  '/podcasts': { get: { summary: 'List podcasts', requestParams: { query: podcastListQuerySchema }, responses: { '200': ok } } },
  '/podcast-feeds': { get: { summary: 'Admin list of podcast feeds', security: admin, responses: { '200': ok } }, post: { summary: 'Create a podcast feed', security: admin, requestBody: json(createFeedSchema), responses: { '201': ok } } },
  '/podcast-feeds/sync': { post: { summary: 'Queue podcast feed synchronization', security: admin, requestBody: json(syncFeedSchema), responses: { '202': accepted } } },
  '/podcast-feeds/{id}': { delete: { summary: 'Delete a podcast feed', security: admin, requestParams: { path: idParams }, responses: { '200': ok } } },
  '/jobs/{jobId}': { get: { summary: 'Read an owned background job', security: auth, requestParams: { path: jobIdParams }, responses: { '200': ok, '403': { description: 'Job belongs to another user' } } } },
} as const;

const document = createDocument({
  openapi: '3.1.0',
  info: { title: 'RadioTEDU Jukebox API', version: '1.0.0', description: 'OpenAPI generated from the refactor request Zod schemas. Game routes are excluded.' },
  servers: [{ url: '/api/v1' }],
  paths,
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
});

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../docs/openapi.json');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`Generated ${path.relative(process.cwd(), output)}`);
