package com.radiotedumobile.car

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.MediaBrowserServiceCompat
import com.radiotedumobile.R
import org.json.JSONObject

/**
 * Custom Android Auto / Automotive media browser for RadioTEDU.
 *
 * RNTP v4 ships no MediaBrowserService, so this provides the browse tree the car
 * shows (categories → channels / podcasts / etc.) and a MediaSession the car
 * controls. Actual audio is played by RNTP in JS: transport + selections are
 * forwarded over CarBridge to JS, which drives playbackQueue. JS pushes the
 * catalog and the now-playing state back into this session.
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
    }

    private lateinit var session: MediaSessionCompat

    /** Tracks whether we currently hold the mediaPlayback foreground service. */
    private var isForeground = false

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
        // updateForeground(), driven by JS via CarBridge.onNowPlaying.
        createNotificationChannel()

        session = MediaSessionCompat(this, "RadioTeduCarSession").apply {
            setCallback(SessionCallback())
            setPlaybackState(buildState(PlaybackStateCompat.STATE_PAUSED))
            isActive = true
        }
        sessionToken = session.sessionToken

        // JS pushed a new browse catalog -> tell the car to reload the tree.
        CarBridge.onCatalogChanged = { notifyChildrenChanged(ROOT_ID) }

        // JS is the single authority on playback state. updateNowPlaying ->
        // this callback sets the MediaSession metadata + PlaybackState to the
        // ACTUAL state reported by JS/RNTP, and starts/stops the foreground
        // service accordingly. The SessionCallback never sets state optimistically.
        CarBridge.onNowPlaying = { title, artist, artwork, isPlaying ->
            session.setMetadata(
                MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                    .putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, artwork)
                    .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, artwork)
                    .build(),
            )
            session.setPlaybackState(
                buildState(
                    if (isPlaying) PlaybackStateCompat.STATE_PLAYING
                    else PlaybackStateCompat.STATE_PAUSED,
                ),
            )
            updateForeground(isPlaying)
        }
    }

    override fun onDestroy() {
        CarBridge.onCatalogChanged = null
        CarBridge.onNowPlaying = null
        session.release()
        @Suppress("DEPRECATION")
        stopForeground(true)
        isForeground = false
        super.onDestroy()
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

    // --- Car transport -> JS (RNTP plays the actual audio) ---

    // Each callback only RELAYS the car's intent to JS. We never set the
    // MediaSession PlaybackState here (no optimistic STATE_PLAYING/PAUSED):
    // JS/RNTP is the single source of truth and reports the real state back via
    // updateNowPlaying -> CarBridge.onNowPlaying, which is where state is set.
    // This prevents the car now-playing/transport UI from desyncing if a
    // command fails or is overridden in JS.
    private inner class SessionCallback : MediaSessionCompat.Callback() {
        override fun onPlay() {
            CarBridge.command("play", null)
        }

        override fun onPause() {
            CarBridge.command("pause", null)
        }

        override fun onStop() {
            CarBridge.command("stop", null)
        }

        override fun onSkipToNext() {
            CarBridge.command("next", null)
        }

        override fun onSkipToPrevious() {
            CarBridge.command("previous", null)
        }

        override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
            CarBridge.command("playId", mediaId)
        }

        override fun onPlayFromSearch(query: String?, extras: Bundle?) {
            CarBridge.command("search", query)
        }
    }
}
