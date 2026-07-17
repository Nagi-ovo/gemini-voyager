//
//  AppDelegate.swift
//  Voyager
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
  private let notifLog = OSLog(subsystem: VoyagerNotifLog.subsystem, category: "app")

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
    os_log(
      .default,
      log: notifLog,
      "app willFinishLaunching: notification delegate + URL handler set (bundle=%{public}@)",
      Bundle.main.bundleIdentifier ?? "?"
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

    os_log(
      .default,
      log: notifLog,
      "app URL-scheme event: scheme=%{public}@ host=%{public}@",
      url.scheme ?? "none",
      url.host ?? "none"
    )

    if GIDSignIn.sharedInstance.handle(url) {
      return
    }

    if let notification = VoyagerAppLink.notificationDelivery(from: url) {
      os_log(
        .default,
        log: notifLog,
        "app received notification delivery id=%{public}@",
        notification.id
      )
      scheduleNotification(notification)
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

  private func scheduleNotification(_ notification: VoyagerAppNotification) {
    let content = UNMutableNotificationContent()
    content.title = notification.title
    content.body = notification.body
    content.sound = .default
    content.categoryIdentifier = VoyagerNotificationDestination.categoryIdentifier
    if let destination = notification.destination {
      content.userInfo = destination.userInfo
    }

    let request = UNNotificationRequest(
      identifier: notification.id,
      content: content,
      trigger: nil
    )
    os_log(
      .default,
      log: notifLog,
      "app scheduling notification id=%{public}@ destinationHost=%{public}@",
      notification.id,
      notification.destination?.url.host ?? "none"
    )

    UNUserNotificationCenter.current().add(request) { error in
      if let error {
        os_log(
          .error,
          log: self.notifLog,
          "app notification add failed: %{public}@",
          error.localizedDescription
        )
      } else {
        os_log(.default, log: self.notifLog, "app notification delivered to center")
      }
    }

    // `NSWorkspace.open` uses activates=false for this handoff. Keep a cold
    // background launch from leaving the containing app's panel on screen.
    if !NSApp.isActive {
      DispatchQueue.main.async {
        NSApp.hide(nil)
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
    os_log(
      .default,
      log: notifLog,
      "app didReceive action=%{public}@ (bundle=%{public}@)",
      actionIdentifier,
      Bundle.main.bundleIdentifier ?? "?"
    )
    guard
      actionIdentifier == UNNotificationDefaultActionIdentifier
        || actionIdentifier == VoyagerNotificationDestination.openActionIdentifier,
      let destination = VoyagerNotificationDestination(
        userInfo: response.notification.request.content.userInfo
      )
    else {
      os_log(
        .default,
        log: notifLog,
        "app didReceive ignored (unrelated action or missing destination)"
      )
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
    os_log(
      .default,
      log: notifLog,
      "app openConversation start: %{private}@",
      destination.url.absoluteString
    )
    var didFinish = false
    let finish: (Bool) -> Void = { shouldOpenFallback in
      DispatchQueue.main.async {
        guard !didFinish else { return }
        didFinish = true

        if shouldOpenFallback {
          os_log(
            .default,
            log: self.notifLog,
            "app openConversation fallback: SFSafariApplication.openWindow"
          )
          SFSafariApplication.openWindow(with: destination.url) { _ in
            self.activateSafari()
            NSApp.hide(nil)
            completion()
          }
          return
        }

        self.activateSafari()
        NSApp.hide(nil)
        completion()
      }
    }

    SFSafariApplication.dispatchMessage(
      withName: VoyagerNotificationDestination.openConversationMessageName,
      toExtensionWithIdentifier: extensionBundleIdentifier,
      userInfo: destination.dispatchUserInfo
    ) { error in
      if let error {
        os_log(
          .error,
          log: self.notifLog,
          "app dispatchMessage failed: %{public}@",
          error.localizedDescription
        )
      } else {
        os_log(.default, log: self.notifLog, "app dispatchMessage delivered to Safari")
      }
      finish(error != nil)
    }

    // Safari can leave the dispatch callback pending when no native port is
    // connected. Never strand a notification click in the containing app.
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
      if !didFinish {
        os_log(.default, log: self.notifLog, "app dispatch timed out; forcing fallback")
      }
      finish(true)
    }
  }

  private func activateSafari() {
    guard
      let safariURL = NSWorkspace.shared.urlForApplication(
        withBundleIdentifier: "com.apple.Safari"
      )
    else { return }
    NSWorkspace.shared.openApplication(
      at: safariURL, configuration: NSWorkspace.OpenConfiguration())
  }
}
