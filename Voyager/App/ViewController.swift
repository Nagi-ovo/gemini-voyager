//
//  ViewController.swift
//  Voyager
//
//  Created by Jesse Zhang on 15/05/2026.
//

import Cocoa
import SafariServices
import WebKit

let extensionBundleIdentifier = "com.yourCompany.Gemini-Voyager.Extension"

class ViewController: NSViewController, WKScriptMessageHandler {

  @IBOutlet var webView: WKWebView!
  private let diagnosticsService = NativeDiagnosticsService()
  private var updaterAvailabilityObservation: NSKeyValueObservation?

  override func viewDidLoad() {
    super.viewDidLoad()

    self.webView.configuration.userContentController.add(self, name: "controller")

    self.webView.loadFileURL(
      Bundle.main.url(forResource: "Main", withExtension: "html")!,
      allowingReadAccessTo: Bundle.main.resourceURL!)
  }

  private func updateExtensionState() {
    SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) {
      (state, error) in
      guard let state = state, error == nil else {
        return
      }

      DispatchQueue.main.async {
        if #available(macOS 13, *) {
          self.webView.evaluateJavaScript("show(\(state.isEnabled), true)")
        } else {
          self.webView.evaluateJavaScript("show(\(state.isEnabled), false)")
        }
      }
    }
  }

  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    if message.body as? String == "open-preferences" {
      SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) {
        error in
        DispatchQueue.main.async {
          NSApplication.shared.terminate(nil)
        }
      }
      return
    }

    guard let payload = message.body as? [String: Any],
      let action = payload["action"] as? String,
      let appDelegate = NSApp.delegate as? AppDelegate
    else {
      return
    }

    switch action {
    case "ready":
      observeUpdaterAvailability(appDelegate)
      updateUpdaterControls(appDelegate)
      updateExtensionState()
      updateDiagnostics(appDelegate)
    case "refreshDiagnostics":
      updateExtensionState()
      updateDiagnostics(appDelegate)
    case "setAutomaticUpdates":
      appDelegate.setAutomaticUpdatesEnabled(payload["enabled"] as? Bool == true)
      updateUpdaterControls(appDelegate)
    case "checkForUpdates":
      appDelegate.checkForUpdates(nil)
      updateUpdaterControls(appDelegate)
    default:
      break
    }
  }

  private func updateUpdaterControls(_ appDelegate: AppDelegate) {
    webView.evaluateJavaScript(
      "showUpdateControls(\(appDelegate.automaticUpdatesEnabled), \(appDelegate.canCheckForUpdates))"
    )
  }

  private func observeUpdaterAvailability(_ appDelegate: AppDelegate) {
    guard updaterAvailabilityObservation == nil else { return }
    updaterAvailabilityObservation = appDelegate.observeCanCheckForUpdates {
      [weak self, weak appDelegate] in
      guard let self, let appDelegate else { return }
      self.updateUpdaterControls(appDelegate)
    }
  }

  private func updateDiagnostics(_ appDelegate: AppDelegate) {
    diagnosticsService.collect(appDelegate: appDelegate) { [weak self] snapshot in
      guard let data = try? JSONEncoder().encode(snapshot),
        let json = String(data: data, encoding: .utf8)
      else { return }

      DispatchQueue.main.async {
        self?.webView.evaluateJavaScript("showDiagnostics(\(json))")
      }
    }
  }

}
