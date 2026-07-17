import Foundation
import UserNotifications

/// Delivers native notifications from the Safari extension process. Click
/// handling deliberately lives in the containing app (AppDelegate): the
/// extension process must not claim the notification-center delegate, because
/// SafariServices APIs that open or message Safari are unavailable there.
final class NativeNotificationService {
  static let shared = NativeNotificationService()

  private let center = UNUserNotificationCenter.current()

  private init() {
    registerCategory()
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
        completion(.failure(error))
      } else {
        completion(.success(()))
      }
    }
  }

  private func registerCategory() {
    center.setNotificationCategories([VoyagerNotificationDestination.notificationCategory()])
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
