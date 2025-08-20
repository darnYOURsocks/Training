import streamlit as st
import textwrap

st.set_page_config(page_title="Training — Sales Flow", layout="wide")

st.title("Training — Sales Flow (Streamlit)")
st.caption(
    "16:9 canvas • Touch control pad • Slower, capped speed profile. "
    "Runs as an embedded HTML5 canvas inside Streamlit."
)

# Optional knobs from Python → JS
base_speed = st.slider("Base Speed", 2.0, 5.0, 3.2, 0.1, help="Overall pace of auto-forward movement.")
gravity = st.slider("Gravity", 0.4, 0.9, 0.55, 0.01, help="Downward acceleration.")
jump_force = st.slider("Jump Force (more negative = higher)", -16.0, -8.0, -11.0, 0.1)
flow_influence = st.slider("Flow Speed Influence", 0.0, 0.01, 0.004, 0.001,
                           help="How much flow increases speed.")
max_speed_mult = st.slider("Max Speed Multiplier", 1.2, 2.5, 1.6, 0.1)

# The entire game runs below as a component
html = f"""
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>Training — Sales Flow</title>
<style>
  :root {{
    --stage-w: 1280px;
    --stage-h: 720px;
  }}
  html, body {{
    margin: 0; padding: 0; background: #000; color: #fff; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }}
  .wrap {{
    width: 100%;
    max-width: 1200px;
    margin: 20px auto;
    aspect-ratio: 16 / 9;
    background: radial-gradient(ellipse at center, #0b0b12 0%, #000 70%);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,.6);
    overflow: hidden;
    position: relative;
  }}
  .stage {{
    position: absolute;
    top: 50%; left: 50%;
    width: var(--stage-w); height: var(--stage-h);
    transform-origin: center center;
  }}
  .hud {{
    position: absolute; top: 12px; left: 12px; right: 12px;
    display: flex; justify-content: space-between; font-size: 12px; pointer-events: none; z-index: 20;
  }}
  .panel {{
    background: rgba(0,0,0,.7); backdrop-filter: blur(6px);
    padding: 8px 12px; border-radius: 8px;
  }}
  .bar {{
    width: 140px; height: 8px; background:#444; border-radius:999px; overflow:hidden;
  }}
  .bar > div {{
    height: 100%; width: 0%; transition: width .3s;
    background: linear-gradient(90deg,#60a5fa,#22c55e);
  }}
  canvas {{ display:block; }}
  /* On-screen controls */
  .pad-left {{
    position:absolute; bottom: 140px; left: 200px; transform: translate(-50%,50%);
    z-index:30; user-select:none;
  }}
  .pad-left .btn {{
    position:absolute; width:80px; height:80px; border-radius:50%;
    border:2px solid rgba(255,255,255,.4);
    color:#fff; font-size:22px; font-weight:700;
    display:flex; align-items:center; justify-content:center;
    backdrop-filter: blur(6px); text-shadow: 0 1px 0 rgba(0,0,0,.5);
  }}
  .btn-left {{ left:0; top:50%; transform: translateY(-50%); background: rgba(59, 201, 219, .35); }}
  .btn-right {{ right:-160px; top:50%; transform: translateY(-50%); background: rgba(34, 197, 94, .35); }}
  .btn:active {{ filter: brightness(1.2); box-shadow: 0 0 24px rgba(255,255,255,.25); }}
  .jump {{
    position:absolute; bottom: 160px; right: 220px; transform: translate(50%,50%);
    width: 96px; height:96px; border-radius:50%; border:2px solid rgba(255,255,255,.5);
    background: rgba(251, 146, 60, .6); color:#fff; font-size:28px; font-weight:800;
    display:flex; align-items:center; justify-content:center; z-index:30; backdrop-filter: blur(6px);
  }}
  .menu {{
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:20;
    background: linear-gradient(180deg, rgba(0,0,0,.0), rgba(0,0,0,.2));
  }}
  .menu .card {{ text-align:center; max-width: 540px; padding: 16px; }}
  .title {{
    font-size: 44px; font-weight: 900;
    background: linear-gradient(90deg, #22d3ee, #a855f7, #ec4899);
    -webkit-background-clip: text; background-clip:text; color: transparent; margin-bottom: 8px;
  }}
  .cta {{
    display:inline-flex; align-items:center; gap:8px; margin-top: 16px;
    padding: 12px 20px; border-radius:999px; font-weight:800;
    background: linear-gradient(90deg,#7c3aed,#ec4899); cursor:pointer; border:none; color:#fff;
    box-shadow: 0 10px 24px rgba(236,72,153,.35);
  }}
</style>
</head>
<body>
  <div class="wrap">
    <div id="stage" class="stage">
      <!-- HUD -->
      <div id="hud" class="hud" style="display:none;">
        <div class="panel">
          <div style="font-size:18px;font-weight:800" id="score">0</div>
          <div>×<span id="mult">1.0</span> • <span id="combo">0</span></div>
        </div>
        <div class="panel" style="text-align:center">
          <div>FLOW</div>
          <div class="bar"><div id="flowbar"></div></div>
        </div>
        <div class="panel">
          <div id="meta">L1 • 0m</div>
          <div id="lives" style="display:flex; gap:4px; margin-top:4px"></div>
        </div>
      </div>

      <canvas id="game" width="1280" height="720"></canvas>

      <!-- Control Pad -->
      <div class="pad-left" id="pad" style="display:none;">
        <div class="btn btn-left" id="btn-left" aria-label="left">◀</div>
        <div class="btn btn-right" id="btn-right" aria-label="right">▶</div>
      </div>
      <div class="jump" id="btn-jump" style="display:none;" aria-label="jump">🎯</div>

      <!-- Menus -->
      <div id="menu" class="menu">
        <div class="card">
          <div class="title">SALES FLOW</div>
          <div style="color:#cbd5e1">Optimized for 16:9 • Touch control pad • Slower, smoother flow</div>
          <div style="display:grid; grid-template-columns:repeat(7, 32px); gap:6px; justify-content:center; margin:14px 0;">
            <div title="SOFT" style="width:32px;height:32px;border-radius:16px;background:#4CAF50;display:flex;align-items:center;justify-content:center">🤝</div>
            <div title="NO_SELL" style="width:32px;height:32px;border-radius:16px;background:#03A9F4;display:flex;align-items:center;justify-content:center">💬</div>
            <div title="HARD" style="width:32px;height:32px;border-radius:16px;background:#F44336;display:flex;align-items:center;justify-content:center">⚡</div>
            <div title="WALK" style="width:32px;height:32px;border-radius:16px;background:#9E9E9E;display:flex;align-items:center;justify-content:center">🚶</div>
            <div title="EMOTION" style="width:32px;height:32px;border-radius:16px;background:#E91E63;display:flex;align-items:center;justify-content:center">❤️</div>
            <div title="LOGIC" style="width:32px;height:32px;border-radius:16px;background:#9C27B0;display:flex;align-items:center;justify-content:center">🧠</div>
            <div title="CLOSE" style="width:32px;height:32px;border-radius:16px;background:#FF9800;display:flex;align-items:center;justify-content:center">🎯</div>
          </div>
          <button id="start" class="cta">▶ ENTER THE FLOW</button>
        </div>
      </div>

      <div id="gameover" class="menu" style="display:none;">
        <div class="card">
          <div class="title" style="color:#f87171; -webkit-text-fill-color: initial;">FLOW BROKEN</div>
          <div id="final" style="margin:8px 0 16px 0"></div>
          <button id="retry" class="cta">⟲ RETRY FLOW</button>
        </div>
      </div>
    </div>
  </div>

<script>
(() => {{
  const DESIGN_WIDTH = 1280, DESIGN_HEIGHT = 720;
  const GRAVITY = {gravity};
  const JUMP_FORCE = {jump_force};
  const BASE_SPEED = {base_speed};
  const MAX_SPEED_MULT = {max_speed_mult};
  const FLOW_SPEED_INFLUENCE = {flow_influence};
  const PLAYER_SIZE = 25;

  const TECHNIQUES = {{
    SOFT:    {{ color: '#4CAF50', icon:'🤝', beat: 0.5 }},
    NO_SELL: {{ color: '#03A9F4', icon:'💬', beat: 0.3 }},
    HARD:    {{ color: '#F44336', icon:'⚡',  beat: 1.2 }},
    WALK:    {{ color: '#9E9E9E', icon:'🚶', beat: 0.1 }},
    EMOTION: {{ color: '#E91E63', icon:'❤️', beat: 0.8 }},
    LOGIC:   {{ color: '#9C27B0', icon:'🧠', beat: 0.7 }},
    CLOSE:   {{ color: '#FF9800', icon:'🎯', beat: 1.0 }}
  }};

  const PROSPECT_RHYTHMS = {{
    ANALYTICAL: {{ colors: ['NO_SELL','LOGIC','CLOSE'], tempo: 120 }},
    EMOTIONAL:  {{ colors: ['SOFT','EMOTION','CLOSE'],  tempo: 100 }},
    EXECUTIVE:  {{ colors: ['NO_SELL','LOGIC','CLOSE'], tempo: 140 }},
    SKEPTICAL:  {{ colors: ['NO_SELL','WALK','SOFT','CLOSE'], tempo: 90 }},
    FRIENDLY:   {{ colors: ['SOFT','EMOTION','CLOSE'], tempo: 110 }},
    AGGRESSIVE: {{ colors: ['HARD','LOGIC','CLOSE'], tempo: 130 }}
  }};

  const wrap = document.querySelector('.wrap');
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const hud = document.getElementById('hud');
  const scoreEl = document.getElementById('score');
  const multEl = document.getElementById('mult');
  const comboEl = document.getElementById('combo');
  const flowBar = document.getElementById('flowbar');
  const metaEl = document.getElementById('meta');
  const livesEl = document.getElementById('lives');

  const menu = document.getElementById('menu');
  const gameover = document.getElementById('gameover');
  const finalEl = document.getElementById('final');
  const startBtn = document.getElementById('start');
  const retryBtn = document.getElementById('retry');

  const pad = document.getElementById('pad');
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnJump = document.getElementById('btn-jump');

  let state = 'menu';
  let animation = null;
  let score=0, multiplier=1, combo=0, level=1, lives=3, flow=0, sessionSec=0;

  const game = {{
    player: {{ x:100, y:300, vx:0, vy:0, w:PLAYER_SIZE, h:PLAYER_SIZE, grounded:false, trail:[] }},
    camera: {{ x:0, shake:0 }},
    obstacles:[], collectibles:[], prospects:[], particles:[],
    keys: {{}}, time:0, beatTime:0, seq:[]
  }};

  function resize() {{
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const scale = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT);
    stage.style.transform = `translate(-50%, -50%) scale(${{scale}})`;
  }}
  window.addEventListener('resize', resize); resize();

  function setState(s) {{
    state = s;
    if (s === 'menu') {{
      hud.style.display = 'none';
      pad.style.display = 'none';
      btnJump.style.display = 'none';
      menu.style.display = '';
      gameover.style.display = 'none';
    }} else if (s === 'playing') {{
      hud.style.display = '';
      pad.style.display = '';
      btnJump.style.display = '';
      menu.style.display = 'none';
      gameover.style.display = 'none';
    }} else if (s === 'gameOver') {{
      hud.style.display = 'none';
      pad.style.display = 'none';
      btnJump.style.display = 'none';
      menu.style.display = 'none';
      gameover.style.display = '';
    }}
  }}

  function tone(freq=420, dur=0.08, type='sine') {{
    try {{
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!tone.ctx) tone.ctx = new AC();
      const ctx = tone.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(.006, ctx.currentTime + dur);
      osc.start(); osc.stop(ctx.currentTime + dur);
    }} catch {{}}
  }}

  function puff(x,y,color, n=10) {{
    for (let i=0;i<n;i++) {{
      game.particles.push({{
        x:x+(Math.random()-.5)*20, y:y+(Math.random()-.5)*20,
        vx:(Math.random()-.5)*6, vy:(Math.random()-.5)*6-2,
        life:1, color, size: Math.random()*3+2
      }});
    }}
  }}

  function generateLevel() {{
    game.obstacles.length=0; game.collectibles.length=0; game.prospects.length=0;
    const diff = level;
    for (let i=0;i<40+diff*8;i++) {{
      const x = 500 + i*(140 + Math.sin(i*.3)*40);
      const h = 50 + Math.sin(i*.5)*30;
      game.obstacles.push({{ x, y:360+Math.sin(i*.4)*100, w:20, h, pulse:i*.2 }});
    }}
    const tkeys = Object.keys(TECHNIQUES);
    for (let i=0;i<60+diff*12;i++) {{
      const key = tkeys[Math.floor(Math.random()*tkeys.length)];
      const x = 400 + i*(90 + Math.sin(i*.6)*30);
      const y = 220 + Math.sin(i*.8 + TECHNIQUES[key].beat)*140;
      game.collectibles.push({{ x, y, t:key, got:false, pulse:i*.3, mag:0 }});
    }}
    const ptypes = Object.keys(PROSPECT_RHYTHMS);
    for (let i=0;i<4+Math.floor(diff/2);i++) {{
      const type = ptypes[Math.floor(Math.random()*ptypes.length)];
      game.prospects.push({{ x:900+i*500, y:300, type, satisfied:false, approaching:false }});
    }}
    game.time=0; game.beatTime=0; game.seq.length=0;
  }}

  function drawHUD() {{
    scoreEl.textContent = score.toLocaleString();
    multEl.textContent = multiplier.toFixed(1);
    comboEl.textContent = combo;
    flowBar.style.width = Math.max(0, Math.min(100, flow)).toFixed(0) + '%';
    metaEl.textContent = 'L'+level+' • '+Math.floor(sessionSec/60)+'m';
    livesEl.innerHTML = ''; for (let i=0;i<lives;i++) {{
      const dot=document.createElement('div');
      dot.style.width='8px'; dot.style.height='8px'; dot.style.background='#ef4444';
      dot.style.borderRadius='4px'; livesEl.appendChild(dot);
    }}
  }}

  function startGame() {{
    score=0; multiplier=1; combo=0; level=1; lives=3; flow=0; sessionSec=0;
    game.player = {{ x:100, y:300, vx:0, vy:0, w:PLAYER_SIZE, h:PLAYER_SIZE, grounded:false, trail:[] }};
    generateLevel();
    if (!animation) animation = requestAnimationFrame(loop);
    setState('playing');
  }}

  function endGame() {{
    setState('gameOver');
    finalEl.innerHTML = `
      <div style="font-size:20px;font-weight:800">${{score.toLocaleString()}}</div>
      <div style="color:#cbd5e1">Level: ${{level}} • Max Combo: ${{combo}}</div>
    `;
  }}

  // Keyboard
  window.addEventListener('keydown', (e) => {{
    game.keys[e.key] = true;
    if (state!=='playing') return;
    if (e.key===' ' || e.key==='ArrowUp' || e.key.toLowerCase()==='w') {{
      if (game.player.grounded || game.player.vy > -5) {{
        const rb = Math.sin(game.beatTime*4) * .25 + 1;
        game.player.vy = {jump_force} * rb;
        tone(420, .08);
      }}
    }}
  }});
  window.addEventListener('keyup', (e) => game.keys[e.key] = false);

  // Touch pad
  const touchHold = (el, on, off) => {{
    let down = false;
    const start = (ev) => {{ ev.preventDefault(); down = true; on(); }};
    const end = (ev) => {{ ev.preventDefault(); down = false; off(); }};
    el.addEventListener('touchstart', start, {{passive:false}});
    el.addEventListener('touchend', end, {{passive:false}});
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', () => {{ if (down) off(); }});
  }};
  let padState = {{ left:false, right:false, jump:false }};
  touchHold(btnLeft, ()=>padState.left=true, ()=>padState.left=false);
  touchHold(btnRight, ()=>padState.right=true, ()=>padState.right=false);
  touchHold(btnJump, ()=>padState.jump=true, ()=>padState.jump=false);

  // Loop
  function loop() {{
    animation = requestAnimationFrame(loop);
    if (state!=='playing') return;

    const g = game, p = g.player, cam = g.camera;
    g.time += 0.016; g.beatTime += 0.032;

    const targetSpeed = BASE_SPEED * (1 + flow * FLOW_SPEED_INFLUENCE);
    const currentSpeed = Math.min(targetSpeed, BASE_SPEED * MAX_SPEED_MULT);

    // bg
    const bg = Math.floor(18 + flow * 0.4);
    ctx.fillStyle = `rgb(${{bg}},${{bg}},${{Math.floor(bg*1.1)}})`; ctx.fillRect(0,0,DESIGN_WIDTH,DESIGN_HEIGHT);

    // input → vx
    if (g.keys['ArrowLeft'] || g.keys['a'] || g.keys['A'] || padState.left) p.vx = -4;
    else if (g.keys['ArrowRight'] || g.keys['d'] || g.keys['D'] || padState.right) p.vx = 4;
    else p.vx *= .85;

    if (padState.jump && (p.grounded || p.vy > -5)) {{
      const rb = Math.sin(g.beatTime*4)*.25 + 1;
      p.vy = JUMP_FORCE * rb;
    }}

    // physics
    p.vy += GRAVITY; p.vy = Math.min(p.vy, 13);
    p.x += currentSpeed + p.vx; p.y += p.vy;

    // camera
    cam.x = p.x - DESIGN_WIDTH * .3; cam.shake *= .9;
    const sx = (Math.random()-.5) * cam.shake;
    const sy = (Math.random()-.5) * cam.shake;

    // ground
    if (p.y > 470) {{ p.y=470; p.vy=0; p.grounded=true; }} else p.grounded=false;

    // trail
    p.trail.push({{x:p.x,y:p.y,life:1}}); if (p.trail.length>18) p.trail.shift();
    p.trail.forEach(t => t.life *= .94);

    // trail draw
    ctx.save(); ctx.translate(-cam.x+sx, sy);
    p.trail.forEach(t => {{
      if (t.life>.1) {{
        ctx.globalAlpha = t.life*.5;
        ctx.fillStyle = `hsl(${{180 + flow*2}},70%,60%)`;
        const s = t.life*7; ctx.fillRect(t.x-s/2, t.y-s/2, s, s);
      }}
    }});
    ctx.restore(); ctx.globalAlpha=1;

    // obstacles
    for (const ob of g.obstacles) {{
      const pulse = Math.sin(g.beatTime*3 + ob.pulse)*5 + 1;
      if (
        p.x + p.w > ob.x - pulse &&
        p.x < ob.x + ob.w + pulse &&
        p.y + p.h > ob.y - pulse &&
        p.y < ob.y + ob.h + pulse
      ) {{
        lives -= 1; flow = Math.max(0, flow-10); multiplier=1; combo=0;
        cam.shake = 16; puff(p.x, p.y, '#FF4444', 14); tone(220,.25,'sawtooth');
        p.y = 330; p.vy = 0;
        if (lives <= 0) return endGame();
      }}
      ctx.save(); ctx.translate(-cam.x+sx, sy);
      ctx.fillStyle = 'rgba(255,100,100,.55)';
      ctx.fillRect(ob.x-pulse, ob.y-pulse, ob.w+pulse*2, ob.h+pulse*2);
      ctx.restore();
    }}

    // collectibles
    for (const c of g.collectibles) {{
      if (c.got) continue;
      const dx = p.x-c.x, dy=p.y-c.y;
      const dist = Math.hypot(dx,dy);
      if (dist<90) {{ c.mag = Math.min(1, c.mag+.12); c.x += dx*c.mag*.08; c.y += dy*c.mag*.08; }}
      if (dist<28) {{
        c.got = true; g.seq.push(c.t);
        const acc = 1 - Math.abs((g.beatTime%1)-.5)*2;
        const pts = Math.floor(8*multiplier*(1+acc));
        score += pts; combo += 1; flow = Math.min(100, flow + 1 + acc*2);
        if (acc>.8) multiplier = Math.min(8, multiplier + .15);
        puff(c.x,c.y,TECHNIQUES[c.t].color,10); tone(440 + combo*18, .08);
      }}
      if (!c.got) {{
        ctx.save(); ctx.translate(-cam.x+sx, sy);
        const t = TECHNIQUES[c.t];
        const pulse = Math.sin(g.beatTime*4 + c.pulse)*3 + 1;
        const glow = Math.sin(g.beatTime*2)*.3 + .7;
        ctx.shadowBlur=14; ctx.shadowColor=t.color; ctx.fillStyle=t.color; ctx.globalAlpha=glow;
        ctx.beginPath(); ctx.arc(c.x, c.y, 8+pulse, 0, Math.PI*2); ctx.fill();
        ctx.restore(); ctx.globalAlpha=1; ctx.shadowBlur=0;
      }}
    }}

    // prospects
    for (const pr of g.prospects) {{
      const dist = Math.abs(p.x - pr.x);
      if (dist < 220 && !pr.satisfied) {{
        pr.approaching = true;
        if (dist < 60 && g.seq.length>0) {{
          const ok = g.seq.some(t => PROSPECT_RHYTHMS[pr.type].colors.includes(t));
          if (ok && g.seq.includes('CLOSE')) {{
            pr.satisfied = true;
            const bonus = 90 * multiplier * g.seq.length;
            score += bonus; flow = Math.min(100, flow+10); multiplier = Math.min(8, multiplier+1);
            puff(pr.x, pr.y, '#44FF44', 14); tone(660, .4); g.seq.length = 0;
          }}
        }}
      }}
      ctx.save(); ctx.translate(-cam.x+sx, sy);
      if (pr.satisfied) {{ ctx.fillStyle='#44FF44'; ctx.shadowBlur=18; ctx.shadowColor='#44FF44'; }}
      else if (pr.approaching) {{
        const a = Math.sin((g.beatTime * PROSPECT_RHYTHMS[pr.type].tempo)/30)*.3 + .7;
        ctx.fillStyle = `rgba(255,200,100,${{a}})`;
      }} else ctx.fillStyle = '#888';
      ctx.fillRect(pr.x-15, pr.y-15, 30, 30);
      ctx.restore(); ctx.shadowBlur=0;
    }}

    // player
    ctx.save(); ctx.translate(-cam.x+sx, sy);
    const hue = 180 + flow*1.8;
    ctx.fillStyle = `hsl(${{hue}},70%,${{50 + flow*.3}}%)`;
    ctx.shadowBlur = 8 + flow*.2; ctx.shadowColor = `hsl(${{hue}},100%,50%)`;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.restore(); ctx.shadowBlur=0;

    // particles
    for (let i=g.particles.length-1;i>=0;i--) {{
      const part = g.particles[i];
      part.x += part.vx; part.y += part.vy; part.vy += .18; part.life -= .02;
      if (part.life<=0) {{ g.particles.splice(i,1); continue; }}
      ctx.save(); ctx.translate(-cam.x+sx, sy);
      ctx.globalAlpha = part.life; ctx.fillStyle = part.color;
      ctx.beginPath(); ctx.arc(part.x, part.y, part.size, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }}
    ctx.globalAlpha=1;

    // HUD
    sessionSec += 1/60;
    flow = Math.max(0, flow - .08);
    drawHUD();

    // progress
    if (p.x > 1800 + level*900) {{ level += 1; generateLevel(); }}
  }}

  // Lives seed
  drawHUD();

  // Buttons
  startBtn.addEventListener('click', () => startGame());
  retryBtn.addEventListener('click', () => startGame());

  // Kick initial state
  setState('menu');
}})();
</script>
</body>
</html>
"""

# Render the game inside Streamlit
st.components.v1.html(html, height=760, scrolling=False)

st.markdown(
    """
**How to run locally**
