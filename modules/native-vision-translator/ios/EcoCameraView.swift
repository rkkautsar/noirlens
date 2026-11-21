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
  private let edgesLayer = CALayer()

  var ecoMode: Bool = false {
    didSet {
      applyMode()
    }
  }

  required init(appContext: AppContext? = nil) {
    previewLayer = AVCaptureVideoPreviewLayer(session: CameraController.shared.session)
    super.init(appContext: appContext)

    backgroundColor = .black
    clipsToBounds = true
    isUserInteractionEnabled = false

    previewLayer.videoGravity = .resizeAspectFill
    previewLayer.backgroundColor = UIColor.black.cgColor

    edgesLayer.backgroundColor = UIColor.black.cgColor
    edgesLayer.contentsGravity = .resizeAspectFill
    edgesLayer.isHidden = true

    layer.addSublayer(previewLayer)
    layer.addSublayer(edgesLayer)

    CameraController.shared.attach(self)
    applyMode()
  }

  override func layoutSubviews() {
    super.layoutSubviews()

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    previewLayer.frame = bounds
    edgesLayer.frame = bounds
    CATransaction.commit()

    CameraController.shared.updatePreviewSize(bounds.size)
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
      CameraController.shared.setEcoMode(ecoMode)
      updatePreviewRotation()
    }
  }

  func displayEdges(_ image: CGImage) {
    guard ecoMode else {
      return
    }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    edgesLayer.contents = image
    CATransaction.commit()
  }

  private func applyMode() {
    previewLayer.isHidden = ecoMode
    edgesLayer.isHidden = !ecoMode
    if !ecoMode {
      edgesLayer.contents = nil
    }
    CameraController.shared.setEcoMode(ecoMode)
  }
}
