/*
 * Public-site motion layer: magnetic spring buttons, 3D tilt with specular glare,
 * depth parallax, spring scroll-reveal, click ripples, hero parallax and scroll progress.
 * Loaded only by the public layout (views/layouts/footer.ejs), never by the admin dashboard.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const shell = document.querySelector('.public-shell');
  if (!shell || root.dataset.fx === 'on') return;
  root.dataset.fx = 'on';

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  /* ---------- Scroll progress (user-driven, safe under reduced motion) ---------- */
  const progress = document.createElement('div');
  progress.className = 'fx-scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);
  let progressQueued = false;
  const updateProgress = () => {
    progressQueued = false;
    const max = root.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener('scroll', () => { if (!progressQueued) { progressQueued = true; requestAnimationFrame(updateProgress); } }, { passive: true });
  addEventListener('resize', updateProgress, { passive: true });
  updateProgress();

  if (reduceMotion.matches) return;
  root.classList.add('fx-motion');

  /* ---------- Shared damped-spring engine (one rAF loop for every effect) ---------- */
  class Spring {
    constructor(value = 0, stiffness = 170, damping = 14) {
      this.value = value; this.target = value; this.velocity = 0;
      this.stiffness = stiffness; this.damping = damping;
    }
    step(dt) {
      const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += force * dt;
      this.value += this.velocity * dt;
      return Math.abs(this.value - this.target) > 0.001 || Math.abs(this.velocity) > 0.001;
    }
    settle() { this.value = this.target; this.velocity = 0; }
  }

  const active = new Set();
  let last = 0;
  let running = false;
  const tick = now => {
    const dt = Math.min((now - (last || now)) / 1000, 1 / 30) || 1 / 60;
    last = now;
    for (const body of active) if (!body.update(dt)) active.delete(body);
    if (active.size) requestAnimationFrame(tick); else { running = false; last = 0; }
  };
  const wake = body => {
    active.add(body);
    if (!running) { running = true; requestAnimationFrame(tick); }
  };

  const CTA = '.btn-shimmer, .spring-btn, .btn-magnetic, [data-magnetic], a.bg-brand-500, button.bg-brand-500, button[type="submit"], .public-shell header :is(.appearance-trigger, .appearance-search, #mobile-menu-btn)';
  const CARD = '[data-tilt], .spotlight-card, .spring-card, .category-card, .interactive-card, article.rounded-2xl, article.rounded-3xl';
  const isEligible = el => !el.closest('[data-fx="off"], .appearance-panel, #copilot-widget-container, #mobile-cta-bar, dialog, [role="dialog"]');

  /* ---------- Magnetic spring buttons ---------- */
  function magnetic(el) {
    if (el.dataset.magnetic === 'off') return;
    const rect0 = el.getBoundingClientRect();
    const small = Math.max(rect0.width, rect0.height) < 64;
    const strength = Number(el.dataset.magneticStrength) || (small ? 0.32 : 0.22);
    const x = new Spring(0, 220, 13), y = new Spring(0, 220, 13);
    const body = {
      update(dt) {
        const moving = x.step(dt) | y.step(dt);
        el.style.translate = `${x.value.toFixed(2)}px ${y.value.toFixed(2)}px`;
        if (!moving) { x.settle(); y.settle(); el.style.translate = x.target || y.target ? el.style.translate : ''; }
        return moving;
      }
    };
    el.classList.add('fx-magnetic');
    el.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 - x.value;
      const cy = rect.top + rect.height / 2 - y.value;
      const limit = small ? 10 : 14;
      x.target = Math.max(-limit, Math.min(limit, (event.clientX - cx) * strength));
      y.target = Math.max(-limit, Math.min(limit, (event.clientY - cy) * strength));
      wake(body);
    });
    el.addEventListener('pointerleave', () => {
      x.target = 0; y.target = 0;
      // A release "flick" makes the spring overshoot visibly before settling.
      x.velocity -= x.value * 6; y.velocity -= y.value * 6;
      wake(body);
    });
  }

  /* ---------- 3D tilt + specular glare + depth parallax ---------- */
  function tilt(card) {
    if (card.dataset.tilt === 'off' || card.querySelector('form, input, textarea, select')) return;
    const rect0 = card.getBoundingClientRect();
    if (rect0.width > 720 || rect0.height > 640) return;
    const maxTilt = Number(card.dataset.tiltMax) || (rect0.width > 420 ? 2 : 2.5);
    const rx = new Spring(0, 140, 15), ry = new Spring(0, 140, 15), lift = new Spring(0, 160, 16), glare = new Spring(0, 120, 18);
    const gx = new Spring(50, 160, 20), gy = new Spring(50, 160, 20);
    const shine = document.createElement('span');
    shine.className = 'fx-glare';
    shine.setAttribute('aria-hidden', 'true');
    card.appendChild(shine);
    card.classList.add('fx-tilt');
    const layers = [...card.querySelectorAll('[data-depth], :scope > div > .w-12, :scope > div > .w-14, :scope > .w-12, :scope > .w-14, img')].slice(0, 4);

    const body = {
      update(dt) {
        let moving = false;
        for (const s of [rx, ry, lift, glare, gx, gy]) moving = s.step(dt) || moving;
        card.style.transform = `perspective(1800px) rotateX(${rx.value.toFixed(3)}deg) rotateY(${ry.value.toFixed(3)}deg) translate3d(0, ${(-lift.value).toFixed(2)}px, 0)`;
        card.style.setProperty('--fx-glare-x', `${gx.value.toFixed(1)}%`);
        card.style.setProperty('--fx-glare-y', `${gy.value.toFixed(1)}%`);
        card.style.setProperty('--fx-glare-o', Math.max(0, glare.value).toFixed(3));
        for (const layer of layers) {
          const depth = Number(layer.dataset.depth) || 1;
          layer.style.translate = `${(ry.value * 0.2 * depth).toFixed(2)}px ${(-rx.value * 0.2 * depth).toFixed(2)}px`;
        }
        if (!moving) {
          for (const s of [rx, ry, lift, glare, gx, gy]) s.settle();
          if (!lift.target) { card.style.transform = ''; layers.forEach(layer => { layer.style.translate = ''; }); }
        }
        return moving;
      }
    };
    card.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      ry.target = (px - 0.5) * 2 * maxTilt;
      rx.target = (0.5 - py) * 2 * maxTilt;
      gx.target = px * 100; gy.target = py * 100;
      glare.target = 0.3; lift.target = 2;
      card.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
      wake(body);
    });
    card.addEventListener('pointerleave', () => {
      rx.target = 0; ry.target = 0; lift.target = 0; glare.target = 0;
      wake(body);
    });
  }

  /* ---------- Click ripple ---------- */
  function ripple(el) {
    if (getComputedStyle(el).position === 'static') el.classList.add('fx-ripple-host');
    el.addEventListener('pointerdown', event => {
      const rect = el.getBoundingClientRect();
      const size = Math.hypot(rect.width, rect.height) * 2;
      // The wave lives in its own clipped layer so the host never needs overflow:hidden.
      const layer = document.createElement('span');
      layer.className = 'fx-ripple-layer';
      layer.setAttribute('aria-hidden', 'true');
      const wave = document.createElement('span');
      wave.className = 'fx-ripple';
      wave.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px`;
      layer.appendChild(wave);
      el.appendChild(layer);
      wave.addEventListener('animationend', () => layer.remove(), { once: true });
    });
  }

  /* ---------- Hero ambient parallax ---------- */
  function heroParallax() {
    const blobs = [...document.querySelectorAll('main .animate-pulse-glow, main [data-parallax]')].slice(0, 6);
    if (!blobs.length) return;
    const px = new Spring(0, 60, 14), py = new Spring(0, 60, 14);
    const body = {
      update(dt) {
        const moving = px.step(dt) | py.step(dt);
        blobs.forEach((blob, index) => {
          const depth = Number(blob.dataset.parallax) || (index % 2 ? -1 : 1) * (0.6 + index * 0.2);
          blob.style.translate = `${(px.value * depth).toFixed(2)}px ${(py.value * depth).toFixed(2)}px`;
        });
        return moving;
      }
    };
    addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || scrollY > innerHeight) return;
      px.target = (event.clientX / innerWidth - 0.5) * 36;
      py.target = (event.clientY / innerHeight - 0.5) * 28;
      wake(body);
    }, { passive: true });
  }

  /* ---------- Spring scroll-reveal with stagger ---------- */
  function reveal() {
    const candidates = new Set(document.querySelectorAll(`main .reveal-on-scroll, main :is(${CARD}), main section h2, main [data-reveal]`));
    const fold = innerHeight * 0.92;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('fx-in');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const siblingIndex = new Map();
    for (const el of candidates) {
      if (!isEligible(el) || el.getBoundingClientRect().top < fold) continue;
      const parent = el.parentElement;
      const index = siblingIndex.get(parent) || 0;
      siblingIndex.set(parent, index + 1);
      const delayClass = [...el.classList].find(name => /^delay-\d+$/.test(name));
      const delay = delayClass ? Number(delayClass.slice(6)) : Math.min(index, 5) * 70;
      el.style.setProperty('--fx-reveal-delay', `${delay}ms`);
      el.classList.add('fx-reveal');
      observer.observe(el);
    }
  }

  /* ---------- Hero particle field (circuit nodes) ---------- */
  function heroParticles() {
    const main = document.getElementById('main-content') || document.querySelector('main');
    if (!main) return;
    const hero = main.querySelector('[data-hero]') || [...main.children].find(el => {
      if (!/^(SECTION|DIV|ARTICLE|HEADER)$/.test(el.tagName) || el.dataset.particles === 'off') return false;
      const cs = getComputedStyle(el);
      if (['sticky', 'fixed'].includes(cs.position) || cs.display === 'none') return false;
      const rect = el.getBoundingClientRect();
      return rect.height >= 160 && rect.top < innerHeight * 0.75;
    });
    if (!hero || hero.dataset.particles === 'off') return;

    hero.classList.add('fx-hero');
    if (getComputedStyle(hero).position === 'static') hero.classList.add('fx-hero-relative');
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-hero-particles';
    canvas.setAttribute('aria-hidden', 'true');
    hero.prepend(canvas);
    const ctx = canvas.getContext('2d');

    let width = 0, height = 0, particles = [], holes = [], color = '#10b981';
    let pointer = null, visible = true, frame = 0;
    const readColor = () => { color = getComputedStyle(root).getPropertyValue('--focus-ring').trim() || '#10b981'; };
    const inHole = (x, y) => holes.some(h => x > h.x && x < h.x + h.w && y > h.y && y < h.y + h.h);
    const spawn = () => {
      let x = 0, y = 0;
      for (let tries = 0; tries < 12; tries++) { x = Math.random() * width; y = Math.random() * height; if (!inHole(x, y)) break; }
      return { x, y, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, r: Math.random() * 1.6 + 1.1 };
    };
    // Regions marked data-particles="off" (e.g. the home console) stay clear of dots and links.
    const measureHoles = () => {
      const base = hero.getBoundingClientRect();
      holes = [...hero.querySelectorAll('[data-particles="off"]')].map(el => {
        const r = el.getBoundingClientRect();
        return { x: r.left - base.left - 24, y: r.top - base.top - 24, w: r.width + 48, h: r.height + 48 };
      }).filter(h => h.w > 48 && h.h > 48);
    };
    const resize = () => {
      const rect = hero.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      width = rect.width;
      height = Math.min(rect.height, Math.max(innerHeight, 520));
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      measureHoles();
      const target = Math.round(Math.min(70, Math.max(16, (width * height) / 16000)));
      particles = particles.filter(p => p.x <= width && p.y <= height && !inHole(p.x, p.y)).slice(0, target);
      while (particles.length < target) particles.push(spawn());
    };

    const draw = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
        if (inHole(p.x, p.y)) { p.x -= p.vx * 2; p.y -= p.vy * 2; p.vx *= -1; p.vy *= -1; }
        if (pointer) {
          const dx = p.x - pointer.x, dy = p.y - pointer.y, dist = Math.hypot(dx, dy);
          if (dist < 90 && dist > 0) { p.x += (dx / dist) * 1.2; p.y += (dy / dist) * 1.2; }
        }
      }
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j], dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > 120 || inHole((a.x + b.x) / 2, (a.y + b.y) / 2)) continue;
          ctx.globalAlpha = 0.26 * (1 - dist / 120);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        if (pointer) {
          const dist = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (dist < 150) { ctx.globalAlpha = 0.42 * (1 - dist / 150); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke(); }
        }
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    const start = () => { if (!frame && visible && !document.hidden) frame = requestAnimationFrame(draw); };

    hero.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      const rect = hero.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (inHole(pointer.x, pointer.y) || pointer.y > height) pointer = null;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { pointer = null; }, { passive: true });
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }).observe(hero);
    new ResizeObserver(resize).observe(hero);
    document.addEventListener('visibilitychange', start);
    addEventListener('appearancechange', readColor);
    readColor();
    resize();
    start();
  }

  function init() {
    heroParticles();
    reveal();
    document.querySelectorAll(CTA).forEach(el => { if (isEligible(el)) ripple(el); });
    if (!finePointer.matches) return;
    document.querySelectorAll(CTA).forEach(el => { if (isEligible(el)) magnetic(el); });
    document.querySelectorAll(`main :is(${CARD})`).forEach(card => { if (isEligible(card)) tilt(card); });
    heroParallax();
  }

  function scheduleInit() {
    const runWhenIdle = () => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(init, { timeout: 2000 });
      } else {
        window.setTimeout(init, 250);
      }
    };

    if (document.readyState === 'complete') runWhenIdle();
    else window.addEventListener('load', runWhenIdle, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInit, { once: true });
  } else {
    scheduleInit();
  }
})();
