import { assetUrl } from "../utils/assets";

type SoundKey = "tabClick" | "uiClick";

const SOUND_FILES: Record<SoundKey, string> = {
  tabClick: assetUrl("sounds/iUiInterfaceButtonA.ogg"),
  uiClick: assetUrl("sounds/uChatScrollButton.ogg"),
};

const BASE_VOLUMES: Record<SoundKey, number> = {
  tabClick: 0.5,
  uiClick: 0.5,
};
const ATTACK_SECONDS = 0.004;

let sfxMaster = 0;
let audioContext: AudioContext | null = null;
const buffers = new Map<SoundKey, AudioBuffer>();
const loading = new Map<SoundKey, Promise<AudioBuffer>>();

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const { audioSession } = window.navigator as Navigator & {
      audioSession?: { type: string };
    };
    // Let short UI sounds mix with music instead of asking for exclusive audio.
    if (audioSession) audioSession.type = "ambient";
  } catch {
    // Audio should still work in browsers that don't accept this session type.
  }
  audioContext = new Ctor();
  return audioContext;
}

export function setSfxMasterVolume01(v01: number): void {
  sfxMaster = clamp01(v01);
}

async function loadBuffer(key: SoundKey): Promise<AudioBuffer> {
  if (buffers.has(key)) return buffers.get(key) as AudioBuffer;
  const existing = loading.get(key);
  if (existing) return existing;

  const ctx = getAudioContext();
  if (!ctx) throw new Error("AudioContext not available");

  const promise = fetch(SOUND_FILES[key])
    .then((resp) => resp.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      buffers.set(key, buffer);
      loading.delete(key);
      return buffer;
    })
    .catch((err) => {
      loading.delete(key);
      throw err;
    });

  loading.set(key, promise);
  return promise;
}

async function ensureResumed(): Promise<AudioContext | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  return ctx;
}

async function playSound(key: SoundKey): Promise<void> {
  if (sfxMaster === 0 || typeof document === "undefined" || document.hidden) return;
  const ctx = await ensureResumed();
  if (!ctx) return;

  let buffer: AudioBuffer;
  try {
    buffer = await loadBuffer(key);
  } catch {
    return;
  }
  if (sfxMaster === 0 || document.hidden) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  const start = ctx.currentTime;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(
    clamp01(BASE_VOLUMES[key] * sfxMaster),
    start + ATTACK_SECONDS,
  );

  source.connect(gain);
  gain.connect(ctx.destination);

  try {
    source.start(start);
  } catch {
    // no-op
  }
}

export function playTabClickSound(): void {
  void playSound("tabClick");
}

export function playUiClickSound(): void {
  void playSound("uiClick");
}
