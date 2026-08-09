import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        return true
    }

    /// Pronunciation has to be audible with the ring/silent switch on.
    ///
    /// WKWebView's default session category is `.ambient`, which is the
    /// correct default for a web page — incidental sound that must never
    /// interrupt anything and is silenced by the hardware switch. It is the
    /// wrong default for this app: every word, example sentence and story line
    /// is spoken audio the learner deliberately asked to hear, and a phone
    /// left on silent (which is most phones, most of the time) played nothing
    /// at all, with no indication why. That is the single most confusing
    /// "is it broken?" failure the app can have, and it is a webview artefact.
    ///
    /// `.playback` is the category for audio that *is* the point. Three
    /// deliberate details:
    ///
    /// - **No options.** `.duckOthers` looks kinder — a learner's podcast
    ///   quietens instead of stopping — but nothing here ever deactivates the
    ///   session, and a duck lasts as long as the session is active. Their
    ///   podcast would stay quiet for the whole time the app is open, with no
    ///   way to explain why. Un-ducking properly means driving
    ///   setActive(false) off playback-ended events that live in JavaScript,
    ///   several layers away. Plain `.playback` is honest instead: the first
    ///   word you play takes the audio, exactly like every media app.
    /// - **Configured, not activated.** Activation is what actually interrupts
    ///   other audio, and iOS does it implicitly on first playback — so merely
    ///   opening the app costs a listener nothing.
    /// - **No `audio` background mode**, so playback stops when the app is
    ///   backgrounded. Intended: this is not a media app, and the capability
    ///   invites an App Review question we have no reason to answer.
    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        } catch {
            // A device that refuses the category still plays through the
            // default one — quieter, switch-dependent, but not broken. There
            // is nothing useful to tell the learner here.
            CAPLog.print("⚡️  Audio session unavailable: \(error.localizedDescription)")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
