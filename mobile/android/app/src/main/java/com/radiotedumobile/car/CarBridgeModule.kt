package com.radiotedumobile.car

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * JS-facing bridge for the car browser:
 *  - setCatalog(json): JS pushes the browse tree (channels, podcasts, …)
 *  - updateNowPlaying(...): JS reflects playback state into the car session
 *  - emits "RadioTeduCarCommand" to JS when the car controls playback
 */
class CarBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        CarBridge.onCarCommand = { action, mediaId -> emitCommand(action, mediaId) }
    }

    override fun getName(): String = "RadioTeduCarBridge"

    @ReactMethod
    fun setCatalog(json: String) {
        reactContext
            .getSharedPreferences(RadioTeduCarService.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(RadioTeduCarService.KEY_CATALOG, json)
            .apply()
        CarBridge.catalogChanged()
    }

    @ReactMethod
    fun updateNowPlaying(
        title: String,
        artist: String,
        artwork: String,
        isPlaying: Boolean,
    ) {
        CarBridge.nowPlaying(title, artist, artwork, isPlaying)
    }

    // Required for RN event emitter (NativeEventEmitter) — no-op listeners.
    @ReactMethod fun addListener(eventName: String) {}

    @ReactMethod fun removeListeners(count: Int) {}

    override fun onCatalystInstanceDestroy() {
        CarBridge.onCarCommand = null
        super.onCatalystInstanceDestroy()
    }

    private fun emitCommand(action: String, mediaId: String?) {
        if (!reactContext.hasActiveReactInstance()) return
        val map = Arguments.createMap().apply {
            putString("action", action)
            putString("mediaId", mediaId)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("RadioTeduCarCommand", map)
    }
}
