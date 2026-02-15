'use strict';

// ============================================================
//  Constants
// ============================================================
const CANVAS_W = 480;
const CANVAS_H = 720;
const PLAYER_SPEED = 5;
const PLAYER_MAX_SPEED = 8;
const PLAYER_MAX_LIVES = 3;
const BULLET_SPEED = 9;
const FIRE_INTERVAL = 120;
const INITIAL_SPAWN_INTERVAL = 1200;
const MIN_SPAWN_INTERVAL = 300;
const BOSS_TIMER_MS = 60000;         // 60s road phase → boss
const BOSS_WARNING_MS = 2500;
const WIDE_SHOT_DURATION_MS = 10000;  // 10s power-up
// Parallax star counts per layer
const STARS_FAR = 80;
const STARS_MID = 50;

// ============================================================
//  Utility
// ============================================================
const rand  = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max));
const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function aabbCollision(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// ============================================================
//  SoundFX  (Web Audio API — synthesised)
// ============================================================
class SoundFX {
  constructor() { this._ctx = null; }

  _ensure() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  shoot() {
    const c = this._ensure(), t = c.currentTime;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.06);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g).connect(c.destination);
    osc.start(t); osc.stop(t + 0.06);
  }

  explosion() {
    const c = this._ensure(), t = c.currentTime, dur = 0.15;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(300, t + dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  }

  bossExplosion() {
    const c = this._ensure(), t = c.currentTime, dur = 0.6;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(1200, t);
    f.frequency.exponentialRampToValueAtTime(80, t + dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t);
    const osc = c.createOscillator(), g2 = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    g2.gain.setValueAtTime(0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(g2).connect(c.destination); osc.start(t); osc.stop(t + 0.4);
  }

  playerHit() {
    const c = this._ensure(), t = c.currentTime;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g).connect(c.destination); osc.start(t); osc.stop(t + 0.2);
  }

  warning() {
    const c = this._ensure(), t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'square';
      const s = t + i * 0.35;
      osc.frequency.setValueAtTime(440, s);
      osc.frequency.setValueAtTime(520, s + 0.1);
      g.gain.setValueAtTime(0.1, s);
      g.gain.setValueAtTime(0.1, s + 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.25);
      osc.connect(g).connect(c.destination); osc.start(s); osc.stop(s + 0.25);
    }
  }

  bossHit() {
    const c = this._ensure(), t = c.currentTime;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g).connect(c.destination); osc.start(t); osc.stop(t + 0.08);
  }

  pickup() {
    const c = this._ensure(), t = c.currentTime;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
    g.gain.setValueAtTime(0.13, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g).connect(c.destination); osc.start(t); osc.stop(t + 0.15);
  }

  powerUp() {
    const c = this._ensure(), t = c.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'sine';
      const s = t + i * 0.08;
      osc.frequency.setValueAtTime(freq, s);
      g.gain.setValueAtTime(0.12, s);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.2);
      osc.connect(g).connect(c.destination);
      osc.start(s); osc.stop(s + 0.2);
    });
  }

}

// ============================================================
//  Star  (parallax layers)
// ============================================================
class Star {
  constructor(layer) {
    this.layer = layer;
    this.reset(true);
  }

  reset(randomY = false) {
    this.x = rand(0, CANVAS_W);
    this.y = randomY ? rand(0, CANVAS_H) : -2;

    if (this.layer === 'far') {
      this.size = rand(0.5, 1.2);
      this.speed = rand(0.3, 0.6);
      this.brightness = rand(0.15, 0.4);
    } else {
      this.size = rand(1.5, 2.5);
      this.speed = rand(0.8, 1.5);
      this.brightness = rand(0.5, 1);
    }
  }

  update() {
    this.y += this.speed;
    if (this.y > CANVAS_H) this.reset(false);
  }

  draw(ctx) {
    ctx.fillStyle = `rgba(200,220,255,${this.brightness})`;
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

// ============================================================
//  Player
// ============================================================
class Player {
  constructor() {
    this.w = 28;
    this.h = 32;
    this.x = (CANVAS_W - this.w) / 2;
    this.y = CANVAS_H - 80;
    this.lives = PLAYER_MAX_LIVES;
    this.speed = PLAYER_SPEED;
    this.wideShot = false;
    this.wideShotTimer = 0;
    this.invincible = 0;
  }

  update(keys, mousePos, touchPos) {
    if (keys['ArrowLeft']  || keys['a']) this.x -= this.speed;
    if (keys['ArrowRight'] || keys['d']) this.x += this.speed;
    if (keys['ArrowUp']    || keys['w']) this.y -= this.speed;
    if (keys['ArrowDown']  || keys['s']) this.y += this.speed;

    // Mouse following
    if (mousePos) {
      const dx = mousePos.x - (this.x + this.w / 2);
      const dy = mousePos.y - (this.y + this.h / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2) {
        const step = Math.min(this.speed + 1, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }

    // Touch: move by delta (relative drag)
    if (touchPos && touchPos.dx !== undefined) {
      this.x += touchPos.dx;
      this.y += touchPos.dy;
    }

    this.x = clamp(this.x, 0, CANVAS_W - this.w);
    this.y = clamp(this.y, 0, CANVAS_H - this.h);
    if (this.invincible > 0) this.invincible--;
  }

  draw(ctx) {
    if (this.invincible > 0 && Math.floor(this.invincible / 4) % 2) return;

    const cx = this.x + this.w / 2;
    const glow = this.wideShot ? '#44ccff' : '#00ff88';
    const body = this.wideShot ? '#22aadd' : '#00e070';
    const cock = this.wideShot ? '#88ddff' : '#aaffcc';

    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = this.wideShot ? 18 : 12;

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(cx, this.y);
    ctx.lineTo(this.x, this.y + this.h);
    ctx.lineTo(cx, this.y + this.h - 8);
    ctx.lineTo(this.x + this.w, this.y + this.h);
    ctx.closePath();
    ctx.fill();

    // Wide-shot wing extensions
    if (this.wideShot) {
      ctx.fillStyle = '#22aadd88';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y + this.h);
      ctx.lineTo(this.x - 8, this.y + this.h - 4);
      ctx.lineTo(this.x + 4, this.y + this.h - 10);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(this.x + this.w, this.y + this.h);
      ctx.lineTo(this.x + this.w + 8, this.y + this.h - 4);
      ctx.lineTo(this.x + this.w - 4, this.y + this.h - 10);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = cock;
    ctx.beginPath();
    ctx.moveTo(cx, this.y + 10);
    ctx.lineTo(cx - 5, this.y + 20);
    ctx.lineTo(cx + 5, this.y + 20);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(0,255,200,${rand(0.4, 0.9)})`;
    ctx.fillRect(cx - 5, this.y + this.h - 2, 4, rand(4, 10));
    ctx.fillRect(cx + 1, this.y + this.h - 2, 4, rand(4, 10));
    ctx.restore();
  }
}

// ============================================================
//  Bullet  (supports angled fire for wide-shot)
// ============================================================
class Bullet {
  constructor(x, y, vx = 0, vy = -BULLET_SPEED) {
    this.w = 4;
    this.h = 14;
    this.x = x - this.w / 2;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.alive = true;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    if (this.y + this.h < 0 || this.x < -20 || this.x > CANVAS_W + 20) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    const isAngled = this.vx !== 0;
    ctx.shadowColor = isAngled ? '#66ddff' : '#ffe066';
    ctx.shadowBlur = 8;
    ctx.fillStyle = isAngled ? '#66ddff' : '#ffe066';
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(this.x + 1, this.y, 2, this.h);
    ctx.restore();
  }
}

// ============================================================
//  Enemy  (types: 'normal' | 'sine' | 'charge')
// ============================================================
class Enemy {
  constructor(difficulty, type = 'normal') {
    this.type = type;
    this.w = 26;
    this.h = 26;
    this.x = rand(10, CANVAS_W - this.w - 10);
    this.y = -this.h;
    this.hp = Math.random() < 0.15 + difficulty * 0.02 ? 3 : 1;
    this.maxHp = this.hp;
    this.alive = true;
    this.scoreValue = this.maxHp * 100;
    this.wobblePhase = rand(0, Math.PI * 2);
    this.vx = rand(-0.5, 0.5);

    if (type === 'normal') {
      this.speed = rand(1.2, 2.4) + difficulty * 0.15;
    } else if (type === 'sine') {
      this.speed = rand(1.0, 1.8) + difficulty * 0.1;
      this.originX = this.x;
      this.sineAmp = rand(50, 90);
      this.sineFreq = rand(0.03, 0.055);
      this.scoreValue = Math.round(this.scoreValue * 1.3);
    } else if (type === 'charge') {
      this.speed = rand(0.6, 1.2);
      this.charged = false;
      this.chargeSpeed = rand(9, 14);
      this.scoreValue = Math.round(this.scoreValue * 1.5);
    }
  }

  update(playerCX) {
    if (this.type === 'sine') {
      this.y += this.speed;
      this.wobblePhase += this.sineFreq;
      this.x = this.originX + Math.sin(this.wobblePhase) * this.sineAmp;
      this.x = clamp(this.x, 0, CANVAS_W - this.w);
    } else if (this.type === 'charge') {
      if (!this.charged) {
        this.y += this.speed;
        const myCX = this.x + this.w / 2;
        if (this.y > 30 && Math.abs(myCX - playerCX) < 28) {
          this.charged = true;
        }
      } else {
        this.y += this.chargeSpeed;
      }
      this.x = clamp(this.x, 0, CANVAS_W - this.w);
    } else {
      this.y += this.speed;
      this.wobblePhase += 0.05;
      this.x += Math.sin(this.wobblePhase) * 0.6 + this.vx;
      this.x = clamp(this.x, 0, CANVAS_W - this.w);
    }

    if (this.y > CANVAS_H + 40) this.alive = false;
  }

  draw(ctx) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.save();

    if (this.type === 'sine') {
      this._drawSine(ctx, cx, cy);
    } else if (this.type === 'charge') {
      this._drawCharge(ctx, cx, cy);
    } else {
      this._drawNormal(ctx, cx, cy);
    }

    if (this.maxHp > 1 && this.hp < this.maxHp) {
      ctx.fillStyle = '#440000';
      ctx.fillRect(this.x, this.y - 6, this.w, 3);
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(this.x, this.y - 6, this.w * (this.hp / this.maxHp), 3);
    }
    ctx.restore();
  }

  _drawNormal(ctx, cx, cy) {
    const isStrong = this.maxHp > 1;
    ctx.shadowColor = isStrong ? '#ff4400' : '#ff2244';
    ctx.shadowBlur = 10;
    ctx.fillStyle = isStrong ? '#ff5500' : '#e83050';
    ctx.beginPath();
    ctx.moveTo(cx, this.y + this.h);
    ctx.lineTo(this.x, this.y);
    ctx.lineTo(cx, this.y + 8);
    ctx.lineTo(this.x + this.w, this.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = isStrong ? '#ffaa44' : '#ff8899';
    ctx.fillRect(cx - 3, cy - 3, 6, 6);
  }

  _drawSine(ctx, cx, cy) {
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffaa22';
    ctx.beginPath();
    ctx.moveTo(cx, this.y);
    ctx.lineTo(this.x + this.w, cy);
    ctx.lineTo(cx, this.y + this.h);
    ctx.lineTo(this.x, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffdd88';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawCharge(ctx, cx, cy) {
    const flash = this.charged;
    ctx.shadowColor = flash ? '#ffffff' : '#00ccff';
    ctx.shadowBlur = flash ? 18 : 10;
    ctx.fillStyle = flash ? '#ffffff' : '#00bbee';
    ctx.beginPath();
    ctx.moveTo(cx, this.y + this.h + 4);
    ctx.lineTo(this.x - 2, this.y + 4);
    ctx.lineTo(this.x + 6, this.y);
    ctx.lineTo(cx, this.y + 10);
    ctx.lineTo(this.x + this.w - 6, this.y);
    ctx.lineTo(this.x + this.w + 2, this.y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = flash ? '#aaeeff' : '#88ddff';
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
  }
}

// ============================================================
//  EnemyBullet  (shared by normal enemies + boss)
// ============================================================
class EnemyBullet {
  constructor(x, y, vx, vy, color) {
    this.w = 6; this.h = 6;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.color = color || '#ff66aa';
    this.alive = true;
  }

  static aimed(x, y, tx, ty, speed, color) {
    const dx = tx - x, dy = ty - y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return new EnemyBullet(x, y, (dx / len) * speed, (dy / len) * speed, color);
  }

  static angled(x, y, angle, speed, color) {
    return new EnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color);
  }

  update() {
    this.x += this.vx; this.y += this.vy;
    if (this.y > CANVAS_H + 20 || this.y < -20 ||
        this.x < -20 || this.x > CANVAS_W + 20) this.alive = false;
  }

  draw(ctx) {
    ctx.save();
    ctx.shadowColor = this.color; ctx.shadowBlur = 6;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2, this.y + this.h / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ============================================================
//  Particle
// ============================================================
class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.size = rand(2, 6);
    const angle = rand(0, Math.PI * 2);
    const speed = rand(1.5, 6);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1;
    this.decay = rand(0.015, 0.04);
    this.color = color || '#ff6644';
  }

  update() {
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.98; this.vy *= 0.98;
    this.life -= this.decay;
    if (this.life <= 0) this.life = 0;
  }

  get alive() { return this.life > 0; }

  draw(ctx) {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

// ============================================================
//  SpeedItem
// ============================================================
class SpeedItem {
  constructor(x, y) {
    this.w = 16; this.h = 16;
    this.x = x - this.w / 2; this.y = y;
    this.vy = 1.5; this.alive = true;
    this.phase = rand(0, Math.PI * 2);
  }

  update() {
    this.y += this.vy; this.phase += 0.1;
    if (this.y > CANVAS_H + 20) this.alive = false;
  }

  draw(ctx) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const pulse = 0.7 + Math.sin(this.phase) * 0.3;
    ctx.save();
    ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 10 * pulse;
    ctx.fillStyle = `rgba(68,170,255,${pulse})`;
    ctx.beginPath();
    ctx.moveTo(cx, this.y);
    ctx.lineTo(this.x + this.w, cy);
    ctx.lineTo(cx, this.y + this.h);
    ctx.lineTo(this.x, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#aaddff';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('S', cx, cy + 1);
    ctx.restore();
  }
}

// ============================================================
//  WideShotItem
// ============================================================
class WideShotItem {
  constructor(x, y) {
    this.w = 18; this.h = 18;
    this.x = x - this.w / 2; this.y = y;
    this.vy = 1.3; this.alive = true;
    this.phase = rand(0, Math.PI * 2);
  }

  update() {
    this.y += this.vy; this.phase += 0.12;
    if (this.y > CANVAS_H + 20) this.alive = false;
  }

  draw(ctx) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const pulse = 0.7 + Math.sin(this.phase) * 0.3;
    ctx.save();
    ctx.shadowColor = '#ff44cc'; ctx.shadowBlur = 12 * pulse;
    ctx.fillStyle = `rgba(255,68,204,${pulse})`;
    ctx.beginPath();
    ctx.moveTo(cx, this.y);
    ctx.lineTo(this.x + this.w, cy);
    ctx.lineTo(cx, this.y + this.h);
    ctx.lineTo(this.x, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffaadd';
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('W', cx, cy + 1);
    ctx.restore();
  }
}

// ============================================================
//  Boss
// ============================================================
class Boss {
  constructor(level) {
    this.level = level;
    const sizeScale = Math.min(level, 4);
    this.w = 90 + sizeScale * 10;
    this.h = 60 + sizeScale * 6;
    this.x = (CANVAS_W - this.w) / 2;
    this.y = -this.h - 20;
    this.targetY = 60;
    this.entering = true;
    this.maxHp = 30 + level * 10;
    this.hp = this.maxHp;
    this.alive = true;
    this.scoreValue = 2000 + level * 1000;
    this.movePhase = 0;
    this.moveAmplitude = 80 + level * 10;
    this.attackTimer = 0;
    this.attackCooldown = Math.max(40, 80 - level * 8);
    this.patternIndex = 0;
    this.spiralAngle = 0;
    this.flashTimer = 0;
    this.shakeX = 0;
  }

  get phase() {
    const r = this.hp / this.maxHp;
    if (r > 0.66) return 1;
    if (r > 0.33) return 2;
    return 3;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(playerX, playerY, spawnBullet) {
    if (this.entering) {
      this.y = lerp(this.y, this.targetY, 0.03);
      if (Math.abs(this.y - this.targetY) < 1) {
        this.y = this.targetY; this.entering = false;
      }
      return;
    }
    const speed = 0.015 + (3 - this.phase) * 0.008;
    this.movePhase += speed;
    this.x = (CANVAS_W - this.w) / 2 + Math.sin(this.movePhase) * this.moveAmplitude;
    this.x = clamp(this.x, 10, CANVAS_W - this.w - 10);
    if (this.phase === 3) this.y = this.targetY + Math.sin(this.movePhase * 1.5) * 20;
    if (this.flashTimer > 0) this.flashTimer--;
    this.shakeX = this.flashTimer > 0 ? rand(-3, 3) : 0;
    this.attackTimer++;
    if (this.attackTimer >= this.attackCooldown) {
      this.attackTimer = 0;
      this._attack(playerX, playerY, spawnBullet);
    }
  }

  _attack(px, py, spawn) {
    const cx = this.cx, cy = this.y + this.h;
    const p = this.phase;
    const pat = this.patternIndex % (p === 1 ? 3 : p === 2 ? 4 : 5);
    this.patternIndex++;
    switch (pat) {
      case 0: this._atkFan(cx, cy, px, py, spawn); break;
      case 1: this._atkRadial(cx, cy, spawn); break;
      case 2: this._atkSpiral(cx, cy, spawn); break;
      case 3: this._atkRain(spawn); break;
      case 4: this._atkCross(cx, cy, spawn); break;
    }
  }

  _atkFan(cx, cy, px, py, spawn) {
    const n = 5 + (3 - this.phase) * 2;
    const sp = 0.6 + (3 - this.phase) * 0.15;
    const ba = Math.atan2(py - cy, px - cx);
    const spd = 3 + this.level * 0.3;
    for (let i = 0; i < n; i++) {
      spawn(EnemyBullet.angled(cx, cy, ba - sp / 2 + (sp / (n - 1)) * i, spd, '#ff66aa'));
    }
  }

  _atkRadial(cx, cy, spawn) {
    const n = 12 + (3 - this.phase) * 4;
    const spd = 2.5 + this.level * 0.2;
    for (let i = 0; i < n; i++) spawn(EnemyBullet.angled(cx, cy, (Math.PI * 2 / n) * i, spd, '#ffaa44'));
  }

  _atkSpiral(cx, cy, spawn) {
    const arms = 3 + Math.floor(this.level / 2);
    const spd = 2.8 + this.level * 0.15;
    for (let i = 0; i < arms; i++) spawn(EnemyBullet.angled(cx, cy, this.spiralAngle + (Math.PI * 2 / arms) * i, spd, '#66ddff'));
    this.spiralAngle += 0.3;
  }

  _atkRain(spawn) {
    const n = 6 + this.level, spd = 3 + this.level * 0.2;
    for (let i = 0; i < n; i++) spawn(EnemyBullet.angled(this.x + rand(0, this.w), this.y + this.h, Math.PI / 2 + rand(-0.2, 0.2), spd, '#ff4466'));
  }

  _atkCross(cx, cy, spawn) {
    for (let arm = 0; arm < 4; arm++) {
      const base = this.spiralAngle + (Math.PI / 2) * arm;
      for (let j = 0; j < 3; j++) spawn(EnemyBullet.angled(cx, cy, base + (j - 1) * 0.12, 3 + j * 0.4, '#dd88ff'));
    }
    this.spiralAngle += 0.25;
  }

  _getColors() {
    const lvl = this.level;
    if (lvl === 0) return { hull: '#cc2222', wing: '#991111', shadow: '#ff2200', line: '#ff444444', eye: ['#ff8866', '#ff4444', '#ff0000'] };
    if (lvl === 1) return { hull: '#8822cc', wing: '#6611aa', shadow: '#cc00ff', line: '#aa44ff44', eye: ['#ff44ff', '#ff2244', '#ff0000'] };
    if (lvl === 2) return { hull: '#ccaa22', wing: '#aa8811', shadow: '#ffcc00', line: '#ffaa4444', eye: ['#ffdd44', '#ffaa22', '#ff6600'] };
    const cycle = (lvl - 3) % 3;
    const schemes = [
      { hull: '#22ccaa', wing: '#11aa88', shadow: '#00ffcc', line: '#44ffaa44', eye: ['#44ffdd', '#22ddaa', '#00ff88'] },
      { hull: '#cc2266', wing: '#aa1144', shadow: '#ff0066', line: '#ff448844', eye: ['#ff4488', '#ff2266', '#dd0044'] },
      { hull: '#4466cc', wing: '#3344aa', shadow: '#4488ff', line: '#4488ff44', eye: ['#6699ff', '#4488ff', '#2266dd'] },
    ];
    return schemes[cycle];
  }

  takeDamage(amount) {
    this.hp -= amount; this.flashTimer = 6;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }

  draw(ctx) {
    if (!this.alive) return;
    const colors = this._getColors();
    const lineW = 1 + Math.min(this.level, 5) * 0.5;
    const wingSpan = 20 + Math.min(this.level, 4) * 4;
    ctx.save();
    ctx.translate(this.shakeX, 0);
    const flash = this.flashTimer > 0;
    ctx.shadowColor = flash ? '#ffffff' : colors.shadow;
    ctx.shadowBlur = flash ? 25 : 15 + this.level * 2;
    ctx.fillStyle = flash ? '#ffffff' : colors.hull;
    ctx.beginPath();
    ctx.moveTo(this.x + 10, this.y);
    ctx.lineTo(this.x + this.w - 10, this.y);
    ctx.lineTo(this.x + this.w, this.y + this.h * 0.6);
    ctx.lineTo(this.x + this.w - 15, this.y + this.h);
    ctx.lineTo(this.x + 15, this.y + this.h);
    ctx.lineTo(this.x, this.y + this.h * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = flash ? '#ddddff' : colors.wing;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + this.h * 0.6);
    ctx.lineTo(this.x - wingSpan, this.y + this.h * 0.4);
    ctx.lineTo(this.x - wingSpan / 2, this.y + this.h);
    ctx.lineTo(this.x + 15, this.y + this.h);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(this.x + this.w, this.y + this.h * 0.6);
    ctx.lineTo(this.x + this.w + wingSpan, this.y + this.h * 0.4);
    ctx.lineTo(this.x + this.w + wingSpan / 2, this.y + this.h);
    ctx.lineTo(this.x + this.w - 15, this.y + this.h);
    ctx.closePath(); ctx.fill();
    const pulse = 0.5 + Math.sin(performance.now() * 0.008) * 0.5;
    const eyeRadius = 8 + Math.min(this.level, 4) * 1.5;
    ctx.fillStyle = colors.eye[this.phase - 1];
    ctx.globalAlpha = 0.6 + pulse * 0.4;
    ctx.beginPath(); ctx.arc(this.cx, this.cy - 2, eyeRadius + pulse * 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(this.cx, this.cy - 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = flash ? '#ffffff88' : colors.line; ctx.lineWidth = lineW;
    ctx.beginPath(); ctx.moveTo(this.x + 20, this.y + 5); ctx.lineTo(this.x + this.w - 20, this.y + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(this.x + 25, this.y + this.h - 5); ctx.lineTo(this.x + this.w - 25, this.y + this.h - 5); ctx.stroke();
    ctx.restore();
    this._drawHPBar(ctx);
  }

  _drawHPBar(ctx) {
    const bx = 40, by = 24, bw = CANVAS_W - 80, bh = 8;
    const ratio = this.hp / this.maxHp;
    ctx.fillStyle = '#cc88ff';
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`BOSS  Lv.${this.level + 1}`, CANVAS_W / 2, by - 4);
    ctx.fillStyle = '#220033'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = ['#aa44ff', '#ff6622', '#ff0033'][this.phase - 1];
    ctx.fillRect(bx, by, bw * ratio, bh);
    ctx.strokeStyle = '#cc88ff'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
  }
}

// ============================================================
//  Game
// ============================================================
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    this.sfx = new SoundFX();
    this.state = 'title';

    this.keys = {};
    this.mousePos = null;
    this.mouseInCanvas = false;

    // Touch state
    this.touchActive = false;
    this.touchId = null;
    this.touchPrev = null;     // previous touch position in canvas coords
    this.touchDelta = null;    // {dx, dy} per frame

    // Game objects
    this.starsBack = [];
    this.starsFront = [];
    this.player = null;
    this.bullets = [];
    this.enemies = [];
    this.enemyBullets = [];
    this.particles = [];
    this.items = [];
    this.boss = null;

    // Boss management
    this.bossTimer = BOSS_TIMER_MS;
    this.bossWarning = 0;
    this.bossWarningTriggered = false;
    this.bossCount = 0;
    this.bossActive = false;

    // Timing
    this.lastFireTime = 0;
    this.lastSpawnTime = 0;
    this.playTime = 0;
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('sv_highscore') || '0', 10);

    this.screenShake = 0;

    // UI refs
    this.uiTitle    = document.getElementById('ui-title');
    this.uiGameOver = document.getElementById('ui-gameover');
    this.hudScore   = document.getElementById('hud-score');
    this.hudSpeed   = document.getElementById('hud-speed');
    this.hudLives   = document.getElementById('hud-lives');
    this.finalScoreEl = document.getElementById('final-score-value');
    this.highScoreEl  = document.getElementById('high-score-value');

    this.container = document.getElementById('game-container');

    this._initStars();
    this._bindEvents();
    this._resizeCanvas();
    this._loop = this._loop.bind(this);
    this._lastFrameTime = performance.now();
    requestAnimationFrame(this._loop);
  }

  // ----------------------------------------------------------
  _initStars() {
    this.starsBack  = Array.from({ length: STARS_FAR }, () => new Star('far'));
    this.starsFront = Array.from({ length: STARS_MID }, () => new Star('mid'));
  }

  // ----------------------------------------------------------
  //  Responsive resize
  // ----------------------------------------------------------
  _resizeCanvas() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const aspect = CANVAS_W / CANVAS_H;  // 480/720 = 0.667

    let w, h;
    if (vw / vh < aspect) {
      // Window is narrower than game → fit width
      w = vw;
      h = vw / aspect;
    } else {
      // Window is taller or same → fit height
      h = vh;
      w = vh * aspect;
    }

    this.container.style.width  = Math.floor(w) + 'px';
    this.container.style.height = Math.floor(h) + 'px';
  }

  // ----------------------------------------------------------
  //  Convert a client (screen) coordinate to canvas coords
  // ----------------------------------------------------------
  _clientToCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (CANVAS_W / rect.width),
      y: (clientY - rect.top)  * (CANVAS_H / rect.height),
    };
  }

  // ----------------------------------------------------------
  _bindEvents() {
    // --- Keyboard ---
    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
      if (e.key === ' ') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key] = false; });

    // --- Mouse ---
    this.canvas.addEventListener('mousemove', (e) => {
      this.mousePos = this._clientToCanvas(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('mouseenter', () => { this.mouseInCanvas = true; });
    this.canvas.addEventListener('mouseleave', () => {
      this.mouseInCanvas = false; this.mousePos = null;
    });

    // --- Touch (on canvas) ---
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.touchActive) return;  // only track first finger
      const t = e.changedTouches[0];
      this.touchActive = true;
      this.touchId = t.identifier;
      this.touchPrev = this._clientToCanvas(t.clientX, t.clientY);
      this.touchDelta = null;
      // Resume audio context on first touch
      this.sfx._ensure();
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.touchId) {
          const cur = this._clientToCanvas(t.clientX, t.clientY);
          if (this.touchPrev) {
            this.touchDelta = {
              dx: cur.x - this.touchPrev.x,
              dy: cur.y - this.touchPrev.y,
            };
          }
          this.touchPrev = cur;
          break;
        }
      }
    }, { passive: false });

    const onTouchEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchId) {
          this.touchActive = false;
          this.touchId = null;
          this.touchPrev = null;
          this.touchDelta = null;
          break;
        }
      }
    };
    this.canvas.addEventListener('touchend', onTouchEnd);
    this.canvas.addEventListener('touchcancel', onTouchEnd);

    // --- UI buttons ---
    document.getElementById('btn-start').addEventListener('click', () => this.startGame());
    document.getElementById('btn-retry').addEventListener('click', () => this.startGame());

    // --- Resize ---
    window.addEventListener('resize', () => this._resizeCanvas());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this._resizeCanvas(), 100);
    });
  }

  // ----------------------------------------------------------
  startGame() {
    this.state = 'playing';
    this.player = new Player();
    this.bullets = [];
    this.enemies = [];
    this.enemyBullets = [];
    this.particles = [];
    this.items = [];
    this.boss = null;
    this.bossActive = false;
    this.bossTimer = BOSS_TIMER_MS;
    this.bossWarning = 0;
    this.bossWarningTriggered = false;
    this.bossCount = 0;
    this.score = 0;
    this.playTime = 0;
    this.lastFireTime = 0;
    this.lastSpawnTime = 0;
    this.screenShake = 0;
    this.uiTitle.classList.add('hidden');
    this.uiGameOver.classList.add('hidden');
  }

  gameOver() {
    this.state = 'gameover';
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('sv_highscore', String(this.highScore));
    }
    this.finalScoreEl.textContent = this.score;
    this.highScoreEl.textContent = this.highScore;
    this.uiGameOver.classList.remove('hidden');
  }

  // ----------------------------------------------------------
  get difficulty() {
    const elapsed = BOSS_TIMER_MS - this.bossTimer;
    const progress = clamp(elapsed / BOSS_TIMER_MS, 0, 1);
    return this.bossCount + progress;
  }

  get spawnInterval() {
    return Math.max(MIN_SPAWN_INTERVAL, INITIAL_SPAWN_INTERVAL - this.difficulty * 80);
  }

  get enemyShootChance() {
    return Math.min(0.012 + this.difficulty * 0.002, 0.04);
  }

  // ----------------------------------------------------------
  _loop(now) {
    const dt = now - this._lastFrameTime;
    this._lastFrameTime = now;
    this._update(dt, now);
    this._draw();
    requestAnimationFrame(this._loop);
  }

  // ----------------------------------------------------------
  _update(dt, now) {
    for (const s of this.starsBack)  s.update();
    for (const s of this.starsFront) s.update();

    if (this.state !== 'playing') return;
    this.playTime += dt;

    const pcx = this.player.x + this.player.w / 2;
    const pcy = this.player.y + this.player.h / 2;

    // -- Player (pass touch delta)
    this.player.update(this.keys, this.mouseInCanvas ? this.mousePos : null, this.touchDelta);
    // Consume touch delta after applying it
    this.touchDelta = null;

    // -- Wide shot timer
    if (this.player.wideShot) {
      this.player.wideShotTimer -= dt;
      if (this.player.wideShotTimer <= 0) {
        this.player.wideShot = false;
        this.player.wideShotTimer = 0;
      }
    }

    // -- Auto-fire
    if (now - this.lastFireTime > FIRE_INTERVAL) {
      const px = this.player.x + this.player.w / 2;
      const py = this.player.y;

      if (this.player.wideShot) {
        this.bullets.push(new Bullet(px, py, 0, -BULLET_SPEED));
        this.bullets.push(new Bullet(px - 4, py + 2, -2.2, -BULLET_SPEED + 0.5));
        this.bullets.push(new Bullet(px + 4, py + 2,  2.2, -BULLET_SPEED + 0.5));
        if (this.difficulty >= 4) {
          this.bullets.push(new Bullet(px - 6, py + 4, -3.8, -BULLET_SPEED + 1.5));
          this.bullets.push(new Bullet(px + 6, py + 4,  3.8, -BULLET_SPEED + 1.5));
        }
      } else {
        this.bullets.push(new Bullet(px, py));
        if (this.difficulty >= 4) {
          this.bullets.push(new Bullet(px - 8, py + 6));
          this.bullets.push(new Bullet(px + 8, py + 6));
        }
      }

      this.lastFireTime = now;
      this.sfx.shoot();
    }

    // -- Boss warning / spawn
    this._updateBossLogic(dt);

    // -- Spawn normal enemies
    if (!this.bossWarningTriggered) {
      const interval = this.bossActive ? this.spawnInterval * 3 : this.spawnInterval;
      if (now - this.lastSpawnTime > interval) {
        this.enemies.push(this._createEnemy());
        if (!this.bossActive && this.difficulty >= 3 && Math.random() < 0.4) {
          this.enemies.push(this._createEnemy());
        }
        this.lastSpawnTime = now;
      }
    }

    // -- Update entities
    for (const b of this.bullets) b.update();
    for (const e of this.enemies) {
      e.update(pcx);
      if (e.type !== 'charge' && e.y > 0 && Math.random() < this.enemyShootChance) {
        this.enemyBullets.push(EnemyBullet.aimed(e.x + e.w / 2, e.y + e.h, pcx, pcy, 3.5));
      }
    }

    if (this.boss && this.boss.alive && !this.boss.entering) {
      this.boss.update(pcx, pcy, (b) => this.enemyBullets.push(b));
    } else if (this.boss && this.boss.entering) {
      this.boss.update(0, 0, () => {});
    }

    for (const eb of this.enemyBullets) eb.update();
    for (const p of this.particles) p.update();
    for (const it of this.items) it.update();

    if (this.screenShake > 0) this.screenShake *= 0.9;
    if (this.screenShake < 0.3) this.screenShake = 0;

    // -- Collisions: bullets vs enemies
    for (const b of this.bullets) {
      if (!b.alive) continue;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (aabbCollision(b, e)) {
          b.alive = false;
          e.hp--;
          this._spawnParticles(b.x + b.w / 2, b.y, 3, '#ffe066');
          if (e.hp <= 0) {
            e.alive = false;
            this.score += e.scoreValue;
            this._spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.maxHp > 1);
            this.sfx.explosion();
            if (Math.random() < 0.05) {
              this.items.push(new SpeedItem(e.x + e.w / 2, e.y + e.h / 2));
            } else if (Math.random() < 0.03) {
              this.items.push(new WideShotItem(e.x + e.w / 2, e.y + e.h / 2));
            }
          }
          break;
        }
      }
    }

    // -- Collisions: bullets vs boss
    if (this.boss && this.boss.alive && !this.boss.entering) {
      for (const b of this.bullets) {
        if (!b.alive) continue;
        const bb = { x: this.boss.x - 20, y: this.boss.y, w: this.boss.w + 40, h: this.boss.h };
        if (aabbCollision(b, bb)) {
          b.alive = false;
          this.boss.takeDamage(1);
          this._spawnParticles(b.x + b.w / 2, b.y, 3, '#cc88ff');
          this.sfx.bossHit();
          if (!this.boss.alive) {
            this.score += this.boss.scoreValue;
            this._spawnBossExplosion();
            this._clearBullets();
            this.sfx.bossExplosion();
            this.screenShake = 15;
            if (Math.random() < 0.05) {
              this.items.push(new SpeedItem(this.boss.cx, this.boss.cy));
            } else if (Math.random() < 0.03) {
              this.items.push(new WideShotItem(this.boss.cx, this.boss.cy));
            }
            this.bossActive = false;
            this.bossTimer = BOSS_TIMER_MS;
            this.boss = null;
          }
          break;
        }
      }
    }

    // -- Collisions: enemies vs player
    if (this.player.invincible === 0) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (aabbCollision(this.player, e)) {
          e.alive = false;
          this._spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, false);
          this._playerHit();
        }
      }
    }

    // -- Collisions: enemy bullets vs player
    if (this.player.invincible === 0) {
      for (const eb of this.enemyBullets) {
        if (!eb.alive) continue;
        if (aabbCollision(this.player, eb)) {
          eb.alive = false;
          this._playerHit();
        }
      }
    }

    // -- Collisions: boss body vs player
    if (this.boss && this.boss.alive && this.player.invincible === 0) {
      const bb = { x: this.boss.x, y: this.boss.y, w: this.boss.w, h: this.boss.h };
      if (aabbCollision(this.player, bb)) this._playerHit();
    }

    // -- Collisions: items vs player
    for (const it of this.items) {
      if (!it.alive) continue;
      if (aabbCollision(this.player, it)) {
        it.alive = false;
        if (it instanceof WideShotItem) {
          this.player.wideShot = true;
          this.player.wideShotTimer = WIDE_SHOT_DURATION_MS;
          this.sfx.powerUp();
          this._spawnParticles(this.player.x + this.player.w / 2,
                               this.player.y + this.player.h / 2, 20, '#44ccff');
        } else if (this.player.speed < PLAYER_MAX_SPEED) {
          this.player.speed += 0.5;
          this.sfx.pickup();
          this._spawnParticles(it.x + it.w / 2, it.y + it.h / 2, 8, '#44aaff');
        } else {
          this.score += 50;
          this.sfx.pickup();
          this._spawnParticles(it.x + it.w / 2, it.y + it.h / 2, 5, '#ffffff');
        }
      }
    }

    // -- Cleanup
    this.bullets      = this.bullets.filter(b => b.alive);
    this.enemies      = this.enemies.filter(e => e.alive);
    this.enemyBullets = this.enemyBullets.filter(eb => eb.alive);
    this.particles    = this.particles.filter(p => p.alive);
    this.items        = this.items.filter(it => it.alive);

    // -- HUD
    this.hudScore.textContent = `SCORE: ${this.score}`;
    this.hudSpeed.textContent = `SPD: ${this.player.speed % 1 === 0 ? this.player.speed : this.player.speed.toFixed(1)}`;
    this.hudLives.textContent = '\u2665'.repeat(Math.max(0, this.player.lives));
  }

  // ----------------------------------------------------------
  _createEnemy() {
    const r = Math.random();
    let type = 'normal';
    if (this.difficulty >= 1 && r < 0.20) type = 'sine';
    if (this.difficulty >= 2 && r >= 0.20 && r < 0.35) type = 'charge';
    return new Enemy(this.difficulty, type);
  }

  // ----------------------------------------------------------
  _updateBossLogic(dt) {
    if (this.bossActive) return;

    this.bossTimer -= dt;

    if (this.bossTimer <= BOSS_WARNING_MS && !this.bossWarningTriggered) {
      this.bossWarningTriggered = true;
      this.sfx.warning();
    }

    if (this.bossWarningTriggered) {
      this.bossWarning = Math.max(0, this.bossTimer);
    }

    if (this.bossTimer <= 0) {
      this.bossTimer = 0;
      this.bossWarning = 0;
      this._spawnBoss();
    }
  }

  _spawnBoss() {
    this.boss = new Boss(this.bossCount);
    this.bossActive = true;
    this.bossCount++;
    this.bossWarningTriggered = false;
    this.enemyBullets = [];
  }

  _spawnBossExplosion() {
    if (!this.boss) return;
    const cx = this.boss.cx, cy = this.boss.cy;
    const cols = ['#cc44ff', '#ff44cc', '#ffcc44', '#ffffff', '#ff2244'];
    for (let burst = 0; burst < 5; burst++) {
      const bx = cx + rand(-40, 40), by = cy + rand(-20, 20);
      for (let i = 0; i < 20; i++) {
        const p = new Particle(bx, by, cols[i % cols.length]);
        p.size = rand(3, 9);
        const a = rand(0, Math.PI * 2), sp = rand(2, 8);
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.decay = rand(0.008, 0.025);
        this.particles.push(p);
      }
    }
  }

  _clearBullets() {
    for (const eb of this.enemyBullets) {
      this._spawnParticles(eb.x + eb.w / 2, eb.y + eb.h / 2, 3, '#ffffff');
    }
    this.enemyBullets = [];
  }

  // ----------------------------------------------------------
  _playerHit() {
    this.player.lives--;
    this.player.invincible = 60;
    this.sfx.playerHit();
    this.screenShake = 8;
    this._spawnParticles(
      this.player.x + this.player.w / 2,
      this.player.y + this.player.h / 2,
      15, '#00ff88',
    );
    if (this.player.lives <= 0) this.gameOver();
  }

  _spawnParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color));
  }

  _spawnExplosion(x, y, big) {
    const n = big ? 30 : 16;
    const cols = big
      ? ['#ff5500', '#ff8833', '#ffcc44', '#ffffff']
      : ['#e83050', '#ff6688', '#ffcc44', '#ffffff'];
    for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, cols[i % cols.length]));
  }

  // ----------------------------------------------------------
  //  Draw
  // ----------------------------------------------------------
  _draw() {
    const ctx = this.ctx;
    ctx.save();

    if (this.screenShake > 0) {
      ctx.translate(rand(-this.screenShake, this.screenShake),
                    rand(-this.screenShake, this.screenShake));
    }

    ctx.fillStyle = '#060612';
    ctx.fillRect(-10, -10, CANVAS_W + 20, CANVAS_H + 20);

    for (const s of this.starsBack)  s.draw(ctx);
    for (const s of this.starsFront) s.draw(ctx);

    if (this.state !== 'playing' && this.state !== 'gameover') {
      ctx.restore(); return;
    }

    for (const p of this.particles) p.draw(ctx);
    for (const eb of this.enemyBullets) eb.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    if (this.boss && this.boss.alive) this.boss.draw(ctx);
    for (const it of this.items) it.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    if (this.state === 'playing') this.player.draw(ctx);
    if (this.state === 'playing' && this.player.wideShot) this._drawWideShotTimer(ctx);
    if (this.state === 'playing' && !this.bossActive) this._drawTimer(ctx);
    if (this.bossWarning > 0) this._drawWarning(ctx);

    ctx.restore();
  }

  _drawWarning(ctx) {
    const alpha = 0.3 + Math.sin(performance.now() * 0.012) * 0.2;
    ctx.fillStyle = `rgba(255,0,0,${alpha * 0.15})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 48px monospace';
    ctx.fillStyle = `rgba(255,50,50,${0.5 + Math.sin(performance.now() * 0.015) * 0.5})`;
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 30;
    ctx.fillText('WARNING', CANVAS_W / 2, CANVAS_H / 2 - 20);
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = `rgba(255,150,150,${alpha})`;
    ctx.shadowBlur = 10;
    ctx.fillText(`BOSS APPROACHING! (Level: ${this.bossCount + 1})`, CANVAS_W / 2, CANVAS_H / 2 + 20);
    ctx.restore();
  }

  _drawWideShotTimer(ctx) {
    const secs = Math.ceil(this.player.wideShotTimer / 1000);
    const ratio = this.player.wideShotTimer / WIDE_SHOT_DURATION_MS;
    const urgent = ratio <= 0.3;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = urgent ? '#ff4444' : '#44ccff';
    ctx.shadowColor = urgent ? '#ff0000' : '#44ccff';
    ctx.shadowBlur = urgent ? 12 : 8;
    ctx.fillText(`POWER UP: ${secs}s`, CANVAS_W / 2, CANVAS_H - 30);
    ctx.restore();
  }

  _drawTimer(ctx) {
    const secs = Math.max(0, Math.ceil(this.bossTimer / 1000));
    const urgent = secs <= 5;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = urgent ? '#ff4444' : '#8899bb';
    ctx.shadowColor = urgent ? '#ff0000' : '#000';
    ctx.shadowBlur = urgent ? 8 : 3;
    ctx.fillText(`NEXT BOSS: ${secs}s`, CANVAS_W - 12, 18);
    ctx.restore();
  }

}

// ============================================================
//  Bootstrap
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  new Game(canvas);
});
