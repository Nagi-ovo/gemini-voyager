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
}
