import CloudKit
import Foundation

final class ICloudSyncService {
  static let shared = ICloudSyncService()

  private let container = CKContainer(identifier: "iCloud.com.yourCompany.Gemini-Voyager")

  private var database: CKDatabase {
    container.privateCloudDatabase
  }

  func accountStatus(completion: @escaping (Result<Void, Error>) -> Void) {
    container.accountStatus { status, error in
      if let error {
        completion(.failure(error))
      } else if status == .available {
        completion(.success(()))
      } else {
        completion(.failure(ICloudSyncError.accountUnavailable))
      }
    }
  }

  func write(fileName: String, json: String, completion: @escaping (Result<Void, Error>) -> Void) {
    let temporaryURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("voyager-\(UUID().uuidString).json")

    do {
      try Data(json.utf8).write(to: temporaryURL, options: .atomic)
    } catch {
      completion(.failure(error))
      return
    }

    let record = CKRecord(recordType: "VoyagerSyncFile", recordID: recordID(for: fileName))
    record["name"] = fileName as CKRecordValue
    record["payload"] = CKAsset(fileURL: temporaryURL)
    record["updatedAt"] = Date() as CKRecordValue

    let operation = CKModifyRecordsOperation(recordsToSave: [record])
    operation.savePolicy = .allKeys
    operation.modifyRecordsCompletionBlock = { _, _, error in
      try? FileManager.default.removeItem(at: temporaryURL)
      if let error {
        completion(.failure(error))
      } else {
        completion(.success(()))
      }
    }
    database.add(operation)
  }

  func read(fileName: String, completion: @escaping (Result<String?, Error>) -> Void) {
    database.fetch(withRecordID: recordID(for: fileName)) { record, error in
      if let cloudError = error as? CKError, cloudError.code == .unknownItem {
        completion(.success(nil))
        return
      }
      if let error {
        completion(.failure(error))
        return
      }
      guard let asset = record?["payload"] as? CKAsset,
        let fileURL = asset.fileURL
      else {
        completion(.failure(ICloudSyncError.invalidPayload))
        return
      }

      do {
        let data = try Data(contentsOf: fileURL)
        guard let json = String(data: data, encoding: .utf8) else {
          throw ICloudSyncError.invalidPayload
        }
        completion(.success(json))
      } catch {
        completion(.failure(error))
      }
    }
  }

  private func recordID(for fileName: String) -> CKRecord.ID {
    let encoded = Data(fileName.utf8).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
    return CKRecord.ID(recordName: "file-\(encoded)")
  }
}

private enum ICloudSyncError: LocalizedError {
  case accountUnavailable
  case invalidPayload

  var errorDescription: String? {
    switch self {
    case .accountUnavailable:
      return "iCloud is unavailable. Sign in to iCloud in System Settings."
    case .invalidPayload:
      return "The iCloud sync file is invalid."
    }
  }
}
