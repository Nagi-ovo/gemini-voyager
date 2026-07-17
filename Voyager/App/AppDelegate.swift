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

    os_log(.default, log: notifLog, "app URL-scheme event: %{public}@", urlString)

    if GIDSignIn.sharedInstance.handle(url) {
      return
    }

    // Notification clicks arrive in the Safari extension process (it owns the
    // scheduling notification center); it hands them to this app over the URL
    // scheme because SafariServices is unavailable there.
    if let destination = VoyagerAppLink.openConversationDestination(from: url) {
      os_log(
        .default,
        log: notifLog,
        "app URL-scheme handoff -> openConversation: %{public}@",
        destination.url.absoluteString
      )
      openConversation(destination) {}
      return
    }

    #if DEBUG
      if VoyagerAppLink.isDebugDeliverNotification(url) {
        scheduleDebugNotification(link: url)
        return
      }
    #endif

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

  #if DEBUG
    /// Debug-only twin of the extension's deliver path, so one click can prove
    /// where app-scheduled notification responses are routed. Trigger with:
    /// open "gemini-voyager://debug-deliver-notification?url=https%3A%2F%2Fgemini.google.com%2Fapp%2Fexample"
    private func scheduleDebugNotification(link: URL) {
      let destination =
        VoyagerAppLink.debugConversationDestination(from: link)
        ?? VoyagerNotificationDestination(rawValue: "https://gemini.google.com/app/voyager-debug")

      let content = UNMutableNotificationContent()
      content.title = "Voyager (app-scheduled debug)"
      content.body = "Click Open Conversation to test app-owned routing."
      content.sound = .default
      content.categoryIdentifier = VoyagerNotificationDestination.categoryIdentifier
      if let destination {
        content.userInfo = destination.userInfo
      }

      let request = UNNotificationRequest(
        identifier: "voyager-debug-\(UUID().uuidString)",
        content: content,
        trigger: nil
      )

      os_log(
        .default,
        log: notifLog,
        "app scheduling debug notification url=%{public}@ (bundle=%{public}@)",
        destination?.url.absoluteString ?? "none",
        Bundle.main.bundleIdentifier ?? "?"
      )

      let center = UNUserNotificationCenter.current()
      center.requestAuthorization(options: [.alert, .sound]) { granted, error in
        guard granted, error == nil else {
          os_log(
            .error,
            log: self.notifLog,
            "app debug notification not authorized: %{public}@",
            error?.localizedDescription ?? "denied"
          )
          return
        }
        center.add(request) { error in
          if let error {
            os_log(
              .error,
              log: self.notifLog,
              "app debug notification add failed: %{public}@",
              error.localizedDescription
            )
          } else {
            os_log(.default, log: self.notifLog, "app debug notification delivered")
          }
        }
      }
    }
  #endif

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
      "app openConversation start: %{public}@",
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
