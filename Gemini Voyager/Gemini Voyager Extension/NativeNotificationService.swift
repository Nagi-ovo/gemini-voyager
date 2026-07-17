import SafariServices
import UserNotifications

final class NativeNotificationService: NSObject, UNUserNotificationCenterDelegate {
  static let shared = NativeNotificationService()

  private let center = UNUserNotificationCenter.current()

  override private init() {
    super.init()
    center.delegate = self
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

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let actionIdentifier = response.actionIdentifier
    guard
      actionIdentifier == UNNotificationDefaultActionIdentifier
        || actionIdentifier == VoyagerNotificationDestination.openActionIdentifier,
      let destination = VoyagerNotificationDestination(
        userInfo: response.notification.request.content.userInfo
      )
    else {
      completionHandler()
      return
    }

    SFSafariApplication.openWindow(with: destination.url) { _ in
      completionHandler()
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
    let openAction = UNNotificationAction(
      identifier: VoyagerNotificationDestination.openActionIdentifier,
      title: "Open Conversation",
      options: [.foreground]
    )
    let category = UNNotificationCategory(
      identifier: VoyagerNotificationDestination.categoryIdentifier,
      actions: [openAction],
      intentIdentifiers: [],
      options: []
    )
    center.setNotificationCategories([category])
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
