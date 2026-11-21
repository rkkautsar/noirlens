import CryptoKit
import ExpoModulesCore
import Foundation
import NaturalLanguage
import Vision

/**
 On-device OCR with paragraph grouping.

 Input buffers are landscape (the sensor's native orientation), so Vision is
 told `.right`: it rotates the image upright before recognizing and returns
 bounding boxes in that upright coordinate space. The matching preview/JPEG is
 rotated with `CIImage.oriented(.right)`, so normalized boxes overlay exactly.
 */
enum TextRecognizer {
  private struct Line {
    let text: String
    let confidence: Float
    let box: CGRect
  }

  private struct Block {
    let text: String
    let confidence: Float
    let box: CGRect
  }

  private static let preferredLanguageCodes = [
    "en-US", "de-DE", "fr-FR", "es-ES", "it-IT", "pt-BR",
    "ja-JP", "ko-KR", "zh-Hans", "zh-Hant", "th-TH",
    "vi-VT", "vi-VN", "id-ID",
  ]
  private static let punctuationNoise = CharacterSet(
    charactersIn: "0123456789.,:;+-*/%$€£¥₩₹()[]{}#*·•°'\"`~^_=<>|\\"
  )

  static func recognize(
    pixelBuffer: CVPixelBuffer,
    previewJpegBase64: String?
  ) throws -> [String: Any] {
    // The upright frame is the landscape buffer rotated 90 degrees.
    let width = CVPixelBufferGetHeight(pixelBuffer)
    let height = CVPixelBufferGetWidth(pixelBuffer)

    // Prefer an explicit list covering every language pack the app can
    // translate. Vision's auto-detection can latch onto a short English
    // watermark on an otherwise German/Japanese sign and then apply English
    // correction to the wrong glyphs. Fall back to auto-detection only when
    // the explicit pass finds nothing.
    var lines: [Line] = []
    let preferred = supportedPreferredLanguages()

    if !preferred.isEmpty {
      do {
        lines = try runPass(pixelBuffer, automatic: false, languages: preferred)
      } catch {
        NSLog("[NoirLens] OCR explicit pass failed: %@", error.localizedDescription)
      }
    }

    if lines.isEmpty {
      do {
        lines = try runPass(pixelBuffer, automatic: true, languages: [])
      } catch {
        throw Exception(
          name: "TextRecognitionFailed",
          description: "On-device text recognition failed.",
          code: "ERR_OCR_FAILED"
        )
      }
    }

    let rawText = lines.map(\.text).joined(separator: "\n")
    let language = dominantLanguage(in: rawText)

    guard !lines.isEmpty else {
      return payload(
        text: "",
        language: "und",
        blocks: [],
        width: width,
        height: height,
        previewJpegBase64: previewJpegBase64
      )
    }

    let vertical = isVerticalLayout(lines, language: language)
    let grouped = vertical
      ? groupColumns(lines)
      : groupParagraphs(lines, language: language)

    let blocks = grouped.map { group -> Block in
      let confidence =
        group.reduce(Float(0)) { $0 + $1.confidence } / Float(group.count)
      return Block(
        text: joinedText(group, language: language, vertical: vertical),
        confidence: confidence,
        box: union(group.map(\.box))
      )
    }

    let text = blocks.map(\.text).joined(separator: "\n")
    NSLog(
      "[NoirLens] OCR language=%@ lines=%d blocks=%d chars=%d",
      language,
      lines.count,
      blocks.count,
      text.count
    )

    return payload(
      text: text,
      language: language,
      blocks: blocks,
      width: width,
      height: height,
      previewJpegBase64: previewJpegBase64
    )
  }

  // MARK: - Observation parsing

  private static func parse(_ observation: VNRecognizedTextObservation) -> Line? {
    guard let candidate = observation.topCandidates(1).first else {
      return nil
    }

    let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
    // Long strings are kept at a permissive confidence floor; short strings
    // need to be convincing so signage noise does not flood the result.
    let confidenceFloor: Float = text.count >= 4 ? 0.50 : 0.72
    guard
      candidate.confidence >= confidenceFloor,
      text.count >= 2,
      !isNoise(text)
    else {
      return nil
    }

    let box = observation.boundingBox
    return Line(
      text: text,
      confidence: candidate.confidence,
      box: CGRect(
        x: box.minX,
        y: 1 - box.maxY,
        width: box.width,
        height: box.height
      )
    )
  }

  private static func isNoise(_ text: String) -> Bool {
    let allowed = punctuationNoise
      .union(.whitespacesAndNewlines)
      .union(.punctuationCharacters)
    return text.unicodeScalars.allSatisfy { allowed.contains($0) }
  }

  // MARK: - Recognition passes

  private static func supportedPreferredLanguages() -> [String] {
    let probe = VNRecognizeTextRequest()
    guard
      let supported = try? VNRecognizeTextRequest.supportedRecognitionLanguages(
        for: .accurate,
        revision: probe.revision
      )
    else {
      return []
    }
    let supportedSet = Set(supported)
    let filtered = preferredLanguageCodes.filter { supportedSet.contains($0) }
    NSLog("[NoirLens] OCR preferred languages available=%d", filtered.count)
    return filtered
  }

  private static func runPass(
    _ pixelBuffer: CVPixelBuffer,
    automatic: Bool,
    languages: [String]
  ) throws -> [Line] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = automatic
    if !automatic {
      request.recognitionLanguages = languages
    }

    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: .right,
      options: [:]
    )
    try handler.perform([request])

    let observations = request.results ?? []
    let lines = observations.compactMap(parse)
    let characters = lines.reduce(0) { $0 + $1.text.count }
    NSLog(
      "[NoirLens] OCR pass automatic=%d languages=%d lines=%d chars=%d",
      automatic ? 1 : 0,
      languages.count,
      lines.count,
      characters
    )
    return lines
  }

  // MARK: - Language

  private static func dominantLanguage(in text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return "und"
    }

    let recognizer = NLLanguageRecognizer()
    recognizer.processString(trimmed)
    let detected = recognizer.dominantLanguage?.rawValue

    if let hint = scriptHint(for: trimmed),
       detected == nil || detected == "en" || detected == "und" {
      return hint
    }

    guard let detected, detected != "und" else {
      return "und"
    }
    return detected
  }

  private static func scriptHint(for text: String) -> String? {
    var hasKana = false
    var hasHangul = false
    var hasThai = false
    var hasHan = false

    for scalar in text.unicodeScalars {
      switch scalar.value {
      case 0x3040...0x30FF:
        hasKana = true
      case 0xAC00...0xD7AF:
        hasHangul = true
      case 0x0E00...0x0E7F:
        hasThai = true
      case 0x4E00...0x9FFF:
        hasHan = true
      default:
        break
      }
    }

    if hasKana { return "ja" }
    if hasHangul { return "ko" }
    if hasThai { return "th" }
    if hasHan { return "zh-Hans" }
    if text.contains(where: { "äöüßÄÖÜ".contains($0) }) { return "de" }
    return nil
  }

  private static func isCJK(_ language: String) -> Bool {
    language.hasPrefix("ja")
      || language.hasPrefix("ko")
      || language.hasPrefix("zh")
      || language.hasPrefix("yue")
  }

  private static func isVerticalLayout(_ lines: [Line], language: String) -> Bool {
    guard isCJK(language), !lines.isEmpty else {
      return false
    }
    let verticalCount = lines.filter { $0.box.height > $0.box.width * 1.6 }.count
    return verticalCount * 2 > lines.count
  }

  // MARK: - Grouping

  private static func groupParagraphs(
    _ lines: [Line],
    language: String
  ) -> [[Line]] {
    let medianHeight = median(lines.map(\.box.height), fallback: 0.02)
    var rows: [[Line]] = []

    for line in lines.sorted(by: { $0.box.midY < $1.box.midY }) {
      if let index = rows.lastIndex(where: { row in
        guard let reference = row.first else {
          return false
        }
        return abs(reference.box.midY - line.box.midY) <= medianHeight * 0.7
      }) {
        rows[index].append(line)
      } else {
        rows.append([line])
      }
    }

    rows = rows
      .map { $0.sorted { $0.box.minX < $1.box.minX } }
      .sorted { union($0.map(\.box)).minY < union($1.map(\.box)).minY }

    var paragraphs: [[Line]] = []
    for row in rows {
      if let index = paragraphs.indices.last {
        let previousBox = union(paragraphs[index].map(\.box))
        let rowBox = union(row.map(\.box))
        let gap = rowBox.minY - previousBox.maxY
        if gap <= medianHeight * 0.9 && gap >= -medianHeight * 1.2 {
          paragraphs[index].append(contentsOf: row)
          continue
        }
      }
      paragraphs.append(row)
    }

    return paragraphs
  }

  private static func groupColumns(_ lines: [Line]) -> [[Line]] {
    let medianWidth = median(lines.map(\.box.width), fallback: 0.02)
    var columns: [[Line]] = []

    for line in lines.sorted(by: { $0.box.midX > $1.box.midX }) {
      if let index = columns.lastIndex(where: { column in
        guard let reference = column.first else {
          return false
        }
        return abs(reference.box.midX - line.box.midX) <= medianWidth * 0.7
      }) {
        columns[index].append(line)
      } else {
        columns.append([line])
      }
    }

    return columns.map { $0.sorted { $0.box.minY < $1.box.minY } }
  }

  private static func joinedText(
    _ lines: [Line],
    language: String,
    vertical: Bool
  ) -> String {
    let separator = vertical || isCJK(language) ? "" : " "
    return lines.map(\.text).joined(separator: separator)
  }

  // MARK: - Payload

  private static func payload(
    text: String,
    language: String,
    blocks: [Block],
    width: Int,
    height: Int,
    previewJpegBase64: String?
  ) -> [String: Any] {
    let averageConfidence: Double
    if blocks.isEmpty {
      averageConfidence = 0
    } else {
      let total = blocks.reduce(Float(0)) { $0 + $1.confidence }
      averageConfidence = Double(total / Float(blocks.count))
    }

    var result: [String: Any] = [
      "text": text,
      "sourceLanguage": language,
      "blocks": blocks.map { block in
        [
          "text": block.text,
          "confidence": Double(block.confidence),
          "x": Double(block.box.minX),
          "y": Double(block.box.minY),
          "width": Double(block.box.width),
          "height": Double(block.box.height)
        ] as [String: Any]
      },
      "confidence": averageConfidence,
      "imageWidth": width,
      "imageHeight": height,
      "sourceHash": sourceHash(text: text, language: language)
    ]

    if let previewJpegBase64 {
      result["previewJpegBase64"] = previewJpegBase64
    }

    return result
  }

  private static func sourceHash(text: String, language: String) -> String {
    guard !text.isEmpty else {
      return ""
    }
    let normalized = text
      .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
    let digest = SHA256.hash(data: Data("\(language)|\(normalized)".utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
  }

  // MARK: - Math

  private static func union(_ boxes: [CGRect]) -> CGRect {
    guard let first = boxes.first else {
      return .zero
    }
    return boxes.dropFirst().reduce(first) { $0.union($1) }
  }

  private static func median(_ values: [CGFloat], fallback: CGFloat) -> CGFloat {
    guard !values.isEmpty else {
      return fallback
    }
    return values.sorted()[values.count / 2]
  }
}
