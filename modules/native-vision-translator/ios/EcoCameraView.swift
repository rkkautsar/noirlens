import AVFoundation
import ExpoModulesCore
import UIKit

/**
 Full-screen camera surface with two render modes:

 - `ecoMode == true`: a luma-edge HUD in warm white over pure black. The
   preview layer is hidden; CoreImage's edge pass runs at 15fps on the video
   queue, so the OLED only lights the outlines.
 - `ecoMode == false`: the normal color preview from `AVCaptureVideoPreviewLayer`.

 The view never owns the capture session; `CameraController` powers it up and
 down from the JS state machine.
 */
class EcoCameraView: ExpoView {
  private let previewLayer: AVCaptureVideoPreviewLayer
  private let dimLayer = CALayer()
  private let scanlines = CAReplicatorLayer()
  private let scanline = CALayer()

  var ecoMode: Bool = false {
    didSet {
      applyMode()
    }
  }

  required init(appContext: AppContext? = nil) {
    previewLayer = AVCaptureVideoPreviewLayer(session: CameraController.shared.currentSession())
    super.init(appContext: appContext)

    backgroundColor = .black
    clipsToBounds = true
    isUserInteractionEnabled = false

    previewLayer.videoGravity = .resizeAspectFill
    previewLayer.backgroundColor = UIColor.black.cgColor

    // Noir mode dims the live preview and lays CRT scanlines over it instead
    // of running a per-frame edge filter: cheaper on the CPU/GPU, and the
    // OLED still only emits a fraction of the full-brightness frame.
    dimLayer.backgroundColor = UIColor(white: 0, alpha: 0.72).cgColor
    dimLayer.isHidden = true
    scanline.backgroundColor = UIColor(white: 0, alpha: 0.55).cgColor
    scanlines.addSublayer(scanline)
    scanlines.instanceTransform = CATransform3DMakeTranslation(0, 3, 0)
    scanlines.isHidden = true

    layer.addSublayer(previewLayer)
    layer.addSublayer(dimLayer)
    layer.addSublayer(scanlines)

    CameraController.shared.attach(self)
    applyMode()
  }

  override func layoutSubviews() {
    super.layoutSubviews()

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    previewLayer.frame = bounds
    dimLayer.frame = bounds
    scanlines.frame = bounds
    scanline.frame = CGRect(x: 0, y: 0, width: bounds.width, height: 1)
    scanlines.instanceCount = max(1, Int(ceil(bounds.height / 3)))
    CATransaction.commit()

    CameraController.shared.updatePreviewSize(bounds.size)
    updatePreviewRotation()
  }

  func updateSession(_ session: AVCaptureSession) {
    if previewLayer.session !== session {
      previewLayer.session = session
    }
    updatePreviewRotation()
  }

  func updatePreviewRotation() {
    guard
      let connection = previewLayer.connection,
      connection.isVideoRotationAngleSupported(90)
    else {
      return
    }
    if connection.videoRotationAngle != 90 {
      connection.videoRotationAngle = 90
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      CameraController.shared.detach(self)
    } else {
      CameraController.shared.attach(self)
      updateSession(CameraController.shared.currentSession())
      CameraController.shared.setEcoMode(ecoMode)
      updatePreviewRotation()
    }
  }

  func displayEdges(_: CGImage) {
    // The edge HUD was replaced by a dim overlay; keep the bridge symbol for
    // compatibility but do nothing with per-frame edge images.
  }

  private func applyMode() {
    previewLayer.isHidden = false
    dimLayer.isHidden = !ecoMode
    scanlines.isHidden = !ecoMode
    // The controller's CoreImage edge pass stays disabled: overlay mode needs
    // no per-frame processing.
    CameraController.shared.setEcoMode(false)
  }
}
