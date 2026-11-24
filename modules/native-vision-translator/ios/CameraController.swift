import AVFoundation
import CoreImage
import ExpoModulesCore
import UIKit

struct CapturedFrame {
  let sampleBuffer: CMSampleBuffer
  let previewJpegBase64: String?
  let cropRect: CGRect?

  var pixelBuffer: CVPixelBuffer? {
    CMSampleBufferGetImageBuffer(sampleBuffer)
  }
}

/**
 Owns the single `AVCaptureSession` used by the app.

 The session is configured once at 1280x720 / 30fps, never 4K and never
 multi-camera. `stop()` calls `stopRunning()`, which powers down the sensor,
 voice-coil autofocus and ISP until the next arm. Frame buffers are delivered
 on a background queue. The Noir preview is composited by the view (dim +
 scanlines) with no per-frame processing, while the untouched pixel buffer is
 handed to Vision on capture.
 */
final class CameraController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
  static let shared = CameraController()

  private var _session = AVCaptureSession()
  private let sessionLock = NSLock()

  var session: AVCaptureSession {
    sessionLock.lock()
    defer { sessionLock.unlock() }
    return _session
  }

  func currentSession() -> AVCaptureSession { session }

  private let sessionQueue = DispatchQueue(label: "app.noirlens.camera.session")
  private let videoQueue = DispatchQueue(
    label: "app.noirlens.camera.video",
    qos: .userInitiated
  )
  private let stateLock = NSLock()
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  private var device: AVCaptureDevice?
  private var videoOutput: AVCaptureVideoDataOutput?
  private var configured = false
  private var latestSampleBuffer: CMSampleBuffer?
  private weak var previewSink: EcoCameraView?
  private var previewViewSize: CGSize = .zero
  private var lastRuntimeError: Error?
  private var lastInterruptionReason: AVCaptureSession.InterruptionReason?
  private var sessionObservers: [NSObjectProtocol] = []
  private let generationLock = NSLock()
  private var startGeneration = 0
  private var wantsCamera = false
  private var torchEnabled = false
  private var lastCapture: (buffer: CVPixelBuffer, crop: CGRect?, jpeg: String?)?

  private override init() {
    super.init()
    NotificationCenter.default.addObserver(
      forName: UIApplication.willResignActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      guard let self else { return }
      self.invalidateStartGeneration()
      Task { await self.stop() }
    }
  }

  // MARK: - Lifecycle

  @discardableResult
  func start() async throws -> Int {
    NSLog(
      "[NoirLens] start: multitasking supported=%d enabled=%d",
      session.isMultitaskingCameraAccessSupported ? 1 : 0,
      session.isMultitaskingCameraAccessEnabled ? 1 : 0
    )
    let generation = nextStartGeneration()
    try await ensureCameraPermission()
    try checkStart(generation)
    lastRuntimeError = nil
    lastInterruptionReason = nil

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      sessionQueue.async {
        do {
          try self.checkStart(generation)
          try self.configureIfNeeded()
          if let device = self.device {
            // Restore continuous AF/AE after the previous capture's one-shot
            // center focus, so the preview keeps hunting while framing.
            self.configureDevice(device)
          }
          self.replaceLatestSampleBuffer(nil)
          if try !self.startRunning(generation) {
            // Never replace the session: a second AVCaptureSession contends
            // with the first for the device and can be reported as a
            // multi-app interruption. Reset this same session and retry once.
            try self.checkStart(generation)
            self.session.stopRunning()
            self.replaceLatestSampleBuffer(nil)
            guard try self.startRunning(generation) else {
              throw self.startFailureError(generation)
            }
          }
          try self.checkStart(generation)
          self.wantsCamera = true
          self.applyTorch()
          self.notifyPreviewRotation()
          continuation.resume()
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
    return generation
  }

  private func startFailureError(_ generation: Int) -> Error {
    if !isCurrentStart(generation) || !appIsActive() {
      return cameraException(
        name: "CameraCancelled",
        description: "The camera start was cancelled.",
        code: "ERR_CAMERA_CANCELLED"
      )
    }
    return cameraException(
      name: "CameraUnavailable",
      description: self.startFailureDescription(),
      code: "ERR_CAMERA_UNAVAILABLE"
    )
  }

  private func startFailureDescription() -> String {
    if let error = lastRuntimeError {
      let ns = error as NSError
      return "AVFoundation error: \(ns.domain) \(ns.code): \(ns.localizedDescription)"
    }
    if let reason = lastInterruptionReason {
      return "AVFoundation interrupted the session (reason \(reason.rawValue))."
    }
    return "The capture session could not start."
  }

  private func observeSession(_ session: AVCaptureSession) {
    for observer in sessionObservers {
      NotificationCenter.default.removeObserver(observer)
    }
    lastRuntimeError = nil
    lastInterruptionReason = nil
    sessionObservers = [
      NotificationCenter.default.addObserver(
        forName: .AVCaptureSessionRuntimeError,
        object: session,
        queue: .main
      ) { [weak self] note in
        let error = note.userInfo?[AVCaptureSessionErrorKey] as? Error
        self?.lastRuntimeError = error
        NSLog("[NoirLens] AVCaptureSession runtime error: \(String(describing: error))")
      },
      NotificationCenter.default.addObserver(
        forName: .AVCaptureSessionWasInterrupted,
        object: session,
        queue: .main
      ) { [weak self] note in
        let raw = note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int
        if let raw, let reason = AVCaptureSession.InterruptionReason(rawValue: raw) {
          self?.lastInterruptionReason = reason
        }
        NSLog("[NoirLens] AVCaptureSession interrupted: \(String(describing: note.userInfo))")
      },
    ]
  }

  private func nextStartGeneration() -> Int {
    generationLock.lock()
    startGeneration += 1
    let generation = startGeneration
    generationLock.unlock()
    return generation
  }

  private func invalidateStartGeneration() {
    generationLock.lock()
    startGeneration += 1
    generationLock.unlock()
  }

  private func isCurrentStart(_ generation: Int) -> Bool {
    generationLock.lock()
    defer { generationLock.unlock() }
    return startGeneration == generation
  }

  private func currentStartGeneration() -> Int {
    generationLock.lock()
    defer { generationLock.unlock() }
    return startGeneration
  }

  /// Atomic compare-and-invalidate: a newer start that minted between a
  /// separate check and increment must survive the stale stop.
  private func invalidateIfCurrent(_ generation: Int) -> Bool {
    generationLock.lock()
    defer { generationLock.unlock() }
    guard startGeneration == generation else {
      return false
    }
    startGeneration += 1
    return true
  }

  private func ensureCurrentStart(_ generation: Int) throws {
    guard isCurrentStart(generation) else {
      throw cameraException(
        name: "CameraCancelled",
        description: "The capture was cancelled.",
        code: "ERR_CAMERA_CANCELLED"
      )
    }
  }

  private func checkStart(_ generation: Int) throws {
    guard isCurrentStart(generation) else {
      throw cameraException(
        name: "CameraCancelled",
        description: "The camera start was cancelled.",
        code: "ERR_CAMERA_CANCELLED"
      )
    }
    guard appIsActive() else {
      throw cameraException(
        name: "CameraUnavailable",
        description: "The app is not active; the camera cannot start in the background.",
        code: "ERR_CAMERA_INACTIVE"
      )
    }
  }

  private func appIsActive() -> Bool {
    if Thread.isMainThread {
      return UIApplication.shared.applicationState == .active
    }
    return DispatchQueue.main.sync {
      UIApplication.shared.applicationState == .active
    }
  }

  private func startRunning(_ generation: Int) throws -> Bool {
    var attempts = 0
    while !session.isRunning, attempts < 3 {
      try checkStart(generation)
      if attempts > 0 {
        Thread.sleep(forTimeInterval: 0.2)
      }
      session.startRunning()
      attempts += 1
    }
    return session.isRunning
  }

  /// Replaces the capture session when it is unrecoverable. The preview layer
  /// must be re-pointed at the new session on the main thread.
  func setTorch(_ enabled: Bool) {
    stateLock.lock()
    torchEnabled = enabled
    stateLock.unlock()
    applyTorch()
  }

  private func applyTorch() {
    sessionQueue.async {
      self.stateLock.lock()
      let enabled = self.torchEnabled
      self.stateLock.unlock()
      guard let device = self.device, device.hasTorch, device.isTorchAvailable else {
        return
      }
      guard (try? device.lockForConfiguration()) != nil else {
        return
      }
      // Torch follows the live session: never light it while the camera is off.
      device.torchMode = enabled && self.session.isRunning ? .on : .off
      device.unlockForConfiguration()
    }
  }

  func stop() async {
    invalidateStartGeneration()
    await stopSession(generation: nil)
  }

  /// Stops only the session belonging to `generation`. A start that raced a
  /// stop and minted a newer generation after it is still torn down, while a
  /// genuinely newer hold's session is left alone. The check runs on the
  /// session queue, serialized with the start block.
  func stopIfCurrent(generation: Int) async {
    await stopSession(generation: generation)
  }

  private func stopSession(generation: Int?) async {
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      sessionQueue.async {
        if let generation {
          guard self.invalidateIfCurrent(generation) else {
            continuation.resume()
            return
          }
        }
        self.wantsCamera = false
        if let device = self.device, device.hasTorch, device.isTorchAvailable {
          if (try? device.lockForConfiguration()) != nil {
            device.torchMode = .off
            device.unlockForConfiguration()
          }
        }
        self.session.stopRunning()
        self.replaceLatestSampleBuffer(nil)
        continuation.resume()
      }
    }
  }

  func status() async -> [String: Any] {
    await withCheckedContinuation { (continuation: CheckedContinuation<[String: Any], Never>) in
      sessionQueue.async {
        let authorized = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        let adjustingFocus = self.device?.isAdjustingFocus ?? false
        let adjustingExposure = self.device?.isAdjustingExposure ?? false
        let running = self.session.isRunning
        continuation.resume(returning: [
          "authorized": authorized,
          "running": running,
          "hasDevice": self.device != nil,
          "adjustingFocus": adjustingFocus,
          "adjustingExposure": adjustingExposure,
          "settled": authorized && running && !adjustingFocus && !adjustingExposure
        ])
      }
    }
  }

  // MARK: - Capture

  func captureFrame(
    crop: CropRect? = nil,
    generation token: Int? = nil
  ) async throws -> CapturedFrame {
    let generation = token ?? currentStartGeneration()
    try ensureCurrentStart(generation)
    // Re-focus and re-expose at the reticle center, then take a fresh frame.
    // The auto arm can fire while AF is still settling; this gives every
    // capture a dedicated, sharp frame instead of whatever was on screen.
    await prepareForCapture(generation: generation)
    try ensureCurrentStart(generation)
    // Give the one-shot AF/AE a moment to settle before sampling.
    await waitForSettledDevice(timeout: 0.45)
    try ensureCurrentStart(generation)

    // Burst three frames and keep the sharpest: a single frame can land while
    // focus or the hand is still moving.
    var best: (buffer: CMSampleBuffer, score: Float)?
    for index in 0..<3 {
      try ensureCurrentStart(generation)
      replaceLatestSampleBuffer(nil)
      guard let candidate = await waitForSampleBuffer(timeout: 1.0) else {
        break
      }
      guard let buffer = CMSampleBufferGetImageBuffer(candidate) else {
        continue
      }
      let score = sharpnessScore(
        buffer,
        cropRect: imageCropRect(for: crop, pixelBuffer: buffer)
      )
      if best == nil || score > best!.score {
        best = (candidate, score)
      }
    }

    guard let sampleBuffer = best?.buffer else {
      throw cameraException(
        name: "NoFrame",
        description: "The camera did not deliver a frame in time.",
        code: "ERR_NO_FRAME"
      )
    }

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      throw cameraException(
        name: "NoFrame",
        description: "The captured frame had no image buffer.",
        code: "ERR_NO_FRAME"
      )
    }

    let cropRect = imageCropRect(for: crop, pixelBuffer: pixelBuffer)
    // Validate and stop on the session queue: a capture cancelled by leaving
    // the screen must never stop the session a newer hold has just started.
    let accepted = await withCheckedContinuation {
      (continuation: CheckedContinuation<Bool, Never>) in
      sessionQueue.async {
        guard self.isCurrentStart(generation) else {
          continuation.resume(returning: false)
          return
        }
        self.stateLock.lock()
        self.lastCapture = (pixelBuffer, cropRect, nil)
        self.stateLock.unlock()
        // The frame is retained; power the sensor down before JPEG/OCR/
        // translation so the camera is not streaming after the user released.
        self.session.stopRunning()
        continuation.resume(returning: true)
      }
    }
    guard accepted else {
      throw cameraException(
        name: "CameraCancelled",
        description: "The capture was cancelled.",
        code: "ERR_CAMERA_CANCELLED"
      )
    }
    // Encode after the sensor is off; the frame is already retained for OCR.
    let jpeg = makePreviewJPEG(pixelBuffer: pixelBuffer, cropRect: cropRect)
    if jpeg != nil {
      stateLock.lock()
      if let current = lastCapture, CFEqual(current.buffer, pixelBuffer) {
        lastCapture = (current.buffer, current.crop, jpeg)
      }
      stateLock.unlock()
    }
    return CapturedFrame(
      sampleBuffer: sampleBuffer,
      previewJpegBase64: jpeg,
      cropRect: cropRect
    )
  }

  /// Re-run OCR on the frozen frame with a user-chosen source language.
  func recognizeLast(language: String) throws -> [String: Any] {
    stateLock.lock()
    let capture = lastCapture
    stateLock.unlock()
    guard let capture else {
      throw cameraException(
        name: "NoFrame",
        description: "No captured frame is available to re-read.",
        code: "ERR_NO_FRAME"
      )
    }
    return try TextRecognizer.recognize(
      pixelBuffer: capture.buffer,
      previewJpegBase64: capture.jpeg,
      languageHint: language,
      cropRect: capture.crop
    )
  }

  func updatePreviewSize(_ size: CGSize) {
    stateLock.lock()
    previewViewSize = size
    stateLock.unlock()
  }

  private func imageCropRect(
    for crop: CropRect?,
    pixelBuffer: CVPixelBuffer
  ) -> CGRect? {
    guard let crop, crop.width > 0, crop.height > 0 else {
      return nil
    }

    stateLock.lock()
    let viewSize = previewViewSize
    stateLock.unlock()

    guard viewSize.width > 0, viewSize.height > 0 else {
      return nil
    }

    // The upright image is the landscape buffer rotated right.
    let uprightWidth = CGFloat(CVPixelBufferGetHeight(pixelBuffer))
    let uprightHeight = CGFloat(CVPixelBufferGetWidth(pixelBuffer))
    guard uprightWidth > 0, uprightHeight > 0 else {
      return nil
    }

    // The preview layer is resizeAspectFill; map the reticle's view rect
    // through the same scale and center crop before OCR.
    let scale = max(viewSize.width / uprightWidth, viewSize.height / uprightHeight)
    let displayWidth = uprightWidth * scale
    let displayHeight = uprightHeight * scale
    let offsetX = (displayWidth - viewSize.width) / 2
    let offsetY = (displayHeight - viewSize.height) / 2

    let viewRect = CGRect(
      x: CGFloat(crop.x) * viewSize.width,
      y: CGFloat(crop.y) * viewSize.height,
      width: CGFloat(crop.width) * viewSize.width,
      height: CGFloat(crop.height) * viewSize.height
    )
    let imageRect = CGRect(
      x: (viewRect.minX + offsetX) / scale,
      y: (viewRect.minY + offsetY) / scale,
      width: viewRect.width / scale,
      height: viewRect.height / scale
    )
    let clipped = imageRect.intersection(
      CGRect(x: 0, y: 0, width: uprightWidth, height: uprightHeight)
    )
    guard !clipped.isNull else {
      return nil
    }
    // CoreImage's origin is bottom-left; the reticle is reported top-left.
    return CGRect(
      x: clipped.minX,
      y: uprightHeight - clipped.maxY,
      width: clipped.width,
      height: clipped.height
    )
  }

  private static let sharpnessContext = CIContext(
    options: [.useSoftwareRenderer: false]
  )

  private func sharpnessScore(
    _ pixelBuffer: CVPixelBuffer,
    cropRect: CGRect?
  ) -> Float {
    var image = CIImage(cvPixelBuffer: pixelBuffer).oriented(.right)
    if let cropRect {
      image = image.cropped(to: cropRect)
    }
    let gray = image.applyingFilter("CIColorControls", parameters: [
      kCIInputSaturationKey: 0,
    ])
    let edges = gray.applyingFilter("CIEdges", parameters: [
      kCIInputIntensityKey: 1.0,
    ])
    let average = edges.applyingFilter("CIAreaAverage", parameters: [
      kCIInputExtentKey: CIVector(cgRect: edges.extent),
    ])
    var pixel = [UInt8](repeating: 0, count: 4)
    CameraController.sharpnessContext.render(
      average,
      toBitmap: &pixel,
      rowBytes: 4,
      bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
      format: .RGBA8,
      colorSpace: CGColorSpaceCreateDeviceRGB()
    )
    return Float(pixel[0]) + Float(pixel[1]) + Float(pixel[2])
  }

  private func waitForSettledDevice(timeout: TimeInterval) async {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      let adjusting = sessionQueue.sync {
        guard let device = self.device else {
          return false
        }
        return device.isAdjustingFocus || device.isAdjustingExposure
      }
      if !adjusting {
        return
      }
      try? await Task.sleep(nanoseconds: 30_000_000)
    }
  }

  private func prepareForCapture(generation: Int) async {
    sessionQueue.async {
      guard self.isCurrentStart(generation) else {
        return
      }
      guard let device = self.device else {
        return
      }
      guard (try? device.lockForConfiguration()) != nil else {
        return
      }
      if device.isFocusPointOfInterestSupported {
        device.focusPointOfInterest = CGPoint(x: 0.5, y: 0.5)
      }
      if device.isExposurePointOfInterestSupported {
        device.exposurePointOfInterest = CGPoint(x: 0.5, y: 0.5)
      }
      if device.isFocusModeSupported(.autoFocus) {
        device.focusMode = .autoFocus
      }
      if device.isExposureModeSupported(.autoExpose) {
        device.exposureMode = .autoExpose
      }
      device.unlockForConfiguration()
    }

    let deadline = Date().addingTimeInterval(1.2)
    while Date() < deadline {
      let ready = sessionQueue.sync { () -> Bool in
        guard self.session.isRunning, let device = self.device else {
          return false
        }
        return !device.isAdjustingFocus && !device.isAdjustingExposure
      }
      if ready {
        return
      }
      try? await Task.sleep(nanoseconds: 50_000_000)
    }
  }

  // MARK: - Preview sink

  func attach(_ view: EcoCameraView) {
    stateLock.lock()
    previewSink = view
    stateLock.unlock()
  }

  func detach(_ view: EcoCameraView) {
    stateLock.lock()
    if previewSink === view {
      previewSink = nil
    }
    stateLock.unlock()
  }

  private func notifyPreviewRotation() {
    stateLock.lock()
    let sink = previewSink
    stateLock.unlock()

    guard let sink else {
      return
    }
    DispatchQueue.main.async {
      sink.updatePreviewRotation()
    }
  }

  // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    replaceLatestSampleBuffer(sampleBuffer)
  }

  // MARK: - Session configuration

  private func ensureCameraPermission() async throws {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      return
    case .notDetermined:
      let granted = await AVCaptureDevice.requestAccess(for: .video)
      if !granted {
        throw cameraException(
          name: "CameraPermissionDenied",
          description: "Camera access was denied. Enable it in Settings.",
          code: "ERR_CAMERA_PERMISSION_DENIED"
        )
      }
    default:
      throw cameraException(
        name: "CameraPermissionDenied",
        description: "Camera access was denied. Enable it in Settings.",
        code: "ERR_CAMERA_PERMISSION_DENIED"
      )
    }
  }

  private func configureIfNeeded() throws {
    if configured {
      return
    }

    guard
      let device = AVCaptureDevice.default(
        .builtInWideAngleCamera,
        for: .video,
        position: .back
      )
    else {
      throw cameraException(
        name: "CameraUnavailable",
        description: "No back camera is available on this device.",
        code: "ERR_CAMERA_UNAVAILABLE"
      )
    }

    configureDevice(device)

    let input: AVCaptureDeviceInput
    do {
      input = try AVCaptureDeviceInput(device: device)
    } catch {
      throw cameraException(
        name: "CameraUnavailable",
        description: "The camera input could not be created.",
        code: "ERR_CAMERA_UNAVAILABLE"
      )
    }

    let output = AVCaptureVideoDataOutput()
    output.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String:
        kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
    ]
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: videoQueue)

    session.beginConfiguration()
    defer { session.commitConfiguration() }

    session.sessionPreset = .hd1280x720

    guard session.canAddInput(input) else {
      throw cameraException(
        name: "CameraUnavailable",
        description: "The camera input could not be added.",
        code: "ERR_CAMERA_UNAVAILABLE"
      )
    }
    session.addInput(input)

    guard session.canAddOutput(output) else {
      session.removeInput(input)
      throw cameraException(
        name: "CameraUnavailable",
        description: "The video data output could not be added.",
        code: "ERR_CAMERA_UNAVAILABLE"
      )
    }
    session.addOutput(output)

    self.device = device
    self.videoOutput = output
    self.configured = true
    if session.isMultitaskingCameraAccessSupported {
      session.isMultitaskingCameraAccessEnabled = true
    }
    NSLog(
      "[NoirLens] multitasking camera: supported=%d enabled=%d",
      session.isMultitaskingCameraAccessSupported ? 1 : 0,
      session.isMultitaskingCameraAccessEnabled ? 1 : 0
    )
    self.observeSession(session)
    self.notifyPreviewRotation()
  }

  private func configureDevice(_ device: AVCaptureDevice) {
    guard (try? device.lockForConfiguration()) != nil else {
      return
    }
    defer { device.unlockForConfiguration() }

    if device.isFocusModeSupported(.continuousAutoFocus) {
      device.focusMode = .continuousAutoFocus
    }
    if device.isExposureModeSupported(.continuousAutoExposure) {
      device.exposureMode = .continuousAutoExposure
    }
    if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
      device.whiteBalanceMode = .continuousAutoWhiteBalance
    }

    // Scene-change monitoring and low-light boost keep the ISP awake between
    // frames; neither is useful for a single-frame read.
    device.isSubjectAreaChangeMonitoringEnabled = false

    if device.activeFormat.isVideoHDRSupported {
      device.automaticallyAdjustsVideoHDREnabled = false
      device.isVideoHDREnabled = false
    }

    // Cap preview/capture frames at 30 fps; scores and stills do not need 60.
    let supports30 = device.activeFormat.videoSupportedFrameRateRanges.contains {
      $0.minFrameRate <= 30 && $0.maxFrameRate >= 30
    }
    if supports30 {
      let duration = CMTime(value: 1, timescale: 30)
      device.activeVideoMinFrameDuration = duration
      device.activeVideoMaxFrameDuration = duration
    }
  }

  // MARK: - Frame buffer plumbing

  private func replaceLatestSampleBuffer(_ buffer: CMSampleBuffer?) {
    stateLock.lock()
    latestSampleBuffer = buffer
    stateLock.unlock()
  }

  private func currentSampleBuffer() -> CMSampleBuffer? {
    stateLock.lock()
    let buffer = latestSampleBuffer
    stateLock.unlock()
    return buffer
  }

  private func waitForSampleBuffer(timeout: TimeInterval) async -> CMSampleBuffer? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if let buffer = currentSampleBuffer() {
        return buffer
      }
      try? await Task.sleep(nanoseconds: 25_000_000)
    }
    return currentSampleBuffer()
  }

  private func makePreviewJPEG(
    pixelBuffer: CVPixelBuffer,
    cropRect: CGRect?
  ) -> String? {
    let upright = CIImage(cvPixelBuffer: pixelBuffer).oriented(.right)
    let cropped = cropRect.map { upright.cropped(to: $0) } ?? upright
    guard let cgImage = ciContext.createCGImage(cropped, from: cropped.extent) else {
      return nil
    }
    guard let data = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.55) else {
      return nil
    }
    return data.base64EncodedString()
  }
}

func cameraException(name: String, description: String, code: String) -> Exception {
  Exception(name: name, description: description, code: code)
}
