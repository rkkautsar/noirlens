# NoirLens

Battery-first, offline-only live camera translator for iOS 18+. Point the phone at a sign, read the English, lower the phone. The camera sensor is off whenever you are not actively scanning.

No accounts. No uploads. No server. Apple's `Vision` and `Translation` frameworks do the work on-device.

## How it behaves

| State | Camera | Screen | Moves on |
| --- | --- | --- | --- |
| `SLEEP` | `stopRunning()`; sensor, AF/OIS and ISP powered down | Pure `#000000`; "Raise to scan"; screen dimmed | Enters the 20–85° band from outside within 1 s with ≥ 30°/s rotation |
| `PREWARM` | 1280×720, 30 fps, continuous AF/AE, no HDR/multi-cam | Warm-white luma-edge HUD over black (toggle: color) | AF/AE settled + angular speed < 0.15 rad/s for 250 ms |
| `SCANNING` | One raw frame grabbed, then `stopRunning()` immediately | "Reading on-device" | OCR + translation finish |
| `LOCKED_READ` | Off | Black result card; frozen-frame wireframe toggle | Lower phone (<15°) or walking, or "Scan Again" |

The transition table is implemented as a pure reducer in `src/scanner/machine.ts`, with every threshold in `DEFAULT_TUNING`. Motion is sampled at 20 Hz; pitch comes from the gravity vector (0° = flat, 90° = upright) and walking is detected from 600 ms of angular-speed variance. The arm gesture accepts rotation in either direction: lifting from a table and tilting down from a vertical pocket both enter the band deliberately, while a phone that is already sitting inside the band does not arm.

## Stack

- Expo SDK 58, React Native 0.88, React 19, TypeScript strict, New Architecture
- `expo-router`, `expo-sensors` (CoreMotion), `expo-brightness`, `expo-keep-awake`, `expo-sqlite`
- Local Expo module `modules/native-vision-translator` (Swift, iOS 18 deployment target)
  - `AVCaptureSession` power lifecycle
  - CoreImage luma-edge HUD (`CIEdges` + `CIColorMonochrome`, 15 fps)
  - `VNRecognizeTextRequest` (accurate, auto language detection, confidence/noise filters, paragraph and vertical-CJK grouping)
  - Apple `Translation` (`TranslationSession`, `LanguageAvailability`) with a system download prompt for packs
- SQLite: translation cache by SHA-256 source hash, daily scan ledger, entitlement state

## Run it

Prerequisites: Node 22+, an iPhone on iOS 18+, and an Expo account. Windows is fine; native builds happen on EAS or GitHub Actions.

```bash
npm install
npm test
npx tsc --noEmit
```

### Development build (Windows, no Mac)

The app contains custom Swift code, so Expo Go will not work. Build a dev client in the cloud:

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform ios
```

Install the build link on the iPhone, then:

```bash
npm start
```

EAS device builds need an Apple Developer account for provisioning. The unsigned GitHub Actions path below works with a free Apple ID. `eas.json` also has `preview` (internal distribution) and `production` profiles.

### Unsigned IPA (free Apple ID)

`.github/workflows/ios-unsigned-build.yml` builds a signed-nothing Release `.app` on `macos-latest`, zips it as `NoirLens-unsigned.ipa`, and uploads it as an artifact.

1. Push the repo to GitHub and run **iOS unsigned IPA** from the Actions tab.
2. Download the `NoirLens-unsigned-ipa` artifact on Windows.
3. Install with [Sideloadly](https://sideloadly.io/) or AltStore using any Apple ID.

With a free Apple ID the signature expires after 7 days; re-sideload to renew. This is for testing only. A paid Apple Developer account is required for ad-hoc EAS `preview` builds and App Store distribution.

## Offline language packs

Open **PACKS** and download the languages you need before traveling. iOS fetches each model once through a system prompt; after that the app makes no network requests. Included in the list: Japanese, Korean, Chinese (Simplified), Spanish, French, German, Thai, Vietnamese, Indonesian.

Apple's supported language pairs are the ceiling. If detection returns a script Apple cannot translate to English, the result card asks for a different pack instead of failing silently.

## Entitlements

- `FREE`: 15 scans per local calendar day, persisted in SQLite
- `TRIP_PASS_14D`: unlimited for 14 days (non-renewing, local expiry)
- `LIFETIME_PRO`: unlimited

`src/services/purchases.ts` is the StoreKit 2 seam. In `__DEV__` a purchase applies instantly and is stored locally so the gate can be exercised; production builds return `unavailable` rather than faking a charge. Wire the real provider there without touching the screens or the reducer.

## Native module API

`modules/native-vision-translator` is autolinked as `NativeVisionTranslator`.

| Export | Purpose |
| --- | --- |
| `startCamera()` | Permission check, configure and start the 720p session |
| `stopCamera()` | `stopRunning()`; powers down the sensor |
| `getCameraStatus()` | `{ authorized, running, adjustingFocus, adjustingExposure, settled }` |
| `captureFrame()` | Grab one raw `CVPixelBuffer`, stop the session, run OCR; returns text, detected language, normalized paragraph boxes, SHA-256 hash and a frozen JPEG preview |
| `translate({ text, sourceLanguage })` | On-device NMT to English; throws `ERR_LANGUAGE_PACK_MISSING` when the pack is absent |
| `checkLanguagePackStatus(langCode)` | `installed` / `supported` / `unsupported` |
| `prepareLanguagePack(langCode)` | Presents Apple's download prompt, then re-checks status |
| `getSupportedLanguages()` | Apple's supported source languages |
| `EcoCameraView` | Native view with `ecoMode` prop; edge HUD or color preview |

## Power notes

- The session is stopped as soon as a frame is grabbed, before OCR or NMT starts. Reading a result costs no camera power.
- The eco HUD runs a GPU-backed CoreImage edge pass over the 720p frame at 15 fps and renders warm-white outlines on black; the color preview layer is hidden in that mode.
- Frame rate is capped by the 720p/30 fps session preset; HDR video, low-light boost, subject-area monitoring and multi-camera devices are deliberately not used.
- Screen brightness is lowered in `SLEEP` and restored on wake. The scanner keeps the screen awake while the scanner screen is mounted.
- App backgrounding or a 2.5 s motion-sample gap forces `SLEEP` and stops the session.

## Verify

```bash
npm test                 # reducer, entitlement and geometry tests
npx tsc --noEmit         # strict typecheck
npx expo prebuild --platform ios --no-install
npx expo export --platform ios --output-dir dist
```

`prebuild` writes `ios/` (gitignored); `expo export` proves the JS bundle and native-module bindings resolve.

## Limits

- iOS-only, iPhone-only, portrait-locked. No Android or web build.
- The simulator has no camera and no motion sensors; use a device.
- OCR is tuned for signage: strings shorter than 2 characters, confidence below 0.70, and pure numbers/currency are discarded.
- Unsigned builds cannot be submitted to the App Store and expire weekly with a free Apple ID.
- Language packs are installed by iOS, not by the app; deleting one in Settings requires re-downloading it.

## Layout

```
app/                         Expo Router screens
  index.tsx                  scanner, result card, frozen original
  languages.tsx              offline pack sheet
  paywall.tsx                entitlement sheet
modules/native-vision-translator/
  ios/                       Swift camera, OCR, Translation bridge
src/scanner/                 pure reducer, store, controller, geometry
src/services/                SQLite, cache, ledger, entitlements, motion
src/components/              OLED UI primitives and views
assets/icon.png              black + warm-white reticle app icon
.github/workflows/           unsigned IPA CI
```
