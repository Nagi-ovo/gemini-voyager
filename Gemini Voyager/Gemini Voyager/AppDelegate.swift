//
//  AppDelegate.swift
//  Gemini Voyager
//
//  Created by Jesse Zhang on 15/05/2026.
//

import Cocoa
import Sparkle

@main
class AppDelegate: NSObject, NSApplicationDelegate {
    private let updaterController = SPUStandardUpdaterController(
        startingUpdater: true,
        updaterDelegate: nil,
        userDriverDelegate: nil
    )

    func applicationDidFinishLaunching(_ notification: Notification) {
        installCheckForUpdatesMenuItem()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    @objc private func checkForUpdates(_ sender: Any?) {
        updaterController.checkForUpdates(sender)
    }

    private func installCheckForUpdatesMenuItem() {
        guard let applicationMenu = NSApp.mainMenu?.items.first?.submenu else { return }

        let item = NSMenuItem(
            title: "Check for Updates…",
            action: #selector(checkForUpdates(_:)),
            keyEquivalent: ""
        )
        item.target = self
        applicationMenu.insertItem(item, at: min(2, applicationMenu.items.count))
    }
}
