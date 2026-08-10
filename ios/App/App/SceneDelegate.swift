import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let root = CAPBridgeViewController()
        window?.rootViewController = root
        window?.makeKeyAndVisible()
        hideScrollIndicators(root)

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    /// The app must not wear a browser's scrollbar.
    ///
    /// Reported from TestFlight: a long grey indicator riding the right edge of
    /// the whole screen on Practice, on Stories — on every screen, in the same
    /// place, because it does not belong to any of them. The app shell scrolls
    /// the DOCUMENT (App.jsx's <main> has no scroller of its own), so the thing
    /// drawing it is the WKWebView's own UIScrollView. It is a UIKit control,
    /// which is why no amount of `::-webkit-scrollbar` CSS would have touched
    /// it, and why the fix is one line here rather than a rule on every screen.
    ///
    /// Only the indicator is hidden. Scrolling, momentum, deceleration, scroll
    /// restoration and rubber-band behaviour are all properties of the scroll
    /// view itself and are left exactly as they are — this turns off the
    /// drawing of a hint, nothing else.
    ///
    /// The web build is untouched: a browser's scrollbar is correct in a
    /// browser, and this file is only ever compiled into the store app.
    private func hideScrollIndicators(_ controller: CAPBridgeViewController) {
        // The web view is built in the controller's loadView(), which
        // makeKeyAndVisible() has already triggered; this is belt and braces
        // for any ordering change in a future Capacitor.
        controller.loadViewIfNeeded()
        guard let scrollView = controller.webView?.scrollView else { return }
        scrollView.showsVerticalScrollIndicator = false
        scrollView.showsHorizontalScrollIndicator = false
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
