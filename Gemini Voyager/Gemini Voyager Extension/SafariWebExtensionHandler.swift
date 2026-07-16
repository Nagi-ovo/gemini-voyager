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
        case "requestNotificationPermission":
            deliverLegacyNotification(
                title: "Gemini Voyager",
                body: "Notifications are enabled.",
                identifier: "gemini-voyager-notification-permission"
            )
            respondWithSuccess(context: context, data: ["authorized": true])
        case "showNotification":
            showLegacyNotification(message: message, context: context)
        default:
            respondWithError(context: context, message: "Unknown action")
        }
    }

    private func showLegacyNotification(message: [String: Any], context: NSExtensionContext) {
        guard let title = message["title"] as? String,
              let body = message["message"] as? String else {
            respondWithError(context: context, message: "Invalid notification")
            return
        }

        deliverLegacyNotification(
            title: title,
            body: body,
            identifier: message["id"] as? String ?? UUID().uuidString
        )
        respondWithSuccess(context: context, data: ["delivered": true])
    }

    private func deliverLegacyNotification(title: String, body: String, identifier: String) {
        let notification = NSUserNotification()
        notification.identifier = identifier
        notification.title = title
        notification.informativeText = body
        notification.soundName = NSUserNotificationDefaultSoundName
        NSUserNotificationCenter.default.deliver(notification)
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
