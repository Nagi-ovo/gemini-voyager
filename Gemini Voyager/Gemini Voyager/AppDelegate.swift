//
//  AppDelegate.swift
//  Gemini Voyager
//
//  Created by Jesse Zhang on 15/05/2026.
//

import Cocoa
import GoogleSignIn
import SafariServices
import Sparkle
import UserNotifications
import os.log

@main
class AppDelegate: NSObject, NSApplicationDelegate {
  private let googleDriveScope = "https://www.googleapis.com/auth/drive.file"
  private var pendingGoogleDriveSignIn = false
  private var canStartInteractiveSignIn = false

  private let updaterController = SPUStandardUpdaterController(
    startingUpdater: true,
    updaterDelegate: nil,
    userDriverDelegate: nil
  )

  var automaticUpdatesEnabled: Bool {
    updaterController.updater.automaticallyChecksForUpdates
  }

  var canCheckForUpdates: Bool {
    updaterController.updater.canCheckForUpdates
  }

  var lastUpdateCheckDate: Date? {
    updaterController.updater.lastUpdateCheckDate
  }

  func applicationWillFinishLaunching(_ notification: Notification) {
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.setNotificationCategories([VoyagerNotificationDestination.notificationCategory()])
    NSAppleEventManager.shared().setEventHandler(
      self,
      andSelector: #selector(handleGetURLEvent(_:withReplyEvent:)),
      forEventClass: AEEventClass(kInternetEventClass),
      andEventID: AEEventID(kAEGetURL)
    )
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    installCheckForUpdatesMenuItem()
    canStartInteractiveSignIn = true
  }

  func applicationDidBecomeActive(_ notification: Notification) {
    startPendingGoogleDriveSignIn()
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    return true
  }

  @objc func checkForUpdates(_ sender: Any?) {
    updaterController.checkForUpdates(sender)
  }

  func setAutomaticUpdatesEnabled(_ enabled: Bool) {
    let updater = updaterController.updater
    if enabled {
      updater.automaticallyChecksForUpdates = true
      updater.automaticallyDownloadsUpdates = true
    } else {
      updater.automaticallyDownloadsUpdates = false
      updater.automaticallyChecksForUpdates = false
    }
  }

  func observeCanCheckForUpdates(_ handler: @escaping () -> Void) -> NSKeyValueObservation {
    updaterController.updater.observe(\.canCheckForUpdates, options: [.new]) { _, _ in
      DispatchQueue.main.async(execute: handler)
    }
  }

  @objc private func handleGetURLEvent(
    _ event: NSAppleEventDescriptor?,
    withReplyEvent replyEvent: NSAppleEventDescriptor?
  ) {
    guard let urlString = event?.paramDescriptor(forKeyword: keyDirectObject)?.stringValue,
      let url = URL(string: urlString)
    else { return }

    if GIDSignIn.sharedInstance.handle(url) {
      return
    }

    guard url.scheme == "gemini-voyager", url.host == "google-drive-auth" else { return }
    pendingGoogleDriveSignIn = true
    if canStartInteractiveSignIn {
      startPendingGoogleDriveSignIn()
    }
  }

  private func startPendingGoogleDriveSignIn() {
    guard canStartInteractiveSignIn,
      pendingGoogleDriveSignIn,
      let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
      !clientID.isEmpty,
      let window = NSApp.mainWindow ?? NSApp.windows.first
    else { return }

    pendingGoogleDriveSignIn = false
    GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
    GIDSignIn.sharedInstance.signIn(
      withPresenting: window,
      hint: nil,
      additionalScopes: [googleDriveScope]
    ) { _, error in
      guard let error else { return }
      let nsError = error as NSError
      if nsError.code != GIDSignInError.canceled.rawValue {
        os_log(.error, "Google Drive sign-in failed: %{public}@", error.localizedDescription)
      }
    }
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

extension AppDelegate: UNUserNotificationCenterDelegate {
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let actionIdentifier = response.actionIdentifier
    guard
      actionIdentifier == UNNotificationDefaultActionIdentifier
        || actionIdentifier == VoyagerNotificationDestination.openActionIdentifier,
      let destination = VoyagerNotificationDestination(
        userInfo: response.notification.request.content.userInfo
      )
    else {
      completionHandler()
      return
    }

    openConversation(destination, completion: completionHandler)
  }

  /// Asks the extension's background script to focus an existing conversation
  /// tab (falling back to a new tab there); only when Safari cannot take the
  /// message at all does this fall back to opening a fresh window.
  private func openConversation(
    _ destination: VoyagerNotificationDestination,
    completion: @escaping () -> Void
  ) {
    SFSafariApplication.dispatchMessage(
      withName: VoyagerNotificationDestination.openConversationMessageName,
      toExtensionWithIdentifier: extensionBundleIdentifier,
      userInfo: destination.dispatchUserInfo
    ) { error in
      guard error == nil else {
        SFSafariApplication.openWindow(with: destination.url) { _ in completion() }
        return
      }
      self.activateSafari()
      completion()
    }
  }

  private func activateSafari() {
    guard
      let safariURL = NSWorkspace.shared.urlForApplication(
        withBundleIdentifier: "com.apple.Safari"
      )
    else { return }
    NSWorkspace.shared.openApplication(at: safariURL, configuration: NSWorkspace.OpenConfiguration())
  }
}
