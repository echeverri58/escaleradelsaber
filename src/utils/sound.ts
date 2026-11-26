// Síntesis ligera de efectos de sonido con Web Audio API (sin archivos externos).

class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    delay = 0,
    gainPeak = 0.14
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playCorrect(): void {
    this.playTone(523.25, 0.14, 'triangle', 0, 0.15); // Do5
    this.playTone(659.25, 0.18, 'triangle', 0.09, 0.16); // Mi5
  }

  public playWrong(): void {
    this.playTone(220, 0.16, 'sawtooth', 0, 0.09);
    this.playTone(174.61, 0.24, 'sawtooth', 0.11, 0.09);
  }

  public playBonus(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this.playTone(n, 0.18, 'triangle', i * 0.08, 0.18);
    });
  }

  public playLadder(): void {
    const notes = [392, 493.88, 587.33, 783.99];
    notes.forEach((n, i) => {
      this.playTone(n, 0.14, 'sine', i * 0.07, 0.14);
    });
  }

  public playSnake(): void {
    const notes = [523.25, 440, 349.23, 261.63];
    notes.forEach((n, i) => {
      this.playTone(n, 0.15, 'sine', i * 0.07, 0.12);
    });
  }

  public playVictory(): void {
    const fanfare = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    const delays = [0, 0.11, 0.22, 0.34, 0.52, 0.65];
    fanfare.forEach((n, i) => {
      this.playTone(n, i === fanfare.length - 1 ? 0.5 : 0.16, 'triangle', delays[i], 0.18);
    });
  }
}

export const soundManager = new SoundManager();
