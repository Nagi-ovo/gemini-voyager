import AppKit
import Foundation
import UserNotifications
import os.log

/// Delivers native notifications from the Safari extension process and owns
/// their click handling. macOS routes a UNNotificationResponse to the
/// notification center of the process that scheduled the request
/// (UNUserNotificationCenter.h: the center is per "app or app extension" and
/// "a UNNotificationResponse will be sent to the application" that owns it) —
/// so clicks arrive HERE, never in the containing app's delegate.
/// SafariServices cannot open or message Safari from this process, so the
/// click is handed to the containing app over the gemini-voyager:// URL
/// scheme (the production-proven Google Drive auth channel); the app then
/// asks the extension's background script to focus the conversation tab.
final class NativeNotificationService: NSObject {
  static let shared = NativeNotificationService()

  private let center = UNUserNotificationCenter.current()
  private let log = OSLog(subsystem: VoyagerNotifLog.subsystem, category: "appex")

  override private init() {
    super.init()
    center.delegate = self
    registerCategory()
    os_log(
      .default,
      log: log,
      "appex claimed notification delegate (bundle=%{public}@)",
      Bundle.main.bundleIdentifier ?? "?"
    )
  }

  func requestAuthorization(completion: @escaping (Result<Bool, Error>) -> Void) {
    center.requestAuthorization(options: [.alert, .sound]) { granted, error in
      if let error {
        completion(.failure(error))
      } else {
        completion(.success(granted))
      }
    }
  }

  func authorizationStatus(completion: @escaping (UNAuthorizationStatus) -> Void) {
    center.getNotificationSettings { settings in
      completion(settings.authorizationStatus)
    }
  }

  func deliver(
    id: String,
    title: String,
    body: String,
    destination: VoyagerNotificationDestination?,
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    content.categoryIdentifier = VoyagerNotificationDestination.categoryIdentifier
    if let destination {
      content.userInfo = destination.userInfo
    }

    let request = UNNotificationRequest(
      identifier: id,
      content: content,
      trigger: nil
    )

    os_log(
      .default,
      log: log,
      "appex scheduling notification id=%{public}@ url=%{public}@ (bundle=%{public}@)",
      id,
      destination?.url.absoluteString ?? "none",
      Bundle.main.bundleIdentifier ?? "?"
    )

    authorizationStatus { status in
      switch status {
      case .authorized, .provisional:
        self.add(request, completion: completion)
      case .notDetermined:
        self.requestAuthorization { result in
          switch result {
          case .success(true):
            self.add(request, completion: completion)
          case .success(false):
            completion(.failure(NativeNotificationError.permissionDenied))
          case .failure(let error):
            completion(.failure(error))
          }
        }
      case .denied:
        completion(.failure(NativeNotificationError.permissionDenied))
      @unknown default:
        completion(.failure(NativeNotificationError.unavailable))
      }
    }
  }

  private func add(
    _ request: UNNotificationRequest,
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    center.add(request) { error in
      if let error {
        os_log(
          .error,
          log: self.log,
          "appex notification add failed: %{public}@",
          error.localizedDescription
        )
        completion(.failure(error))
      } else {
        os_log(.default, log: self.log, "appex notification delivered to center")
        completion(.success(()))
      }
    }
  }

  private func registerCategory() {
    center.setNotificationCategories([VoyagerNotificationDestination.notificationCategory()])
  }
}

extension NativeNotificationService: UNUserNotificationCenterDelegate {
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let actionIdentifier = response.actionIdentifier
    os_log(
      .default,
      log: log,
      "appex didReceive action=%{public}@ (bundle=%{public}@)",
      actionIdentifier,
      Bundle.main.bundleIdentifier ?? "?"
    )

    guard
      actionIdentifier == UNNotificationDefaultActionIdentifier
        || actionIdentifier == VoyagerNotificationDestination.openActionIdentifier,
      let destination = VoyagerNotificationDestination(
        userInfo: response.notification.request.content.userInfo
      ),
      let handoffURL = VoyagerAppLink.openConversationURL(for: destination)
    else {
      os_log(
        .default,
        log: log,
        "appex didReceive ignored (unrelated action or missing destination)"
      )
      completionHandler()
      return
    }

    os_log(
      .default,
      log: log,
      "appex handing off click via %{public}@",
      handoffURL.absoluteString
    )

    // SafariServices is inert in this process and NSExtensionContext.open is
    // unsupported at this extension point (and no request context is live at
    // click time). LaunchServices is the supported handoff: it launches the
    // containing app when needed and delivers kAEGetURL to its handler.
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = false
    NSWorkspace.shared.open(handoffURL, configuration: configuration) { _, error in
      if let error {
        os_log(
          .error,
          log: self.log,
          "appex URL-scheme handoff failed: %{public}@",
          error.localizedDescription
        )
      } else {
        os_log(.default, log: self.log, "appex URL-scheme handoff dispatched")
      }
      completionHandler()
    }
  }
}

private enum NativeNotificationError: LocalizedError {
  case permissionDenied
  case unavailable

  var errorDescription: String? {
    switch self {
    case .permissionDenied:
      return "Notifications are disabled in System Settings"
    case .unavailable:
      return "Notifications are unavailable"
    }
  }
}
