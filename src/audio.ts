/**
 * Synthesised, asset-free sound design (WebAudio). Soft and short so it suits
 * shared spaces like a commute or an office.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** Call from any user gesture so later sounds are allowed to play. */
  unlock() {
    this.ensure();
  }

  private tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine') {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  pick() {
    this.tone(660, 0, 0.12, 0.05, 'triangle');
  }
  drop() {
    this.tone(523.25, 0, 0.25, 0.07);
    this.tone(784, 0.07, 0.3, 0.05);
  }
  tap() {
    this.tone(880, 0, 0.08, 0.035, 'triangle');
  }
  reject() {
    this.tone(220, 0, 0.18, 0.05, 'triangle');
  }
  /** Focus block complete: a rising bell chord. */
  bloom() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.12, 1.4, 0.06));
  }
  breathCue(inhale: boolean) {
    this.tone(inhale ? 392 : 329.63, 0, 0.6, 0.025);
  }
}
