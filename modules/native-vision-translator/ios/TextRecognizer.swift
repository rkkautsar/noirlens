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

  private static let minimumConfidence: Float = 0.70
  private static let punctuationNoise = CharacterSet(
    charactersIn: "0123456789.,:;+-*/%$€£¥₩₹()[]{}#*·•°'\"`~^_=<>|\\"
  )

  static func recognize(
    pixelBuffer: CVPixelBuffer,
    previewJpegBase64: String?
  ) throws -> [String: Any] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = true

    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: .right,
      options: [:]
    )

    do {
      try handler.perform([request])
    } catch {
      throw Exception(
        name: "TextRecognitionFailed",
        description: "On-device text recognition failed.",
        code: "ERR_OCR_FAILED"
      )
    }

    let observations = request.results ?? []
    let lines = observations.compactMap(parse)
    let rawText = lines.map(\.text).joined(separator: "\n")
    let language = dominantLanguage(in: rawText)

    // The upright frame is the landscape buffer rotated 90 degrees.
    let width = CVPixelBufferGetHeight(pixelBuffer)
    let height = CVPixelBufferGetWidth(pixelBuffer)

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
    guard
      candidate.confidence >= minimumConfidence,
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

  // MARK: - Language

  private static func dominantLanguage(in text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return "und"
    }

    let recognizer = NLLanguageRecognizer()
    recognizer.processString(trimmed)
    guard
      let language = recognizer.dominantLanguage,
      language != .undetermined
    else {
      return "und"
    }
    return language.rawValue
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
