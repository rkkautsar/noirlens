import AVFoundation
import ExpoModulesCore
import Foundation
import Speech
import UIKit

/// One push-to-talk utterance at a time. The caller reserves a turn before
/// the first bridge call; stop and cancel are safe if they arrive before the
/// audio engine is ready. Recognition never falls back to Apple's servers.
@MainActor
final class SpeechInputBridge: NSObject {
  static let shared = SpeechInputBridge()

  /// Playback cleanup must not deactivate the session while capture owns it.
  static var isCapturing: Bool {
    shared.activeTurn != nil && shared.sessionActive
  }

  private let audioEngine = AVAudioEngine()
  private var recognizer: SFSpeechRecognizer?
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var activeTurn: String?
  private var cancelledTurns: [String] = []
  private var latestTranscript = ""
  private var terminalResult: Result<String, Error>?
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

  func start(turnId: String, language: String) throws {
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
    activeTurn = turnId
    latestTranscript = ""
    terminalResult = nil

    let status = permissionStatus()
    guard status["speech"] == "authorized", status["microphone"] == "granted" else {
      activeTurn = nil
      throw speechError(
        "SpeechPermission",
        "Speech recognition and microphone access are required.",
        "ERR_SPEECH_PERMISSION"
      )
    }

    let locale = speechLocale(for: language)
    guard let recognizer = SFSpeechRecognizer(locale: locale),
          recognizer.isAvailable,
          recognizer.supportsOnDeviceRecognition
    else {
      activeTurn = nil
      throw speechError(
        "SpeechUnavailable",
        "On-device speech recognition is unavailable for this language.",
        "ERR_SPEECH_ON_DEVICE_UNAVAILABLE"
      )
    }

    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.record, mode: .measurement)
      try session.setActive(true)
      sessionActive = true

      let request = SFSpeechAudioBufferRecognitionRequest()
      request.requiresOnDeviceRecognition = true
      request.shouldReportPartialResults = true
      request.taskHint = .dictation

      let input = audioEngine.inputNode
      let format = input.outputFormat(forBus: 0)
      guard format.sampleRate > 0, format.channelCount > 0 else {
        throw speechError(
          "SpeechInputUnavailable",
          "No microphone input is available.",
          "ERR_SPEECH_ON_DEVICE_UNAVAILABLE"
        )
      }
      input.installTap(onBus: 0, bufferSize: 1024, format: format) {
        [weak request] buffer, _ in
        request?.append(buffer)
      }
      tapInstalled = true

      audioEngine.prepare()
      try audioEngine.start()

      self.recognizer = recognizer
      self.request = request
      task = recognizer.recognitionTask(with: request) { [weak self] result, error in
        Task { @MainActor [weak self] in
          self?.handle(result: result, error: error, turnId: turnId)
        }
      }
    } catch let error as Exception {
      cleanupAudio()
      activeTurn = nil
      throw error
    } catch {
      cleanupAudio()
      activeTurn = nil
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
    if let terminalResult {
      finishTurn(terminalResult)
      return try terminalResult.get()
    }
    guard request != nil else {
      finishTurn(.failure(speechError("NoSpeech", "No speech was detected.", "ERR_SPEECH_EMPTY")))
      throw speechError("NoSpeech", "No speech was detected.", "ERR_SPEECH_EMPTY")
    }

    return try await withCheckedThrowingContinuation { continuation in
      stopContinuation = continuation
      stopTimeout = Task { @MainActor [weak self] in
        try? await Task.sleep(nanoseconds: 3_000_000_000)
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
          )
        )
      }
      request?.endAudio()
      stopAudio()
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

  private func handle(
    result: SFSpeechRecognitionResult?,
    error: Error?,
    turnId: String
  ) {
    guard activeTurn == turnId else {
      return
    }
    if let result {
      latestTranscript = result.bestTranscription.formattedString
        .trimmingCharacters(in: .whitespacesAndNewlines)
      if result.isFinal {
        terminalResult = latestTranscript.isEmpty
          ? .failure(speechError("NoSpeech", "No speech was detected.", "ERR_SPEECH_EMPTY"))
          : .success(latestTranscript)
        stopAudio()
        if stopContinuation != nil {
          finishTurn(terminalResult!)
        }
      }
    }
    if let error {
      terminalResult = .failure(error)
      stopAudio()
      if stopContinuation != nil {
        finishTurn(terminalResult!)
      }
    }
  }

  private func cancelActive() {
    guard activeTurn != nil else {
      return
    }
    finishTurn(
      .failure(
        speechError("SpeechCancelled", "The speech turn was cancelled.", "ERR_SPEECH_CANCELLED")
      )
    )
  }

  private func finishTurn(_ result: Result<String, Error>) {
    let continuation = stopContinuation
    stopContinuation = nil
    stopTimeout?.cancel()
    stopTimeout = nil
    task?.cancel()
    task = nil
    request?.endAudio()
    request = nil
    recognizer = nil
    cleanupAudio()
    activeTurn = nil
    terminalResult = nil
    latestTranscript = ""
    continuation?.resume(with: result)
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
