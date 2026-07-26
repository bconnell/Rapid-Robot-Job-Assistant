import type { PermissionRequestResult } from './ExtensionMessaging';
import type { TabCapabilityResult } from './TabPermissions';

export async function requestCurrentSitePermissionFromUi(
  tabStatus: TabCapabilityResult | undefined
): Promise<PermissionRequestResult> {
  if (!tabStatus?.originPattern || !tabStatus.canRequestPermission) {
    return {
      granted: false,
      userMessage: 'This page does not support a current-site permission request.'
    };
  }

  try {
    const granted = await chrome.permissions.request({ origins: [tabStatus.originPattern] });
    return {
      granted,
      originPattern: tabStatus.originPattern,
      userMessage: granted
        ? 'Permission granted. Try analysis again. Reload the page if it still fails.'
        : 'Permission was not granted. You can still try one-off analysis from the button.'
    };
  } catch {
    return {
      granted: false,
      originPattern: tabStatus.originPattern,
      userMessage:
        'Chrome could not complete the permission request. Keep this page open and try again from the button.'
    };
  }
}
