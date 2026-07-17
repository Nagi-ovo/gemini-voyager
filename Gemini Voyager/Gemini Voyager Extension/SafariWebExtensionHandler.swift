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
      let message = extensionMessage(from: request)
    else {
      respondWithError(context: context, message: "Invalid message")
      return
    }

    let nativeRequest: VoyagerNativeRequest
    do {
      nativeRequest = try VoyagerNativeMessageCodec.decodeRequest(from: message)
    } catch {
      respondWithError(context: context, message: "Invalid native message")
      return
    }

    os_log(.info, "Safari native action: %{public}@", nativeRequest.actionName)

    switch nativeRequest {
    case .ping:
      respondWithSuccess(context: context, data: VoyagerPingResponse(status: "ok"))
    case .deliverNotification(let request):
      deliverNotification(request: request, context: context)
    case .requestNotificationPermission:
      requestNotificationPermission(context: context)
    case .googleDriveGetToken(let interactive):
      getGoogleDriveToken(interactive: interactive, context: context)
    case .googleDriveSignOut:
      GIDSignIn.sharedInstance.signOut()
      respondWithSuccess(
        context: context,
        data: VoyagerGoogleDriveSignOutResponse(signedOut: true)
      )
    case .iCloudAccountStatus:
      handleICloudAccountStatus(context: context)
    case .iCloudWriteFile(let request):
      writeICloudFile(request: request, context: context)
    case .iCloudReadFile(let fileName):
      readICloudFile(fileName: fileName, context: context)
    }
  }

  private func handleICloudAccountStatus(context: NSExtensionContext) {
    ICloudSyncService.shared.accountStatus { result in
      switch result {
      case .success:
        self.respondWithSuccess(
          context: context,
          data: VoyagerICloudAccountResponse(available: true)
        )
      case .failure(let error):
        self.respondWithICloudError(context: context, error: error)
      }
    }
  }

  private func writeICloudFile(
    request: VoyagerICloudWriteRequest,
    context: NSExtensionContext
  ) {
    ICloudSyncService.shared.write(fileName: request.fileName, json: request.json) { result in
      switch result {
      case .success:
        self.respondWithSuccess(
          context: context,
          data: VoyagerICloudWriteResponse(saved: true)
        )
      case .failure(let error):
        self.respondWithICloudError(context: context, error: error)
      }
    }
  }

  private func readICloudFile(fileName: String, context: NSExtensionContext) {
    ICloudSyncService.shared.read(fileName: fileName) { result in
      switch result {
      case .success(let json):
        self.respondWithSuccess(
          context: context,
          data: VoyagerICloudReadResponse(json: json, found: json != nil)
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

    respondWithError(
      context: context,
      failure: VoyagerNativeFailure(
        error: failure.localizedDescription,
        code: failure.code.rawValue,
        retryAfterMs: failure.retryAfterMilliseconds
      )
    )
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
          data: VoyagerGoogleDriveTokenResponse(
            accessToken: refreshedUser.accessToken.tokenString,
            expiresAt: expirationDate.timeIntervalSince1970 * 1000,
            signedIn: true
          )
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
      respondWithSuccess(
        context: context,
        data: VoyagerGoogleDriveTokenResponse(signedIn: false)
      )
      return
    }

    respondWithSuccess(
      context: context,
      data: VoyagerGoogleDriveTokenResponse(
        signedIn: false,
        requiresAppLaunch: true
      )
    )
  }

  private func deliverNotification(
    request: VoyagerNotificationRequest,
    context: NSExtensionContext
  ) {
    NativeNotificationService.shared.deliver(
      id: request.id ?? UUID().uuidString,
      title: request.title,
      body: request.body,
      destination: request.url.flatMap {
        VoyagerNotificationDestination(rawValue: $0)
      }
    ) { result in
      switch result {
      case .success:
        self.respondWithSuccess(
          context: context,
          data: VoyagerNotificationDeliveryResponse(delivered: true)
        )
      case .failure(let error):
        self.respondWithError(context: context, message: error.localizedDescription)
      }
    }
  }

  private func requestNotificationPermission(context: NSExtensionContext) {
    NativeNotificationService.shared.requestAuthorization { result in
      switch result {
      case .success(let granted):
        self.respondWithSuccess(
          context: context,
          data: VoyagerNotificationPermissionResponse(granted: granted)
        )
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

  private func respondWithSuccess<Payload: Codable>(
    context: NSExtensionContext,
    data: Payload
  ) {
    respond(context: context, response: VoyagerNativeResponse.success(data))
  }

  private func respondWithError(context: NSExtensionContext, message: String) {
    respondWithError(context: context, failure: VoyagerNativeFailure(error: message))
  }

  private func respondWithError(context: NSExtensionContext, failure: VoyagerNativeFailure) {
    respond(
      context: context,
      response: VoyagerNativeResponse<VoyagerEmptyResponse>.failure(failure)
    )
  }

  private func respond<Payload: Codable>(
    context: NSExtensionContext,
    response nativeResponse: VoyagerNativeResponse<Payload>
  ) {
    guard let message = try? VoyagerNativeMessageCodec.encodeResponse(nativeResponse) else {
      context.cancelRequest(withError: VoyagerNativeHandlerError.responseEncodingFailed)
      return
    }

    let response = NSExtensionItem()
    if #available(macOS 11.0, *) {
      response.userInfo = [SFExtensionMessageKey: message]
    } else {
      response.userInfo = ["message": message]
    }
    context.completeRequest(returningItems: [response])
  }
}

private enum VoyagerNativeHandlerError: LocalizedError {
  case responseEncodingFailed

  var errorDescription: String? {
    "Could not encode the native response"
  }
}
