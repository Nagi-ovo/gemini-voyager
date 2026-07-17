import CloudKit
import Foundation
import UserNotifications

enum VoyagerICloudFailureCode: String, Codable {
  case accountUnavailable = "icloud_account_unavailable"
  case conflict = "icloud_conflict"
  case invalidPayload = "icloud_invalid_payload"
  case temporarilyUnavailable = "icloud_temporarily_unavailable"
}

struct VoyagerICloudFailure: LocalizedError, Equatable {
  let code: VoyagerICloudFailureCode
  let message: String
  let retryAfterMilliseconds: Int?

  var errorDescription: String? { message }

  static let accountUnavailable = VoyagerICloudFailure(
    code: .accountUnavailable,
    message: "iCloud is unavailable. Sign in to iCloud in System Settings.",
    retryAfterMilliseconds: nil
  )

  static let invalidPayload = VoyagerICloudFailure(
    code: .invalidPayload,
    message: "The iCloud sync file is invalid.",
    retryAfterMilliseconds: nil
  )

  static func conflict(fileName: String) -> VoyagerICloudFailure {
    VoyagerICloudFailure(
      code: .conflict,
      message:
        "\(fileName) changed on another device. Download and merge before uploading again.",
      retryAfterMilliseconds: nil
    )
  }

  static func temporarilyUnavailable(retryAfter seconds: TimeInterval?)
    -> VoyagerICloudFailure
  {
    VoyagerICloudFailure(
      code: .temporarilyUnavailable,
      message: "iCloud is temporarily unavailable. Try again shortly.",
      retryAfterMilliseconds: seconds.map { max(0, Int(($0 * 1_000).rounded())) }
    )
  }
}

enum VoyagerICloudFailureMapper {
  static func map(error: Error, fileName: String? = nil) -> Error {
    guard let cloudError = primaryCloudKitError(from: error) else { return error }

    switch cloudError.code {
    case .serverRecordChanged:
      return VoyagerICloudFailure.conflict(fileName: fileName ?? "The iCloud sync file")
    case .notAuthenticated:
      return VoyagerICloudFailure.accountUnavailable
    case .requestRateLimited, .serviceUnavailable, .zoneBusy:
      let retryAfter = (cloudError.userInfo[CKErrorRetryAfterKey] as? NSNumber)?.doubleValue
      return VoyagerICloudFailure.temporarilyUnavailable(retryAfter: retryAfter)
    default:
      return error
    }
  }

  static func primaryCloudKitError(from error: Error?) -> CKError? {
    guard let cloudError = error as? CKError else { return nil }
    guard cloudError.code == .partialFailure,
      let nestedError = cloudError.partialErrorsByItemID?.values.first
    else { return cloudError }

    return primaryCloudKitError(from: nestedError) ?? cloudError
  }
}

enum VoyagerGoogleDriveFailureCode: String, Codable {
  case authRequired = "drive_auth_required"
  case notFound = "drive_not_found"
  case rateLimited = "drive_rate_limited"
  case temporarilyUnavailable = "drive_temporarily_unavailable"
}

struct VoyagerGoogleDriveFailure: LocalizedError, Equatable {
  let code: VoyagerGoogleDriveFailureCode
  let message: String
  let retryAfterMilliseconds: Int?

  var errorDescription: String? { message }

  static let authRequired = VoyagerGoogleDriveFailure(
    code: .authRequired,
    message: "Google Drive access must be authorized again. Open Voyager to reconnect.",
    retryAfterMilliseconds: nil
  )

  static let notFound = VoyagerGoogleDriveFailure(
    code: .notFound,
    message: "The Google Drive file no longer exists.",
    retryAfterMilliseconds: nil
  )

  static func rateLimited(retryAfter seconds: TimeInterval?) -> VoyagerGoogleDriveFailure {
    VoyagerGoogleDriveFailure(
      code: .rateLimited,
      message: "Google Drive is rate limiting requests. Try again shortly.",
      retryAfterMilliseconds: seconds.map { max(0, Int(($0 * 1_000).rounded())) }
    )
  }

  static func temporarilyUnavailable(statusCode: Int) -> VoyagerGoogleDriveFailure {
    VoyagerGoogleDriveFailure(
      code: .temporarilyUnavailable,
      message: "Google Drive is temporarily unavailable (\(statusCode)). Try again shortly.",
      retryAfterMilliseconds: nil
    )
  }
}

enum VoyagerGoogleDriveHTTPFailureMapper {
  /// Maps a Drive REST status to a structured failure, or nil when the status
  /// carries no reliable semantics (callers keep their generic error).
  /// 403 is ambiguous (revoked permission vs. rate limit vs. storage quota),
  /// so it is only mapped when the response body confirms rate limiting.
  static func map(
    statusCode: Int,
    retryAfterSeconds: TimeInterval? = nil,
    bodyHint: String? = nil
  ) -> VoyagerGoogleDriveFailure? {
    switch statusCode {
    case 200..<300:
      return nil
    case 401:
      return .authRequired
    case 403:
      let hint = bodyHint?.lowercased() ?? ""
      if hint.contains("ratelimit") || hint.contains("dailylimitexceeded") {
        return .rateLimited(retryAfter: retryAfterSeconds)
      }
      return nil
    case 404:
      return .notFound
    case 429:
      return .rateLimited(retryAfter: retryAfterSeconds)
    case 500..<600:
      return .temporarilyUnavailable(statusCode: statusCode)
    default:
      return nil
    }
  }
}

enum VoyagerICloudRecordIdentity {
  static func recordName(for fileName: String) -> String {
    let encoded = Data(fileName.utf8).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
    return "file-\(encoded)"
  }
}

struct VoyagerNotificationDestination: Equatable {
  static let userInfoKey = "voyagerConversationURL"
  static let categoryIdentifier = "voyager.response-complete"
  static let openActionIdentifier = "voyager.open-conversation"

  private static let allowedHosts = [
    "gemini.google.com",
    "aistudio.google.com",
    "chatgpt.com",
    "claude.ai",
  ]

  let url: URL

  init?(rawValue: String) {
    guard let url = URL(string: rawValue),
      url.scheme == "https",
      let host = url.host?.lowercased(),
      Self.allowedHosts.contains(where: { host == $0 || host.hasSuffix(".\($0)") })
    else { return nil }

    self.url = url
  }

  init?(userInfo: [AnyHashable: Any]) {
    guard let rawValue = userInfo[Self.userInfoKey] as? String else { return nil }
    self.init(rawValue: rawValue)
  }

  var userInfo: [AnyHashable: Any] {
    [Self.userInfoKey: url.absoluteString]
  }

  static let openConversationMessageName = "gvOpenConversation"

  var dispatchUserInfo: [String: Any] {
    [
      "type": Self.openConversationMessageName,
      "url": url.absoluteString,
    ]
  }

  static func notificationCategory() -> UNNotificationCategory {
    let openAction = UNNotificationAction(
      identifier: openActionIdentifier,
      title: "Open Conversation",
      options: [.foreground]
    )
    return UNNotificationCategory(
      identifier: categoryIdentifier,
      actions: [openAction],
      intentIdentifiers: [],
      options: []
    )
  }
}

enum VoyagerDiagnosticLevel: String, Codable {
  case ready
  case attention
  case neutral
}

struct VoyagerDiagnosticItem: Codable, Equatable {
  let id: String
  let label: String
  let value: String
  let detail: String
  let level: VoyagerDiagnosticLevel
}

struct VoyagerDiagnosticsSnapshot: Codable, Equatable {
  let items: [VoyagerDiagnosticItem]
}
