//
//  SafariWebExtensionHandler.swift
//  Gemini Voyager Safari Extension
//
//  Created for Gemini Voyager
//  https://github.com/Nagi-ovo/gemini-voyager
//

import SafariServices
import os.log

let logger = OSLog(subsystem: "com.gemini-voyager.safari", category: "extension")

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    /// Handles messages from the extension's JavaScript code
    /// - Parameters:
    ///   - userInfo: Message payload from JavaScript
    ///   - context: Extension context for responding
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        guard let message = request?.userInfo?[SFExtensionMessageKey] as? [String: Any],
              let action = message["action"] as? String else {
            os_log(.error, log: logger, "Invalid message format")
            context.completeRequest(returningItems: nil)
            return
        }

        os_log(.info, log: logger, "Received action: %{public}@", action)

        // Handle different message types
        switch action {
        case "ping":
            handlePing(context: context)

        case "getVersion":
            handleGetVersion(context: context)

        case "syncStorage":
            handleSyncStorage(message: message, context: context)

        default:
            os_log(.info, log: logger, "Unknown action: %{public}@", action)
            respondWithError(context: context, message: "Unknown action")
        }
    }

    // MARK: - Message Handlers

    /// Simple health check
    private func handlePing(context: NSExtensionContext) {
        respondWithSuccess(context: context, data: ["status": "ok", "message": "pong"])
    }

    /// Returns extension version info
    private func handleGetVersion(context: NSExtensionContext) {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"

        respondWithSuccess(context: context, data: [
            "version": version,
            "build": build,
            "platform": "safari-macos"
        ])
    }

    /// Handle storage synchronization (placeholder for future feature)
    private func handleSyncStorage(message: [String: Any], context: NSExtensionContext) {
        // Future: Implement native storage sync with UserDefaults or Keychain
        os_log(.info, log: logger, "Storage sync requested (not yet implemented)")
        respondWithSuccess(context: context, data: ["synced": false])
    }

    // MARK: - Response Helpers

    private func respondWithSuccess(context: NSExtensionContext, data: [String: Any]) {
        let response = NSExtensionItem()
        response.userInfo = [
            SFExtensionMessageKey: [
                "success": true,
                "data": data
            ]
        ]
        context.completeRequest(returningItems: [response])
    }

    private func respondWithError(context: NSExtensionContext, message: String) {
        let response = NSExtensionItem()
        response.userInfo = [
            SFExtensionMessageKey: [
                "success": false,
                "error": message
            ]
        ]
        context.completeRequest(returningItems: [response])
    }
}
