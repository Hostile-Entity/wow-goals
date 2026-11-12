import { RefObject, useEffect, useState } from "react";
import {
  playTabClickSound,
  playUiClickSound,
  primeAudio,
  setSfxMasterVolume01,
} from "../audio/soundManager";

export function useDeviceUI(
  soundVolume: number,
  noteInput: string,
  tab: string,
  textareaRef: RefObject<HTMLTextAreaElement>,
  composerRef: RefObject<HTMLFormElement>,
) {
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    let baseline = window.innerHeight;
    const update = () => {
      const active = document.activeElement;
      const focused =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement;
      if (!focused) baseline = window.innerHeight;
      const viewport = window.visualViewport;
      setKeyboardVisible(
        focused &&
          baseline -
            (viewport
              ? viewport.height + viewport.offsetTop
              : window.innerHeight) >
            80,
      );
    };
    window.addEventListener("resize", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const style = getComputedStyle(textarea);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const max = (parseFloat(style.lineHeight) || 22) * 6 + padding + borders;
    // scrollHeight includes padding, but not borders; CSS uses border-box sizing.
    const height = textarea.scrollHeight + borders;
    textarea.style.height = `${Math.min(height, max)}px`;
    textarea.style.overflowY = height > max ? "auto" : "hidden";
    const update = () =>
      document.documentElement.style.setProperty(
        "--notes-composer-live-height",
        `${composerRef.current?.offsetHeight ?? 60}px`,
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [noteInput, tab, textareaRef, composerRef]);
  useEffect(() => {
    setSfxMasterVolume01(soundVolume / 100);
  }, [soundVolume]);
  useEffect(() => {
    const prime = () => {
      void primeAudio().catch(() => undefined);
      document.removeEventListener("pointerdown", prime);
    };
    const click = (event: MouseEvent) => {
      const target = (event.target as HTMLElement)?.closest<HTMLElement>(
        "button, [role=button], a",
      );
      if (!target || (target instanceof HTMLButtonElement && target.disabled))
        return;
      if (target.closest(".tabs,.more-tabs")) playTabClickSound();
      else playUiClickSound();
    };
    document.addEventListener("pointerdown", prime);
    document.addEventListener("click", click);
    return () => {
      document.removeEventListener("pointerdown", prime);
      document.removeEventListener("click", click);
    };
  }, []);
  return isKeyboardVisible;
}
