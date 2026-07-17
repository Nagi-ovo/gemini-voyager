import CloudKit
import XCTest

@testable import VoyagerNativeCore

final class NativeSupportTests: XCTestCase {
  func testCloudRecordNameIsStableAndCloudKitSafe() {
    XCTAssertEqual(
      VoyagerICloudRecordIdentity.recordName(for: "gemini-voyager-prompts.json"),
      "file-Z2VtaW5pLXZveWFnZXItcHJvbXB0cy5qc29u"
    )
    XCTAssertFalse(
      VoyagerICloudRecordIdentity.recordName(for: "folder/账号.json").contains("/")
    )
  }

  func testCloudConflictExplainsRecoveryWithoutAutomaticOverwrite() {
    let failure = VoyagerICloudFailure.conflict(fileName: "prompts.json")

    XCTAssertEqual(failure.code, .conflict)
    XCTAssertNil(failure.retryAfterMilliseconds)
    XCTAssertTrue(failure.localizedDescription.contains("Download and merge"))
  }

  func testCloudRetryDelayUsesMilliseconds() {
    let failure = VoyagerICloudFailure.temporarilyUnavailable(retryAfter: 2.5)

    XCTAssertEqual(failure.code, .temporarilyUnavailable)
    XCTAssertEqual(failure.retryAfterMilliseconds, 2_500)
  }

  func testCloudConflictIsUnwrappedFromPartialFailure() {
    let recordID = CKRecord.ID(recordName: "prompts")
    let conflict = CKError(
      _nsError: NSError(
        domain: CKErrorDomain,
        code: CKError.Code.serverRecordChanged.rawValue
      )
    )
    let partialFailure = CKError(
      _nsError: NSError(
        domain: CKErrorDomain,
        code: CKError.Code.partialFailure.rawValue,
        userInfo: [CKPartialErrorsByItemIDKey: [recordID: conflict]]
      )
    )

    let mapped =
      VoyagerICloudFailureMapper.map(
        error: partialFailure,
        fileName: "prompts.json"
      ) as? VoyagerICloudFailure

    XCTAssertEqual(mapped?.code, .conflict)
    XCTAssertTrue(mapped?.localizedDescription.contains("Download and merge") == true)
  }

  func testNotificationDestinationAcceptsSupportedConversationURLs() {
    let destination = VoyagerNotificationDestination(
      rawValue: "https://gemini.google.com/u/0/app/example"
    )

    XCTAssertEqual(destination?.url.host, "gemini.google.com")
    XCTAssertEqual(
      VoyagerNotificationDestination(userInfo: destination?.userInfo ?? [:]),
      destination
    )
  }

  func testNotificationDestinationRejectsUnsafeURLs() {
    XCTAssertNil(VoyagerNotificationDestination(rawValue: "javascript:alert(1)"))
    XCTAssertNil(VoyagerNotificationDestination(rawValue: "https://example.com/app/example"))
    XCTAssertNil(VoyagerNotificationDestination(rawValue: "http://gemini.google.com/app/example"))
  }

  func testDiagnosticsSnapshotEncodesStableStatusValues() throws {
    let snapshot = VoyagerDiagnosticsSnapshot(items: [
      VoyagerDiagnosticItem(
        id: "extension",
        label: "Safari extension",
        value: "Enabled",
        detail: "Voyager is available in Safari.",
        level: .ready
      )
    ])

    let encoded = try JSONEncoder().encode(snapshot)
    let decoded = try JSONDecoder().decode(VoyagerDiagnosticsSnapshot.self, from: encoded)
    XCTAssertEqual(decoded, snapshot)
  }

  func testNativeMessageDecodesTypedNotificationRequest() throws {
    let request = try VoyagerNativeMessageCodec.decodeRequest(from: [
      "action": "deliverNotification",
      "id": "response-complete",
      "title": "Voyager",
      "body": "The response is ready.",
      "url": "https://gemini.google.com/app/example",
    ])

    XCTAssertEqual(
      request,
      .deliverNotification(
        VoyagerNotificationRequest(
          id: "response-complete",
          title: "Voyager",
          body: "The response is ready.",
          url: "https://gemini.google.com/app/example"
        )
      )
    )
  }

  func testNativeMessageDecodesEverySupportedAction() throws {
    let cases: [([String: Any], VoyagerNativeRequest)] = [
      (["action": "ping"], .ping),
      (["action": "requestNotificationPermission"], .requestNotificationPermission),
      (
        ["action": "googleDriveGetSession", "interactive": true],
        .googleDriveGetSession(interactive: true)
      ),
      (["action": "googleDriveSignOut"], .googleDriveSignOut),
      (
        ["action": "googleDriveFindFile", "fileName": "prompts.json"],
        .googleDriveFindFile(fileName: "prompts.json")
      ),
      (
        [
          "action": "googleDriveEnsureFile",
          "fileName": "prompts.json",
          "cachedFileID": "cached-file",
        ],
        .googleDriveEnsureFile(
          VoyagerGoogleDriveEnsureRequest(
            fileName: "prompts.json",
            cachedFileID: "cached-file"
          )
        )
      ),
      (
        [
          "action": "googleDriveUploadFile",
          "fileID": "drive-file",
          "json": "{}",
        ],
        .googleDriveUploadFile(
          VoyagerGoogleDriveFileRequest(fileID: "drive-file", json: "{}")
        )
      ),
      (
        ["action": "googleDriveDownloadFile", "fileID": "drive-file"],
        .googleDriveDownloadFile(fileID: "drive-file")
      ),
      (["action": "iCloudAccountStatus"], .iCloudAccountStatus),
      (
        ["action": "iCloudWriteFile", "fileName": "prompts.json", "json": "{}"],
        .iCloudWriteFile(VoyagerICloudWriteRequest(fileName: "prompts.json", json: "{}"))
      ),
      (
        ["action": "iCloudReadFile", "fileName": "prompts.json"],
        .iCloudReadFile(fileName: "prompts.json")
      ),
    ]

    for (message, expected) in cases {
      XCTAssertEqual(try VoyagerNativeMessageCodec.decodeRequest(from: message), expected)
    }
  }

  func testNativeMessageRejectsMissingRequiredPayload() {
    XCTAssertThrowsError(
      try VoyagerNativeMessageCodec.decodeRequest(from: [
        "action": "iCloudWriteFile",
        "fileName": "prompts.json",
      ])
    )
  }

  func testNativeResponseKeepsWebExtensionEnvelope() throws {
    let response = VoyagerNativeResponse.success(
      VoyagerICloudReadResponse(json: "{\"version\":1}", found: true)
    )
    let message = try VoyagerNativeMessageCodec.encodeResponse(response)

    XCTAssertEqual(message["success"] as? Bool, true)
    let data = try XCTUnwrap(message["data"] as? [String: Any])
    XCTAssertEqual(data["found"] as? Bool, true)
    XCTAssertEqual(data["json"] as? String, "{\"version\":1}")
  }

  func testNativeFailureKeepsStructuredICloudRecoveryData() throws {
    let response = VoyagerNativeResponse<VoyagerEmptyResponse>.failure(
      VoyagerNativeFailure(
        error: "iCloud is temporarily unavailable.",
        code: "icloud_temporarily_unavailable",
        retryAfterMs: 2_500
      )
    )
    let message = try VoyagerNativeMessageCodec.encodeResponse(response)

    XCTAssertEqual(message["success"] as? Bool, false)
    XCTAssertEqual(message["code"] as? String, "icloud_temporarily_unavailable")
    XCTAssertEqual(message["retryAfterMs"] as? Int, 2_500)
  }
}
