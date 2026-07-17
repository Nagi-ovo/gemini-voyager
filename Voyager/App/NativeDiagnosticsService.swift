import Foundation
import GoogleSignIn
import SafariServices

final class NativeDiagnosticsService {
  private let googleDriveScope = "https://www.googleapis.com/auth/drive.file"

  func collect(
    appDelegate: AppDelegate,
    completion: @escaping (VoyagerDiagnosticsSnapshot) -> Void
  ) {
    let automaticUpdatesEnabled = appDelegate.automaticUpdatesEnabled
    let canCheckForUpdates = appDelegate.canCheckForUpdates
    let lastUpdateCheckDate = appDelegate.lastUpdateCheckDate

    SFSafariExtensionManager.getStateOfSafariExtension(
      withIdentifier: extensionBundleIdentifier
    ) { state, error in
      let extensionEnabled = error == nil ? state?.isEnabled : nil
      let extensionReady = extensionEnabled == true

      self.googleDriveDiagnostic { googleDriveItem in
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
            value: extensionReady ? "Safari managed" : "Unavailable",
            detail: extensionReady
              ? "Safari checks notification authorization before delivery."
              : "Enable the Safari extension before requesting notification access.",
            level: extensionReady ? .neutral : .attention
          ),
          VoyagerDiagnosticItem(
            id: "icloud",
            label: "iCloud bridge",
            value: extensionReady ? "Checked on use" : "Unavailable",
            detail: extensionReady
              ? "The Safari extension verifies CloudKit account status before every sync."
              : "Enable the Safari extension before using iCloud sync.",
            level: extensionReady ? .neutral : .attention
          ),
          googleDriveItem,
          VoyagerDiagnosticItem(
            id: "updates",
            label: "Updates",
            value: automaticUpdatesEnabled ? "Automatic" : "Manual",
            detail: canCheckForUpdates
              ? Self.updatesReadyDetail(lastCheck: lastUpdateCheckDate)
              : "Sparkle is still starting or unavailable.",
            level: canCheckForUpdates ? .ready : .attention
          ),
        ]

        completion(VoyagerDiagnosticsSnapshot(items: items))
      }
    }
  }

  private func googleDriveDiagnostic(
    completion: @escaping (VoyagerDiagnosticItem) -> Void
  ) {
    guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
      !clientID.isEmpty
    else {
      completion(
        googleDriveItem(
          value: "Not configured",
          detail: "Google Sign-In is missing its client configuration.",
          level: .attention
        )
      )
      return
    }

    guard GIDSignIn.sharedInstance.hasPreviousSignIn() else {
      completion(
        googleDriveItem(
          value: "Not connected",
          detail: "Connect Google Drive from the Voyager popup when needed.",
          level: .neutral
        )
      )
      return
    }

    GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
    GIDSignIn.sharedInstance.restorePreviousSignIn { user, _ in
      guard let user else {
        completion(
          self.googleDriveItem(
            value: "Needs sign-in",
            detail: "The saved Google session could not be restored.",
            level: .attention
          )
        )
        return
      }

      user.refreshTokensIfNeeded { refreshedUser, _ in
        guard let refreshedUser else {
          completion(
            self.googleDriveItem(
              value: "Needs sign-in",
              detail: "The Google session could not be refreshed.",
              level: .attention
            )
          )
          return
        }

        guard refreshedUser.grantedScopes?.contains(self.googleDriveScope) == true else {
          completion(
            self.googleDriveItem(
              value: "Reconnect",
              detail: "The saved Google session does not include Drive access.",
              level: .attention
            )
          )
          return
        }

        completion(
          self.googleDriveItem(
            value: "Connected",
            detail: "The native Google session is valid and includes Drive access.",
            level: .ready
          )
        )
      }
    }
  }

  private static func updatesReadyDetail(lastCheck: Date?) -> String {
    guard let lastCheck else {
      return "Sparkle is ready to check for updates. No check has completed yet."
    }
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    formatter.timeStyle = .short
    return "Sparkle is ready to check for updates. Last checked \(formatter.string(from: lastCheck))."
  }

  private func googleDriveItem(
    value: String,
    detail: String,
    level: VoyagerDiagnosticLevel
  ) -> VoyagerDiagnosticItem {
    VoyagerDiagnosticItem(
      id: "google-drive",
      label: "Google Drive",
      value: value,
      detail: detail,
      level: level
    )
  }
}
