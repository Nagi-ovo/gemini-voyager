import Foundation
import GoogleSignIn
import SafariServices

final class NativeDiagnosticsService {
  func collect(
    appDelegate: AppDelegate,
    completion: @escaping (VoyagerDiagnosticsSnapshot) -> Void
  ) {
    let automaticUpdatesEnabled = appDelegate.automaticUpdatesEnabled
    let canCheckForUpdates = appDelegate.canCheckForUpdates

    SFSafariExtensionManager.getStateOfSafariExtension(
      withIdentifier: extensionBundleIdentifier
    ) { state, error in
      let extensionEnabled = error == nil ? state?.isEnabled : nil
      let extensionReady = extensionEnabled == true
      let googleDriveConnected = GIDSignIn.sharedInstance.hasPreviousSignIn()

      let items = [
        VoyagerDiagnosticItem(
          id: "extension",
          label: "Safari extension",
          value: extensionEnabled.map { $0 ? "Enabled" : "Disabled" } ?? "Unavailable",
          detail: extensionReady
            ? "Voyager is available in Safari."
            : "Open Safari Extensions and enable Voyager.",
          level: extensionReady ? .ready : .attention
        ),
        VoyagerDiagnosticItem(
          id: "notifications",
          label: "Native notifications",
          value: extensionReady ? "In popup" : "Unavailable",
          detail: "Notification permission is managed from the Voyager popup.",
          level: extensionReady ? .neutral : .attention
        ),
        VoyagerDiagnosticItem(
          id: "icloud",
          label: "iCloud bridge",
          value: extensionReady ? "On demand" : "Unavailable",
          detail: "Account availability is checked when iCloud is selected in Voyager.",
          level: extensionReady ? .neutral : .attention
        ),
        VoyagerDiagnosticItem(
          id: "google-drive",
          label: "Google Drive",
          value: googleDriveConnected ? "Connected" : "Not connected",
          detail: googleDriveConnected
            ? "The native Google session can be reused by Safari."
            : "Connect from the Voyager popup when you need cloud sync.",
          level: googleDriveConnected ? .ready : .neutral
        ),
        VoyagerDiagnosticItem(
          id: "updates",
          label: "Updates",
          value: automaticUpdatesEnabled ? "Automatic" : "Manual",
          detail: canCheckForUpdates
            ? "Update checks are available."
            : "The updater is still starting.",
          level: canCheckForUpdates ? .ready : .neutral
        ),
      ]

      completion(VoyagerDiagnosticsSnapshot(items: items))
    }
  }
}
