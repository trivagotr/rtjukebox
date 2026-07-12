package com.radiotedumobile.car

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.MediaBrowserServiceCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.radiotedumobile.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * Custom Android Auto / Automotive media browser for RadioTEDU.
 *
 * RNTP v4 ships no MediaBrowserService, so this provides the browse tree the car
 * shows (categories → channels / podcasts / etc.) and a MediaSession the car
 * controls.
 *
 * Audio is played NATIVELY and HEADLESSLY here via media3 ExoPlayer, with NO
 * dependency on the React Native JS runtime. This fixes the cold-start "stuck on
 * loading" bug: previously the car's transport was relayed to JS over CarBridge,
 * but the JS listener is only registered once the app UI has been opened, so a
 * cold start from the car (app not running) never started playback. Every
 * PLAYABLE catalog item now carries a stream `url` (embedded by carBridge.ts),
 * so this service can play it directly with zero JS. The JS bridge only supplies
 * the browse catalog (SharedPreferences); the native ExoPlayer is the single
 * source of truth for the car's PlaybackState + metadata.
 */
class RadioTeduCarService : MediaBrowserServiceCompat() {

    companion object {
        const val PREFS = "radiotedu_car"
        const val KEY_CATALOG = "catalog"
        private const val ROOT_ID = "__ROOT__"

        // android.media.browse content style hints (grid for categories, list for items)
        private const val CONTENT_STYLE_SUPPORTED = "android.media.browse.CONTENT_STYLE_SUPPORTED"
        private const val CONTENT_STYLE_BROWSABLE_HINT = "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT"
        private const val CONTENT_STYLE_PLAYABLE_HINT = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
        private const val CONTENT_STYLE_GRID = 2
        private const val CONTENT_STYLE_LIST = 1

        private const val CHANNEL_ID = "radiotedu_car"
        private const val FGS_ID = 7
        private const val TAG = "RadioTeduCarService"

        // Network timeouts for the car player's HTTP data source. A live radio
        // stream that opens the socket but never delivers data would otherwise
        // sit in STATE_BUFFERING forever (infinite spinner); a finite read
        // timeout makes ExoPlayer surface onPlayerError instead.
        private const val HTTP_CONNECT_TIMEOUT_MS = 15_000
        private const val HTTP_READ_TIMEOUT_MS = 15_000

        // Belt-and-braces watchdog: if the player is still BUFFERING this long
        // after a play request (e.g. a half-open stream the data-source timeout
        // didn't catch), force STATE_ERROR so the car never spins forever.
        private const val BUFFERING_WATCHDOG_MS = 20_000L

        // Static fallback so the car is never empty before the app's first
        // launch (the JS catalog lives in SharedPreferences, which is empty
        // until pushCarCatalog() has run at least once). Mirrors the
        // 'radiotedu-main' channel in mobile/src/data/radioChannels.ts.
        private const val FALLBACK_RADIO_ID = "radiotedu-main"
        private const val FALLBACK_RADIO_URL = "https://stream.radiotedu.com/radio"
        private const val FALLBACK_RADIO_TITLE = "RadioTEDU"
        private const val FALLBACK_RADIO_SUBTITLE = "Ana Kanal"
        private const val FALLBACK_RADIO_ARTWORK =
            "https://radiotedu.com/wp-content/uploads/2025/07/logo-02-scaled.png"
    }

    private lateinit var session: MediaSessionCompat

    /**
     * Native headless player for the car. Created lazily on the service main
     * thread (see player()). All access MUST be on the main thread — the
     * MediaSession callbacks and Player.Listener callbacks already run there.
     */
    private var player: ExoPlayer? = null

    /** Tracks whether we currently hold the mediaPlayback foreground service. */
    private var isForeground = false

    /** Main-thread handler used to post the buffering watchdog. */
    private val mainHandler = Handler(Looper.getMainLooper())

    /** Pending buffering watchdog; cancelled once playback resolves or stops. */
    private var bufferingWatchdog: Runnable? = null

    private val playbackActions =
        PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_STOP or
            PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
            PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH

    override fun onCreate() {
        super.onCreate()

        // Set up the notification channel up front, but do NOT start a
        // foreground service here. On Android 14 (targetSdk 34) a
        // mediaPlayback FGS started from the background with no active
        // playback throws ForegroundServiceStartNotAllowedException, which
        // previously left the process unprotected ("car stuck on loading").
        // The FGS is started only once playback is actually active — see
        // updateForeground(), now driven by the native ExoPlayer's
        // Player.Listener callbacks.
        createNotificationChannel()

        session = MediaSessionCompat(this, "RadioTeduCarSession").apply {
            setCallback(SessionCallback())
            setPlaybackState(buildState(PlaybackStateCompat.STATE_PAUSED))
            isActive = true
        }
        sessionToken = session.sessionToken

        // JS pushed a new browse catalog -> tell the car to reload the tree.
        // This is the ONLY remaining dependency on JS: it just refreshes the
        // browse tree. Playback no longer goes through JS at all.
        CarBridge.onCatalogChanged = { notifyChildrenChanged(ROOT_ID) }

        // The native ExoPlayer is now the single source of truth for the car's
        // PlaybackState + metadata. JS no longer drives playback state, so keep
        // onNowPlaying as a harmless no-op: if some older JS still calls
        // updateNowPlaying, we must NOT let it clobber the real native state.
        CarBridge.onNowPlaying = { _, _, _, _ -> /* no-op: native player owns state */ }
    }

    override fun onDestroy() {
        CarBridge.onCatalogChanged = null
        CarBridge.onNowPlaying = null
        cancelBufferingWatchdog()
        player?.let {
            it.removeListener(playerListener)
            it.release()
        }
        player = null
        @Suppress("DEPRECATION")
        stopForeground(true)
        isForeground = false
        session.release()
        super.onDestroy()
    }

    // --- Native ExoPlayer (headless car playback) ---

    /**
     * Lazily create the ExoPlayer on the service main thread. Audio attributes
     * mark this as MEDIA/MUSIC with handleAudioFocus = true, so the system
     * ducks/pauses other audio (including the in-app RNTP) while the car plays.
     */
    private fun player(): ExoPlayer {
        val existing = player
        if (existing != null) return existing
        // Give the HTTP data source a finite connect/read timeout so a stream
        // that connects but stalls surfaces as onPlayerError (-> STATE_ERROR)
        // instead of buffering forever. allowCrossProtocolRedirects handles the
        // common http<->https redirects radio CDNs use.
        val httpFactory = DefaultHttpDataSource.Factory()
            .setConnectTimeoutMs(HTTP_CONNECT_TIMEOUT_MS)
            .setReadTimeoutMs(HTTP_READ_TIMEOUT_MS)
            .setAllowCrossProtocolRedirects(true)
        val created = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .build()
            .apply {
                val attrs = AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build()
                setAudioAttributes(attrs, /* handleAudioFocus = */ true)
                addListener(playerListener)
            }
        player = created
        return created
    }

    /**
     * Maps ExoPlayer state to the car MediaSession PlaybackState and drives the
     * mediaPlayback foreground service. This is what guarantees the car shows
     * buffering / playing / error instead of an infinite spinner.
     */
    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            // Playback actually started -> we resolved to PLAYING, so the
            // buffering watchdog is no longer needed.
            if (isPlaying) cancelBufferingWatchdog()
            syncPlaybackState()
            updateForeground(isPlaying)
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            // Any terminal/ready state means buffering is over; stop the
            // watchdog so it can't later stomp a good state with an error.
            if (playbackState == Player.STATE_READY ||
                playbackState == Player.STATE_ENDED ||
                playbackState == Player.STATE_IDLE
            ) {
                cancelBufferingWatchdog()
            }
            syncPlaybackState()
            // Keep the FGS in step with playback ending.
            updateForeground(player?.isPlaying == true)
        }

        override fun onPlayerError(error: PlaybackException) {
            cancelBufferingWatchdog()
            // Surface a real error so the car shows an error state instead of
            // an infinite loading spinner.
            setErrorState(error.localizedMessage ?: "Playback error")
            updateForeground(false)
        }
    }

    /** Set the car session into STATE_ERROR with a user-facing message. */
    private fun setErrorState(message: String) {
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(playbackActions)
                .setState(
                    PlaybackStateCompat.STATE_ERROR,
                    PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
                    1f,
                )
                .setErrorMessage(
                    PlaybackStateCompat.ERROR_CODE_UNKNOWN_ERROR,
                    message,
                )
                .build(),
        )
    }

    private fun cancelBufferingWatchdog() {
        bufferingWatchdog?.let { mainHandler.removeCallbacks(it) }
        bufferingWatchdog = null
    }

    /**
     * Arm a watchdog that flips the session to STATE_ERROR if the player is
     * still buffering after BUFFERING_WATCHDOG_MS. Guarantees the car's
     * "loading" state always resolves to either PLAYING or ERROR.
     */
    private fun armBufferingWatchdog() {
        cancelBufferingWatchdog()
        val runnable = Runnable {
            bufferingWatchdog = null
            val p = player
            if (p != null && p.playbackState == Player.STATE_BUFFERING) {
                p.stop()
                setErrorState("Yayına bağlanılamadı")
                updateForeground(false)
            }
        }
        bufferingWatchdog = runnable
        mainHandler.postDelayed(runnable, BUFFERING_WATCHDOG_MS)
    }

    /** Reflect the current ExoPlayer state into the car MediaSession. */
    private fun syncPlaybackState() {
        val p = player ?: return
        val state = when {
            p.playbackState == Player.STATE_BUFFERING -> PlaybackStateCompat.STATE_BUFFERING
            p.isPlaying -> PlaybackStateCompat.STATE_PLAYING
            p.playbackState == Player.STATE_ENDED -> PlaybackStateCompat.STATE_STOPPED
            // An IDLE player (after stop()/clear, or before the first prepare)
            // is stopped, not paused. Mapping it explicitly avoids reporting a
            // misleading PAUSED for a player that has nothing loaded.
            p.playbackState == Player.STATE_IDLE -> PlaybackStateCompat.STATE_STOPPED
            p.playbackState == Player.STATE_READY && !p.isPlaying ->
                PlaybackStateCompat.STATE_PAUSED
            else -> PlaybackStateCompat.STATE_PAUSED
        }
        session.setPlaybackState(buildState(state))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "RadioTEDU",
                NotificationManager.IMPORTANCE_LOW,
            )
            getSystemService(NotificationManager::class.java)
                ?.createNotificationChannel(channel)
        }
    }

    /**
     * Start/stop the mediaPlayback foreground service to match actual playback.
     *
     * Starting the FGS only while playback is active keeps it within the
     * Android 14 background-start exemption for media playback, and stopping it
     * when playback pauses/stops avoids holding a foreground service (and its
     * ongoing notification) when nothing is playing.
     */
    private fun updateForeground(isPlaying: Boolean) {
        if (isPlaying) {
            if (isForeground) return
            try {
                val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle("RadioTEDU")
                    .setContentText("Araçta çalıyor")
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setOngoing(true)
                    .build()
                startForeground(FGS_ID, notification)
                isForeground = true
            } catch (e: Exception) {
                // Foreground start can still be restricted in edge cases; log it
                // so the failure is visible instead of silently swallowed.
                Log.e(TAG, "Failed to start mediaPlayback foreground service", e)
            }
        } else {
            if (!isForeground) return
            @Suppress("DEPRECATION")
            stopForeground(true)
            isForeground = false
        }
    }

    private fun buildState(state: Int): PlaybackStateCompat =
        PlaybackStateCompat.Builder()
            .setActions(playbackActions)
            .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build()

    // --- Browsing ---

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?,
    ): BrowserRoot {
        val extras = Bundle().apply {
            putBoolean(CONTENT_STYLE_SUPPORTED, true)
            putInt(CONTENT_STYLE_BROWSABLE_HINT, CONTENT_STYLE_GRID)
            putInt(CONTENT_STYLE_PLAYABLE_HINT, CONTENT_STYLE_LIST)
        }
        return BrowserRoot(ROOT_ID, extras)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<MutableList<MediaBrowserCompat.MediaItem>>,
    ) {
        val items = mutableListOf<MediaBrowserCompat.MediaItem>()
        val catalog = readCatalog()
        val categories = catalog.optJSONArray("categories")

        if (categories != null) {
            if (parentId == ROOT_ID) {
                // The four destinations (grid).
                for (i in 0 until categories.length()) {
                    val cat = categories.getJSONObject(i)
                    items.add(
                        browsable(
                            cat.getString("id"),
                            cat.getString("title"),
                            cat.optString("subtitle", ""),
                            cat.optString("artwork", ""),
                        ),
                    )
                }
                // Recently Played row (playable, shown after the destinations).
                val recent = catalog.optJSONArray("recent")
                if (recent != null) {
                    for (j in 0 until recent.length()) {
                        items.add(itemFor(recent.getJSONObject(j)))
                    }
                }
            } else {
                for (i in 0 until categories.length()) {
                    val cat = categories.getJSONObject(i)
                    if (cat.getString("id") == parentId) {
                        val children = cat.optJSONArray("items")
                        if (children != null) {
                            for (j in 0 until children.length()) {
                                val it = children.getJSONObject(j)
                                items.add(itemFor(it))
                            }
                        }
                        break
                    }
                }
            }
        } else {
            // Empty catalog (app never opened): show a minimal Live Radio tree
            // built from the static fallback so the car is never blank and the
            // main RadioTEDU stream is tappable on a true cold start.
            val fallback = fallbackRadioItem()
            if (parentId == ROOT_ID) {
                items.add(browsable("cat_radio", FALLBACK_RADIO_TITLE, "", ""))
            } else if (parentId == "cat_radio") {
                items.add(
                    playable(
                        fallback.id,
                        fallback.title,
                        fallback.artist,
                        fallback.artwork,
                    ),
                )
            }
        }
        result.sendResult(items)
    }

    private fun itemFor(json: JSONObject): MediaBrowserCompat.MediaItem {
        val playable = json.optBoolean("playable", true)
        return if (playable) {
            playable(
                json.getString("id"),
                json.getString("title"),
                json.optString("subtitle", ""),
                json.optString("artwork", ""),
            )
        } else {
            browsable(
                json.getString("id"),
                json.getString("title"),
                json.optString("subtitle", ""),
                json.optString("artwork", ""),
            )
        }
    }

    private fun browsable(
        id: String,
        title: String,
        subtitle: String,
        artwork: String,
    ): MediaBrowserCompat.MediaItem =
        MediaBrowserCompat.MediaItem(
            description(id, title, subtitle, artwork),
            MediaBrowserCompat.MediaItem.FLAG_BROWSABLE,
        )

    private fun playable(
        id: String,
        title: String,
        subtitle: String,
        artwork: String,
    ): MediaBrowserCompat.MediaItem =
        MediaBrowserCompat.MediaItem(
            description(id, title, subtitle, artwork),
            MediaBrowserCompat.MediaItem.FLAG_PLAYABLE,
        )

    private fun description(
        id: String,
        title: String,
        subtitle: String,
        artwork: String,
    ): MediaDescriptionCompat {
        val b = MediaDescriptionCompat.Builder()
            .setMediaId(id)
            .setTitle(title)
        if (subtitle.isNotEmpty()) b.setSubtitle(subtitle)
        if (artwork.isNotEmpty()) b.setIconUri(Uri.parse(artwork))
        return b.build()
    }

    private fun readCatalog(): JSONObject {
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_CATALOG, null) ?: return JSONObject()
        return try {
            JSONObject(raw)
        } catch (e: Exception) {
            JSONObject()
        }
    }

    // --- Car transport -> native ExoPlayer (headless, no JS) ---

    // Each callback drives the native ExoPlayer directly. There is NO MORE
    // CarBridge.command relay to JS for transport/playback, so playback works on
    // a cold start from the car even when the RN JS runtime never registered its
    // listener. PlaybackState is set from the player's real state (see
    // playerListener / syncPlaybackState), never optimistically here.
    private inner class SessionCallback : MediaSessionCompat.Callback() {
        override fun onPlay() {
            val p = player()
            // After a stop()/error the player sits in STATE_IDLE; play() alone
            // would just set playWhenReady and stay silent. Re-prepare the
            // existing item so "play" actually resumes instead of no-opping.
            if (p.playbackState == Player.STATE_IDLE && p.currentMediaItem != null) {
                session.setPlaybackState(buildState(PlaybackStateCompat.STATE_BUFFERING))
                armBufferingWatchdog()
                p.prepare()
            }
            p.play()
        }

        override fun onPause() {
            player?.pause()
        }

        override fun onStop() {
            cancelBufferingWatchdog()
            player?.stop()
            @Suppress("DEPRECATION")
            stopForeground(true)
            isForeground = false
            session.setPlaybackState(buildState(PlaybackStateCompat.STATE_STOPPED))
        }

        override fun onSkipToNext() {
            cycleRadio(1)
        }

        override fun onSkipToPrevious() {
            cycleRadio(-1)
        }

        override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
            if (mediaId != null) {
                playMediaId(mediaId)
            }
        }

        override fun onPlayFromSearch(query: String?, extras: Bundle?) {
            playFromSearch(query)
        }
    }

    /**
     * A playable catalog item: its id, stream url, and now-playing metadata.
     * Looked up natively from the catalog JSON so playback needs no JS.
     */
    private data class CatalogItem(
        val id: String,
        val url: String,
        val title: String,
        val artist: String,
        val artwork: String,
    )

    private fun itemFromJson(json: JSONObject): CatalogItem =
        CatalogItem(
            id = json.optString("id", ""),
            url = json.optString("url", ""),
            title = json.optString("title", "RadioTEDU"),
            artist = json.optString("subtitle", ""),
            artwork = json.optString("artwork", ""),
        )

    /** Every playable item across all categories + the recent row, in order. */
    private fun allPlayableItems(): List<CatalogItem> {
        val out = mutableListOf<CatalogItem>()
        val catalog = readCatalog()
        val categories = catalog.optJSONArray("categories")
        if (categories != null) {
            for (i in 0 until categories.length()) {
                val items = categories.getJSONObject(i).optJSONArray("items") ?: continue
                addPlayable(items, out)
            }
        }
        addPlayable(catalog.optJSONArray("recent"), out)
        return out
    }

    private fun addPlayable(arr: JSONArray?, out: MutableList<CatalogItem>) {
        if (arr == null) return
        for (j in 0 until arr.length()) {
            val obj = arr.getJSONObject(j)
            if (!obj.optBoolean("playable", true)) continue
            val item = itemFromJson(obj)
            if (item.url.isNotEmpty()) out.add(item)
        }
    }

    /**
     * Static fallback station. Used when the JS catalog is empty (the app has
     * never been opened, so SharedPreferences has no catalog yet) so the car can
     * still browse and voice-play the main RadioTEDU stream on a true cold start.
     */
    private fun fallbackRadioItem(): CatalogItem =
        CatalogItem(
            id = FALLBACK_RADIO_ID,
            url = FALLBACK_RADIO_URL,
            title = FALLBACK_RADIO_TITLE,
            artist = FALLBACK_RADIO_SUBTITLE,
            artwork = FALLBACK_RADIO_ARTWORK,
        )

    /** The RADIO category's playable items (live stations) in catalog order. */
    private fun radioItems(): List<CatalogItem> {
        val out = mutableListOf<CatalogItem>()
        val categories = readCatalog().optJSONArray("categories")
        if (categories != null) {
            for (i in 0 until categories.length()) {
                val cat = categories.getJSONObject(i)
                if (cat.optString("id") == "cat_radio") {
                    addPlayable(cat.optJSONArray("items"), out)
                    break
                }
            }
        }
        // Never return empty: voice search / skip must always have a station.
        if (out.isEmpty()) out.add(fallbackRadioItem())
        return out
    }

    /** Look up a playable item by id across categories + recent. */
    private fun findItem(mediaId: String): CatalogItem? =
        allPlayableItems().firstOrNull { it.id == mediaId }
            ?: run {
                // Non-playable rows (e.g. jukebox:none) are excluded above; also
                // search raw items so a stale id still resolves if it has a url.
                val catalog = readCatalog()
                val categories = catalog.optJSONArray("categories")
                if (categories != null) {
                    for (i in 0 until categories.length()) {
                        val items =
                            categories.getJSONObject(i).optJSONArray("items") ?: continue
                        for (j in 0 until items.length()) {
                            val obj = items.getJSONObject(j)
                            if (obj.optString("id") == mediaId) return itemFromJson(obj)
                        }
                    }
                }
                val recent = catalog.optJSONArray("recent")
                if (recent != null) {
                    for (j in 0 until recent.length()) {
                        val obj = recent.getJSONObject(j)
                        if (obj.optString("id") == mediaId) return itemFromJson(obj)
                    }
                }
                // Empty-catalog cold start: resolve the fallback station id so a
                // tap from the synthesized browse tree still plays.
                if (mediaId == FALLBACK_RADIO_ID) fallbackRadioItem() else null
            }

    /**
     * Play a catalog item by id, fully natively. Sets STATE_BUFFERING + metadata
     * IMMEDIATELY so the car shows buffering (not a dead spinner) while the
     * stream connects, then prepares + plays on ExoPlayer. STATE_ERROR if the
     * item is missing or has no url.
     */
    private fun playMediaId(mediaId: String) {
        val item = findItem(mediaId)
        if (item == null || item.url.isEmpty()) {
            setErrorState("Bu içerik çalınamıyor")
            return
        }
        playItem(item)
    }

    /** Set metadata + buffering state, then prepare and play the stream. */
    private fun playItem(item: CatalogItem) {
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, item.title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, item.artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, item.artwork)
                .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, item.artwork)
                .build(),
        )
        // Show buffering immediately so the car never sits on a dead spinner.
        session.setPlaybackState(buildState(PlaybackStateCompat.STATE_BUFFERING))
        // Arm the watchdog so a stream that connects but never delivers data
        // resolves to STATE_ERROR rather than buffering forever.
        armBufferingWatchdog()
        val p = player()
        p.setMediaItem(MediaItem.fromUri(item.url))
        p.prepare()
        p.play()
    }

    /**
     * For live radio, "skip" = change station: find the currently playing radio
     * item and move to the next/previous one in the catalog, wrapping around.
     */
    private fun cycleRadio(direction: Int) {
        val radios = radioItems()
        if (radios.isEmpty()) return
        val currentUrl =
            (player?.currentMediaItem?.localConfiguration?.uri)?.toString()
        val currentIndex = radios.indexOfFirst { it.url == currentUrl }
        val nextIndex =
            if (currentIndex == -1) {
                if (direction >= 0) 0 else radios.size - 1
            } else {
                ((currentIndex + direction) % radios.size + radios.size) % radios.size
            }
        playItem(radios[nextIndex])
    }

    /**
     * Voice search: handle published RadioTEDU phrases first, then score radio
     * items with normalized matching. Specific stations such as Spark/Rock beat
     * the generic RadioTEDU brand match, so "Hey Gemini, play RadioTEDU Rock"
     * does not fall back to the main channel once Rock is playable.
     */
    private fun playFromSearch(query: String?) {
        val radios = radioItems()
        if (radios.isEmpty()) {
            session.setPlaybackState(buildState(PlaybackStateCompat.STATE_ERROR))
            return
        }
        val q = normalizeSearchQuery(query)
        val playable = allPlayableItems()
        if (q.contains("podcast")) {
            val latestPodcast = playable.firstOrNull { it.id.startsWith("podcast:") }
            if (latestPodcast != null) {
                playItem(latestPodcast)
                return
            }
        }
        if (q.contains("jukebox")) {
            val jukebox = playable.firstOrNull { it.id.startsWith("jukebox") }
            if (jukebox != null) {
                playItem(jukebox)
                return
            }
        }
        val match =
            if (q.isEmpty()) {
                radios.first()
            } else {
                radios
                    .map { it to scoreSearchItem(it, q) }
                    .filter { it.second > 0 }
                    .maxByOrNull { it.second }
                    ?.first ?: radios.first()
            }
        playItem(match)
    }

    private fun normalizeSearchQuery(value: String?): String =
        value
            ?.lowercase()
            ?.replace("ı", "i")
            ?.replace("ç", "c")
            ?.replace("ğ", "g")
            ?.replace("ö", "o")
            ?.replace("ş", "s")
            ?.replace("ü", "u")
            ?.replace(Regex("[^a-z0-9]+"), " ")
            ?.trim()
            .orEmpty()

    private fun scoreSearchItem(item: CatalogItem, q: String): Int {
        val title = normalizeSearchQuery(item.title)
        val artist = normalizeSearchQuery(item.artist)
        val id = normalizeSearchQuery(item.id)
        var score = 0

        if (title.isNotEmpty() && q.contains(title)) {
            score += if (item.id == "radiotedu-main") 2 else 6
        }
        if (artist.isNotEmpty() && q.contains(artist)) {
            score += if (item.id == "radiotedu-main") 1 else 4
        }
        if (id.isNotEmpty() && q.contains(id)) {
            score += 4
        }
        if (item.id == "radiotedu-spark" && q.contains("spark")) {
            score += 8
        }
        if (item.id == "radiotedu-rock" && q.contains("rock")) {
            score += 8
        }
        if (item.id == "radiotedu-main" && (q.contains("radiotedu") || q.contains("radio tedu") || q.contains("radyo tedu") || q.contains("rtedu"))) {
            score += 2
        }
        if (item.id.startsWith("radiotedu-") && (q.contains("cal") || q.contains("oynat"))) {
            score += 1
        }

        return score
    }
}
