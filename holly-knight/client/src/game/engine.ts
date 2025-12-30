// Core game logic separate from React rendering
export interface Point {
  x: number;
  y: number;
}

export interface GameState {
  score: number;
  speed: number;
  distance: number;
  isGameOver: boolean;
  isPlaying: boolean;
  time: number;
  dayNightCycle: number; // 0 to 1
  isInvincible: boolean;
  invincibilityTimer: number;
}

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number = 0;
  height: number = 0;
  
  // Game State
  state: GameState = {
    score: 0,
    speed: 0,
    distance: 0,
    isGameOver: false,
    isPlaying: false,
    time: 0,
    dayNightCycle: 0,
    isInvincible: false,
    invincibilityTimer: 0
  };

  // Physics constants
  readonly GRAVITY = 0.6;
  readonly FRICTION = 0.99;
  readonly BOOST = 0.2;
  readonly MAX_SPEED = 12; 
  readonly JUMP_FORCE = -12.5; // Slightly increased for more height
  
  // Entities
  player: { x: number; y: number; dy: number; rotation: number; grounded: boolean } = {
    x: 200, y: 0, dy: 0, rotation: 0, grounded: false
  };
  
  terrainPoints: Point[] = [];
  obstacles: { x: number; type: 'rock' | 'tree' }[] = [];
  codeOrbs: { x: number; y: number; value: string; collected: boolean }[] = [];
  powerups: { x: number; y: number; type: 'coffee' | 'firewall'; collected: boolean }[] = [];
  lastPowerupTime: number = 0;
  particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
  bgStars: { x: number; y: number; size: number; alpha: number }[] = [];
  lastCommitDistance: number = 0;
  commitMarkers: { x: number; y: number }[] = [];
  speechTimer: number = 0;
  thoughtDisplayTimer: number = 0;
  currentThought: string = "";
  readonly THOUGHTS = [
    "It works on my machine...",
    "Is it a bug or a feature?",
    "Just one more line...",
    "I use Arch btw",
    "git push --force",
    "Ctrl+C, Ctrl+V",
    "I speak Binary.",
    "Wait, did I save?",
    "Deploying on Friday...",
    "Who wrote this code? Oh, me.",
    "Searching Stack Overflow..."
  ];

  // Inputs
  keys: { space: boolean } = { space: false };
  isOnGround: boolean = false;
  
  // Callbacks
  onGameOver?: (score: number) => void;
  onScoreUpdate?: (score: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    this.initStars();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    
    // Regenerate terrain if empty
    if (this.terrainPoints.length === 0) {
      this.generateInitialTerrain();
    }
  }

  initStars() {
    this.bgStars = [];
    for (let i = 0; i < 100; i++) {
      this.bgStars.push({
        x: Math.random() * this.width,
        y: Math.random() * (this.height * 0.6),
        size: Math.random() * 2,
        alpha: Math.random()
      });
    }
  }

  generateInitialTerrain() {
    this.terrainPoints = [];
    let x = 0;
    let y = this.height * 0.75; // Lowered from 0.6 to show more sky
    
    while (x < this.width + 1200) {
      this.terrainPoints.push({ x, y });
      x += 60; 
      y += (Math.random() - 0.5) * 60; // Reduced variation slightly
      // Clamp height - lowered range
      if (y < this.height * 0.5) y = this.height * 0.5;
      if (y > this.height * 0.9) y = this.height * 0.9;
    }
    
    // Initial player position
    this.player.y = this.getTerrainHeightAt(this.player.x) - 15;
  }

  start() {
    this.state = {
      score: 0,
      speed: 5,
      distance: 0,
      isGameOver: false,
      isPlaying: true,
      time: 0,
      dayNightCycle: 0,
      isInvincible: false,
      invincibilityTimer: 0
    };
    this.player = { x: 200, y: 0, dy: 0, rotation: 0, grounded: false };
    this.obstacles = [];
    this.codeOrbs = [];
    this.particles = [];
    this.lastCommitDistance = 0;
    this.commitMarkers = [];
    this.speechTimer = 0;
    this.thoughtDisplayTimer = 0;
    this.currentThought = "";
    this.generateInitialTerrain();
  }

  jump() {
    if (this.isOnGround) {
      this.player.dy = this.JUMP_FORCE;
      this.isOnGround = false;
      this.createParticles(this.player.x, this.player.y + 10, 15, '#fff');
      return true;
    }
    return false;
  }

  update() {
    if (!this.state.isPlaying || this.state.isGameOver) return;

    this.state.time++;
    this.state.dayNightCycle = (Math.sin(this.state.time * 0.001) + 1) / 2; // Cycle 0-1
    
    // Invincibility Timer
    if (this.state.invincibilityTimer > 0) {
      this.state.invincibilityTimer--;
      if (this.state.invincibilityTimer === 0) {
        this.state.isInvincible = false;
      }
    }
    
    // Physics
    this.player.dy += this.GRAVITY;
    this.player.y += this.player.dy;
    
    // Terrain collision
    const segmentWidth = 60;
    const segmentIndex = Math.floor((this.player.x + this.state.distance) / segmentWidth);
    const segmentProgress = ((this.player.x + this.state.distance) % segmentWidth) / segmentWidth;
    
    // Find matching terrain points more reliably
    const p1 = this.terrainPoints.find(p => p.x >= (this.player.x + this.state.distance) - segmentWidth) || { x: 0, y: this.height };
    const p2 = this.terrainPoints.find(p => p.x > p1.x) || p1;
    
    const terrainHeight = p1.y + (p2.y - p1.y) * segmentProgress;
    const slope = (p2.y - p1.y) / segmentWidth;
    
    const SLEIGH_HEIGHT = 15;
    const COLLISION_MARGIN = 5;
    if (this.player.y >= terrainHeight - SLEIGH_HEIGHT - COLLISION_MARGIN) {
      this.player.y = terrainHeight - SLEIGH_HEIGHT;
      this.player.dy = 0;
      this.isOnGround = true;
      this.player.rotation = Math.atan2(p2.y - p1.y, segmentWidth);
      
      // Speed based on slope - reduced variation
      this.state.speed += slope * 0.15;
      if (this.state.speed < 4) this.state.speed = 4;
      if (this.state.speed > this.MAX_SPEED) this.state.speed = this.MAX_SPEED;
    } else {
      this.isOnGround = false;
      this.player.rotation += 0.02; // Rotate while in air
    }
    
    // Clamp player within screen height to prevent falling off bottom
    if (this.player.y > this.height - 50) {
      this.player.y = this.height - 50;
      this.gameOver();
    }
    
    // Move world
    this.state.distance += this.state.speed;
    this.state.score = Math.floor(this.state.distance / 10);
    this.onScoreUpdate?.(this.state.score);

    // Git Commit Markers logic
    if (this.state.distance - this.lastCommitDistance >= 2500) {
      this.lastCommitDistance = Math.floor(this.state.distance / 2500) * 2500;
      this.commitMarkers.push({
        x: this.state.distance + this.width,
        y: this.getTerrainHeightAt(this.state.distance + this.width)
      });
    }

    // Rubber Duck Thoughts logic
    this.speechTimer++;
    if (this.speechTimer >= 10 * 60) { // 10 seconds at 60fps
      this.speechTimer = 0;
      this.currentThought = this.THOUGHTS[Math.floor(Math.random() * this.THOUGHTS.length)];
      this.thoughtDisplayTimer = 4 * 60; // 4 seconds
    }
    if (this.thoughtDisplayTimer > 0) {
      this.thoughtDisplayTimer--;
    }

    // Generate new terrain
    const lastPoint = this.terrainPoints[this.terrainPoints.length - 1];
    if (lastPoint.x - this.state.distance < this.width + 400) {
      const x = lastPoint.x + 60;
      let y = lastPoint.y + (Math.random() - 0.5) * 90; // Natural heights
      
      // Keep within bounds - lowered
      if (y < this.height * 0.5) y = this.height * 0.5;
      if (y > this.height * 0.9) y = this.height * 0.9;
      
      this.terrainPoints.push({ x, y });
      
      // Chance to spawn obstacle
      // Spawning earlier: check distance > 300 (approx 3-4 seconds)
      // Added minimum spacing: 400 pixels between obstacles
      const lastObs = this.obstacles[this.obstacles.length - 1];
      const spacing = lastObs ? x - lastObs.x : 1000;
      
      if (Math.random() < 0.15 && this.state.distance > 300 && spacing > 400) {
        this.obstacles.push({ 
          x: x, 
          type: Math.random() > 0.5 ? 'rock' : 'tree' 
        });
      }

      // Spawn Power-ups
      const timeSinceLastPowerup = this.state.time - this.lastPowerupTime;
      if (Math.random() < 0.025 && this.state.distance > 800 && timeSinceLastPowerup > 5 * 60) {
        this.lastPowerupTime = this.state.time;
        this.powerups.push({
          x: x,
          y: y - 100, // Jump height
          type: Math.random() > 0.33 ? 'coffee' : 'firewall', // 1/3 chance for firewall (1 shield for every 2 coffee)
          collected: false
        });
      }

      // Spawn Code Orbs
      if (Math.random() < 0.08 && this.state.distance > 500) {
        const orbValues = ['{', '}', '</>', ':=', '&&', '||'];
        this.codeOrbs.push({
          x: x,
          y: y - 80 - Math.random() * 100, // Spawned above terrain
          value: orbValues[Math.floor(Math.random() * orbValues.length)],
          collected: false
        });
      }
    }
    
    // Clean up old terrain
    if (this.terrainPoints[0].x - this.state.distance < -100) {
      this.terrainPoints.shift();
    }
    
    // Update Obstacles & Check Collision
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      const screenX = obs.x - this.state.distance;
      
      // Remove off-screen
      if (screenX < -100) {
        this.obstacles.splice(i, 1);
        continue;
      }
      
      // Simple collision box
      if (
        Math.abs(screenX - this.player.x) < 30 &&
        Math.abs(this.player.y - (this.getTerrainHeightAt(obs.x) - 10)) < 30
      ) {
        if (!this.state.isInvincible) {
          this.gameOver();
        }
      }
    }

    // Update Power-ups & Check Collision
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      const screenX = pu.x - this.state.distance;

      if (screenX < -100) {
        this.powerups.splice(i, 1);
        continue;
      }

      if (!pu.collected) {
        const dx = screenX - this.player.x;
        const dy = pu.y - this.player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 40) {
          pu.collected = true;
          if (pu.type === 'coffee') {
            this.state.speed += 3.5;
            this.createParticles(screenX, pu.y, 15, '#fbbf24');
          } else if (pu.type === 'firewall') {
            this.state.isInvincible = true;
            this.state.invincibilityTimer = 5 * 60; // 5 seconds
            this.createParticles(screenX, pu.y, 15, '#3b82f6');
          }
        }
      }
    }

    // Update Code Orbs & Check Collision
    for (let i = this.codeOrbs.length - 1; i >= 0; i--) {
      const orb = this.codeOrbs[i];
      const screenX = orb.x - this.state.distance;

      // Remove off-screen
      if (screenX < -100) {
        this.codeOrbs.splice(i, 1);
        continue;
      }

      if (!orb.collected) {
        const dx = screenX - this.player.x;
        const dy = orb.y - this.player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 40) {
          orb.collected = true;
          this.state.score += 50;
          this.onScoreUpdate?.(this.state.score);
          this.createParticles(screenX, orb.y, 10, '#00ff00');
        }
      }
    }
    
    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    
    // Constant snow trail
    if (this.player.grounded && this.state.speed > 8) {
      this.createParticles(this.player.x - 20, this.player.y + 10, 1, 'rgba(255,255,255,0.5)');
    }
  }

  getTerrainHeightAt(x: number) {
    const relativeX = x; // Terrain array stores absolute X
    // Find segment
    const segmentIndex = this.terrainPoints.findIndex(p => p.x >= relativeX) - 1;
    if (segmentIndex < 0) return this.height / 2;
    
    const p1 = this.terrainPoints[segmentIndex];
    const p2 = this.terrainPoints[segmentIndex + 1];
    if (!p2) return p1.y;
    
    const progress = (relativeX - p1.x) / (p2.x - p1.x);
    return p1.y + (p2.y - p1.y) * progress;
  }

  gameOver() {
    this.state.isGameOver = true;
    this.state.isPlaying = false;
    this.onGameOver?.(this.state.score);
    // Screen shake effect
    this.canvas.style.transform = 'translate(5px, 5px)';
    setTimeout(() => this.canvas.style.transform = 'none', 50);
  }

  createParticles(x: number, y: number, count: number, color: string) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 1.0,
        color
      });
    }
  }

  draw() {
    // Clear
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // Sky Gradient (Day/Night cycle)
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    // Interpolate colors based on dayNightCycle
    // Night: #0f172a, Sunset: #4c1d95, Day: #0ea5e9 (Simplified logic)
    const t = this.state.dayNightCycle;
    
    // Deep purple/blue night
    gradient.addColorStop(0, `rgba(15, 23, 42, 1)`); 
    gradient.addColorStop(1, `rgba(88, 28, 135, ${0.5 + t * 0.5})`);
    
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Draw Stars (parallax)
    this.ctx.fillStyle = `rgba(255, 255, 255, ${0.8 - t * 0.8})`; // Fade out during 'day'
    this.bgStars.forEach(star => {
      this.ctx.beginPath();
      const px = (star.x - this.state.distance * 0.05) % this.width;
      const x = px < 0 ? px + this.width : px;
      this.ctx.arc(x, star.y, star.size, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // Aurora (Procedural)
    // Even more prominent aurora
    const auroraAlpha = 0.85; 
    this.drawAurora(auroraAlpha);

    // Terrain
    this.ctx.beginPath();
    if (this.terrainPoints.length > 0) {
      const first = this.terrainPoints[0];
      this.ctx.moveTo(first.x - this.state.distance, this.height);
      this.ctx.lineTo(first.x - this.state.distance, first.y);
      
      for (let i = 0; i < this.terrainPoints.length - 1; i++) {
        const p1 = this.terrainPoints[i];
        const p2 = this.terrainPoints[i + 1];
        const xc = (p1.x + p2.x) / 2;
        const yc = (p1.y + p2.y) / 2;
        this.ctx.quadraticCurveTo(p1.x - this.state.distance, p1.y, xc - this.state.distance, yc);
      }
      
      const last = this.terrainPoints[this.terrainPoints.length - 1];
      this.ctx.lineTo(last.x - this.state.distance, this.height);
    }
    this.ctx.fillStyle = '#f8fafc'; // Snow white
    this.ctx.fill();
    
    // Terrain Shadow/Depth
    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 5;
    this.ctx.stroke();

    // Obstacles
    this.obstacles.forEach(obs => {
      const x = obs.x - this.state.distance;
      const y = this.getTerrainHeightAt(obs.x);
      
      if (obs.type === 'rock') {
        this.ctx.fillStyle = '#64748b';
        this.ctx.beginPath();
        // Stone partially buried in snow
        this.ctx.moveTo(x - 25, y + 10);
        this.ctx.lineTo(x - 15, y - 25);
        this.ctx.lineTo(x + 15, y - 30);
        this.ctx.lineTo(x + 25, y + 10);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Stone highlights
        this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // 404 Text
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = 'bold 14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('404', x, y - 5);
      } else {
        // Xmas Tree (Taller tiered style)
        // Trunk
        this.ctx.fillStyle = '#451a03'; 
        this.ctx.fillRect(x - 4, y - 20, 8, 20);

        // Circular tiers with "decorations"
        this.ctx.fillStyle = '#064e3b';
        
        // Bottom tier
        this.ctx.beginPath();
        this.ctx.arc(x, y - 25, 18, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Middle tier
        this.ctx.beginPath();
        this.ctx.arc(x, y - 45, 14, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Top tier
        this.ctx.beginPath();
        this.ctx.arc(x, y - 60, 9, 0, Math.PI * 2);
        this.ctx.fill();

        // Star on top (Glowing)
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#facc15';
        this.ctx.fillStyle = '#facc15';
        this.ctx.beginPath();
        this.ctx.arc(x, y - 72, 5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        // More baubles and lights
        const time = Date.now() * 0.005;
        const colors = ['#ef4444', '#3b82f6', '#facc15', '#ffffff', '#ec4899'];
        for (let i = 0; i < 8; i++) {
          this.ctx.fillStyle = colors[i % colors.length];
          const radius = 15 - (i * 1.5);
          const angle = time + (i * Math.PI * 0.5);
          const ox = Math.sin(angle) * radius;
          const oy = Math.cos(angle * 0.5) * 5;
          this.ctx.beginPath();
          this.ctx.arc(x + ox, y - 25 - i * 6 + oy, 2.5, 0, Math.PI * 2);
          this.ctx.fill();
        }

        // Tinsel/Garland effect
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(x - 15, y - 25);
        this.ctx.quadraticCurveTo(x, y - 15, x + 15, y - 25);
        this.ctx.stroke();
      }
    });

    // Draw Code Orbs
    this.codeOrbs.forEach(orb => {
      if (!orb.collected) {
        const x = orb.x - this.state.distance;
        this.ctx.fillStyle = '#00ff00';
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#00ff00';
        this.ctx.font = 'bold 24px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(orb.value, x, orb.y);
        this.ctx.shadowBlur = 0;
      }
    });

    // Draw Power-ups
    this.powerups.forEach(pu => {
      if (!pu.collected) {
        const x = pu.x - this.state.distance;
        this.ctx.font = '24px serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(pu.type === 'coffee' ? '☕' : '🛡️', x, pu.y);
      }
    });

    // Player (Duck pulling Sleigh)
    this.ctx.save();
    this.ctx.translate(this.player.x, this.player.y);
    this.ctx.rotate(this.player.rotation);
    
    // Sleigh base (Thin brown plank)
    this.ctx.fillStyle = '#78350f'; 
    this.ctx.beginPath();
    this.ctx.roundRect(-20, 0, 40, 4, 2);
    this.ctx.fill();

    // Santa in the back
    this.ctx.save();
    this.ctx.translate(-10, 0); // Position Santa in the back of the sleigh

    // Santa Body (Tilted forward slightly)
    this.ctx.fillStyle = '#ef4444';
    this.ctx.beginPath();
    this.ctx.ellipse(-2, -8, 10, 12, 0.2, 0, Math.PI * 2);
    this.ctx.fill();

    // Belt
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(-10, -8, 18, 3);

    // Beard (Proper fluffy beard)
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(8, -10, 6, 0, Math.PI * 2);
    this.ctx.arc(6, -6, 5, 0, Math.PI * 2);
    this.ctx.arc(10, -6, 4, 0, Math.PI * 2);
    this.ctx.fill();

    // Face
    this.ctx.fillStyle = '#fecaca';
    this.ctx.beginPath();
    this.ctx.arc(8, -14, 5, 0, Math.PI * 2);
    this.ctx.fill();

    // Eyes
    this.ctx.fillStyle = '#000';
    this.ctx.beginPath();
    this.ctx.arc(10, -15, 1, 0, Math.PI * 2);
    this.ctx.fill();

    // Proper Hat
    this.ctx.fillStyle = '#ef4444';
    this.ctx.beginPath();
    this.ctx.moveTo(4, -18);
    this.ctx.lineTo(12, -18);
    this.ctx.quadraticCurveTo(8, -28, 0, -26);
    this.ctx.fill();
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(0, -26, 3, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
    
    // Rope
    this.ctx.strokeStyle = '#d4d4d8';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(20, 2);
    this.ctx.lineTo(35, -5);
    this.ctx.stroke();

    // Yellow Rubber Duck
    this.ctx.translate(40, -5); // Position duck in front

    // Invincibility Shield
    if (this.state.isInvincible) {
      this.ctx.save();
      this.ctx.strokeStyle = '#3b82f6';
      this.ctx.lineWidth = 3;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = '#3b82f6';
      this.ctx.beginPath();
      // Shield around both duck and sleigh roughly
      this.ctx.arc(-20, 0, 45, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
    
    // Duck Body
    this.ctx.fillStyle = '#facc15'; // Yellow
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Duck Head
    this.ctx.beginPath();
    this.ctx.arc(8, -8, 7, 0, Math.PI * 2);
    this.ctx.fill();

    // Duck Eye
    this.ctx.fillStyle = '#000';
    this.ctx.beginPath();
    this.ctx.arc(11, -10, 1.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Duck Beak
    this.ctx.fillStyle = '#fb923c'; // Orange
    this.ctx.beginPath();
    this.ctx.moveTo(14, -8);
    this.ctx.lineTo(20, -7);
    this.ctx.lineTo(14, -5);
    this.ctx.fill();
    
    this.ctx.restore();

    // Duck Thought Bubble
    if (this.thoughtDisplayTimer > 0) {
      this.ctx.save();
      // Position above the duck (which is translated to 40, -5 from player)
      this.ctx.translate(this.player.x + 40, this.player.y - 45);
      
      this.ctx.font = '12px sans-serif';
      const metrics = this.ctx.measureText(this.currentThought);
      const padding = 8;
      const w = metrics.width + padding * 2;
      const h = 24;

      this.ctx.fillStyle = 'white';
      this.ctx.beginPath();
      this.ctx.roundRect(-w/2, -h, w, h, 6);
      this.ctx.fill();

      // Bubble pointer
      this.ctx.beginPath();
      this.ctx.moveTo(-5, 0);
      this.ctx.lineTo(5, 0);
      this.ctx.lineTo(0, 5);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.fillStyle = 'black';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(this.currentThought, 0, -h/2 + 4);
      this.ctx.restore();
    }
    
    // Particles
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1;

    // Draw Git Commit Markers
    this.commitMarkers.forEach(marker => {
      const x = marker.x - this.state.distance;
      if (x > -100 && x < this.width + 100) {
        const y = this.getTerrainHeightAt(marker.x);
        
        // Flag pole
        this.ctx.strokeStyle = '#22c55e';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x, y - 50);
        this.ctx.stroke();

        // Oval Box
        this.ctx.fillStyle = '#22c55e';
        this.ctx.beginPath();
        this.ctx.ellipse(x + 40, y - 50, 45, 12, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 12px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("GIT COMMIT", x + 40, y - 46);
      }
    });

    // Developer Humor Easter Eggs
    if (this.state.isPlaying) {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      this.ctx.font = '12px monospace';
      this.ctx.textAlign = 'left';
      this.ctx.fillText("Welcome to the chill zone. No deadlines here.", 20, this.height - 20);
    }

    if (this.state.isGameOver) {
      this.ctx.fillStyle = '#ef4444';
      this.ctx.font = 'bold 14px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText("Uncaught ReferenceError: Skill not found.", this.width / 2, this.height / 2 + 120);
      this.ctx.fillText("Drink more coffee to resolve.", this.width / 2, this.height / 2 + 140);
    }

    // Foreground Snow (Randomized natural pattern)
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.font = '14px monospace';
    const tTime = Date.now() / 1000;
    for(let i=0; i<150; i++) {
      // Use unique pseudo-random seeds per particle
      const seedX = (i * 154.123);
      const seedY = (i * 721.456);
      const speedX = 30 + (Math.sin(i) * 20);
      const speedY = 60 + (Math.cos(i) * 30);
      
      const sx = (seedX + tTime * speedX) % this.width;
      const sy = (seedY + tTime * speedY) % this.height;
      
      this.ctx.beginPath();
      const char = i % 2 === 0 ? '0' : '1';
      this.ctx.fillText(char, sx, sy);
    }
  }

  drawAurora(alpha: number) {
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    
    const time = Date.now() * 0.001;
    
    // Multi-layered horizontal bands with soft gradients - Made more vibrant
    const bands = [
      { y: 60, color: '#22c55e', speed: 0.3, height: 120 }, // Green
      { y: 120, color: '#a855f7', speed: 0.2, height: 150 }, // Purple
      { y: 180, color: '#38bdf8', speed: 0.4, height: 100 }  // Cyan
    ];

    bands.forEach((band, i) => {
      const gradient = this.ctx.createLinearGradient(0, band.y - band.height/2, 0, band.y + band.height/2);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.5, band.color + '88'); // 0x88 alpha for more prominence
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      
      const waveFreq = 0.0015;
      const waveAmp = 50; // Increased wave amplitude
      
      this.ctx.moveTo(-100, band.y);
      for (let x = -100; x <= this.width + 100; x += 40) {
        const y = band.y + Math.sin(x * waveFreq + time * band.speed + i) * waveAmp;
        this.ctx.lineTo(x, y);
      }
      
      this.ctx.lineTo(this.width + 100, band.y + band.height);
      this.ctx.lineTo(-100, band.y + band.height);
      this.ctx.fill();
    });
    
    this.ctx.restore();
  }
}
