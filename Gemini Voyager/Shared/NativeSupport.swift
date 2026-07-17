import CloudKit
import Foundation

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
