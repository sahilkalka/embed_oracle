(() => {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting || !target.getBoundingClientRect().width || target.dataset.adQueued) return;
      target.dataset.adQueued = 'true';
      observer.unobserve(target);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
      catch (error) { console.warn('Advertisement could not be initialized.', error.message); }
    });
  }, { rootMargin: '200px' });
  document.querySelectorAll('.adsbygoogle').forEach(slot => observer.observe(slot));
})();
