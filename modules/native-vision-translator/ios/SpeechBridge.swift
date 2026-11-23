import AVFoundation
import ExpoModulesCore

/**
 Minimal on-device speech synthesis. One synthesizer, one utterance at a
 time; starting a new request stops the previous one.
 */
@MainActor
enum SpeechBridge {
  private static let synthesizer = AVSpeechSynthesizer()

  static func speak(text: String, language: String) -> Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return false
    }
    if synthesizer.isSpeaking {
      synthesizer.stopSpeaking(at: .immediate)
    }
    let utterance = AVSpeechUtterance(string: trimmed)
    utterance.voice = AVSpeechSynthesisVoice(language: language)
      ?? AVSpeechSynthesisVoice(language: Locale.current.language.languageCode?.identifier)
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate
    do {
      try AVAudioSession.sharedInstance().setCategory(
        .playback,
        mode: .spokenAudio,
        options: [.duckOthers]
      )
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      // Audio session failures still let the synthesizer try.
    }
    synthesizer.speak(utterance)
    return true
  }

  static func stop() {
    if synthesizer.isSpeaking {
      synthesizer.stopSpeaking(at: .immediate)
    }
  }
}
