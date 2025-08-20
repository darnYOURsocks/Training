// SalesFlowGame.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw } from 'lucide-react';

/** ---------- Tunables for pacing & display ---------- **/
const DESIGN_WIDTH = 1280;     // 16:9 reference canvas
const DESIGN_HEIGHT = 720;
const GRAVITY = 0.55;          // slightly softer gravity
const JUMP_FORCE = -11;        // tuned for new gravity
const BASE_SPEED = 3.2;        // **slower** base speed
const MAX_SPEED_MULT = 1.6;    // cap overall speed
const FLOW_SPEED_INFLUENCE = 0.004; // gentler flow influence
const PLAYER_SIZE = 25;

/** ---------- Visual technique data ---------- **/
const TECHNIQUES = {
  SOFT:    { color: '#4CAF50', beat: 0.5, energy: 'calm',     icon: '🤝' },
  NO_SELL: { color: '#03A9F4', beat: 0.3, energy: 'neutral',  icon: '💬' },
  HARD:    { color: '#F44336', beat: 1.2, energy: 'intense',  icon: '⚡' },
  WALK:    { color: '#9E9E9E', beat: 0.1, energy: 'retreat',  icon: '🚶' },
  EMOTION:{ color: '#E91E63', beat: 0.8, energy: 'warm',      icon: '❤️' },
  LOGIC:   { color: '#9C27B0', beat: 0.7, energy: 'structured', icon: '🧠' },
  CLOSE:   { color: '#FF9800', beat: 1.0, energy: 'decisive', icon: '🎯' }
};

const PROSPECT_RHYTHMS = {
  ANALYTICAL: { pattern: [0.3, 0.7, 1.0], colors: ['NO_SELL','LOGIC','CLOSE'], tempo: 120 },
  EMOTIONAL:  { pattern: [0.5, 0.8, 1.0], colors: ['SOFT','EMOTION','CLOSE'],  tempo: 100 },
  EXECUTIVE:  { pattern: [0.3, 0.7, 1.0], colors: ['NO_SELL','LOGIC','CLOSE'], tempo: 140 },
  SKEPTICAL:  { pattern: [0.3, 0.1, 0.5, 1.0], colors: ['NO_SELL','WALK','SOFT','CLOSE'], tempo: 90 },
  FRIENDLY:   { pattern: [0.5, 0.8, 1.0], colors: ['SOFT','EMOTION','CLOSE'], tempo: 110 },
  AGGRESSIVE: { pattern: [1.2, 0.7, 1.0], colors: ['HARD','LOGIC','CLOSE'], tempo: 130 }
};

const SalesFlowGame = () => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationRef = useRef(null);

  const [gameState, setGameState] = useState('menu');
  const [score, setScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [combo, setCombo] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const [gameSpeed, setGameSpeed] = useState(0.9); // start a bit slower
  const [flowState, setFlowState] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);

  // Touch controls (now with D-pad on the left + Jump on the right)
  const [touchControls, setTouchControls] = useState({ left: false, right: false, jump: false });
  const [colorPulse, setColorPulse] = useState({ left: 0, right: 0, jump: 0 });

  // Simple haptics toggle
  const [hapticFeedback] = useState(true);

  // Pixel buffer is fixed at 1280x720; we scale CSS for 16:9 in any viewport.
  const [scale, setScale] = useState(1);

  const gameRefs = useRef({
    player: { x: 100, y: 300, vx: 0, vy: 0, width: PLAYER_SIZE, height: PLAYER_SIZE, grounded: false, trail: [] },
    camera: { x: 0, shake: 0 },
    obstacles: [],
    collectibles: [],
    prospects: [],
    particles: [],
    keys: {},
    time: 0,
    beatTime: 0,
    techniqueSequence: [],
    backgroundPulse: 0,
    screenFlash: 0
  });

  /** ---------- Utility ---------- **/
  const triggerHaptic = (type = 'light') => {
    if (!hapticFeedback || !navigator.vibrate) return;
    const patterns = {
      light: 10,
      success: [25, 10, 25],
      error: [100, 40, 100]
    };
    navigator.vibrate(patterns[type] ?? 10);
  };

  const createTone = (frequency, duration = 0.08, type = 'sine') => {
    if (!audioContextRef.current) {
      try { audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { return; }
    }
    try {
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.006, ctx.currentTime + duration);
      osc.start(); osc.stop(ctx.currentTime + duration);
    } catch {}
  };

  /** ---------- Level generation (unchanged logic, friendlier counts) ---------- **/
  const generateLevel = useCallback(() => {
    const game = gameRefs.current;
    const difficulty = level;
    game.obstacles = [];
    game.collectibles = [];
    game.prospects = [];

    // Slightly fewer obstacles when speed is slow
    for (let i = 0; i < 40 + difficulty * 8; i++) {
      const x = 500 + i * (140 + Math.sin(i * 0.3) * 40);
      const height = 50 + Math.sin(i * 0.5) * 30;
      game.obstacles.push({
        x,
        y: 360 + Math.sin(i * 0.4) * 100,
        width: 20,
        height,
        type: 'spike',
        pulsePhase: i * 0.2,
        tempo: 100 + difficulty * 8,
        dangerous: true
      });
    }

    const techniqueKeys = Object.keys(TECHNIQUES);
    for (let i = 0; i < 60 + difficulty * 12; i++) {
      const technique = techniqueKeys[Math.floor(Math.random() * techniqueKeys.length)];
      const x = 400 + i * (90 + Math.sin(i * 0.6) * 30);
      const y = 220 + Math.sin(i * 0.8 + TECHNIQUES[technique].beat) * 140;
      game.collectibles.push({ x, y, technique, collected: false, pulsePhase: i * 0.3, magnetism: 0 });
    }

    const prospectTypes = Object.keys(PROSPECT_RHYTHMS);
    for (let i = 0; i < 4 + Math.floor(difficulty / 2); i++) {
      const type = prospectTypes[Math.floor(Math.random() * prospectTypes.length)];
      game.prospects.push({
        x: 900 + i * 500, y: 300, type, rhythm: PROSPECT_RHYTHMS[type],
        phase: 0, satisfied: false, approaching: false, pulseIntensity: 0
      });
    }

    game.time = 0; game.beatTime = 0; game.techniqueSequence = [];
  }, [level]);

  /** ---------- 16:9 Scaler ---------- **/
  useEffect(() => {
    const handleResize = () => {
      const el = containerRef.current;
      if (!el) return;
      const { clientWidth: w, clientHeight: h } = el;
      // Scale to fit while preserving 16:9
      const scale = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT);
      setScale(scale);
      setIsMobile(w < 900 || 'ontouchstart' in window);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /** ---------- Session timer ---------- **/
  useEffect(() => {
    const t = setInterval(() => {
      if (gameState === 'playing') setSessionTime(v => v + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [gameState]);

  /** ---------- Input ---------- **/
  useEffect(() => {
    const down = (e) => {
      const g = gameRefs.current;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        if (g.player.grounded || g.player.vy > -5) {
          const rhythmBonus = Math.sin(g.beatTime * 4) * 0.25 + 1;
          g.player.vy = JUMP_FORCE * rhythmBonus;
          createTone(420, 0.08);
        }
      }
      g.keys[e.key] = true;
    };
    const up = (e) => { gameRefs.current.keys[e.key] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const setPad = (dir, val) => {
    setTouchControls(prev => ({ ...prev, [dir]: val }));
    setColorPulse(prev => ({ ...prev, [dir]: val ? 1 : 0 }));
    if (dir === 'jump' && val) triggerHaptic('light');
  };

  /** ---------- Particles ---------- **/
  const puff = (x, y, color, kind = 'success') => {
    const g = gameRefs.current;
    const n = kind === 'explosion' ? 14 : 6;
    for (let i = 0; i < n; i++) {
      g.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 2,
        life: 1,
        color,
        size: Math.random() * 3 + 2
      });
    }
  };

  /** ---------- Game Loop ---------- **/
  const updateGame = useCallback(() => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const g = gameRefs.current;
    const { player, camera } = g;

    g.time += 0.016 * gameSpeed;
    g.beatTime += 0.016 * gameSpeed * 2;

    // Manageable speed profile
    const targetSpeed = BASE_SPEED * (1 + flowState * FLOW_SPEED_INFLUENCE);
    const currentSpeed = Math.min(targetSpeed, BASE_SPEED * MAX_SPEED_MULT);

    // Clear background
    const bg = Math.floor(18 + flowState * 0.4);
    ctx.fillStyle = `rgb(${bg},${bg},${Math.floor(bg * 1.1)})`;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // Movement (keyboard or pad)
    if (g.keys['ArrowLeft'] || g.keys['a'] || touchControls.left) player.vx = -4;
    else if (g.keys['ArrowRight'] || g.keys['d'] || touchControls.right) player.vx = 4;
    else player.vx *= 0.85;

    // Jump from pad
    if (touchControls.jump && (player.grounded || player.vy > -5)) {
      const rhythmBonus = Math.sin(g.beatTime * 4) * 0.25 + 1;
      player.vy = JUMP_FORCE * rhythmBonus;
    }

    // Physics
    player.vy += GRAVITY;
    player.vy = Math.min(player.vy, 13);

    // Auto-forward always on (keeps flow), pad only adds strafe
    player.x += currentSpeed + player.vx;
    player.y += player.vy;

    // Camera
    camera.x = player.x - DESIGN_WIDTH * 0.3;
    camera.shake *= 0.9;
    const shakeX = (Math.random() - 0.5) * camera.shake;
    const shakeY = (Math.random() - 0.5) * camera.shake;

    // Ground
    if (player.y > 470) { player.y = 470; player.vy = 0; player.grounded = true; }
    else player.grounded = false;

    // Trail
    player.trail.push({ x: player.x, y: player.y, life: 1 });
    if (player.trail.length > 18) player.trail.shift();
    player.trail.forEach(p => (p.life *= 0.94));

    // Draw trail
    ctx.save(); ctx.translate(-camera.x + shakeX, shakeY);
    player.trail.forEach(p => {
      if (p.life > 0.1) {
        ctx.globalAlpha = p.life * 0.5;
        ctx.fillStyle = `hsl(${180 + flowState * 2},70%,60%)`;
        const s = p.life * 7;
        ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
      }
    });
    ctx.restore();
    ctx.globalAlpha = 1;

    // Obstacles
    g.obstacles.forEach(ob => {
      const pulse = Math.sin(g.beatTime * 3 + ob.pulsePhase) * 5 + 1;

      // Collision
      if (
        player.x + player.width > ob.x - pulse &&
        player.x < ob.x + ob.width + pulse &&
        player.y + player.height > ob.y - pulse &&
        player.y < ob.y + ob.height + pulse
      ) {
        setLives(v => v - 1);
        setFlowState(v => Math.max(0, v - 10));
        setMultiplier(1); setCombo(0);
        camera.shake = 16; g.screenFlash = 0.4;
        puff(player.x, player.y, '#FF4444', 'explosion');
        createTone(220, 0.25, 'sawtooth'); triggerHaptic('error');
        // Small knockback
        player.y = 330; player.vy = 0;
      }

      // Draw
      ctx.save(); ctx.translate(-camera.x + shakeX, shakeY);
      ctx.fillStyle = `rgba(255,100,100,${0.55})`;
      ctx.fillRect(ob.x - pulse, ob.y - pulse, ob.width + pulse*2, ob.height + pulse*2);
      ctx.restore();
    });

    // Collectibles
    g.collectibles.forEach(c => {
      if (c.collected) return;
      const dx = player.x - c.x, dy = player.y - c.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 90) {
        c.magnetism = Math.min(1, c.magnetism + 0.12);
        c.x += dx * c.magnetism * 0.08;
        c.y += dy * c.magnetism * 0.08;
      }

      if (dist < 28) {
        c.collected = true;
        g.techniqueSequence.push(c.technique);
        const beatAcc = 1 - Math.abs((g.beatTime % 1) - 0.5) * 2;
        const points = Math.floor(8 * multiplier * (1 + beatAcc));
        setScore(v => v + points);
        setCombo(v => v + 1);
        setFlowState(v => Math.min(100, v + 1 + beatAcc * 2));
        if (beatAcc > 0.8) setMultiplier(v => Math.min(8, v + 0.15));
        puff(c.x, c.y, TECHNIQUES[c.technique].color);
        createTone(440 + combo * 18, 0.08);
      }

      if (!c.collected) {
        ctx.save(); ctx.translate(-camera.x + shakeX, shakeY);
        const tech = TECHNIQUES[c.technique];
        const pulse = Math.sin(g.beatTime * 4 + c.pulsePhase) * 3 + 1;
        const glow = Math.sin(g.beatTime * 2) * 0.3 + 0.7;
        ctx.shadowBlur = 14; ctx.shadowColor = tech.color;
        ctx.fillStyle = tech.color; ctx.globalAlpha = glow;
        ctx.beginPath(); ctx.arc(c.x, c.y, 8 + pulse, 0, Math.PI * 2); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
    });

    // Prospects
    g.prospects.forEach(p => {
      const dist = Math.abs(player.x - p.x);
      if (dist < 220 && !p.satisfied) {
        p.approaching = true;
        if (dist < 60 && g.techniqueSequence.length > 0) {
          const match = g.techniqueSequence.some(t => p.rhythm.colors.includes(t));
          if (match && g.techniqueSequence.includes('CLOSE')) {
            p.satisfied = true;
            const bonus = 90 * multiplier * g.techniqueSequence.length;
            setScore(v => v + bonus);
            setFlowState(v => Math.min(100, v + 10));
            setMultiplier(v => Math.min(8, v + 1));
            g.screenFlash = 0.25; puff(p.x, p.y, '#44FF44', 'explosion');
            createTone(660, 0.4); g.techniqueSequence = [];
          }
        }
      }

      // Draw prospect
      ctx.save(); ctx.translate(-camera.x + shakeX, shakeY);
      if (p.satisfied) { ctx.fillStyle = '#44FF44'; ctx.shadowBlur = 18; ctx.shadowColor = '#44FF44'; }
      else if (p.approaching) { const a = Math.sin((g.beatTime * p.rhythm.tempo)/30) * 0.3 + 0.7; ctx.fillStyle = `rgba(255,200,100,${a})`; }
      else ctx.fillStyle = '#888';
      ctx.fillRect(p.x - 15, p.y - 15, 30, 30);
      ctx.restore(); ctx.shadowBlur = 0;
    });

    // Player
    ctx.save(); ctx.translate(-camera.x + shakeX, shakeY);
    const hue = 180 + flowState * 1.8;
    ctx.fillStyle = `hsl(${hue},70%,${50 + flowState * 0.3}%)`;
    ctx.shadowBlur = 8 + flowState * 0.2;
    ctx.shadowColor = `hsl(${hue},100%,50%)`;
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.restore(); ctx.shadowBlur = 0;

    // Particles
    g.particles.forEach((p, i) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= 0.02;
      if (p.life <= 0) { g.particles.splice(i, 1); return; }
      ctx.save(); ctx.translate(-camera.x + shakeX, shakeY);
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });
    ctx.globalAlpha = 1;

    // Gentle flow decay + clamp speed
    setFlowState(v => Math.max(0, v - 0.08));
    setGameSpeed(() => Math.min(MAX_SPEED_MULT, 1 + flowState * FLOW_SPEED_INFLUENCE));

    // Level progress (distance tuned for slower speed)
    if (player.x > 1800 + level * 900) {
      setLevel(v => v + 1);
      generateLevel();
    }
  }, [gameState, gameSpeed, flowState, multiplier, combo, level, touchControls, generateLevel]);

  useEffect(() => {
    const loop = () => { updateGame(); animationRef.current = requestAnimationFrame(loop); };
    if (gameState === 'playing') animationRef.current = requestAnimationFrame(loop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [updateGame, gameState]);

  /** ---------- Controls ---------- **/
  const startGame = () => {
    setGameState('playing');
    setScore(0); setMultiplier(1); setCombo(0); setLevel(1); setLives(3);
    setFlowState(0); setGameSpeed(0.9);
    gameRefs.current.player = { x: 100, y: 300, vx: 0, vy: 0, width: PLAYER_SIZE, height: PLAYER_SIZE, grounded: false, trail: [] };
    generateLevel();
  };

  const resetToMenu = () => setGameState('menu');

  /** ---------- Render ---------- **/
  return (
    <div className="min-h-screen w-full bg-black text-white flex items-center justify-center">
      {/* 16:9 Stage Container */}
      <div
        ref={containerRef}
        className="relative"
        style={{
          width: '100%',
          maxWidth: '1200px',
          aspectRatio: '16 / 9',
          // letterbox if needed
          background: 'radial-gradient(ellipse at center, #0b0b12 0%, #000 70%)',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
          overflow: 'hidden'
        }}
      >
        {/* Fixed-resolution canvas scaled to container */}
        <div
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: DESIGN_WIDTH, height: DESIGN_HEIGHT,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center center'
          }}
        >
          {/* HUD */}
          {gameState !== 'playing' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center">
              {gameState === 'menu' && (
                <div className="text-center space-y-6 px-6">
                  <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-400 bg-clip-text text-transparent">
                    SALES FLOW
                  </h1>
                  <p className="text-base text-gray-300">Optimized for 16:9. Touch control pad enabled. Slower, smoother flow.</p>
                  <div className="grid grid-cols-7 gap-1 mb-6 mx-auto w-fit">
                    {Object.entries(TECHNIQUES).map(([k, t]) => (
                      <div key={k} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: t.color }}>{t.icon}</div>
                    ))}
                  </div>
                  <button
                    onClick={startGame}
                    className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-bold text-lg hover:scale-110 transition-transform duration-200 shadow-lg hover:shadow-pink-500/50"
                  >
                    <Play className="inline mr-2" />
                    ENTER THE FLOW
                  </button>
                </div>
              )}
              {gameState === 'gameOver' && (
                <div className="text-center space-y-4 px-6">
                  <div className="text-4xl font-bold text-red-400">FLOW BROKEN</div>
                  <div className="space-y-1">
                    <div className="text-2xl">{score.toLocaleString()}</div>
                    <div className="text-sm">Level: {level}</div>
                    <div className="text-sm">Max Combo: {combo}</div>
                  </div>
                  <div className="space-y-2">
                    <button onClick={startGame} className="block w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-bold hover:scale-105 transition-transform duration-200">
                      <RotateCcw className="inline mr-2" /> RETRY FLOW
                    </button>
                    <button onClick={resetToMenu} className="block w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-full font-semibold hover:scale-105 transition-transform duration-200">
                      EXIT TO MENU
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Live HUD (top) */}
          {gameState === 'playing' && (
            <div className="absolute top-3 left-3 right-3 z-20 flex justify-between text-xs pointer-events-none">
              <div className="bg-black/70 backdrop-blur px-3 py-2 rounded-md">
                <div className="text-lg font-bold">{score.toLocaleString()}</div>
                <div>x{multiplier.toFixed(1)} • {combo}</div>
              </div>
              <div className="bg-black/70 backdrop-blur px-3 py-2 rounded-md text-center">
                <div>FLOW</div>
                <div className="w-28 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${flowState > 70
                      ? 'bg-gradient-to-r from-yellow-400 to-red-500'
                      : 'bg-gradient-to-r from-blue-400 to-green-400'}`}
                    style={{ width: `${flowState}%` }}
                  />
                </div>
              </div>
              <div className="bg-black/70 backdrop-blur px-3 py-2 rounded-md">
                <div>L{level} • {Math.floor(sessionTime / 60)}m</div>
                <div className="flex gap-1 mt-1">
                  {Array.from({ length: lives }, (_, i) => (
                    <div key={i} className="w-2 h-2 bg-red-500 rounded-full" />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Canvas */}
          <canvas
            ref={canvasRef}
            width={DESIGN_WIDTH}
            height={DESIGN_HEIGHT}
            className="block"
          />

          {/* On‑screen Control Pad (touch-friendly, inside scaled stage) */}
          {gameState === 'playing' && (
            <>
              {/* Left D‑pad */}
              <div className="absolute bottom-36 left-32 z-30 select-none"
                   style={{ transform: 'translate(-50%, 50%)' }}>
                <div className="relative w-140 h-140"
                     style={{ width: 140, height: 140 }}>
                  {/* Left */}
                  <button
                    onTouchStart={(e) => { e.preventDefault(); setPad('left', true); }}
                    onTouchEnd={(e) => { e.preventDefault(); setPad('left', false); }}
                    onMouseDown={() => setPad('left', true)}
                    onMouseUp={() => setPad('left', false)}
                    className={`absolute top-1/2 left-0 -translate-y-1/2 w-20 h-20 rounded-full border-2 backdrop-blur-sm
                               ${touchControls.left ? 'bg-cyan-600/70' : 'bg-cyan-500/40'} border-cyan-300`}
                    style={{ boxShadow: colorPulse.left ? '0 0 20px #22d3ee' : 'none' }}
                    aria-label="move left"
                  >◀</button>

                  {/* Right */}
                  <button
                    onTouchStart={(e) => { e.preventDefault(); setPad('right', true); }}
                    onTouchEnd={(e) => { e.preventDefault(); setPad('right', false); }}
                    onMouseDown={() => setPad('right', true)}
                    onMouseUp={() => setPad('right', false)}
                    className={`absolute top-1/2 right-0 -translate-y-1/2 w-20 h-20 rounded-full border-2 backdrop-blur-sm
                               ${touchControls.right ? 'bg-green-600/70' : 'bg-green-500/40'} border-green-300`}
                    style={{ boxShadow: colorPulse.right ? '0 0 20px #22c55e' : 'none' }}
                    aria-label="move right"
                  >▶</button>
                </div>
              </div>

              {/* Jump Button */}
              <button
                onTouchStart={(e) => { e.preventDefault(); setPad('jump', true); }}
                onTouchEnd={(e) => { e.preventDefault(); setPad('jump', false); }}
                onMouseDown={() => setPad('jump', true)}
                onMouseUp={() => setPad('jump', false)}
                className={`absolute bottom-40 right-48 z-30 w-24 h-24 rounded-full border-2 backdrop-blur-sm text-xl font-bold
                           ${touchControls.jump ? 'bg-orange-600/80' : 'bg-orange-500/60'} border-orange-300`}
                style={{ boxShadow: colorPulse.jump ? '0 0 24px #fb923c' : 'none', transform: 'translate(50%, 50%)' }}
                aria-label="jump"
              >
                {TECHNIQUES.CLOSE.icon}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesFlowGame;
