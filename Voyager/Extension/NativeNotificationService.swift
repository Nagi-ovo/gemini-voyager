import AppKit
import Foundation
import UserNotifications
import os.log

/// Handles permission checks in the Safari extension, then hands notification
/// delivery to the launchable containing app. A Safari `.appex` can schedule
/// notifications but macOS reports `can launch: false` for their responses,
/// so its delegate cannot reliably process a click.
final class NativeNotificationService {
  static let shared = NativeNotificationService()

  private let center = UNUserNotificationCenter.current()
  private let log = OSLog(subsystem: VoyagerNotifLog.subsystem, category: "appex")

  private init() {}

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
    guard
      let notification = VoyagerAppNotification(
        id: id,
        title: title,
        body: body,
        destinationURL: destination?.url.absoluteString
      ), let handoffURL = VoyagerAppLink.deliverNotificationURL(for: notification)
    else {
      completion(.failure(NativeNotificationError.invalidRequest))
      return
    }

    authorizationStatus { status in
      switch status {
      case .authorized, .provisional:
        self.handoff(handoffURL, id: id, completion: completion)
      case .notDetermined:
        self.requestAuthorization { result in
          switch result {
          case .success(true):
            self.handoff(handoffURL, id: id, completion: completion)
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

  private func handoff(
    _ url: URL,
    id: String,
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    os_log(
      .default,
      log: log,
      "appex handing notification to app id=%{public}@",
      id
    )
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = false
    NSWorkspace.shared.open(url, configuration: configuration) { _, error in
      if let error {
        os_log(
          .error,
          log: self.log,
          "appex notification handoff failed: %{public}@",
          error.localizedDescription
        )
        completion(.failure(error))
      } else {
        os_log(.default, log: self.log, "appex notification handoff dispatched")
        completion(.success(()))
      }
    }
  }
}

private enum NativeNotificationError: LocalizedError {
  case invalidRequest
  case permissionDenied
  case unavailable

  var errorDescription: String? {
    switch self {
    case .invalidRequest:
      return "The notification payload is invalid"
    case .permissionDenied:
      return "Notifications are disabled in System Settings"
    case .unavailable:
      return "Notifications are unavailable"
    }
  }
}
