//
//  SafariWebExtensionHandler.swift
//  Gemini Voyager Extension
//

import SafariServices
import os.log

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        guard let request = context.inputItems.first as? NSExtensionItem,
              let message = extensionMessage(from: request),
              let action = message["action"] as? String else {
            respondWithError(context: context, message: "Invalid message")
            return
        }

        os_log(.info, "Safari native action: %{public}@", action)

        switch action {
        case "ping":
            respondWithSuccess(context: context, data: ["status": "ok"])
        default:
            respondWithError(context: context, message: "Unknown action")
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
