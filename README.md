# NoirLens

Battery-first translator for iOS 18+ whose OCR and translation run on-device once the required language packs are installed. Point the phone at a sign and read English, type text when there is nothing to point at, or collect a few signs and translate them later.

There is no NoirLens account, backend, or camera-frame upload. The camera, OCR, and translation never contact a network while packs are installed. Optional lookups can send selected text to DuckDuckGo or Wikipedia, and the explicit web-search action sends it to Google.

## Modes

Two top tabs, **Camera** and **Translate**. Inside the switcher, the active tab is the only accent element; there is no tab container or border.

### Camera

Two capture behaviors, switched with the layers button beside the torch. The choice persists between launches.

**Read** — press the unobstructed standby area or the center of the shutter bar to start the camera; aim and release to capture. A quick tap can also start and request a capture; there is no minimum hold time. The shutter's side controls are Cancel and Languages. The camera samples up to three frames, keeps the available frame with the highest edge-sharpness score, crops to an expanded region around the reticle (a 16% margin per side where space permits; a central 60% crop before the reticle is measured), and runs OCR. Supported non-English text is translated into English when the pack is installed; an English or undetected result locks without a translation, and a missing pack locks a notice. The sensor stops before OCR starts.

| State | Camera | Screen | Moves on |
| --- | --- | --- | --- |
| `SLEEP` | off | standby; press and release to capture | touch down |
| `PREWARM` | 1280×720 session | preview and reticle while pressed | release |
| `SCANNING` | up to three candidate frames, one retained, then off | "Reading on-device" | a result, or standby on failure |
| `LOCKED_READ` | off | result card; copy, inspect, change language, next scan | hold for next scan |

The transition table is a pure reducer in `src/scanner/machine.ts`; `src/scanner/useScanner.ts` executes its hardware effects. A frozen result is never interrupted by lowering the phone.

**Collect** — the same press and release, but the selected frame is saved as a JPEG plus a thumbnail (longest side at most 480 px) under `Documents/captures`, then queued for OCR. History shows the number of retained, unreviewed captures, and after a save the real thumbnail flies into the History icon unless Reduce Motion is enabled. Collect captures do not use the daily translation allowance. Opening a capture shows its result screen and marks it reviewed.

Metadata lives in AsyncStorage (`captures.v1`). On iOS, the record stores filenames and the image bytes are saved as files; the web mock persists its data-URI mock instead. Collect retains the newest 100 records. Eviction, Delete, and Clear remove the metadata first, then attempt to remove the corresponding JPEGs and thumbnails; leftovers are eligible for startup cleanup. Unfinished OCR resumes on the next launch. On scanner startup, after a successful and complete metadata read, the app attempts to delete unreferenced `.jpg` files whose modification time is more than ten minutes old. The captures directory is excluded from iCloud backup.

**Review** — History → CAPTURES, or the History button while in Collect. Rows show the thumbnail, timestamp, OCR status, and a text preview. A row opens the result screen for that capture: the saved image is the inspect thumbnail (tap it to view the image and tap a line to translate), the OCR language can be changed from the result, and copy/retry/delete/clear work offline. Delete lives in History with a confirmation. Missing packs use the same native download prompt as Read.

Delete removes the record first and then attempts to remove both files. If the AsyncStorage read fails, History reports storage unavailable and writes are blocked until a read succeeds. A successful read with malformed metadata skips orphan cleanup but can still show an empty capture list.

### Translate

Type or paste text, choose source and target (target defaults to English; source defaults to the current Camera source if already loaded and not AUTO, otherwise Japanese), swap, translate. Both languages are explicit; there is no auto-detect here. The text box and TRANSLATE button are docked above the safe area.

Results offer COPY, SPEAK, and SHOW. Speech is one `AVSpeechSynthesizer`: it requests a voice for the target language with a system-language fallback, one utterance at a time, and stops on target changes or when Translate unmounts. SHOW is a full-screen, high-contrast presentation with a font size fitted to the text and viewport, scrolling for long text, up to four lines of the current input in smaller type, a 180° flip for facing someone else, and no automatic playback.

The camera never starts from this tab.

## Stack

- Expo SDK 58, React Native 0.88, React 19, TypeScript strict, New Architecture
- `expo-router`, `expo-clipboard`, `expo-haptics`, `expo-keep-awake`, `expo-localization`, `@react-native-async-storage/async-storage`
- Local Expo module `modules/native-vision-translator` (Swift, iOS 18 deployment target)
  - `AVCaptureSession` power lifecycle, 1280×720 session (frame rate left to AVFoundation)
  - Noir preview mode: the live color preview dimmed by a black overlay with a repeating CRT scanline layer (no per-frame processing)
  - Up to three frames with an edge-sharpness pick, expanded reticle crop, JPEG + thumbnail encoding
  - `VNRecognizeTextRequest` with paragraph and vertical-CJK grouping, confidence/noise filters
  - Apple `Translation` (`TranslationSession`, `LanguageAvailability`) with the system pack download prompt, for the selected pair where Apple supports it
  - `AVSpeechSynthesizer` for spoken results
- AsyncStorage for scan history, capture metadata, mode and language preferences, and the entitlement record. There is no SQLite database in this app.

## Run it

Use Node 22.13 or newer in the Node 22 line, which CI uses. Local JS checks (`npm test`, `npx tsc --noEmit`) do not need an iPhone or an Expo account. To run the native app, use an iPhone on iOS 18 or later; use an Expo account for EAS, or build the unsigned artifact with GitHub Actions. Windows is fine.

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
3. Sign and install with a sideloading tool such as [Sideloadly](https://sideloadly.io/) or AltStore. The tool provisions the app; free-account provisioning expires after seven days.

The CI artifact is unsigned and is not suitable for App Store submission. If installed with free Apple Account provisioning, the profile expires after seven days; re-sign and reinstall to renew. A paid Apple Developer account is required for ad-hoc EAS `preview` builds and App Store distribution.

## Offline language packs

Camera and Capture Review translate into English, so they need source→English packs. Translate uses the source and target you choose; Apple's Translation framework decides whether that pair is supported on the device. When a supported pair is missing its models, the app can ask iOS to download them through the system prompt. With the necessary models installed, translation can run offline. English-to-English and unknown-language text are identity paths. Optional lookup and web search can still contact third-party services. The traveler list covers Japanese, Korean, Chinese (Simplified and Traditional), Thai, Vietnamese, Indonesian, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Russian, Arabic, and Turkish, plus English, which is selectable on either side in Translate.

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
| `startCamera()` | Permission check and 1280×720 session start; resolves with the session generation |
| `stopCamera()` | Stop the session unconditionally |
| `stopCameraIfCurrent(generation)` | Stop only that generation (stale-start cleanup) |
| `getCameraStatus()` | `{ authorized, running, hasDevice, adjustingFocus, adjustingExposure, settled }` |
| `captureFrame(sourceLanguage, crop?, cameraToken?)` | Sample up to three frames, keep the sharpest available, stop the session, run OCR on the crop. `""` means AUTO; a code forces the source |
| `captureStill(cameraToken?)` | Capture and save a full upright JPEG + thumbnail; no OCR |
| `recognizeCapture(image, language)` | OCR a stored capture JPEG |
| `capturesDirectory()` / `captureFileUri(name)` / `listCaptureFiles(minAgeSeconds)` | File locations for review and cleanup |
| `deleteCaptureFiles(names)` | Remove image and thumbnail files |
| `recognizeLast(language)` | Re-run OCR on the frozen frame with another source |
| `translate({ text, sourceLanguage, targetLanguage? })` | On-device NMT; defaults to English. Throws `ERR_LANGUAGE_PACK_MISSING` |
| `checkLanguagePackStatus(langCode, target?)` / `prepareLanguagePack(langCode, target?)` | Pack availability and Apple's download prompt |
| `speak(text, language)` / `stopSpeaking()` | Speech synthesis. Returns `false` immediately for blank text; for one request it resolves `true` on completion or stop. Overlapping requests do not have per-utterance completion tracking. |
| `romanize(text, language)` | ICU romanization for the result card |
| `getSupportedLanguages()` | Apple's supported languages |
| `EcoCameraView` | Native view with `ecoMode` and `scanlineLevel` props |

## Battery

In a controlled study of iPhone 13 Pro and 14 Pro devices, the rear camera had the largest battery impact of the sensors tested. NoirLens starts the camera on press and stops it after the release-triggered capture and JPEG encoding, before OCR or translation. This model assumes 30 seconds of camera-on time across ten scans.

The table is an illustrative order-of-magnitude model, not a measurement and not a claim about any specific app. It uses an assumed 12.41 Wh iPhone 13 battery ([capacity reference](https://www.theverge.com/2021/9/17/22678607/iphone-13-reported-battery-sizes-increase-laptop-comparison)) and excludes the screen.

| Flow | Camera/OCR live | Estimated energy | Share of battery |
| --- | --- | --- | --- |
| NoirLens, ten 3 s captures | 30 s | 51–69 J (0.014–0.019 Wh) | 0.11–0.15% |
| Hypothetical point-and-freeze, 30 s live + 30 s review, ten times | 300 s | 610–910 J (0.169–0.253 Wh) | 1.37–2.04% |
| Hypothetical continuous preview and OCR, camera open 10 min | 600 s | 1.21–1.81 kJ (0.336–0.503 Wh) | 2.71–4.05% |

Assumptions: rear camera + preview at about 1.2–1.8 W for our 1280×720 session, 2–3 W for a higher-resolution preview plus a continuous Vision OCR loop; one OCR pass about 0.5 J; one translation about 1 J. A [2026 sensor-battery study](https://pmc.ncbi.nlm.nih.gov/articles/PMC13211051/) measured the rear camera at roughly six minutes of battery per percentage point with no preview or recording; that supports the camera cost, not these rows. The inputs are illustrative and the real numbers will differ.

The screen is excluded from the table; its effect is separate. The standby and result screens are almost entirely `#000000`, which an OLED panel renders with the pixels off, and the app does not change the display brightness. While aiming, the default Noir mode keeps the live preview but dims it with a 72% black overlay and a repeating scanline layer; no per-frame edge filter runs. This model assumes a live-preview comparator shows an undimmed camera image while pointing and keeps a full-color still on screen during review.

Under illustrative display assumptions — 0.1–0.2 W for the dimmed preview, 0.05–0.15 W for a black screen with light text, 0.5–1 W for full-color imagery — the same ten-minute flows differ by roughly 0.009–0.025 Wh for NoirLens versus 0.08–0.17 Wh for full-color content. Neither figure is measured; the screen is on while the user reads in both cases.

To compare on a device, run the same scripted flow on both apps. For absolute energy, use a measurement method that reports joules or watt-hours; iOS per-app battery usage is a relative indicator. Between scans, camera standby does not stream frames or run a continuous OCR or translation loop. Queued Collect OCR and user-requested translation can still run with the camera off.

## Power notes

- The session stops as soon as the selected frame is grabbed and encoded, before OCR or translation starts.
- Collect reuses that same capture path. The capture session stops before the JPEG files are written and before the capture is queued for OCR; a later hold can power the camera while queued OCR continues in a bounded queue (two at a time, keyed by capture id so an old result can never land on a newer capture).
- Noir mode composites the live preview through a 72% black overlay and a repeating scanline layer. There is no per-frame CoreImage pass; the OLED emits a fraction of the light of the undimmed preview.
- The session is configured at 1280×720; frame rate is left to AVFoundation. HDR video, subject-area monitoring, and multi-camera devices are not used. Low-light boost is not configured.
- The app does not change screen brightness; the OLED standby (pure black, pixels off) and the user's brightness setting handle idle power, and the aiming view is dimmed with scanlines rather than an undimmed color preview. The scanner keeps the screen awake while mounted.
- Backgrounding or navigating away puts an unlocked scanner to sleep and stops the camera. A locked Read result is preserved; its session is already stopped.

## Verify

```bash
npm test                 # 115 tests: reducer, entitlements, geometry, capture model/queue, translation task, allowance, show layout
npx tsc --noEmit         # strict typecheck
npx expo prebuild --platform ios --no-install
npx expo export --platform ios --output-dir dist
```

`prebuild` generates the gitignored `ios/` project. `expo export` checks that the iOS JavaScript bundle can be produced; it does not compile Swift or prove native autolinking. The GitHub workflow runs the typecheck and tests before the Release build.

## Limits

- iOS-only, iPhone-only, portrait-locked. No Android build.
- Validate the real camera, speech, system pack prompts, native capture files, and animation on a physical iPhone; the web mock does not validate native behavior.
- OCR permits one character for recognized script ranges (kana, Han, Hangul, Thai, Arabic, Cyrillic) and requires at least two otherwise. Short observations require 0.45 confidence for those scripts and 0.72 otherwise. For four or more characters the main floor is 0.35 with an explicit source and 0.40 in AUTO; a final automatic pass uses 0.50. A separate noise filter rejects strings made entirely of digits, punctuation, whitespace, and listed symbols.
- Read crops to an expanded region around the reticle; text outside it is ignored. Collect saves the full upright frame.
- Collect keeps at most 100 captures. Review uses 480 px thumbnails; the result screen's inspect view decodes the stored JPEG.
- The unsigned CI artifact is not suitable for App Store submission. If provisioned with a free Apple account, it expires after seven days.
- Unsigned CI builds set `EXPO_PUBLIC_DEV_UNLIMITED=1` and run with unlimited scans. A production build must not set that variable.
- Price detection requires a recognized currency symbol, code, or a supported cue such as `won` for a Korean source. Rates are bundled estimates, not live rates.
- No cloud translation, image upload, account, or analytics path exists. This does not mean the app never sends data: optional text lookup and the explicit web search do.

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
