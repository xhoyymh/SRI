# SVI Android Frontend

This is an Android frontend for the existing SVIMVP backend, based on `VideoInteraction_Frontend-main`.

## Structure

- `app/src/main/java/com/example/svimvpandroid/MainActivity.java`: native Android WebView shell, file chooser, device id bridge, toast bridge.
- `app/src/main/assets/web/index.html`: Android frontend entry.
- `app/src/main/assets/web/styles.css`: mobile UI styles.
- `app/src/main/assets/web/app.js`: page routing, API client, playback interactions, upload flow, RAG polling, auth and social state.
- `docs/function-map.md`: one-to-one mapping from mini program pages and APIs.

## Backend

The Android app calls:

```text
http://106.55.249.9:8080/api/v1
```

This matches the current mini program `utils/config.js`. Because the API is HTTP, `usesCleartextTraffic=true` is enabled in the Android manifest.

## Upload Behavior

The mini program uses Tencent COS mini program SDK for direct multipart upload. The Android WebView frontend uses the backend fallback endpoint instead:

```text
POST /uploads/assets/{assetId}/file
```

The end-to-end product flow remains the same:

1. Create upload batch.
2. Upload each selected video.
3. Complete batch.
4. Open RAG analysis page.
5. Start or monitor RAG task.

## Build

Open `VideoInteraction_Android-main` in Android Studio, or run Gradle from a machine with Android SDK installed:

```powershell
gradle assembleDebug
```

If Gradle reports that SDK location is missing, copy `local.properties.example` to `local.properties` and set `sdk.dir` to the Android SDK directory, for example:

```properties
sdk.dir=<ANDROID_SDK_PATH>
```

This project intentionally avoids AndroidX, Compose, React Native, and other external UI dependencies. It only needs the Android Gradle plugin and Android SDK.
