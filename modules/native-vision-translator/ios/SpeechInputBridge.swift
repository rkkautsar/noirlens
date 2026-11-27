import AVFoundation
import ExpoModulesCore
import Foundation
import Speech
import UIKit

/// One push-to-talk utterance at a time, backed by the iOS 26 SpeechAnalyzer
/// pipeline. The caller reserves a turn before the first bridge call; stop and
/// cancel are safe if they arrive before the analyzer is ready. Recognition
/// never falls back to Apple's servers.
@MainActor
final class SpeechInputBridge: NSObject {
  static let shared = SpeechInputBridge()

  /// Playback cleanup must not deactivate the session while capture owns it.
  static var isCapturing: Bool {
    shared.activeTurn != nil && shared.sessionActive
  }

  private let audioEngine = AVAudioEngine()
  private var analyzer: SpeechAnalyzer?
  private var transcriber: SpeechTranscriber?
  private var inputContinuation: AsyncStream<AnalyzerInput>.Continuation?
  private var audioConverter: AVAudioConverter?
  private var resultTask: Task<String, Error>?
  private var activeTurn: String?
  private var cancelledTurns: [String] = []
  private var prepareQueue: Task<Void, Error>?
  private var prepareGeneration = 0
  private var stopContinuation: CheckedContinuation<String, Error>?
  private var stopTimeout: Task<Void, Never>?
  private var tapInstalled = false
  private var sessionActive = false
  private var interruptionObserver: NSObjectProtocol?
  private var backgroundObserver: NSObjectProtocol?

  override private init() {
    super.init()
    interruptionObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { [weak self] notification in
      let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
      guard raw == AVAudioSession.InterruptionType.began.rawValue else {
        return
      }
      Task { @MainActor [weak self] in
        self?.cancelActive()
      }
    }
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      Task { @MainActor [weak self] in
        self?.cancelActive()
      }
    }
  }

  func permissionStatus() -> [String: String] {
    var speech = "undetermined"
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized:
      speech = "authorized"
    case .denied:
      speech = "denied"
    case .restricted:
      speech = "restricted"
    case .notDetermined:
      speech = "undetermined"
    @unknown default:
      speech = "undetermined"
    }

    var microphone = "undetermined"
    switch AVAudioApplication.shared.recordPermission {
    case .granted:
      microphone = "granted"
    case .denied:
      microphone = "denied"
    case .undetermined:
      microphone = "undetermined"
    @unknown default:
      microphone = "undetermined"
    }
    return ["speech": speech, "microphone": microphone]
  }

  func requestPermissions() async -> [String: String] {
    _ = await withCheckedContinuation { continuation in
      AVAudioApplication.requestRecordPermission { granted in
        continuation.resume(returning: granted)
      }
    }
    _ = await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status)
      }
    }
    return permissionStatus()
  }

  /// Downloads the on-device models ahead of the first hold and releases
  /// locales that are no longer part of the active pair. AssetInventory shares
  /// installed models between apps and consolidates duplicate requests.
  func prepareAssets(languages: [String]) async {
    _ = try? await enqueueAssets(
      languages: languages,
      reservations: languages
    )
  }

  private func enqueueAssets(
    languages: [String],
    reservations: [String]
  ) async throws {
    prepareGeneration += 1
    let generation = prepareGeneration
    let previous = prepareQueue
    let task = Task { @MainActor [weak self] in
      _ = try? await previous?.value
      guard let self, generation == self.prepareGeneration else {
        return
      }
      try await self.performPrepare(
        languages: languages,
        reservations: reservations
      )
    }
    prepareQueue = task
    try await task.value
  }

  private func performPrepare(
    languages: [String],
    reservations: [String]
  ) async throws {
    guard SpeechTranscriber.isAvailable else {
      return
    }
    var installLocales: [Locale] = []
    for language in Set(languages) {
      let requested = speechLocale(for: language)
      guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) else {
        continue
      }
      installLocales.append(locale)
    }
    var wanted: Set<String> = []
    for language in Set(reservations) {
      let requested = speechLocale(for: language)
      if let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) {
        wanted.insert(locale.identifier.lowercased())
      }
    }

    // Free stale reservations before asking for the new pair; otherwise an
    // installation at the reservation quota fails before it can release them.
    let reservedLocales = await AssetInventory.reservedLocales
    for reserved in reservedLocales
    where !wanted.contains(reserved.identifier.lowercased()) {
      _ = await AssetInventory.release(reservedLocale: reserved)
    }

    for locale in installLocales {
      let transcriber = SpeechTranscriber(locale: locale, preset: .transcription)
      if let request = try await AssetInventory.assetInstallationRequest(
        supporting: [transcriber]
      ) {
        try await request.downloadAndInstall()
      }
    }
  }

  func start(turnId: String, language: String, languages: [String]) async throws {
    guard activeTurn == nil else {
      throw speechError("Busy", "Another speech turn is already active.", "ERR_SPEECH_BUSY")
    }
    if let index = cancelledTurns.firstIndex(of: turnId) {
      cancelledTurns.remove(at: index)
      throw speechError("Cancelled", "The speech turn was cancelled.", "ERR_SPEECH_CANCELLED")
    }
    guard UIApplication.shared.applicationState == .active else {
      throw speechError("Inactive", "Return to the app to speak.", "ERR_SPEECH_INACTIVE")
    }

    let status = permissionStatus()
    guard status["speech"] == "authorized", status["microphone"] == "granted" else {
      throw speechError(
        "SpeechPermission",
        "Speech recognition and microphone access are required.",
        "ERR_SPEECH_PERMISSION"
      )
    }

    activeTurn = turnId

    do {
      guard SpeechTranscriber.isAvailable else {
        throw speechError(
          "SpeechUnavailable",
          "Speech transcription is unavailable on this device.",
          "ERR_SPEECH_ON_DEVICE_UNAVAILABLE"
        )
      }
      let requested = speechLocale(for: language)
      guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) else {
        throw speechError(
          "SpeechUnavailable",
          "Speech transcription is unavailable for this language.",
          "ERR_SPEECH_ON_DEVICE_UNAVAILABLE"
        )
      }

      guard activeTurn == turnId,
            UIApplication.shared.applicationState == .active
      else {
        throw speechError("Cancelled", "The speech turn was cancelled.", "ERR_SPEECH_CANCELLED")
      }

      let transcriber = SpeechTranscriber(locale: locale, preset: .transcription)
      let assetStatus = await AssetInventory.status(forModules: [transcriber])
      guard activeTurn == turnId,
            UIApplication.shared.applicationState == .active
      else {
        throw speechError("Cancelled", "The speech turn was cancelled.", "ERR_SPEECH_CANCELLED")
      }
      if assetStatus != .installed {
        try await enqueueAssets(
          languages: [language],
          reservations: languages
        )
      }

      guard activeTurn == turnId,
            UIApplication.shared.applicationState == .active
      else {
        throw speechError("Cancelled", "The speech turn was cancelled.", "ERR_SPEECH_CANCELLED")
      }
      guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
        compatibleWith: [transcriber]
      ) else {
        throw speechError(
          "SpeechUnavailable",
          "The speech model could not be loaded.",
          "ERR_SPEECH_ON_DEVICE_UNAVAILABLE"
        )
      }
      guard activeTurn == turnId,
            UIApplication.shared.applicationState == .active
      else {
        throw speechError("Cancelled", "The speech turn was cancelled.", "ERR_SPEECH_CANCELLED")
      }

      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.record, mode: .measurement)
      try session.setActive(true)
      sessionActive = true

      let input = audioEngine.inputNode
      let inputFormat = input.outputFormat(forBus: 0)
      guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
        throw speechError(
          "SpeechInputUnavailable",
          "No microphone input is available.",
          "ERR_SPEECH_ON_DEVICE_UNAVAILABLE"
        )
      }
      guard let converter = AVAudioConverter(from: inputFormat, to: analyzerFormat) else {
        throw speechError(
          "SpeechInputUnavailable",
          "The microphone format is not supported.",
          "ERR_SPEECH_START"
        )
      }

      let (inputSequence, continuation) = AsyncStream.makeStream(of: AnalyzerInput.self)
      let analyzer = SpeechAnalyzer(modules: [transcriber], options: nil)

      self.transcriber = transcriber
      self.analyzer = analyzer
      self.audioConverter = converter
      self.inputContinuation = continuation
      self.resultTask = Task {
        var transcript = AttributedString()
        for try await result in transcriber.results {
          if result.isFinal {
            transcript.append(result.text)
          }
        }
        return String(transcript.characters)
      }

      try await analyzer.start(inputSequence: inputSequence)
      guard activeTurn == turnId,
            UIApplication.shared.applicationState == .active
      else {
        throw speechError("Cancelled", "The speech turn was cancelled.", "ERR_SPEECH_CANCELLED")
      }

      let ratio = analyzerFormat.sampleRate / inputFormat.sampleRate
      input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) {
        buffer, _ in
        let capacity = AVAudioFrameCount(
          (Double(buffer.frameLength) * ratio).rounded(.up)
        ) + 1024
        guard let converted = AVAudioPCMBuffer(
          pcmFormat: analyzerFormat,
          frameCapacity: capacity
        ) else {
          return
        }
        var conversionError: NSError?
        var supplied = false
        let conversionStatus = converter.convert(
          to: converted,
          error: &conversionError
        ) { _, outStatus in
          if supplied {
            outStatus.pointee = .noDataNow
            return nil
          }
          supplied = true
          outStatus.pointee = .haveData
          return buffer
        }
        guard conversionStatus == .haveData || conversionStatus == .inputRanDry,
              converted.frameLength > 0
        else {
          return
        }
        continuation.yield(AnalyzerInput(buffer: converted))
      }
      tapInstalled = true

      audioEngine.prepare()
      try audioEngine.start()
    } catch let error as Exception {
      if activeTurn == turnId {
        finishTurn(.failure(error), turnId: turnId)
      }
      throw error
    } catch {
      if activeTurn == turnId {
        finishTurn(.failure(error), turnId: turnId)
      }
      throw speechError(
        "SpeechStartFailed",
        "The microphone could not start.",
        "ERR_SPEECH_START"
      )
    }
  }

  func stop(turnId: String) async throws -> String {
    guard activeTurn == turnId else {
      return ""
    }
    guard stopContinuation == nil else {
      throw speechError("Busy", "The transcript is already finishing.", "ERR_SPEECH_BUSY")
    }
    guard let analyzer, inputContinuation != nil else {
      finishTurn(
        .failure(speechError("NoSpeech", "No speech was detected.", "ERR_SPEECH_EMPTY")),
        turnId: turnId
      )
      throw speechError("NoSpeech", "No speech was detected.", "ERR_SPEECH_EMPTY")
    }

    return try await withCheckedThrowingContinuation { continuation in
      stopContinuation = continuation
      stopTimeout = Task { @MainActor [weak self] in
        try? await Task.sleep(nanoseconds: 5_000_000_000)
        guard let self, !Task.isCancelled else {
          return
        }
        self.finishTurn(
          .failure(
            speechError(
              "SpeechTimeout",
              "The final transcript did not arrive.",
              "ERR_SPEECH_TIMEOUT"
            )
          ),
          turnId: turnId
        )
      }

      stopAudio()
      let stream = inputContinuation
      inputContinuation = nil
      drainConverter(into: stream)
      stream?.finish()

      Task { @MainActor [weak self] in
        guard let self else {
          return
        }
        let result: Result<String, Error>
        do {
          try await analyzer.finalizeAndFinishThroughEndOfInput()
          let text = try await self.resultTask?.value
          let trimmed = (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          result = trimmed.isEmpty
            ? .failure(speechError("NoSpeech", "No speech was detected.", "ERR_SPEECH_EMPTY"))
            : .success(trimmed)
        } catch {
          result = .failure(error)
        }
        guard self.activeTurn == turnId else {
          return
        }
        self.finishTurn(result, turnId: turnId)
      }
    }
  }

  func cancel(turnId: String) {
    guard activeTurn == turnId else {
      if !cancelledTurns.contains(turnId) {
        cancelledTurns.append(turnId)
        if cancelledTurns.count > 16 {
          cancelledTurns.removeFirst()
        }
      }
      return
    }
    cancelActive()
  }

  private func cancelActive() {
    guard let turnId = activeTurn else {
      return
    }
    finishTurn(
      .failure(
        speechError("SpeechCancelled", "The speech turn was cancelled.", "ERR_SPEECH_CANCELLED")
      ),
      turnId: turnId
    )
  }

  private func finishTurn(_ result: Result<String, Error>, turnId: String) {
    guard activeTurn == turnId else {
      return
    }
    let continuation = stopContinuation
    stopContinuation = nil
    stopTimeout?.cancel()
    stopTimeout = nil
    resultTask?.cancel()
    resultTask = nil
    if let analyzer {
      Task {
        await analyzer.cancelAndFinishNow()
      }
    }
    analyzer = nil
    transcriber = nil
    audioConverter = nil
    inputContinuation?.finish()
    inputContinuation = nil
    cleanupAudio()
    activeTurn = nil
    continuation?.resume(with: result)
  }

  private func drainConverter(into stream: AsyncStream<AnalyzerInput>.Continuation?) {
    guard let converter = audioConverter, let stream else {
      return
    }
    let format = converter.outputFormat
    let capacity = AVAudioFrameCount(4096)
    for _ in 0..<4 {
      guard let converted = AVAudioPCMBuffer(
        pcmFormat: format,
        frameCapacity: capacity
      ) else {
        return
      }
      var conversionError: NSError?
      let status = converter.convert(to: converted, error: &conversionError) { _, outStatus in
        outStatus.pointee = .endOfStream
        return nil
      }
      if converted.frameLength > 0 {
        stream.yield(AnalyzerInput(buffer: converted))
      }
      if status != .haveData {
        break
      }
    }
  }

  private func stopAudio() {
    if tapInstalled {
      audioEngine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    if audioEngine.isRunning {
      audioEngine.stop()
    }
    if sessionActive {
      try? AVAudioSession.sharedInstance().setActive(
        false,
        options: .notifyOthersOnDeactivation
      )
      sessionActive = false
    }
  }

  private func cleanupAudio() {
    stopAudio()
    audioEngine.reset()
  }

  private func speechLocale(for language: String) -> Locale {
    switch language.lowercased() {
    case "en":
      return Locale(identifier: "en-US")
    case "ja":
      return Locale(identifier: "ja-JP")
    case "ko":
      return Locale(identifier: "ko-KR")
    case "zh-hans":
      return Locale(identifier: "zh-CN")
    case "zh-hant":
      return Locale(identifier: "zh-TW")
    case "th":
      return Locale(identifier: "th-TH")
    case "vi":
      return Locale(identifier: "vi-VN")
    case "id":
      return Locale(identifier: "id-ID")
    case "de":
      return Locale(identifier: "de-DE")
    case "fr":
      return Locale(identifier: "fr-FR")
    case "es":
      return Locale(identifier: "es-ES")
    case "it":
      return Locale(identifier: "it-IT")
    case "pt":
      return Locale(identifier: "pt-BR")
    case "nl":
      return Locale(identifier: "nl-NL")
    case "pl":
      return Locale(identifier: "pl-PL")
    case "ru":
      return Locale(identifier: "ru-RU")
    case "ar":
      return Locale(identifier: "ar-SA")
    case "tr":
      return Locale(identifier: "tr-TR")
    default:
      return Locale(identifier: language)
    }
  }

  private func speechError(
    _ name: String,
    _ description: String,
    _ code: String
  ) -> Exception {
    Exception(name: name, description: description, code: code)
  }
}
