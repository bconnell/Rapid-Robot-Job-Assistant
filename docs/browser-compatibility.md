# Browser Compatibility

Rapid Robot Job Assistant is built for Chromium browsers in this version.

## Chrome

Chrome is the primary tested target. The in-page assistant is the recommended live workflow. The side panel may be used as an optional surface when available.

## Brave

Brave is supported on a best-effort basis through Chromium extension APIs. The in-page assistant is the recommended live workflow.

Brave Shields can affect some job and application pages. Embedded forms, third-party apply widgets, cookies, scripts, iframes, CAPTCHA, and bot checks may behave differently. Rapid Robot Job Assistant does not change Shields settings, bypass Shields, or bypass bot checks.

## Edge

Edge is supported on a best-effort basis through Chromium extension APIs. The in-page assistant is the recommended live workflow. Side panel behavior should be treated as optional.

## Other Chromium Browsers

Other Chromium browsers are best effort. The extension does not block use based only on browser detection, but side panel support and permission behavior may vary.

## Firefox And Safari

Firefox and Safari are future ports. They are not supported by this Manifest V3 build.

## Known Limits

- Cross-origin iframe forms may need to be opened directly or filled manually.
- Browser privacy features may prevent parts of a form from loading.
- The extension does not click submit, apply, next, login, CAPTCHA, MFA, or bot-check controls.
- The extension does not spoof browser behavior or evade detection.
