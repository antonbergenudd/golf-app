import { Alert, type AlertButton, Platform } from "react-native";

/**
 * RN Web sets aria-hidden on content behind <Modal />. Blur the focused
 * control before the modal opens (and use Modal onShow as a backup) to avoid
 * the browser “Blocked aria-hidden…” warning.
 */
export function blurActiveElementForModalWeb() {
  if (Platform.OS !== "web") return;
  if (typeof document === "undefined") return;
  const el = document.activeElement as HTMLElement | null;
  el?.blur?.();
}

/**
 * React Navigation / RN Screens mark inactive stack routes `aria-hidden` on web.
 * If focus stayed on a control in that route, Chrome warns and assistive tech breaks.
 * Blur only when the focused element is under an `aria-hidden` ancestor.
 */
export function blurIfFocusInsideAriaHiddenAncestorsWeb() {
  if (Platform.OS !== "web") return;
  if (typeof document === "undefined") return;
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || el === document.documentElement) {
    return;
  }
  let node: HTMLElement | null = el;
  while (node) {
    if (node.getAttribute("aria-hidden") === "true") {
      el.blur();
      return;
    }
    node = node.parentElement;
  }
}

type AlertWebOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
  userInterfaceStyle?: "light" | "dark";
};

/**
 * Same as `Alert.alert`, but blurs the active element on web first so the
 * alert overlay’s aria-hidden ancestor does not contain a focused control.
 */
export function alertWeb(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertWebOptions,
): void {
  blurActiveElementForModalWeb();
  if (buttons !== undefined && options !== undefined) {
    Alert.alert(title, message, buttons, options);
  } else if (buttons !== undefined) {
    Alert.alert(title, message, buttons);
  } else if (message !== undefined) {
    Alert.alert(title, message);
  } else {
    Alert.alert(title);
  }
}
