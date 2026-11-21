# NoirLens

Battery-first, offline-only live camera translator for iOS 18+. Point the phone at a sign, read the English, lower the phone. The camera sensor is off whenever you are not actively scanning.

No accounts. No uploads. No server. Apple's `Vision` and `Translation` frameworks do the work on-device.

## How it behaves

| State | Camera | Screen | Moves on |
| --- | --- | --- | --- |
| `SLEEP` | `stopRunning()`; sensor, AF/OIS and ISP powered down | Pure `#000000`; hold anywhere on the screen; auto-brightness untouched | Press and hold anywhere |
| `PREWARM` | 1280×720, 30 fps, continuous AF/AE, no HDR/multi-cam | Color preview by default; **NOIR** toggles the warm-white edge HUD. Release-to-capture shutter; STOP | Release the shutter |
| `SCANNING` | One raw frame grabbed, then `stopRunning()` immediately | "Reading on-device" | OCR + translation finish |
| `LOCKED_READ` | Off | Black result card; selectable text and COPY; frozen-frame toggle; bottom **HOLD FOR NEXT SCAN** bar | Hold the bottom bar (or tap SCAN AGAIN); lowering or walking never clears it |

The transition table is implemented as a pure reducer in `src/scanner/machine.ts`. There is no motion gesture: the hold shutter is the only camera trigger.

**Hold to scan:** press and hold almost anywhere on the standby or aiming screen (top-bar chips and buttons still take their own taps). The camera opens while your finger is down; aim at the sign through the reticle, then release to capture. A normal hold is under a second. **OCR reads only the square inside the reticle**, not the full sensor frame, so browser URL bars and page chrome outside the aim area cannot leak into the result; the frozen **ORIGINAL** view shows that same crop. URL/percent-encoded query lines are also dropped even if they fall inside the reticle.

The result stays on screen when you lower the phone to read it. On the result, the bottom bar is **HOLD FOR NEXT SCAN**; the translated/source text is selectable and **COPY** copies the shown text plus any price estimates. Tapping **SCAN AGAIN** returns to standby if you prefer tapping over holding.


**Source language** is selectable from the top-bar language chip. The default is **AUTO**, which never claims English: an English-only scene shows a short notice instead of a fake translation, and mixed text prefers the non-English language. AUTO picks the best of the nine supported source languages, plus script and German function-word hints, so a short umlaut-free German sign is not misread as Romanian or Polish; unsupported detections are reported as unknown rather than offering a pack this app cannot install. Choosing a specific language forces that source and also makes it the first OCR language (English stays as a secondary model for embedded Latin text); explicit-source scans use a lower 0.35 floor for long small print. AUTO runs OCR in script priority: Thai, Korean, Japanese, Chinese, then the Latin traveler languages, with en-US last. The language sheet uses the same order, so a Latin watermark cannot outrank a non-Latin sign while an English-only frame still shows the English notice. If AUTO detects a language whose pack is not installed and OCR confidence is below 0.65, the app tries the already-installed source packs before prompting for a download. If the needed offline pack is missing, the result still shows the captured source text with a one-tap pack prompt — it is not treated as a failed scan and does not consume a free scan. Only a completed translation counts against the daily limit.

**Prices** are detected from the source text when a currency symbol or ISO code is present and converted to the phone locale's currency (falling back to USD). The bundled table is USD-based, so any pair converts through USD; every conversion is labelled **EST. FX · Nov 2026** and should be treated as approximate, not a live quote.

## Stack

- Expo SDK 58, React Native 0.88, React 19, TypeScript strict, New Architecture
- `expo-router`, `expo-localization`, `expo-keep-awake`, `expo-sqlite`
- Local Expo module `modules/native-vision-translator` (Swift, iOS 18 deployment target)
  - `AVCaptureSession` power lifecycle
  - CoreImage luma-edge HUD (`CIEdges` + `CIColorMonochrome`, 15 fps)
  - `VNRecognizeTextRequest` (accurate, traveler-language list with auto-detect fallback, confidence/noise filters, paragraph and vertical-CJK grouping)
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

- `FREE`: 15 translated scans per local calendar day, persisted in SQLite (English detections and missing-pack notices are free)
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
| `captureFrame(sourceLanguage)` | Grab one raw `CVPixelBuffer`, stop the session, run OCR; `""` means AUTO detection, a code forces the source language. Returns text, language, normalized paragraph boxes, SHA-256 hash and a frozen JPEG preview |
| `translate({ text, sourceLanguage })` | On-device NMT to English; throws `ERR_LANGUAGE_PACK_MISSING` when the pack is absent |
| `checkLanguagePackStatus(langCode)` | `installed` / `supported` / `unsupported` |
| `prepareLanguagePack(langCode)` | Presents Apple's download prompt, then re-checks status |
| `getSupportedLanguages()` | Apple's supported source languages |
| `EcoCameraView` | Native view with `ecoMode` prop; edge HUD or color preview |

## Power notes

- The session is stopped as soon as a frame is grabbed, before OCR or NMT starts. Reading a result costs no camera power.
- The eco HUD runs a GPU-backed CoreImage edge pass over the 720p frame at 15 fps and renders warm-white outlines on black; the color preview layer is hidden in that mode.
- Frame rate is capped by the 720p/30 fps session preset; HDR video, low-light boost, subject-area monitoring and multi-camera devices are deliberately not used.
- Screen brightness is never touched; the OLED black standby plus auto-brightness handle idle power. The scanner keeps the screen awake while mounted.
- App backgrounding forces `SLEEP` and stops the session. A frozen result is never interrupted by backgrounding the camera.

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
- The simulator has no camera; use a device.
- OCR is tuned for signage: strings shorter than 2 characters and pure numbers/currency are discarded. Long strings use a permissive 0.50 confidence floor; 2–3 character strings require 0.72.
- OCR prefers the traveler language list (German, Japanese, Chinese, etc.) so a short English watermark cannot skew language correction. Auto-detection is the fallback when that list finds nothing. AUTO source selection weighs language hypotheses toward non-English and falls back to the script hint for umlauts, kana, Hangul, Thai and Han characters.
- Unsigned builds cannot be submitted to the App Store and expire weekly with a free Apple ID.
- Language packs are installed by iOS, not by the app; deleting one in Settings requires re-downloading it.
- Price detection requires an explicit currency symbol or ISO code; bare numbers, times and dates are ignored. Rates are bundled estimates, not live market data, and no network request is made.
- OCR is limited to the reticle square. Text outside it is intentionally ignored; step back to fit a wide sign.

## Layout

```
app/                         Expo Router screens
  index.tsx                  scanner, result card, frozen original
  languages.tsx              offline pack sheet
  paywall.tsx                entitlement sheet
modules/native-vision-translator/
  ios/                       Swift camera, OCR, Translation bridge
src/scanner/                 pure reducer, store, controller, geometry
src/services/                SQLite, cache, ledger, entitlements, source language, currency
src/components/              OLED UI primitives and views
assets/icon.png              black + warm-white reticle app icon
.github/workflows/           unsigned IPA CI
```
