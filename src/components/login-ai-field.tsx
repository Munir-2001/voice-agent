"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient AI "signal network" for the login hero: drifting nodes connected by
 * proximity links, with light pulses traveling edge-to-edge and a slow breathing
 * glow — a live neural/voice field. It also reacts to the cursor: nearby nodes are
 * magnetically drawn toward the pointer and link to it, easing back when it leaves.
 * Canvas 2D, DPR-crisp, cheap, and it renders a single static frame when the
 * viewer prefers reduced motion.
 */
export function LoginAiField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const NODE_COUNT = 46;
    const LINK_DIST = 158;
    const POINTER_RADIUS = 210; // how far the cursor's pull reaches
    const POINTER_PULL = 0.3; // fraction of the way a node leans toward the cursor

    type Node = { x: number; y: number; vx: number; vy: number; r: number; accent: boolean };
    type Pulse = { a: number; b: number; t: number; speed: number; accent: boolean };

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let pulses: Pulse[] = [];
    // Per-frame displaced positions (base drift + cursor magnetism).
    let dx: number[] = [];
    let dy: number[] = [];

    // Pointer state (canvas-local px). `influence` eases 0→1 while hovering.
    let pointerX = 0;
    let pointerY = 0;
    let smoothX = 0;
    let smoothY = 0;
    let pointerActive = false;
    let influence = 0;

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    function build() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (width === 0 || height === 0) return;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: rand(0, width),
        y: rand(0, height),
        vx: rand(-0.14, 0.14),
        vy: rand(-0.14, 0.14),
        r: rand(1, 2.4),
        accent: Math.random() < 0.13,
      }));
      dx = new Array(NODE_COUNT).fill(0);
      dy = new Array(NODE_COUNT).fill(0);
      pulses = [];
    }

    function nearestNeighbor(i: number): number {
      let best = -1;
      let bestD = LINK_DIST * LINK_DIST;
      const a = nodes[i];
      for (let j = 0; j < nodes.length; j++) {
        if (j === i) continue;
        const b = nodes[j];
        const ddx = a.x - b.x;
        const ddy = a.y - b.y;
        const d = ddx * ddx + ddy * ddy;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      return best;
    }

    let pulseTimer = 0;

    function render(now: number, dt: number) {
      ctx!.clearRect(0, 0, width, height);

      // Ease cursor influence + smooth the pointer position.
      influence += ((pointerActive ? 1 : 0) - influence) * Math.min(1, dt / 140);
      smoothX += (pointerX - smoothX) * Math.min(1, dt / 90);
      smoothY += (pointerY - smoothY) * Math.min(1, dt / 90);

      // Breathing radial glow — the "voice" at the heart of the network.
      const cx = width * 0.5;
      const cy = height * 0.6;
      const breathe = 0.5 + 0.5 * Math.sin(now * 0.0009);
      const glowR = Math.max(width, height) * 0.6;
      const glow = ctx!.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glow.addColorStop(0, `rgba(140,180,255,${0.1 + 0.07 * breathe})`);
      glow.addColorStop(1, "rgba(140,180,255,0)");
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, width, height);

      // Drift base positions.
      if (!reduced) {
        for (const n of nodes) {
          n.x += n.vx * (dt / 16);
          n.y += n.vy * (dt / 16);
          if (n.x < -24) n.x = width + 24;
          if (n.x > width + 24) n.x = -24;
          if (n.y < -24) n.y = height + 24;
          if (n.y > height + 24) n.y = -24;
        }
      }

      // Compute displaced positions: base drift + magnetism toward the cursor.
      // The pull is recomputed from live positions each frame (not integrated),
      // so it self-cancels the moment the cursor leaves.
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        let ox = n.x;
        let oy = n.y;
        if (influence > 0.001) {
          const vx = smoothX - n.x;
          const vy = smoothY - n.y;
          const dist = Math.hypot(vx, vy);
          if (dist < POINTER_RADIUS && dist > 0.001) {
            const force = 1 - dist / POINTER_RADIUS;
            const pull = force * force * POINTER_PULL * influence;
            ox += vx * pull;
            oy += vy * pull;
          }
        }
        dx[i] = ox;
        dy[i] = oy;
      }

      // Proximity links (using displaced positions).
      ctx!.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(dx[i] - dx[j], dy[i] - dy[j]);
          if (d < LINK_DIST) {
            ctx!.strokeStyle = `rgba(255,255,255,${(1 - d / LINK_DIST) * 0.2})`;
            ctx!.beginPath();
            ctx!.moveTo(dx[i], dy[i]);
            ctx!.lineTo(dx[j], dy[j]);
            ctx!.stroke();
          }
        }
      }

      // Cursor links + glow: the pointer behaves like a bright transient node.
      if (influence > 0.02) {
        const cursorGlow = ctx!.createRadialGradient(smoothX, smoothY, 0, smoothX, smoothY, 90);
        cursorGlow.addColorStop(0, `rgba(180,214,255,${0.14 * influence})`);
        cursorGlow.addColorStop(1, "rgba(180,214,255,0)");
        ctx!.fillStyle = cursorGlow;
        ctx!.fillRect(smoothX - 90, smoothY - 90, 180, 180);

        ctx!.lineWidth = 1;
        for (let i = 0; i < nodes.length; i++) {
          const d = Math.hypot(dx[i] - smoothX, dy[i] - smoothY);
          if (d < POINTER_RADIUS) {
            ctx!.strokeStyle = `rgba(190,220,255,${(1 - d / POINTER_RADIUS) * 0.32 * influence})`;
            ctx!.beginPath();
            ctx!.moveTo(smoothX, smoothY);
            ctx!.lineTo(dx[i], dy[i]);
            ctx!.stroke();
          }
        }
      }

      // Nodes (brighter + larger the nearer the cursor).
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        let emphasis = 0;
        if (influence > 0.001) {
          const d = Math.hypot(dx[i] - smoothX, dy[i] - smoothY);
          if (d < POINTER_RADIUS) emphasis = (1 - d / POINTER_RADIUS) * influence;
        }
        const r = n.r * (1 + emphasis * 0.9);
        if (n.accent) {
          ctx!.beginPath();
          ctx!.arc(dx[i], dy[i], r * 3.4, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(250,204,21,${0.12 + emphasis * 0.14})`;
          ctx!.fill();
        }
        ctx!.beginPath();
        ctx!.arc(dx[i], dy[i], r, 0, Math.PI * 2);
        ctx!.fillStyle = n.accent
          ? `rgba(250,204,21,${0.92})`
          : `rgba(255,255,255,${0.72 + emphasis * 0.28})`;
        ctx!.fill();
      }

      // Traveling signal pulses (ride the displaced graph).
      if (!reduced) {
        pulseTimer += dt;
        if (pulseTimer > 380 && pulses.length < 16 && nodes.length > 1) {
          pulseTimer = 0;
          const a = Math.floor(Math.random() * nodes.length);
          const b = nearestNeighbor(a);
          if (b >= 0) {
            pulses.push({ a, b, t: 0, speed: rand(0.008, 0.015), accent: Math.random() < 0.2 });
          }
        }
        pulses = pulses.filter((p) => p.t < 1);
        for (const p of pulses) {
          p.t += p.speed * (dt / 16);
          const x = dx[p.a] + (dx[p.b] - dx[p.a]) * p.t;
          const y = dy[p.a] + (dy[p.b] - dy[p.a]) * p.t;
          const trail = p.accent ? "rgba(250,224,120," : "rgba(190,220,255,";
          const core = p.accent ? "rgba(255,236,160," : "rgba(210,232,255,";
          ctx!.beginPath();
          ctx!.arc(x, y, 6.5, 0, Math.PI * 2);
          ctx!.fillStyle = `${trail}0.14)`;
          ctx!.fill();
          ctx!.beginPath();
          ctx!.arc(x, y, 2.2, 0, Math.PI * 2);
          ctx!.fillStyle = `${core}0.95)`;
          ctx!.fill();
        }
      }
    }

    let raf = 0;
    let last = 0;
    function loop(now: number) {
      const dt = Math.min(now - last, 50) || 16;
      last = now;
      render(now, dt);
      raf = requestAnimationFrame(loop);
    }

    // Pointer tracking. The canvas is pointer-events:none, so we listen on its
    // parent (the hero panel, which shares the canvas's bounds).
    const host = canvas.parentElement ?? canvas;
    function onMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
      if (!pointerActive) {
        // Jump the smoothed point to the entry position so it doesn't streak in.
        smoothX = pointerX;
        smoothY = pointerY;
      }
      pointerActive = true;
    }
    function onLeave() {
      pointerActive = false;
    }

    build();
    const ro = new ResizeObserver(build);
    ro.observe(canvas);

    if (reduced) {
      render(0, 16);
    } else {
      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerleave", onLeave);
      host.addEventListener("pointercancel", onLeave);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
