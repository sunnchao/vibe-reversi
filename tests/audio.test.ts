import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundManager } from '../src/platform/audio';

describe('原创音效播放器', () => {
  afterEach(() => {
    delete (globalThis as { wx?: unknown }).wx;
  });

  it('首次触摸前不播放，解锁后按偏好播放本地技能音效', () => {
    const players: Array<{ src: string; volume: number; obeyMuteSwitch: boolean; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn>; onError: ReturnType<typeof vi.fn> }> = [];
    (globalThis as unknown as { wx: unknown }).wx = {
      createInnerAudioContext: () => {
        const player = {
          src: '', volume: 1, obeyMuteSwitch: true,
          play: vi.fn(), stop: vi.fn(), destroy: vi.fn(), onError: vi.fn(),
        };
        players.push(player);
        return player;
      },
    };
    const manager = new SoundManager(() => ({ sound: true, effects: true, vibration: false, volume: 0.55 }));
    manager.play('place');
    expect(players).toHaveLength(0);

    manager.unlock();
    manager.play('place');
    manager.play('shield');
    expect(players).toHaveLength(2);
    expect(players[0].src).toContain('place.mp3');
    expect(players[0].volume).toBe(0.55);
    expect(players[0].play).toHaveBeenCalledOnce();
    expect(players[1].src).toContain('shield.mp3');

    manager.play('place');
    expect(players).toHaveLength(2);
    expect(players[0].stop).toHaveBeenCalled();
    expect(players[0].play).toHaveBeenCalledTimes(2);
    manager.destroy();
    expect(players.every((player) => player.destroy.mock.calls.length === 1)).toBe(true);
  });

  it('关闭音效或音量为零时不创建音频上下文', () => {
    const create = vi.fn();
    (globalThis as unknown as { wx: unknown }).wx = { createInnerAudioContext: create };
    const manager = new SoundManager(() => ({ sound: false, effects: true, vibration: false, volume: 0.5 }));
    manager.unlock();
    manager.play('win');
    expect(create).not.toHaveBeenCalled();
    manager.destroy();
  });
});
