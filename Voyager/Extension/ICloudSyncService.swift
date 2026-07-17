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
        completion(.failure(VoyagerICloudFailureMapper.map(error: error)))
      } else if status == .available {
        completion(.success(()))
      } else {
        completion(.failure(VoyagerICloudFailure.accountUnavailable))
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

    let recordID = recordID(for: fileName)
    let fetchOperation = CKFetchRecordsOperation(recordIDs: [recordID])
    fetchOperation.desiredKeys = []
    fetchOperation.fetchRecordsCompletionBlock = { records, error in
      if VoyagerICloudFailureMapper.primaryCloudKitError(from: error)?.code == .unknownItem {
        self.save(
          record: CKRecord(recordType: "VoyagerSyncFile", recordID: recordID),
          fileName: fileName,
          temporaryURL: temporaryURL,
          completion: completion
        )
        return
      }
      if let error {
        try? FileManager.default.removeItem(at: temporaryURL)
        completion(.failure(VoyagerICloudFailureMapper.map(error: error, fileName: fileName)))
        return
      }
      let record = records?[recordID]
      guard let record else {
        try? FileManager.default.removeItem(at: temporaryURL)
        completion(.failure(VoyagerICloudFailure.invalidPayload))
        return
      }

      self.save(
        record: record,
        fileName: fileName,
        temporaryURL: temporaryURL,
        completion: completion
      )
    }
    database.add(fetchOperation)
  }

  func read(fileName: String, completion: @escaping (Result<String?, Error>) -> Void) {
    database.fetch(withRecordID: recordID(for: fileName)) { record, error in
      if let cloudError = error as? CKError, cloudError.code == .unknownItem {
        completion(.success(nil))
        return
      }
      if let error {
        completion(.failure(VoyagerICloudFailureMapper.map(error: error, fileName: fileName)))
        return
      }
      guard let asset = record?["payload"] as? CKAsset,
        let fileURL = asset.fileURL
      else {
        completion(.failure(VoyagerICloudFailure.invalidPayload))
        return
      }

      do {
        let data = try Data(contentsOf: fileURL)
        guard let json = String(data: data, encoding: .utf8) else {
          throw VoyagerICloudFailure.invalidPayload
        }
        completion(.success(json))
      } catch {
        completion(.failure(error))
      }
    }
  }

  private func save(
    record: CKRecord,
    fileName: String,
    temporaryURL: URL,
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    record["name"] = fileName as CKRecordValue
    record["payload"] = CKAsset(fileURL: temporaryURL)
    record["updatedAt"] = Date() as CKRecordValue

    let operation = CKModifyRecordsOperation(recordsToSave: [record])
    operation.isAtomic = true
    operation.savePolicy = .ifServerRecordUnchanged
    operation.modifyRecordsCompletionBlock = { _, _, error in
      try? FileManager.default.removeItem(at: temporaryURL)
      if let error {
        completion(.failure(VoyagerICloudFailureMapper.map(error: error, fileName: fileName)))
      } else {
        completion(.success(()))
      }
    }
    database.add(operation)
  }

  private func recordID(for fileName: String) -> CKRecord.ID {
    CKRecord.ID(recordName: VoyagerICloudRecordIdentity.recordName(for: fileName))
  }

}
