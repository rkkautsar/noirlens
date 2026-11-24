import AVFoundation
import ExpoModulesCore

/**
 Minimal on-device speech synthesis. One synthesizer, one utterance at a
 time. `speak` resolves when the utterance finishes or is stopped, so the
 JS side can show a truthful speaking/stopped state.
 */
@MainActor
final class SpeechBridge: NSObject, AVSpeechSynthesizerDelegate {
  static let shared = SpeechBridge()

  private let synthesizer = AVSpeechSynthesizer()
  private var continuation: CheckedContinuation<Bool, Never>?
  private var audioConfigured = false

  private override init() {
    super.init()
    synthesizer.delegate = self
  }

  func speak(text: String, language: String) async -> Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return false
    }
    if synthesizer.isSpeaking {
      synthesizer.stopSpeaking(at: .immediate)
    }
    finish(true)

    let utterance = AVSpeechUtterance(string: trimmed)
    utterance.voice = AVSpeechSynthesisVoice(language: language)
      ?? AVSpeechSynthesisVoice(
        language: Locale.current.language.languageCode?.identifier ?? "en"
      )
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate
    configureAudioIfNeeded()

    return await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
      self.continuation = continuation
      synthesizer.speak(utterance)
    }
  }

  func stop() {
    if synthesizer.isSpeaking {
      synthesizer.stopSpeaking(at: .immediate)
    }
    finish(true)
  }

  private func configureAudioIfNeeded() {
    guard !audioConfigured else {
      try? AVAudioSession.sharedInstance().setActive(true)
      return
    }
    do {
      try AVAudioSession.sharedInstance().setCategory(
        .playback,
        mode: .spokenAudio,
        options: [.duckOthers]
      )
      try AVAudioSession.sharedInstance().setActive(true)
      audioConfigured = true
    } catch {
      // Playback may still work through the current session.
    }
  }

  private func finish(_ spoke: Bool) {
    let continuation = self.continuation
    self.continuation = nil
    continuation?.resume(returning: spoke)
    if !synthesizer.isSpeaking {
      try? AVAudioSession.sharedInstance().setActive(
        false,
        options: .notifyOthersOnDeactivation
      )
    }
  }

  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer,
    didFinish utterance: AVSpeechUtterance
  ) {
    Task { @MainActor in self.finish(true) }
  }

  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer,
    didCancel utterance: AVSpeechUtterance
  ) {
    Task { @MainActor in self.finish(true) }
  }
}
