package com.radiotedumobile

import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.session.MediaSessionCompat
import androidx.media.MediaBrowserServiceCompat

class AutoBrowserService : MediaBrowserServiceCompat() {

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot? {
        // Return a valid root
        return BrowserRoot("RADIO_TEDU_ROOT", null)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<MutableList<MediaBrowserCompat.MediaItem>>
    ) {
        val mediaItems = mutableListOf<MediaBrowserCompat.MediaItem>()

        if (parentId == "RADIO_TEDU_ROOT") {
            addChannelItem(mediaItems, "radiotedu-main", "RadioTEDU", "Ana Kanal")
            addChannelItem(mediaItems, "radiotedu-classic", "Classic", "Klasik Müzik")
            addChannelItem(mediaItems, "radiotedu-jazz", "Jazz", "Caz Müzik")
            addChannelItem(mediaItems, "radiotedu-lofi", "Lo-Fi", "Lo-Fi Beats")
        }

        result.sendResult(mediaItems)
    }

    private fun addChannelItem(items: MutableList<MediaBrowserCompat.MediaItem>, id: String, title: String, subtitle: String) {
        val description = MediaDescriptionCompat.Builder()
            .setMediaId(id)
            .setTitle(title)
            .setSubtitle(subtitle)
            .setIconUri(android.net.Uri.parse("https://radiotedu.com/logo.png"))
            .build()
        items.add(MediaBrowserCompat.MediaItem(description, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE))
    }
}
