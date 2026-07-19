import Foundation
import GoogleSignIn
import os.log

final class GoogleDriveService {
  static let shared = GoogleDriveService()

  private let scope = "https://www.googleapis.com/auth/drive.file"
  private let apiHost = "www.googleapis.com"
  private var backupFolderID: String?
  private let backupFolderResolutionLock = NSLock()
  private var backupFolderResolutionInFlight = false
  private var backupFolderResolutionWaiters: [
    (Result<String, Error>) -> Void
  ] = []

  enum AuthorizationState {
    case signedIn
    case signedOut
    case requiresAppLaunch
  }

  func authorizationState(
    interactive: Bool,
    completion: @escaping (Result<AuthorizationState, Error>) -> Void
  ) {
    withAccessToken { result in
      switch result {
      case .success:
        completion(.success(.signedIn))
      case .failure(let error as VoyagerGoogleDriveFailure) where error.code == .authRequired:
        completion(.success(interactive ? .requiresAppLaunch : .signedOut))
      case .failure(let error):
        completion(.failure(error))
      }
    }
  }

  func signOut(completion: @escaping (Result<Void, Error>) -> Void) {
    backupFolderID = nil
    guard GIDSignIn.sharedInstance.hasPreviousSignIn() else {
      GIDSignIn.sharedInstance.signOut()
      completion(.success(()))
      return
    }

    GIDSignIn.sharedInstance.disconnect { error in
      if let error {
        os_log(
          .error,
          "Google Drive revocation failed; completing local sign-out: %{public}@",
          error.localizedDescription
        )
        GIDSignIn.sharedInstance.signOut()
      }
      completion(.success(()))
    }
  }

  func findFile(
    named fileName: String,
    completion: @escaping (Result<String?, Error>) -> Void
  ) {
    migrateBackupFolderIfPresent {
      self.findFileInResolvedFolder(named: fileName, completion: completion)
    }
  }

  private func findFileInResolvedFolder(
    named fileName: String,
    completion: @escaping (Result<String?, Error>) -> Void
  ) {
    guard let backupFolderID else {
      findItem(
        named: fileName,
        mimeType: nil,
        fields: "files(id,name)",
        completion: completion
      )
      return
    }

    findItem(
      clauses: [
        "name='\(escapeQueryValue(fileName))'",
        "'\(escapeQueryValue(backupFolderID))' in parents",
        "trashed=false",
      ],
      fields: "files(id,name)"
    ) { scopedResult in
      switch scopedResult {
      case .failure(let error):
        completion(.failure(error))
      case .success(let fileID?):
        completion(.success(fileID))
      case .success(nil):
        // Older versions searched globally and may have left a sync file in a
        // previous folder. Keep one global fallback so it can be recovered and
        // moved into the resolved folder by ensureFile.
        self.findItem(
          named: fileName,
          mimeType: nil,
          fields: "files(id,name)",
          completion: completion
        )
      }
    }
  }

  func ensureFile(
    named fileName: String,
    cachedFileID: String?,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    ensureBackupFolder { folderResult in
      switch folderResult {
      case .failure(let error):
        completion(.failure(error))
      case .success(let folderID):
        self.resolveFile(
          named: fileName,
          cachedFileID: cachedFileID,
          folderID: folderID,
          completion: completion
        )
      }
    }
  }

  func upload(
    fileID: String,
    json: String,
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    performRequest(
      method: "PATCH",
      path: "/upload/drive/v3/files/\(fileID)",
      queryItems: [URLQueryItem(name: "uploadType", value: "media")],
      contentType: "application/json",
      body: Data(json.utf8)
    ) { result in
      switch result {
      case .failure(let error):
        completion(.failure(error))
      case .success(let response):
        guard response.isSuccessful else {
          completion(.failure(self.requestFailure(response)))
          return
        }
        completion(.success(()))
      }
    }
  }

  func download(
    fileID: String,
    completion: @escaping (Result<String?, Error>) -> Void
  ) {
    performRequest(
      method: "GET",
      path: "/drive/v3/files/\(fileID)",
      queryItems: [URLQueryItem(name: "alt", value: "media")]
    ) { result in
      switch result {
      case .failure(let error):
        completion(.failure(error))
      case .success(let response) where response.statusCode == 404:
        completion(.success(nil))
      case .success(let response):
        guard response.isSuccessful,
          let json = String(data: response.data, encoding: .utf8)
        else {
          completion(.failure(self.requestFailure(response)))
          return
        }
        completion(.success(json))
      }
    }
  }

  private func resolveFile(
    named fileName: String,
    cachedFileID: String?,
    folderID: String,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    guard let cachedFileID else {
      findOrCreateFile(named: fileName, folderID: folderID, completion: completion)
      return
    }

    getFileParents(fileID: cachedFileID) { result in
      switch result {
      case .failure(let error):
        completion(.failure(error))
      case .success(nil):
        self.findOrCreateFile(named: fileName, folderID: folderID, completion: completion)
      case .success(let parents?):
        self.moveIfNeeded(fileID: cachedFileID, parents: parents, folderID: folderID) { moveResult in
          switch moveResult {
          case .failure(let error):
            completion(.failure(error))
          case .success:
            completion(.success(cachedFileID))
          }
        }
      }
    }
  }

  private func findOrCreateFile(
    named fileName: String,
    folderID: String,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    findFile(named: fileName) { result in
      switch result {
      case .failure(let error):
        completion(.failure(error))
      case .success(nil):
        self.createItem(
          name: fileName,
          mimeType: "application/json",
          parentID: folderID,
          completion: completion
        )
      case .success(let fileID?):
        self.getFileParents(fileID: fileID) { parentsResult in
          switch parentsResult {
          case .failure(let error):
            completion(.failure(error))
          case .success(nil):
            self.createItem(
              name: fileName,
              mimeType: "application/json",
              parentID: folderID,
              completion: completion
            )
          case .success(let parents?):
            self.moveIfNeeded(fileID: fileID, parents: parents, folderID: folderID) { moveResult in
              switch moveResult {
              case .failure(let error):
                completion(.failure(error))
              case .success:
                completion(.success(fileID))
              }
            }
          }
        }
      }
    }
  }

  private func ensureBackupFolder(
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    backupFolderResolutionLock.lock()
    backupFolderResolutionWaiters.append(completion)
    guard !backupFolderResolutionInFlight else {
      backupFolderResolutionLock.unlock()
      return
    }
    backupFolderResolutionInFlight = true
    backupFolderResolutionLock.unlock()

    resolveBackupFolder { result in
      self.backupFolderResolutionLock.lock()
      let waiters = self.backupFolderResolutionWaiters
      self.backupFolderResolutionWaiters.removeAll()
      self.backupFolderResolutionInFlight = false
      self.backupFolderResolutionLock.unlock()
      waiters.forEach { $0(result) }
    }
  }

  private func resolveBackupFolder(
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    if let backupFolderID {
      itemExists(fileID: backupFolderID) { result in
        switch result {
        case .success(true):
          completion(.success(backupFolderID))
        case .success(false):
          self.backupFolderID = nil
          self.findOrCreateBackupFolder(completion: completion)
        case .failure(let error):
          completion(.failure(error))
        }
      }
      return
    }

    findOrCreateBackupFolder(completion: completion)
  }

  private func findOrCreateBackupFolder(
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    findExistingBackupFolder { result in
      switch result {
      case .failure(let error):
        completion(.failure(error))
      case .success(let folderID?):
        self.backupFolderID = folderID
        completion(.success(folderID))
      case .success(nil):
        self.createItem(
          name: VoyagerGoogleDriveFolderIdentity.currentName,
          mimeType: "application/vnd.google-apps.folder",
          parentID: nil,
          appProperties: [
            VoyagerGoogleDriveFolderIdentity.markerKey:
              VoyagerGoogleDriveFolderIdentity.markerValue
          ]
        ) { createResult in
          if case .success(let folderID) = createResult {
            self.backupFolderID = folderID
          }
          completion(createResult)
        }
      }
    }
  }

  private func migrateBackupFolderIfPresent(completion: @escaping () -> Void) {
    if backupFolderID != nil {
      completion()
      return
    }

    findExistingBackupFolder { result in
      switch result {
      case .success(let folderID?):
        self.backupFolderID = folderID
      case .failure(let error):
        os_log(
          .error,
          "Google Drive folder migration deferred: %{public}@",
          error.localizedDescription
        )
      case .success(nil):
        break
      }
      completion()
    }
  }

  private func findExistingBackupFolder(
    completion: @escaping (Result<String?, Error>) -> Void
  ) {
    findMarkedBackupFolder { markedResult in
      switch markedResult {
      case .failure(let error):
        completion(.failure(error))
      case .success(let folderID?):
        completion(.success(folderID))
      case .success(nil):
        self.findNamedBackupFolders(completion: completion)
      }
    }
  }

  private func findMarkedBackupFolder(
    completion: @escaping (Result<String?, Error>) -> Void
  ) {
    let identity = VoyagerGoogleDriveFolderIdentity.self
    findItem(
      clauses: [
        "appProperties has { key='\(escapeQueryValue(identity.markerKey))' and value='\(escapeQueryValue(identity.markerValue))' }",
        "mimeType='application/vnd.google-apps.folder'",
        "trashed=false",
      ],
      fields: "files(id)"
    ) { result in
      completion(result)
    }
  }

  private func findNamedBackupFolders(
    completion: @escaping (Result<String?, Error>) -> Void
  ) {
    findItem(
      named: VoyagerGoogleDriveFolderIdentity.currentName,
      mimeType: "application/vnd.google-apps.folder",
      fields: "files(id)"
    ) { canonicalResult in
      switch canonicalResult {
      case .failure(let error):
        completion(.failure(error))
      case .success(let folderID?):
        self.markBackupFolder(folderID: folderID, renameLegacyFolder: false) {
          completion(.success(folderID))
        }
      case .success(nil):
        self.findLegacyOrRecoveredBackupFolder(completion: completion)
      }
    }
  }

  private func findLegacyOrRecoveredBackupFolder(
    completion: @escaping (Result<String?, Error>) -> Void
  ) {
    findItem(
      named: VoyagerGoogleDriveFolderIdentity.legacyName,
      mimeType: "application/vnd.google-apps.folder",
      fields: "files(id)"
    ) { legacyResult in
      switch legacyResult {
      case .failure(let error):
        completion(.failure(error))
      case .success(let folderID?):
        self.markBackupFolder(folderID: folderID, renameLegacyFolder: true) {
          completion(.success(folderID))
        }
      case .success(nil):
        self.recoverBackupFolderFromSyncFile(completion: completion)
      }
    }
  }

  private func recoverBackupFolderFromSyncFile(
    completion: @escaping (Result<String?, Error>) -> Void
  ) {
    findItem(
      named: "gemini-voyager-folders.json",
      mimeType: nil,
      fields: "files(id)"
    ) { fileResult in
      switch fileResult {
      case .failure(let error):
        completion(.failure(error))
      case .success(nil):
        completion(.success(nil))
      case .success(let fileID?):
        self.getFileParents(fileID: fileID) { parentsResult in
          switch parentsResult {
          case .failure(let error):
            completion(.failure(error))
          case .success(let parents?):
            guard let folderID = parents.first else {
              completion(.success(nil))
              return
            }
            self.markBackupFolder(folderID: folderID, renameLegacyFolder: false) {
              completion(.success(folderID))
            }
          case .success(nil):
            completion(.success(nil))
          }
        }
      }
    }
  }

  private func markBackupFolder(
    folderID: String,
    renameLegacyFolder: Bool,
    completion: @escaping () -> Void
  ) {
    let metadata = DriveUpdateMetadata(
      name: renameLegacyFolder ? VoyagerGoogleDriveFolderIdentity.currentName : nil,
      appProperties: [
        VoyagerGoogleDriveFolderIdentity.markerKey:
          VoyagerGoogleDriveFolderIdentity.markerValue
      ]
    )

    let body: Data
    do {
      body = try JSONEncoder().encode(metadata)
    } catch {
      os_log(.error, "Google Drive folder metadata encoding failed: %{public}@", error.localizedDescription)
      completion()
      return
    }

    performRequest(
      method: "PATCH",
      path: "/drive/v3/files/\(folderID)",
      queryItems: [URLQueryItem(name: "fields", value: "id,name,appProperties")],
      contentType: "application/json",
      body: body
    ) { result in
      if case .failure(let error) = result {
        os_log(.error, "Google Drive folder migration failed: %{public}@", error.localizedDescription)
      } else if case .success(let response) = result, !response.isSuccessful {
        os_log(.error, "Google Drive folder migration returned HTTP %{public}d", response.statusCode)
      }
      completion()
    }
  }

  private func findItem(
    named name: String,
    mimeType: String?,
    fields: String,
    completion: @escaping (Result<String?, Error>) -> Void
  ) {
    var clauses = ["name='\(escapeQueryValue(name))'", "trashed=false"]
    if let mimeType {
      clauses.insert("mimeType='\(escapeQueryValue(mimeType))'", at: 1)
    }

    findItem(clauses: clauses, fields: fields, completion: completion)
  }

  private func findItem(
    clauses: [String],
    fields: String,
    completion: @escaping (Result<String?, Error>) -> Void
  ) {

    performRequest(
      method: "GET",
      path: "/drive/v3/files",
      queryItems: [
        URLQueryItem(name: "q", value: clauses.joined(separator: " and ")),
        URLQueryItem(name: "fields", value: fields),
        URLQueryItem(name: "pageSize", value: "1"),
      ]
    ) { result in
      completion(
        result.flatMap { response in
          guard response.isSuccessful else {
            return .failure(self.requestFailure(response))
          }
          return Result {
            try JSONDecoder().decode(DriveFileList.self, from: response.data).files.first?.id
          }
        }
      )
    }
  }

  private func createItem(
    name: String,
    mimeType: String,
    parentID: String?,
    appProperties: [String: String]? = nil,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    let metadata = DriveCreateMetadata(
      name: name,
      mimeType: mimeType,
      parents: parentID.map { [$0] },
      appProperties: appProperties
    )

    let body: Data
    do {
      body = try JSONEncoder().encode(metadata)
    } catch {
      completion(.failure(error))
      return
    }

    performRequest(
      method: "POST",
      path: "/drive/v3/files",
      contentType: "application/json",
      body: body
    ) { result in
      completion(
        result.flatMap { response in
          guard response.isSuccessful else {
            return .failure(self.requestFailure(response))
          }
          return Result { try JSONDecoder().decode(DriveFile.self, from: response.data).id }
        }
      )
    }
  }

  private func getFileParents(
    fileID: String,
    completion: @escaping (Result<[String]?, Error>) -> Void
  ) {
    performRequest(
      method: "GET",
      path: "/drive/v3/files/\(fileID)",
      queryItems: [URLQueryItem(name: "fields", value: "parents,trashed")]
    ) { result in
      switch result {
      case .failure(let error):
        completion(.failure(error))
      case .success(let response) where response.statusCode == 404:
        completion(.success(nil))
      case .success(let response):
        guard response.isSuccessful else {
          completion(.failure(self.requestFailure(response)))
          return
        }
        do {
          let metadata = try JSONDecoder().decode(DriveParentMetadata.self, from: response.data)
          completion(.success(metadata.trashed == true ? nil : metadata.parents ?? []))
        } catch {
          completion(.failure(error))
        }
      }
    }
  }

  private func moveIfNeeded(
    fileID: String,
    parents: [String],
    folderID: String,
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    guard !parents.contains(folderID) else {
      completion(.success(()))
      return
    }

    performRequest(
      method: "PATCH",
      path: "/drive/v3/files/\(fileID)",
      queryItems: [
        URLQueryItem(name: "addParents", value: folderID),
        URLQueryItem(name: "removeParents", value: parents.joined(separator: ",")),
        URLQueryItem(name: "fields", value: "id,parents"),
      ]
    ) { result in
      switch result {
      case .failure(let error):
        os_log(
          .error,
          "Google Drive file move request failed: %{public}@",
          error.localizedDescription
        )
        if VoyagerGoogleDriveHTTPFailureMapper.isAuthorizationFailure(error) {
          completion(.failure(error))
        } else {
          completion(.success(()))
        }
      case .success(let response):
        guard !response.isSuccessful else {
          completion(.success(()))
          return
        }
        let error = self.requestFailure(response)
        os_log(
          .error,
          "Google Drive file move returned HTTP %{public}d: %{public}@",
          response.statusCode,
          error.localizedDescription
        )
        if VoyagerGoogleDriveHTTPFailureMapper.isAuthorizationFailure(error) {
          completion(.failure(error))
        } else {
          completion(.success(()))
        }
      }
    }
  }

  private func itemExists(
    fileID: String,
    completion: @escaping (Result<Bool, Error>) -> Void
  ) {
    performRequest(
      method: "GET",
      path: "/drive/v3/files/\(fileID)",
      queryItems: [URLQueryItem(name: "fields", value: "id")]
    ) { result in
      switch result {
      case .failure(let error):
        completion(.failure(error))
      case .success(let response) where response.statusCode == 404:
        completion(.success(false))
      case .success(let response) where response.isSuccessful:
        completion(.success(true))
      case .success(let response):
        completion(.failure(self.requestFailure(response)))
      }
    }
  }

  private func requestFailure(_ response: DriveHTTPResponse) -> Error {
    VoyagerGoogleDriveHTTPFailureMapper.map(
      statusCode: response.statusCode,
      retryAfterSeconds: response.retryAfterSeconds,
      bodyHint: String(data: response.data, encoding: .utf8)
    ) ?? GoogleDriveServiceError.httpStatus(response.statusCode)
  }

  private func performRequest(
    method: String,
    path: String,
    queryItems: [URLQueryItem] = [],
    contentType: String? = nil,
    body: Data? = nil,
    completion: @escaping (Result<DriveHTTPResponse, Error>) -> Void
  ) {
    withAccessToken { tokenResult in
      switch tokenResult {
      case .failure(let error):
        completion(.failure(error))
      case .success(let token):
        var components = URLComponents()
        components.scheme = "https"
        components.host = self.apiHost
        components.path = path
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        guard let url = components.url else {
          completion(.failure(GoogleDriveServiceError.invalidResponse))
          return
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let contentType {
          request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
          if let error {
            completion(.failure(error))
            return
          }
          guard let response = response as? HTTPURLResponse else {
            completion(.failure(GoogleDriveServiceError.invalidResponse))
            return
          }
          let retryAfterSeconds = response.allHeaderFields
            .first { ($0.key as? String)?.caseInsensitiveCompare("Retry-After") == .orderedSame }
            .flatMap { $0.value as? String }
            .flatMap(TimeInterval.init)
          completion(
            .success(
              DriveHTTPResponse(
                data: data ?? Data(),
                statusCode: response.statusCode,
                retryAfterSeconds: retryAfterSeconds
              )
            )
          )
        }.resume()
      }
    }
  }

  private func withAccessToken(
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    guard configureGoogleSignIn() else {
      completion(.failure(GoogleDriveServiceError.notConfigured))
      return
    }

    if let currentUser = GIDSignIn.sharedInstance.currentUser {
      refresh(user: currentUser, completion: completion)
      return
    }

    GIDSignIn.sharedInstance.restorePreviousSignIn { user, _ in
      guard let user else {
        completion(.failure(VoyagerGoogleDriveFailure.authRequired))
        return
      }
      self.refresh(user: user, completion: completion)
    }
  }

  private func refresh(
    user: GIDGoogleUser,
    completion: @escaping (Result<String, Error>) -> Void
  ) {
    user.refreshTokensIfNeeded { refreshedUser, error in
      if let error {
        completion(
          .failure(
            VoyagerGoogleDriveAuthErrorClassifier.isPermanentAuthFailure(error)
              ? VoyagerGoogleDriveFailure.authRequired
              : error
          )
        )
        return
      }
      guard let refreshedUser else {
        completion(.failure(VoyagerGoogleDriveFailure.authRequired))
        return
      }
      guard refreshedUser.grantedScopes?.contains(self.scope) == true else {
        completion(.failure(VoyagerGoogleDriveFailure.authRequired))
        return
      }
      completion(.success(refreshedUser.accessToken.tokenString))
    }
  }

  private func configureGoogleSignIn() -> Bool {
    guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
      !clientID.isEmpty
    else { return false }
    GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
    return true
  }

  private func escapeQueryValue(_ value: String) -> String {
    value
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "'", with: "\\'")
  }
}

private struct DriveHTTPResponse {
  let data: Data
  let statusCode: Int
  let retryAfterSeconds: TimeInterval?

  var isSuccessful: Bool {
    (200..<300).contains(statusCode)
  }
}

private struct DriveFileList: Decodable {
  let files: [DriveFile]
}

private struct DriveFile: Decodable {
  let id: String
}

private struct DriveCreateMetadata: Encodable {
  let name: String
  let mimeType: String
  let parents: [String]?
  let appProperties: [String: String]?
}

private struct DriveUpdateMetadata: Encodable {
  let name: String?
  let appProperties: [String: String]
}

private struct DriveParentMetadata: Decodable {
  let parents: [String]?
  let trashed: Bool?
}

private enum GoogleDriveServiceError: LocalizedError, Equatable {
  case httpStatus(Int)
  case invalidResponse
  case notConfigured

  var errorDescription: String? {
    switch self {
    case .httpStatus(let statusCode):
      return "Google Drive request failed (\(statusCode))"
    case .invalidResponse:
      return "Google Drive returned an invalid response"
    case .notConfigured:
      return "Google Sign-In is not configured"
    }
  }
}
