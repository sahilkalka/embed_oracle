// public/js/counters.js - IntersectionObserver Animated Metric Counters
document.addEventListener('DOMContentLoaded', () => {
  const elements = document.querySelectorAll('.count-up');
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseFloat(el.getAttribute('data-target'));
        const isDecimal = el.getAttribute('data-decimal') === '1';
        let current = 0;
        const step = target / 40;
        const interval = setInterval(() => {
          current += step;
          if (current >= target) {
            el.textContent = isDecimal ? target.toFixed(1) : Math.round(target);
            clearInterval(interval);
          } else {
            el.textContent = isDecimal ? current.toFixed(1) : Math.round(current);
          }
        }, 30);
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.2 });

  elements.forEach(el => observer.observe(el));
});

