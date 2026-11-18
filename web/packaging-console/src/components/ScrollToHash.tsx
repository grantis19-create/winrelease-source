import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls to the element named by the URL's #fragment after a route change. The pages scroll inside the layout's main area, not the window,
 * so the browser's own jump to a fragment does not happen when a link inside the app (the front page's "How WinRelease is tested", say) opens
 * a page at /help#testing. It retries briefly because the target may not be on screen until the page has rendered.
 */
export function ScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    const timer = window.setInterval(() => {
      const target = document.getElementById(id);
      tries += 1;
      if (target) {
        target.scrollIntoView({ block: "start" });
        window.clearInterval(timer);
      } else if (tries >= 10) {
        window.clearInterval(timer);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [pathname, hash]);
  return null;
}
