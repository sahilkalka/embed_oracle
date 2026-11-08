/**
 * Hairline Kinetic Suite v2.1
 * Pure client-side zero-dependency isometric kinetic line figures engine for Embedded India.
 * Inspired by @lucasmarkes/hairline.
 * Fully theme-adaptive (Light & Dark modes) with dynamic live theme switching.
 */

(function () {
  'use strict';

  const COS30 = Math.cos(Math.PI / 6);
  const SIN30 = Math.sin(Math.PI / 6);

  function projectIso(x, y, z, cx, cy) {
    return {
      x: cx + (x - y) * COS30,
      y: cy + (x + y) * SIN30 - z
    };
  }

  function isDarkTheme() {
    return document.documentElement.classList.contains('dark');
  }

  function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
      return `rgba(16, 185, 129, ${alpha})`;
    }
    let c = hex.substring(1);
    if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return `rgba(16, 185, 129, ${alpha})`;
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  // Dynamic Theme-following Palette: automatically synchronizes with active site theme tokens
  function getActivePalette() {
    const isDark = isDarkTheme();
    const docEl = document.documentElement;
    const computed = window.getComputedStyle(docEl);

    // Read site CSS variables directly from active root styling
    const cssPrimary = (isDark ? computed.getPropertyValue('--accent-light') : computed.getPropertyValue('--primary-color')).trim();
    const cssSecondary = computed.getPropertyValue('--secondary-color').trim();
    const cssAlert = computed.getPropertyValue('--danger-text').trim();
    const cssWarning = computed.getPropertyValue('--warning-text').trim();
    const cssChip = computed.getPropertyValue('--info-text').trim();

    // Map site data-palette or provide robust high-contrast fallbacks
    const paletteKey = docEl.getAttribute('data-palette') || 'cyber-emerald';

    let fallbackPrimary = isDark ? '#10b981' : '#059669';
    let fallbackAccent = isDark ? '#34d399' : '#047857';

    if (paletteKey.includes('amber') || paletteKey.includes('solar')) {
      fallbackPrimary = isDark ? '#f59e0b' : '#d97706';
      fallbackAccent = isDark ? '#fbbf24' : '#b45309';
    } else if (paletteKey.includes('cyan') || paletteKey.includes('quantum') || paletteKey.includes('ocean') || paletteKey.includes('vscode')) {
      fallbackPrimary = isDark ? '#06b6d4' : '#0891b2';
      fallbackAccent = isDark ? '#22d3ee' : '#0e7490';
    }

    const primary = cssPrimary || fallbackPrimary;
    const accent = cssSecondary || fallbackAccent;

    return {
      primary: primary,
      accent: accent,
      subtle: hexToRgba(primary, isDark ? 0.35 : 0.28),
      dim: hexToRgba(primary, isDark ? 0.15 : 0.10),
      core: accent,
      alert: cssAlert || (isDark ? '#f43f5e' : '#e11d48'),
      warning: cssWarning || (isDark ? '#fbbf24' : '#d97706'),
      chip: cssChip || (isDark ? '#38bdf8' : '#0284c7')
    };
  }

  function cycleGlobalPalette() {
    // Kept for backward compatibility; hairline colors dynamically mirror site theme
    return document.documentElement.getAttribute('data-palette') || 'cyber-emerald';
  }

  // Figure Rendering Implementations
  const FIGURES = {
    // 01: Silicon Lattice (Hero Section & Badges)
    'silicon-lattice': function (ctx, w, h, t, pointer, opts, palette) {
      const cx = w / 2;
      const cy = h / 2;
      const maxTilt = Math.min(18, Math.min(w, h) * 0.18);
      const tiltX = pointer.active ? pointer.x * maxTilt : Math.sin(t * 1.5) * (maxTilt * 0.6);
      const tiltY = pointer.active ? pointer.y * maxTilt : Math.cos(t * 1.5) * (maxTilt * 0.6);

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.primary;

      // Base Substrate Plate (proportional)
      const size = Math.min(w, h) * 0.28;
      const p1 = projectIso(-size + tiltX, -size + tiltY, 0, cx, cy);
      const p2 = projectIso(size + tiltX, -size + tiltY, 0, cx, cy);
      const p3 = projectIso(size + tiltX, size + tiltY, 0, cx, cy);
      const p4 = projectIso(-size + tiltX, size + tiltY, 0, cx, cy);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.stroke();

      // Silicon Core Die (Elevated)
      const dieSize = size * 0.52;
      const dieElevation = Math.min(14, h * 0.16) + (pointer.active ? -pointer.y * 6 : Math.sin(t * 2) * 4);
      const d1 = projectIso(-dieSize + tiltX, -dieSize + tiltY, dieElevation, cx, cy);
      const d2 = projectIso(dieSize + tiltX, -dieSize + tiltY, dieElevation, cx, cy);
      const d3 = projectIso(dieSize + tiltX, dieSize + tiltY, dieElevation, cx, cy);
      const d4 = projectIso(-dieSize + tiltX, dieSize + tiltY, dieElevation, cx, cy);

      ctx.strokeStyle = palette.accent;
      ctx.beginPath();
      ctx.moveTo(d1.x, d1.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.lineTo(d3.x, d3.y);
      ctx.lineTo(d4.x, d4.y);
      ctx.closePath();
      ctx.stroke();

      // Gold Bond Wires from Die to Substrate Pins
      ctx.strokeStyle = palette.subtle;
      const pins = Math.max(4, Math.floor(Math.min(w, h) / 16));
      for (let i = 0; i < pins; i++) {
        const frac = (i / (pins - 1)) * 2 - 1;
        const wireBaseN = projectIso(frac * (size - 4) + tiltX, -size + tiltY, 0, cx, cy);
        const wireDieN = projectIso(frac * (dieSize - 3) + tiltX, -dieSize + tiltY, dieElevation, cx, cy);
        ctx.beginPath();
        ctx.moveTo(wireBaseN.x, wireBaseN.y);
        ctx.lineTo(wireDieN.x, wireDieN.y);
        ctx.stroke();

        const wireBaseS = projectIso(frac * (size - 4) + tiltX, size + tiltY, 0, cx, cy);
        const wireDieS = projectIso(frac * (dieSize - 3) + tiltX, dieSize + tiltY, dieElevation, cx, cy);
        ctx.beginPath();
        ctx.moveTo(wireBaseS.x, wireBaseS.y);
        ctx.lineTo(wireDieS.x, wireDieS.y);
        ctx.stroke();
      }

      // Pulsing Core Light
      const centerPoint = projectIso(tiltX, tiltY, dieElevation + 2, cx, cy);
      const pulse = (Math.sin(t * 4) + 1) * 0.5;
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(centerPoint.x, centerPoint.y, 2 + pulse * 1.5, 0, Math.PI * 2);
      ctx.fill();
    },

    // 02: Exploded Hardware Stack (Hardware Estimator)
    'exploded-stack': function (ctx, w, h, t, pointer, opts, palette) {
      const cx = w / 2;
      const cy = h * 0.54;
      const maxSep = Math.min(20, h * 0.13);
      const separation = pointer.active ? (pointer.dist * maxSep + 10) : (Math.sin(t * 1.8) * (maxSep * 0.35) + 13);
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      const layers = [
        { z: separation * 1.4, color: palette.chip, label: "Enclosure Top" },
        { z: separation * 0.4, color: palette.primary, label: "PCB Component" },
        { z: -separation * 0.4, color: palette.warning, label: "Silicon / Die" },
        { z: -separation * 1.4, color: palette.subtle, label: "Aluminum Base" }
      ];

      const s = Math.min(w, h) * 0.19;
      layers.forEach((layer) => {
        ctx.strokeStyle = layer.color;
        const p1 = projectIso(-s, -s, layer.z, cx, cy);
        const p2 = projectIso(s, -s, layer.z, cx, cy);
        const p3 = projectIso(s, s, layer.z, cx, cy);
        const p4 = projectIso(-s, s, layer.z, cx, cy);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.stroke();

        ctx.strokeStyle = layer.color;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y);
        ctx.stroke();
      });

      // Guide lines
      ctx.strokeStyle = isDarkTheme() ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.15)";
      ctx.setLineDash([2, 3]);
      [-s, s].forEach(x => {
        [-s, s].forEach(y => {
          const top = projectIso(x, y, layers[0].z, cx, cy);
          const bot = projectIso(x, y, layers[3].z, cx, cy);
          ctx.beginPath();
          ctx.moveTo(top.x, top.y);
          ctx.lineTo(bot.x, bot.y);
          ctx.stroke();
        });
      });
      ctx.setLineDash([]);
    },

    // 03: Terrain Plinth (Tools Hub)
    'terrain-plinth': function (ctx, w, h, t, pointer, opts, palette) {
      const cx = w / 2;
      const cy = h * 0.54;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      const cols = 7;
      const rows = 7;
      const spacing = Math.min(w, h) * 0.055;
      const startX = -((cols - 1) * spacing) / 2;
      const startY = -((rows - 1) * spacing) / 2;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = startX + i * spacing;
          const y = startY + j * spacing;
          const dx = (x / (cols * spacing * 0.5)) - (pointer.active ? pointer.x : 0);
          const dy = (y / (rows * spacing * 0.5)) - (pointer.active ? pointer.y : 0);
          const dist = Math.sqrt(dx * dx + dy * dy);

          const pointerLift = Math.max(0, 1 - dist * 1.3) * 22;
          const waveLift = Math.sin(t * 3 + (i + j) * 0.6) * 5;
          const z = pointerLift + waveLift;

          const base = projectIso(x, y, 0, cx, cy);
          const top = projectIso(x, y, z, cx, cy);

          ctx.strokeStyle = pointerLift > 8 ? palette.accent : palette.subtle;
          ctx.beginPath();
          ctx.moveTo(base.x, base.y);
          ctx.lineTo(top.x, top.y);
          ctx.stroke();

          ctx.fillStyle = pointerLift > 8 ? palette.primary : palette.core;
          ctx.fillRect(top.x - 1, top.y - 1, 2, 2);
        }
      }
    },

    // 04: Phosphor Logic Analyzer (Bring-Up Console)
    'phosphor-analyzer': function (ctx, w, h, t, pointer, opts, palette) {
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      const sw = Math.min(w, h) * 0.28;
      const sh = sw * 0.6;
      ctx.strokeStyle = palette.subtle;
      const p1 = projectIso(-sw, -sh, 0, cx, cy);
      const p2 = projectIso(sw, -sh, 0, cx, cy);
      const p3 = projectIso(sw, sh, 0, cx, cy);
      const p4 = projectIso(-sw, sh, 0, cx, cy);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.stroke();

      // Waveform 1: Clock
      ctx.strokeStyle = palette.accent;
      const points = 24;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const frac = (i / points) * 2 - 1;
        const x = frac * (sw - 6);
        const high = (Math.floor(i + t * 6) % 2 === 0);
        const y = -12 + (high ? -5 : 5);
        const pt = projectIso(x, y, 0, cx, cy);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // Waveform 2: Data
      ctx.strokeStyle = palette.chip;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const frac = (i / points) * 2 - 1;
        const x = frac * (sw - 6);
        const noise = Math.sin(i * 1.5 + t * 4) > 0 ? 5 : -5;
        const pt = projectIso(x, 12 + noise, 0, cx, cy);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // Sweep trigger line
      const sweepFrac = pointer.active ? pointer.x : Math.sin(t * 2);
      const sweepX = sweepFrac * (sw - 6);
      const sTop = projectIso(sweepX, -sh + 3, 0, cx, cy);
      const sBot = projectIso(sweepX, sh - 3, 0, cx, cy);
      ctx.strokeStyle = palette.alert;
      ctx.beginPath();
      ctx.moveTo(sTop.x, sTop.y);
      ctx.lineTo(sBot.x, sBot.y);
      ctx.stroke();
    },

    // 05: PCB Trace Router (PCB Calculator)
    'pcb-router': function (ctx, w, h, t, pointer, opts, palette) {
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      const scale = Math.min(w, h) * 0.01;
      const pads = [
        { x: -45 * scale, y: -35 * scale },
        { x: -45 * scale, y: 25 * scale },
        { x: 40 * scale, y: -40 * scale },
        { x: 45 * scale, y: 35 * scale },
        { x: 0, y: -45 * scale }
      ];

      pads.forEach(pad => {
        const pt = projectIso(pad.x, pad.y, 0, cx, cy);
        ctx.strokeStyle = palette.warning;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.stroke();
      });

      const tgtX = pointer.active ? pointer.x * (48 * scale) : Math.sin(t * 1.7) * (30 * scale);
      const tgtY = pointer.active ? pointer.y * (48 * scale) : Math.cos(t * 1.7) * (30 * scale);
      const tgtPt = projectIso(tgtX, tgtY, 0, cx, cy);

      ctx.strokeStyle = palette.primary;
      pads.forEach((pad) => {
        const start = projectIso(pad.x, pad.y, 0, cx, cy);
        const midX = (pad.x + tgtX) / 2;
        const mid = projectIso(midX, pad.y, 0, cx, cy);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(mid.x, mid.y);
        ctx.lineTo(tgtPt.x, tgtPt.y);
        ctx.stroke();
      });

      ctx.strokeStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(tgtPt.x, tgtPt.y, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    },

    // 06: Riffle Datasheet Stack (Blogs)
    'riffle-datasheet': function (ctx, w, h, t, pointer, opts, palette) {
      const cx = w / 2;
      const cy = h * 0.65;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      const numCards = 6;
      const activeIndex = pointer.active
        ? Math.min(numCards - 1, Math.max(0, Math.floor(((pointer.x + 1) / 2) * numCards)))
        : Math.floor((Math.sin(t * 2) + 1) * 0.5 * numCards);

      const cardW = Math.min(w * 0.09, 30);
      const cardH = cardW * 1.25;

      for (let i = 0; i < numCards; i++) {
        const offset = (i - numCards / 2) * 10;
        const isHovered = (i === activeIndex);
        const zElev = isHovered ? 14 : 0;

        const c1 = projectIso(offset, -cardW, zElev, cx, cy);
        const c2 = projectIso(offset, cardW, zElev, cx, cy);
        const c3 = projectIso(offset + 4, cardW, zElev + cardH, cx, cy);
        const c4 = projectIso(offset + 4, -cardW, zElev + cardH, cx, cy);

        ctx.strokeStyle = isHovered ? palette.accent : palette.subtle;
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(c3.x, c3.y);
        ctx.lineTo(c4.x, c4.y);
        ctx.closePath();
        ctx.stroke();

        if (isHovered) {
          ctx.strokeStyle = palette.dim;
          const mid1 = projectIso(offset + 2, -cardW + 4, zElev + 7, cx, cy);
          const mid2 = projectIso(offset + 2, cardW - 4, zElev + 7, cx, cy);
          ctx.beginPath();
          ctx.moveTo(mid1.x, mid1.y);
          ctx.lineTo(mid2.x, mid2.y);
          ctx.stroke();
        }
      }
    },

    // 07: Turntable Inspection (Testimonials)
    'turntable-inspection': function (ctx, w, h, t, pointer, opts, palette) {
      const cx = w / 2;
      const cy = h * 0.52;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      const angle = pointer.active ? pointer.x * Math.PI : t * 0.8;
      const radius = Math.min(w, h) * 0.22;

      ctx.strokeStyle = palette.subtle;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2; a += 0.2) {
        const pt = projectIso(Math.cos(a) * radius, Math.sin(a) * radius, 0, cx, cy);
        if (a === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.stroke();

      const boxSize = radius * 0.55;
      const boxH = boxSize * 0.75;
      const rotPoints = [
        [-boxSize, -boxSize],
        [boxSize, -boxSize],
        [boxSize, boxSize],
        [-boxSize, boxSize]
      ].map(([x, y]) => {
        const rx = x * Math.cos(angle) - y * Math.sin(angle);
        const ry = x * Math.sin(angle) + y * Math.cos(angle);
        return {
          bot: projectIso(rx, ry, 4, cx, cy),
          top: projectIso(rx, ry, 4 + boxH, cx, cy)
        };
      });

      ctx.strokeStyle = palette.primary;
      ctx.beginPath();
      rotPoints.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.bot.x, p.bot.y);
        else ctx.lineTo(p.bot.x, p.bot.y);
      });
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = palette.accent;
      ctx.beginPath();
      rotPoints.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.top.x, p.top.y);
        else ctx.lineTo(p.top.x, p.top.y);
      });
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = palette.subtle;
      rotPoints.forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p.bot.x, p.bot.y);
        ctx.lineTo(p.top.x, p.top.y);
        ctx.stroke();
      });
    },

    // 08: RTOS Conveyor FIFO (Services)
    'rtos-pipeline': function (ctx, w, h, t, pointer, opts, palette) {
      const cx = w / 2;
      const cy = h * 0.52;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      const len = Math.min(w, h) * 0.26;
      const wRail = len * 0.35;
      ctx.strokeStyle = palette.subtle;
      const r1 = projectIso(-len, -wRail, 0, cx, cy);
      const r2 = projectIso(len, -wRail, 0, cx, cy);
      const r3 = projectIso(len, wRail, 0, cx, cy);
      const r4 = projectIso(-len, wRail, 0, cx, cy);

      ctx.beginPath();
      ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y);
      ctx.moveTo(r4.x, r4.y); ctx.lineTo(r3.x, r3.y);
      ctx.stroke();

      // Gate
      const g1 = projectIso(0, -wRail - 5, 0, cx, cy);
      const g2 = projectIso(0, -wRail - 5, 24, cx, cy);
      const g3 = projectIso(0, wRail + 5, 24, cx, cy);
      const g4 = projectIso(0, wRail + 5, 0, cx, cy);
      ctx.strokeStyle = palette.alert;
      ctx.beginPath();
      ctx.moveTo(g1.x, g1.y); ctx.lineTo(g2.x, g2.y);
      ctx.lineTo(g3.x, g3.y); ctx.lineTo(g4.x, g4.y);
      ctx.stroke();

      const speed = pointer.active ? (1 + pointer.y * 0.8) : 1;
      const numBlocks = 4;
      for (let b = 0; b < numBlocks; b++) {
        const prog = ((t * 0.4 * speed + b / numBlocks) % 1);
        const posX = -len + prog * (len * 2);

        const bTop = projectIso(posX, 0, 12, cx, cy);
        const bBot = projectIso(posX, 0, 0, cx, cy);

        ctx.strokeStyle = posX > -6 && posX < 14 ? palette.warning : palette.primary;
        ctx.strokeRect(bTop.x - 4.5, bTop.y - 4.5, 9, 9);
        ctx.beginPath();
        ctx.moveTo(bBot.x, bBot.y);
        ctx.lineTo(bTop.x, bTop.y);
        ctx.stroke();
      }
    },

    // 09: Multi-Layer Vias (Service Detail)
    'multi-via-interconnect': function (ctx, w, h, t, pointer, opts, palette) {
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      const deltaZ = Math.min(22, h * 0.16);
      const strata = [deltaZ, 0, -deltaZ];
      const plate = Math.min(w, h) * 0.22;

      strata.forEach((z) => {
        ctx.strokeStyle = palette.subtle;
        const p1 = projectIso(-plate, -plate, z, cx, cy);
        const p2 = projectIso(plate, -plate, z, cx, cy);
        const p3 = projectIso(plate, plate, z, cx, cy);
        const p4 = projectIso(-plate, plate, z, cx, cy);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.stroke();
      });

      const viaCoords = [[-16, -16], [16, -8], [0, 18]];
      viaCoords.forEach(([vx, vy]) => {
        const vTop = projectIso(vx, vy, strata[0], cx, cy);
        const vBot = projectIso(vx, vy, strata[2], cx, cy);
        ctx.strokeStyle = palette.chip;
        ctx.beginPath();
        ctx.moveTo(vTop.x, vTop.y);
        ctx.lineTo(vBot.x, vBot.y);
        ctx.stroke();
      });

      const activeZ = pointer.active ? pointer.y * deltaZ : Math.sin(t * 3) * deltaZ;
      const packetPt = projectIso(0, 18, activeZ, cx, cy);
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(packetPt.x, packetPt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    },

    // 10: Radar Dish (Contact)
    'radar-dish': function (ctx, w, h, t, pointer, opts, palette) {
      const cx = w / 2;
      const cy = h * 0.62;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      const m1 = projectIso(0, 0, 0, cx, cy);
      const m2 = projectIso(0, 0, 22, cx, cy);
      ctx.strokeStyle = palette.subtle;
      ctx.beginPath();
      ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y);
      ctx.stroke();

      const az = pointer.active ? pointer.x * 35 : Math.sin(t * 1.5) * 25;
      const el = pointer.active ? 22 - pointer.y * 18 : 22 + Math.cos(t * 1.5) * 10;

      ctx.strokeStyle = palette.primary;
      const radii = [10, 18, 28];
      radii.forEach((r, idx) => {
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2; a += 0.3) {
          const dx = Math.cos(a) * r + az * 0.25;
          const dy = Math.sin(a) * r;
          const dz = el + (idx * 5);
          const pt = projectIso(dx, dy, dz, cx, cy);
          if (a === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.stroke();
      });

      const hornPt = projectIso(az * 0.5, 0, el + 32, cx, cy);
      ctx.strokeStyle = palette.alert;
      ctx.fillStyle = palette.alert;
      ctx.beginPath();
      ctx.arc(hornPt.x, hornPt.y, 2, 0, Math.PI * 2);
      ctx.fill();

      const pulseR = ((t * 24) % 35);
      ctx.strokeStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(hornPt.x, hornPt.y, pulseR, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  // Web Component <hairline-figure>
  class HairlineFigure extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.canvas = document.createElement('canvas');
      this.canvas.style.display = 'block';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.style.cursor = 'crosshair';

      this.pointer = { x: 0, y: 0, active: false, dist: 0 };
      this.rafId = null;
      this.startTime = performance.now();
      this.resizeObserver = null;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.onMouseMove = this.onMouseMove.bind(this);
      this.onMouseEnter = this.onMouseEnter.bind(this);
      this.onMouseLeave = this.onMouseLeave.bind(this);
      this.onTouchMove = this.onTouchMove.bind(this);
      this.onTouchEnd = this.onTouchEnd.bind(this);
      this.onThemeOrPaletteChange = this.onThemeOrPaletteChange.bind(this);
    }

    connectedCallback() {
      const isDark = isDarkTheme();
      const style = document.createElement('style');
      style.textContent = `
        :host {
          display: block;
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        canvas {
          display: block;
          width: 100%;
          height: 100%;
        }
      `;

      if (isDark) this.classList.add('is-dark');
      else this.classList.remove('is-dark');

      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(this.canvas);

      this.canvas.addEventListener('mousemove', this.onMouseMove);
      this.canvas.addEventListener('mouseenter', this.onMouseEnter);
      this.canvas.addEventListener('mouseleave', this.onMouseLeave);
      this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: true });
      this.canvas.addEventListener('touchend', this.onTouchEnd);
      window.addEventListener('hairline-palette-change', this.onThemeOrPaletteChange);
      window.addEventListener('appearancechange', this.onThemeOrPaletteChange);

      // Mutation observer to detect theme class additions on <html>
      this.themeObserver = new MutationObserver(() => this.onThemeOrPaletteChange());
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-palette'] });

      this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      this.resizeObserver.observe(this);

      this.resizeCanvas();
      this.startLoop();
    }

    disconnectedCallback() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (this.themeObserver) this.themeObserver.disconnect();
      this.canvas.removeEventListener('mousemove', this.onMouseMove);
      this.canvas.removeEventListener('mouseenter', this.onMouseEnter);
      this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
      this.canvas.removeEventListener('touchmove', this.onTouchMove);
      this.canvas.removeEventListener('touchend', this.onTouchEnd);
      window.removeEventListener('hairline-palette-change', this.onThemeOrPaletteChange);
      window.removeEventListener('appearancechange', this.onThemeOrPaletteChange);
    }

    onThemeOrPaletteChange() {
      if (isDarkTheme()) this.classList.add('is-dark');
      else this.classList.remove('is-dark');
    }

    updateCoords(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const intensity = parseFloat(this.getAttribute('intensity') || '0.75');
      const rawX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const rawY = ((clientY - rect.top) / rect.height) * 2 - 1;
      this.pointer.x = rawX * intensity;
      this.pointer.y = rawY * intensity;
      this.pointer.dist = Math.min(1, Math.sqrt(rawX * rawX + rawY * rawY));
      this.pointer.active = true;
    }

    onMouseMove(e) {
      this.updateCoords(e.clientX, e.clientY);
    }

    onMouseEnter(e) {
      this.updateCoords(e.clientX, e.clientY);
    }

    onMouseLeave() {
      this.pointer.active = false;
    }

    onTouchMove(e) {
      if (e.touches && e.touches[0]) {
        this.updateCoords(e.touches[0].clientX, e.touches[0].clientY);
      }
    }

    onTouchEnd() {
      this.pointer.active = false;
    }

    resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.getBoundingClientRect();
      const w = Math.max(20, rect.width || 300);
      const h = Math.max(20, rect.height || 200);

      if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        const ctx = this.canvas.getContext('2d');
        ctx.scale(dpr, dpr);
      }
    }

    startLoop() {
      const render = (now) => {
        const figureId = this.getAttribute('figure') || 'silicon-lattice';
        const drawFn = FIGURES[figureId];
        // Kinetic loop runs continuously, adapting to active theme
        const play = !this.reducedMotion;

        if (drawFn && this.canvas.offsetParent !== null) {
          const rect = this.getBoundingClientRect();
          const w = rect.width;
          const h = rect.height;

          if (w > 0 && h > 0) {
            const ctx = this.canvas.getContext('2d');
            const t = (now - this.startTime) / 1000;
            const palette = getActivePalette();

            drawFn(ctx, w, h, t, this.pointer, { play }, palette);
          }
        }

        this.rafId = requestAnimationFrame(render);
      };

      this.rafId = requestAnimationFrame(render);
    }
  }

  // Register Custom Element
  if (!customElements.get('hairline-figure')) {
    customElements.define('hairline-figure', HairlineFigure);
  }

  // Expose global controller
  window.Hairline = {
    cyclePalette: cycleGlobalPalette,
    getActivePalette: getActivePalette,
    figures: Object.keys(FIGURES)
  };
})();
