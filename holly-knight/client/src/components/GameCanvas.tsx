import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/game/engine';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, Play, RotateCcw } from 'lucide-react';

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const requestRef = useRef<number>();
  
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const [score, setScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgMusicRef = useRef<OscillatorNode | null>(null);

  // Audio System
  const playSound = (type: 'jump' | 'hit') => {
    if (isMuted) return;
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioContextRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    if (type === 'jump') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    } else {
      // Zen-like chime for crash/reset
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(261.63, ctx.currentTime + 0.5); // Slide down to C4
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    }
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  };

  const startBackgroundMusic = () => {
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioContextRef.current;
    
    // Richer synth pad for background
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.04, ctx.currentTime);
    masterGain.connect(ctx.destination);
    
    const playNote = (freq: number, startTime: number, duration: number = 6) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      
      // Soft envelope
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.3, startTime + duration * 0.4);
      g.gain.linearRampToValueAtTime(0, startTime + duration);
      
      osc.connect(g);
      g.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const scheduleMusic = () => {
      const scales = [
        [261.63, 329.63, 392.00, 523.25], // C Major
        [349.23, 440.00, 523.25, 698.46], // F Major
        [392.00, 493.88, 587.33, 783.99]  // G Major
      ];
      
      const playLoop = () => {
        if (!isMuted && gameState !== 'gameover') {
          const scale = scales[Math.floor(Date.now() / 10000) % scales.length];
          const note = scale[Math.floor(Math.random() * scale.length)];
          playNote(note, ctx.currentTime);
          // Add a low fifth for depth
          playNote(note * 0.66, ctx.currentTime, 8);
        }
        setTimeout(playLoop, 4000);
      };
      playLoop();
    };
    scheduleMusic();
  };

  // Initialize Engine
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Start music early
    if (!audioContextRef.current) startBackgroundMusic();
    
    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;
    
    engine.onScoreUpdate = (s) => setScore(s);
    engine.onGameOver = (finalScore) => {
      setScore(finalScore);
      setGameState('gameover');
      playSound('hit');
    };

    const animate = () => {
      engine.update();
      engine.draw();
      requestRef.current = requestAnimationFrame(animate);
    };
    
    requestRef.current = requestAnimationFrame(animate);
    
    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault(); 
        if (gameState === 'playing') {
          const jumped = engineRef.current?.jump();
          if (jumped) {
            playSound('jump');
          }
        }
      }
    };
    
    const handleMouseDown = (e: MouseEvent) => {
      if (gameState === 'playing') {
        const jumped = engineRef.current?.jump();
        if (jumped) {
          playSound('jump');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [gameState]);

  const startGame = () => {
    if (!audioContextRef.current) startBackgroundMusic();
    engineRef.current?.start();
    setGameState('playing');
    setScore(0);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900">
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full touch-none"
      />
      
      {/* HUD - Score */}
      <div className="absolute top-6 right-6 flex items-center gap-4 z-10">
        <div className="bg-black/30 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 shadow-xl">
          <span className="text-2xl font-display text-white tracking-widest">{score} m</span>
        </div>
      </div>

      <AnimatePresence>
        {gameState === 'start' && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-20"
          >
            <div className="text-center space-y-8 p-8 max-w-2xl w-full">
              <h1 className="text-6xl md:text-9xl font-display text-transparent bg-clip-text bg-gradient-to-br from-white via-primary to-purple-400 drop-shadow-lg filter px-8 py-2">
                AuroraDash
              </h1>
              
              <div className="bg-card/50 border border-white/10 p-6 rounded-2xl backdrop-blur-md shadow-2xl">
                <p className="text-lg text-white/80 mb-6 font-body whitespace-pre-line">
                  Welcome to the chill zone. No deadlines here.{"\n"}
                  Tap or Spacebar to debug.
                </p>
                <Button 
                  onClick={startGame}
                  className="w-full text-xl py-8 rounded-xl bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-600 border-none shadow-lg shadow-primary/20 hover:scale-105 transition-all duration-300 font-bold"
                >
                  <Play className="mr-2 w-6 h-6" fill="currentColor" /> Start Journey
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'gameover' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-30"
          >
            <div className="bg-card border border-white/10 p-8 rounded-3xl shadow-2xl max-w-lg w-full m-4">
              <div className="text-center mb-8">
                <h2 className="text-5xl font-display text-red-500 mb-2">Uncaught ReferenceError</h2>
                <div className="text-7xl font-bold text-primary my-4">{score}</div>
                <p className="text-white/60">Skill not found. Drink more coffee.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <Button 
                  onClick={startGame}
                  className="py-6 text-lg font-bold bg-gradient-to-r from-primary to-purple-500 hover:scale-[1.02] transition-transform text-primary-foreground"
                >
                  <RotateCcw className="mr-2" /> git reset --hard
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
