/* ---------------------------------------------------------------
   Stats block animation
   1. When the block scrolls into view: eyebrow, heading and body fade in
      from a blur (CSS transitions, staggered via --d), and the stats wheel
      fades in while spinning to rest on the highlighted stat.
   2. Every INTERVAL ms the wheel rotates one step (eased) so the next
      stat takes the highlighted place.
---------------------------------------------------------------- */
(() => {
  const CONFIG = {
    interval: 3500,        // ms between rotations (hold + rotate)
    rotateDuration: 1200,  // ms for each eased rotation
    introDuration: 1900,   // ms for the scroll-in spin
    introDelay: 350,       // ms after the text starts revealing
    step: 36,              // degrees between neighbouring stats
    threshold: 0.35,       // how much of the block must be visible
    introBlur: 14,         // px of blur the stats fade in from
  };

  // easing
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (t) => t * t * (3 - 2 * t);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mod = (n, m) => ((n % m) + m) % m;

  function init(root) {
    const wheel = root.querySelector('[data-wheel]');
    const stats = Array.from(wheel.children);
    const n = stats.length;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let pos = 0;          // continuous wheel position (stat index, fractional while turning)
    let fade = 0;         // 0..1 intro fade (opacity + blur)
    let raf = 0;
    let timer = 0;
    let started = false;
    let inView = false;
    let nextAt = 0;       // timestamp the next rotation is due

    /* -- scale the composition with the block width (design is 1440px) -- */
    const fit = () => {
      const k = clamp(root.clientWidth / 1440, 0.45, 1);
      root.style.setProperty('--k', k.toFixed(4));
    };
    fit();
    new ResizeObserver(fit).observe(root);

    /* -- place every stat on the wheel for a given position -- */
    function render() {
      stats.forEach((el, i) => {
        // signed distance from the highlighted slot, wrapped to [-n/2, n/2)
        const o = mod(i - pos + n / 2, n) - n / 2;
        const a = Math.abs(o);

        // 1 at the highlighted slot, slightly dimmed at the neighbours (the CSS veil hides most of them), gone before the wrap point
        const op = a <= 1 ? 1 - 0.2 * a : 0.8 * Math.max(0, 1 - (a - 1) / 0.5);

        el.style.transform = `rotate(${(o * CONFIG.step).toFixed(3)}deg)`;
        el.style.opacity = (op * fade).toFixed(3);
        el.style.filter = fade < 1 ? `blur(${((1 - fade) * CONFIG.introBlur).toFixed(2)}px)` : '';
        el.style.setProperty('--m', (Math.min(a, 1) * 0.6).toFixed(3));

        const active = a < 0.5;
        el.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
    }

    /* -- tiny tween helper -- */
    function tween(duration, onFrame) {
      return new Promise((resolve) => {
        const t0 = performance.now();
        const tick = (now) => {
          const t = clamp((now - t0) / duration, 0, 1);
          onFrame(t);
          render();
          if (t < 1) raf = requestAnimationFrame(tick);
          else resolve();
        };
        raf = requestAnimationFrame(tick);
      });
    }

    /* -- the rotation cycle -- */
    function schedule(delay) {
      clearTimeout(timer);
      nextAt = performance.now() + delay;
      timer = setTimeout(rotate, delay);
    }

    async function rotate() {
      if (!inView) return;
      const from = pos;
      await tween(CONFIG.rotateDuration, (t) => {
        pos = from + easeInOutCubic(t);
      });
      pos = Math.round(pos);
      render();
      schedule(CONFIG.interval - CONFIG.rotateDuration);
    }

    /* -- scroll-in: text blur-fade + spinning stats -- */
    async function intro() {
      root.classList.add('is-in');
      await new Promise((r) => setTimeout(r, CONFIG.introDelay));
      // start one slot "behind" so the highlighted stat spins in and stops
      await tween(CONFIG.introDuration, (t) => {
        pos = -1 + easeOutQuart(t);
        fade = smooth(clamp(t / 0.8, 0, 1));
      });
      pos = 0;
      fade = 1;
      render();
      schedule(CONFIG.interval);
    }

    /* -- reduced motion: show everything, no spinning -- */
    if (reduceMotion) {
      root.setAttribute('data-anim', 'ready');
      fade = 1;
      render();
      new IntersectionObserver((entries, io) => {
        if (entries.some((e) => e.isIntersecting)) {
          root.classList.add('is-in');
          io.disconnect();
        }
      }, { threshold: CONFIG.threshold }).observe(root);
      return;
    }

    root.setAttribute('data-anim', 'ready');
    render(); // initial hidden state (fade = 0)

    new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      inView = e.isIntersecting;
      if (!started && e.intersectionRatio >= CONFIG.threshold) {
        started = true;
        intro();
      } else if (started) {
        // pause the cycle while off-screen, resume when back
        if (!inView) {
          clearTimeout(timer);
        } else if (fade === 1) {
          schedule(Math.max(0, nextAt - performance.now()) || 600);
        }
      }
    }, { threshold: [0, CONFIG.threshold] }).observe(root);
  }

  document.querySelectorAll('[data-stats]').forEach(init);
})();
