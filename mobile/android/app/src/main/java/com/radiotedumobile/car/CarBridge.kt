package com.radiotedumobile.car

/**
 * In-process bridge between the car MediaBrowserService and the React Native
 * module. Both live in the same app process, so a simple singleton with
 * listener callbacks is enough — no IPC needed.
 *
 *  JS  --(setCatalog / updateNowPlaying)-->  CarBridgeModule  -->  CarBridge  -->  Service
 *  Car --(transport / playFromMediaId)----->  Service          -->  CarBridge  -->  JS (events)
 */
object CarBridge {
    /** Service registers this to rebuild its browse tree when JS pushes a new catalog. */
    var onCatalogChanged: (() -> Unit)? = null

    /** Service registers this to reflect JS playback state in its MediaSession. */
    var onNowPlaying: ((title: String, artist: String, artwork: String, isPlaying: Boolean) -> Unit)? = null

    /** Module registers this to forward car transport commands to JS. */
    var onCarCommand: ((action: String, mediaId: String?) -> Unit)? = null

    fun catalogChanged() = onCatalogChanged?.invoke()

    fun nowPlaying(title: String, artist: String, artwork: String, isPlaying: Boolean) =
        onNowPlaying?.invoke(title, artist, artwork, isPlaying)

    fun command(action: String, mediaId: String?) = onCarCommand?.invoke(action, mediaId)
}
