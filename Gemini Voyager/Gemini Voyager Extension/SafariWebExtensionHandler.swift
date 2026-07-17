//
//  SafariWebExtensionHandler.swift
//  Gemini Voyager Extension
//

import GoogleSignIn
import SafariServices
import os.log

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
  private let googleDriveScope = "https://www.googleapis.com/auth/drive.file"

  func beginRequest(with context: NSExtensionContext) {
    _ = NativeNotificationService.shared

    guard let request = context.inputItems.first as? NSExtensionItem,
      let message = extensionMessage(from: request),
      let action = message["action"] as? String
    else {
      respondWithError(context: context, message: "Invalid message")
      return
    }

    os_log(.info, "Safari native action: %{public}@", action)

    switch action {
    case "ping":
      respondWithSuccess(context: context, data: ["status": "ok"])
    case "deliverNotification":
      deliverNotification(message: message, context: context)
    case "requestNotificationPermission":
      requestNotificationPermission(context: context)
    case "googleDriveGetToken":
      getGoogleDriveToken(
        interactive: message["interactive"] as? Bool == true,
        context: context
      )
    case "googleDriveSignOut":
      GIDSignIn.sharedInstance.signOut()
      respondWithSuccess(context: context, data: ["signedOut": true])
    case "iCloudAccountStatus":
      handleICloudAccountStatus(context: context)
    case "iCloudWriteFile":
      writeICloudFile(message: message, context: context)
    case "iCloudReadFile":
      readICloudFile(message: message, context: context)
    default:
      respondWithError(context: context, message: "Unknown action")
    }
  }

  private func handleICloudAccountStatus(context: NSExtensionContext) {
    ICloudSyncService.shared.accountStatus { result in
      switch result {
      case .success:
        self.respondWithSuccess(context: context, data: ["available": true])
      case .failure(let error):
        self.respondWithICloudError(context: context, error: error)
      }
    }
  }

  private func writeICloudFile(message: [String: Any], context: NSExtensionContext) {
    guard let fileName = message["fileName"] as? String,
      let json = message["json"] as? String
    else {
      respondWithError(context: context, message: "Invalid iCloud write request")
      return
    }

    ICloudSyncService.shared.write(fileName: fileName, json: json) { result in
      switch result {
      case .success:
        self.respondWithSuccess(context: context, data: ["saved": true])
      case .failure(let error):
        self.respondWithICloudError(context: context, error: error)
      }
    }
  }

  private func readICloudFile(message: [String: Any], context: NSExtensionContext) {
    guard let fileName = message["fileName"] as? String else {
      respondWithError(context: context, message: "Invalid iCloud read request")
      return
    }

    ICloudSyncService.shared.read(fileName: fileName) { result in
      switch result {
      case .success(let json):
        self.respondWithSuccess(
          context: context,
          data: json.map { ["json": $0, "found": true] }
            ?? ["found": false]
        )
      case .failure(let error):
        self.respondWithICloudError(context: context, error: error)
      }
    }
  }

  private func respondWithICloudError(context: NSExtensionContext, error: Error) {
    guard let failure = error as? VoyagerICloudFailure else {
      respondWithError(context: context, message: error.localizedDescription)
      return
    }

    var response: [String: Any] = [
      "success": false,
      "error": failure.localizedDescription,
      "code": failure.code.rawValue,
    ]
    if let retryAfterMilliseconds = failure.retryAfterMilliseconds {
      response["retryAfterMs"] = retryAfterMilliseconds
    }
    respond(context: context, message: response)
  }

  private func getGoogleDriveToken(interactive: Bool, context: NSExtensionContext) {
    guard configureGoogleSignIn() else {
      respondWithError(context: context, message: "Google Sign-In is not configured")
      return
    }

    GIDSignIn.sharedInstance.restorePreviousSignIn { user, _ in
      guard let user else {
        self.respondWithGoogleDriveAuthorizationRequirement(
          interactive: interactive,
          context: context
        )
        return
      }

      user.refreshTokensIfNeeded { refreshedUser, _ in
        guard let refreshedUser else {
          self.respondWithGoogleDriveAuthorizationRequirement(
            interactive: interactive,
            context: context
          )
          return
        }

        guard refreshedUser.grantedScopes?.contains(self.googleDriveScope) == true else {
          self.respondWithGoogleDriveAuthorizationRequirement(
            interactive: interactive,
            context: context
          )
          return
        }

        let expirationDate =
          refreshedUser.accessToken.expirationDate
          ?? Date().addingTimeInterval(55 * 60)

        self.respondWithSuccess(
          context: context,
          data: [
            "accessToken": refreshedUser.accessToken.tokenString,
            "expiresAt": expirationDate.timeIntervalSince1970 * 1000,
            "signedIn": true,
          ]
        )
      }
    }
  }

  private func configureGoogleSignIn() -> Bool {
    guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
      !clientID.isEmpty
    else { return false }
    GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
    return true
  }

  private func respondWithGoogleDriveAuthorizationRequirement(
    interactive: Bool,
    context: NSExtensionContext
  ) {
    guard interactive else {
      respondWithSuccess(context: context, data: ["signedIn": false])
      return
    }

    respondWithSuccess(
      context: context,
      data: ["requiresAppLaunch": true, "signedIn": false]
    )
  }

  private func deliverNotification(message: [String: Any], context: NSExtensionContext) {
    guard let title = message["title"] as? String,
      let body = message["body"] as? String
    else {
      respondWithError(context: context, message: "Invalid notification")
      return
    }

    NativeNotificationService.shared.deliver(
      id: message["id"] as? String ?? UUID().uuidString,
      title: title,
      body: body,
      destination: (message["url"] as? String).flatMap {
        VoyagerNotificationDestination(rawValue: $0)
      }
    ) { result in
      switch result {
      case .success:
        self.respondWithSuccess(context: context, data: ["delivered": true])
      case .failure(let error):
        self.respondWithError(context: context, message: error.localizedDescription)
      }
    }
  }

  private func requestNotificationPermission(context: NSExtensionContext) {
    NativeNotificationService.shared.requestAuthorization { result in
      switch result {
      case .success(let granted):
        self.respondWithSuccess(context: context, data: ["granted": granted])
      case .failure(let error):
        self.respondWithError(context: context, message: error.localizedDescription)
      }
    }
  }

  private func extensionMessage(from request: NSExtensionItem) -> [String: Any]? {
    if #available(macOS 11.0, *) {
      return request.userInfo?[SFExtensionMessageKey] as? [String: Any]
    }
    return request.userInfo?["message"] as? [String: Any]
  }

  private func respondWithSuccess(context: NSExtensionContext, data: [String: Any]) {
    respond(context: context, message: ["success": true, "data": data])
  }

  private func respondWithError(context: NSExtensionContext, message: String) {
    respond(context: context, message: ["success": false, "error": message])
  }

  private func respond(context: NSExtensionContext, message: [String: Any]) {
    let response = NSExtensionItem()
    if #available(macOS 11.0, *) {
      response.userInfo = [SFExtensionMessageKey: message]
    } else {
      response.userInfo = ["message": message]
    }
    context.completeRequest(returningItems: [response])
  }
}
