import { GamePreferences } from './preferences';

export type SoundCue = 'tap' | 'place' | 'flip' | 'bomb' | 'shield' | 'steal' | 'double' | 'wait' | 'undo' | 'win' | 'lose';

interface WxAudio {
  src: string;
  volume: number;
  obeyMuteSwitch: boolean;
  play(): void;
  stop(): void;
  destroy(): void;
  onError?(callback: () => void): void;
}

/** Short local audio cues. No network service or microphone permissions are needed. */
export class SoundManager {
  private context: AudioContext | null = null;
  private buffers = new Map<SoundCue, AudioBuffer>();
  private loading = new Map<SoundCue, Promise<AudioBuffer | null>>();
  private wxPlayers = new Map<SoundCue, WxAudio>();
  private sources = new Set<AudioBufferSourceNode>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private unlocked = false;
  private suspended = false;
  private generation = 0;
  public playedCount = 0;

  constructor(private preferences: () => GamePreferences) {}

  unlock(): void {
    this.unlocked = true;
    this.suspended = false;
    const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AudioClass = g.AudioContext ?? g.webkitAudioContext;
    if (!this.context && AudioClass) {
      try { this.context = new AudioClass(); } catch { return; }
    }
    void this.context?.resume().catch(() => {});
  }

  play(cue: SoundCue, delayMs = 0): void {
    const prefs = this.preferences();
    if (!prefs.sound || prefs.volume <= 0 || !this.unlocked || this.suspended) return;
    if (delayMs > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.play(cue);
      }, delayMs);
      this.timers.add(timer);
      return;
    }
    const g = globalThis as unknown as {
      wx?: { createInnerAudioContext?: (options: { useWebAudioImplement: boolean }) => WxAudio };
    };
    if (g.wx?.createInnerAudioContext) {
      try {
        let audio = this.wxPlayers.get(cue);
        if (!audio) {
          audio = g.wx.createInnerAudioContext({ useWebAudioImplement: true });
          audio.src = `/assets/audio/${cue}.mp3`;
          audio.obeyMuteSwitch = true;
          audio.onError?.(() => {});
          this.wxPlayers.set(cue, audio);
        }
        audio.volume = prefs.volume;
        audio.stop();
        audio.play();
        this.playedCount++;
      } catch {
        // Missing audio must not block game actions.
      }
      return;
    }
    const generation = this.generation;
    void this.getBuffer(cue).then((buffer) => {
      const context = this.context;
      const current = this.preferences();
      if (!buffer || !context || this.suspended || !current.sound || generation !== this.generation) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = current.volume;
      source.connect(gain).connect(context.destination);
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect();
        gain.disconnect();
      };
      this.sources.add(source);
      source.start();
      this.playedCount++;
    });
  }

  private async getBuffer(cue: SoundCue): Promise<AudioBuffer | null> {
    if (!this.context || typeof fetch === 'undefined') return null;
    const cached = this.buffers.get(cue);
    if (cached) return cached;
    const pending = this.loading.get(cue);
    if (pending) return pending;
    const context = this.context;
    const task = fetch(`/assets/audio/${cue}.mp3`)
      .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error('Audio unavailable')))
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => { this.buffers.set(cue, buffer); return buffer; })
      .catch(() => null);
    this.loading.set(cue, task);
    return task;
  }

  stop(): void {
    this.generation++;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const source of this.sources) { try { source.stop(); } catch {} }
    this.sources.clear();
    for (const audio of this.wxPlayers.values()) { try { audio.stop(); } catch {} }
  }

  suspend(): void {
    this.suspended = true;
    this.stop();
    void this.context?.suspend().catch(() => {});
  }

  resume(): void {
    this.suspended = false;
    if (this.unlocked) void this.context?.resume().catch(() => {});
  }

  destroy(): void {
    this.stop();
    for (const audio of this.wxPlayers.values()) { try { audio.destroy(); } catch {} }
    this.wxPlayers.clear();
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
