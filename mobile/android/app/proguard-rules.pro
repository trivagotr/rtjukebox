# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Keep TrackPlayer and KotlinAudio fields for Android Auto reflection
-keep class com.doublesymmetry.trackplayer.** { *; }
-keep class com.doublesymmetry.kotlinaudio.** { *; }
-keep interface com.doublesymmetry.kotlinaudio.** { *; }
-keep class android.support.v4.media.** { *; }

# RadioTEDU native car browser + bridge (referenced from the manifest and from
# JS via the React bridge; must survive minification).
-keep class com.radiotedumobile.car.** { *; }

# AndroidX media (MediaBrowserServiceCompat / MediaSessionCompat).
-keep class androidx.media.** { *; }

# react-native-vector-icons (fonts loaded by name).
-keep class com.oblador.vectoricons.** { *; }

# NOTE: minification is OFF by default (enableProguardInReleaseBuilds=false in
# app/build.gradle). Before enabling it, run a RELEASE build and smoke-test
# playback, Android Auto browse, and the consent flow - RN libraries rely on
# reflection and may need extra keep rules.
