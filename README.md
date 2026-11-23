# NoirLens

Battery-first, offline-only translator for iOS 18+. Point the phone at a sign and read English, type text when there is nothing to point at, or collect a few signs and translate them later. Apple's `Vision` and `Translation` frameworks do the work on-device.

No accounts. No uploads. No server. Camera frames and text stay in the app's private storage.

## Modes

Two top tabs, **Camera** and **Translate**. The active tab is the only accent element; there is no tab container or border.

### Camera

Two capture behaviors, switched with the layers button beside the torch. The choice persists between launches.

**Read** — hold anywhere (or the HOLD bar), aim through the reticle, release. The app grabs the sharpest of three frames, crops to the reticle, runs OCR, translates to English, and shows the result. The sensor stops before OCR starts.

| State | Camera | Screen | Moves on |
| --- | --- | --- | --- |
| `SLEEP` | off | standby; hold anywhere | press and hold |
| `PREWARM` | 720p, 30 fps | preview and reticle while holding | release |
| `SCANNING` | one frame, then off | "Reading on-device" | OCR + translation |
| `LOCKED_READ` | off | result card; copy, speak, next scan | hold for next scan |

The transition table is a pure reducer in `src/scanner/machine.ts`; `src/scanner/useScanner.ts` executes its hardware effects. A frozen result is never interrupted by lowering the phone.

**Collect** — the same hold and release, but the selected frame is saved as a JPEG plus a 480 px thumbnail under `Documents/captures`, then queued for OCR. There is no result screen: the History badge increments and a thumbnail of the real capture flies into the History icon. Each capture is an intentional hold; Collect captures do not use the daily translation allowance. Opening a capture marks it reviewed.

Metadata lives in AsyncStorage (`captures.v1`) and images live as files, never base64 in storage. At most 100 records are kept; the oldest is evicted with its files. Unfinished OCR resumes on the next launch. On a successful startup read, JPEGs older than ten minutes that no record references are removed. Captures are excluded from iCloud backup.

**Review** — History → CAPTURES, or the History button while in Collect. Rows show the thumbnail, timestamp, OCR status, and a text preview. A row opens the full image with its OCR boxes: tap a box to translate it, or translate the whole capture. Copy, retry, delete, and clear all work offline. Missing packs use the same native download prompt as Read.

Delete removes the record and both files. If the metadata store cannot be read, the app refuses to write over it and History says so instead of showing an empty library.

### Translate

Type or paste text, choose source and target (target defaults to English), swap, translate. Both languages are explicit; there is no auto-detect here. The text box and TRANSLATE button are docked above the safe area so the whole flow is reachable with one hand.

Results offer COPY, SPEAK, and SHOW. Speech is `AVSpeechSynthesizer`: one voice per language, one utterance at a time, stopped when leaving the screen or changing the target. SHOW is a full-screen, high-contrast presentation with a font size fitted to the text and viewport, scrolling for long text, the original in smaller type, a 180° flip for facing someone else, and no automatic playback.

The camera never starts from this tab.

## Stack

- Expo SDK 58, React Native 0.88, React 19, TypeScript strict, New Architecture
- `expo-router`, `expo-clipboard`, `expo-haptics`, `expo-keep-awake`, `expo-localization`, `@react-native-async-storage/async-storage`
- Local Expo module `modules/native-vision-translator` (Swift, iOS 18 deployment target)
  - `AVCaptureSession` power lifecycle, 720p/30 fps
  - CoreImage luma-edge HUD (`CIEdges` + `CIColorMonochrome`, 15 fps)
  - Three-frame capture with an edge-sharpness pick, reticle crop, JPEG + thumbnail encoding
  - `VNRecognizeTextRequest` with paragraph and vertical-CJK grouping, confidence/noise filters
  - Apple `Translation` (`TranslationSession`, `LanguageAvailability`) with the system pack download prompt, for any source→target pair
  - `AVSpeechSynthesizer` for spoken results
- AsyncStorage for scan history, capture metadata, mode and language preferences, and the entitlement record. There is no SQLite database in this app.

## Run it

Prerequisites: Node 22+, an iPhone on iOS 18+, and an Expo account. Windows is fine; native builds happen on EAS or GitHub Actions.

```bash
npm install
npm test
npx tsc --noEmit
```

### Web preview

`npx expo start --web` renders the screens with a mock camera, OCR, and translation. It is useful for layout and flow checks; the camera, OCR, language packs, speech, and file persistence only exist on a device.

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

`.github/workflows/ios-unsigned-build.yml` builds an unsigned Release `.app` on `macos-latest`, zips it as `NoirLens-unsigned.ipa`, and uploads it as an artifact.

1. Push the repo to GitHub and run **iOS unsigned IPA** from the Actions tab.
2. Download the `NoirLens-unsigned-ipa` artifact on Windows.
3. Install with [Sideloadly](https://sideloadly.io/) or AltStore using any Apple ID.

With a free Apple ID the signature expires after 7 days; re-sideload to renew. This is for testing only. A paid Apple Developer account is required for ad-hoc EAS `preview` builds and App Store distribution.

## Offline language packs

Camera mode needs source→English packs; Translate can need any pair you select. iOS fetches each model once through a system prompt; after that the app makes no network requests. The traveler list covers Japanese, Korean, Chinese (Simplified and Traditional), Thai, Vietnamese, Indonesian, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Russian, Arabic, and Turkish, plus English as a translate target.

Apple's supported pairs are the ceiling. If a pack is missing, the result asks for the download instead of falling back to an online service. Packs are installed by iOS; deleting one in Settings requires downloading it again.

## Entitlements

- `FREE`: 15 translated scans per local calendar day. English detections and missing-pack notices are free; Collect captures and text translations are not metered.
- `TRIP_PASS_14D`: unlimited for 14 days (non-renewing, local expiry)
- `LIFETIME_PRO`: unlimited

`src/services/purchases.ts` is the StoreKit 2 seam. In `__DEV__` a purchase applies instantly and is stored locally so the gate can be exercised; production builds return `unavailable` rather than faking a charge.

## Native module API

`modules/native-vision-translator` is autolinked as `NativeVisionTranslator`.

| Export | Purpose |
| --- | --- |
| `startCamera()` | Permission check and 720p session start; resolves with the session generation |
| `stopCamera()` | Stop the session unconditionally |
| `stopCameraIfCurrent(generation)` | Stop only that generation (stale-start cleanup) |
| `getCameraStatus()` | `{ authorized, running, adjustingFocus, adjustingExposure, settled }` |
| `captureFrame(sourceLanguage, crop?, cameraToken?)` | Grab the sharpest of three frames, stop the session, run OCR on the crop. `""` means AUTO; a code forces the source |
| `captureStill(cameraToken?)` | Capture and save a full upright JPEG + thumbnail; no OCR |
| `recognizeCapture(image, language)` | OCR a stored capture JPEG |
| `capturesDirectory()` / `captureFileUri(name)` / `listCaptureFiles(minAgeSeconds)` | File locations for review and cleanup |
| `deleteCaptureFiles(names)` | Remove image and thumbnail files |
| `recognizeLast(language)` | Re-run OCR on the frozen frame with another source |
| `translate({ text, sourceLanguage, targetLanguage? })` | On-device NMT; defaults to English. Throws `ERR_LANGUAGE_PACK_MISSING` |
| `checkLanguagePackStatus(langCode, target?)` / `prepareLanguagePack(langCode, target?)` | Pack availability and Apple's download prompt |
| `speak(text, language)` / `stopSpeaking()` | Speech synthesis; `speak` resolves when playback finishes or stops |
| `romanize(text, language)` | ICU romanization for the result card |
| `getSupportedLanguages()` | Apple's supported languages |
| `EcoCameraView` | Native view with `ecoMode` prop |

## Battery

The camera is the most expensive sensor in an iPhone, so NoirLens powers it only for the hold itself: roughly three seconds per scan, then off while the frame is processed. A live-overlay translator has to keep the preview and an OCR loop running for as long as the camera screen is open.

The table is an order-of-magnitude model, not a measurement, for an iPhone 13 (12.41 Wh) doing ten scans in ten minutes. The screen is on and excluded in every row.

| Flow | Camera/OCR live | Estimated energy | Share of battery |
| --- | --- | --- | --- |
| NoirLens, ten 3 s holds | 30 s | 60–80 J (0.017–0.022 Wh) | 0.14–0.18% |
| Point-and-freeze, 30 s live + 30 s review, five times | 150 s | 400–500 J (0.11–0.14 Wh) | 0.9–1.1% |
| Apple Translate camera screen left open for the whole 10 min | 600 s | 1.3–1.8 kJ (0.36–0.5 Wh) | 3–4% |

Assumptions: rear camera + preview at about 1.2–1.8 W for our 720p session and 2–3 W for a higher-resolution preview plus a continuous Vision OCR loop; one OCR pass on a captured frame about 0.5 J; one translation about 1 J. A 2026 sensor-battery study found the rear camera to be the iPhone's most demanding sensor — about [six minutes of battery per percent](https://pmc.ncbi.nlm.nih.gov/articles/PMC13211051/) with no preview or recording at all — so the live-overlay rows are if anything conservative. Expect the real numbers to be off by a factor of two; the ordering is the point.

For a real number, run a fixed script on the phone and read Xcode's Energy Log or Settings → Battery per app. The model above is only a design argument: between scans there is no sensor, no OCR loop, and no translation work.

## Power notes

- The session stops as soon as the selected frame is grabbed and encoded, before OCR or translation starts.
- Collect reuses that same capture path; the camera is already off while the JPEG is written and OCR runs in a bounded queue (two at a time, keyed by capture id so an old result can never land on a newer capture).
- The eco HUD runs a GPU-backed CoreImage edge pass over the 720p frame at 15 fps; the color preview layer is hidden in that mode.
- 720p/30 fps is the ceiling. HDR video, low-light boost, subject-area monitoring, and multi-camera devices are not used.
- Screen brightness is never touched; the OLED standby plus auto-brightness handle idle power. The scanner keeps the screen awake while mounted.
- Backgrounding forces `SLEEP` and stops the session. Leaving a screen does the same; a frozen result is never interrupted.

## Verify

```bash
npm test                 # 106 tests: reducer, entitlements, geometry, capture model/queue, show layout
npx tsc --noEmit         # strict typecheck
npx expo prebuild --platform ios --no-install
npx expo export --platform ios --output-dir dist
```

`prebuild` writes `ios/` (gitignored); `expo export` proves the JS bundle and native-module bindings resolve. The GitHub workflow runs the typecheck and tests before the Release build.

## Limits

- iOS-only, iPhone-only, portrait-locked. No Android build.
- The simulator has no camera; use a device. Speech, language-pack prompts, file persistence, and the capture animation need hardware validation.
- OCR is tuned for signage: strings shorter than 2 characters and pure numbers/currency are discarded. Long strings use a permissive 0.50 confidence floor; 2–3 character strings require 0.72.
- Read crops to the reticle; text outside it is intentionally ignored. Collect saves the full upright frame.
- Collect keeps at most 100 captures. Review uses 480 px thumbnails; the detail screen decodes the stored JPEG.
- Unsigned builds cannot be submitted to the App Store and expire weekly with a free Apple ID.
- Unsigned CI builds set `EXPO_PUBLIC_DEV_UNLIMITED=1` and run with unlimited scans. A production build must not set that variable.
- Price detection requires an explicit currency symbol or ISO code; rates are bundled estimates, not live market data.
- No cloud translation, image upload, account, or analytics path exists.

## Layout

```
app/                         Expo Router screens
  index.tsx                  camera: Read/Collect, result card, history entry
  translate.tsx              text translation, speech, show-to-local entry
  result.tsx                 read-only replay of a history translation
  capture/[id].tsx           saved capture: image, OCR regions, translation
  paywall.tsx                entitlement sheet
  preview.tsx                UI sampler
modules/native-vision-translator/
  ios/                       Swift camera, capture files, OCR, Translation, speech
src/scanner/                 pure reducer, store, controller, geometry
src/services/                history, captures, OCR queue, entitlements, languages, currency
src/components/              OLED UI primitives, sheets, capture flight, mode tabs
.github/workflows/           unsigned IPA CI
```
