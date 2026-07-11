/* ==========================================================================
   RepoMind AI — Landing Page Interactions
   ========================================================================== */

// -- nav scroll state --------------------------------------------------
const nav = document.querySelector('.nav');
const heroEl = document.querySelector('.hero');
const heroHeight = () => (heroEl ? heroEl.offsetHeight : 600);

function onScroll() {
  nav.classList.toggle('scrolled', window.scrollY > 40);

  // dim the galaxy canvas as the reader moves past the hero
  const fraction = Math.min(1, window.scrollY / (heroHeight() * 0.9));
  if (window.__galaxyScrollDim) window.__galaxyScrollDim(fraction);
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// -- scroll reveals ------------------------------------------------------
const revealTargets = document.querySelectorAll('[data-reveal]');
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        const delay = Number(entry.target.dataset.revealDelay || 0);
        window.setTimeout(() => entry.target.classList.add('is-visible'), delay);
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
);
revealTargets.forEach((el) => revealObserver.observe(el));

// stagger children that share a reveal group
document.querySelectorAll('[data-reveal-group]').forEach((group) => {
  const items = group.querySelectorAll('[data-reveal]');
  items.forEach((el, i) => el.setAttribute('data-reveal-delay', String(i * 90)));
});

// -- FAQ accordion ---------------------------------------------------------
document.querySelectorAll('.faq-item').forEach((item) => {
  const q = item.querySelector('.faq-q');
  q.addEventListener('click', () => {
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach((open) => open.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});

// -- feature card cursor glow ----------------------------------------------
document.querySelectorAll('.feature-card').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    card.style.setProperty('--my', `${e.clientY - rect.top}px`);
  });
});

// -- smooth-scroll anchor links --------------------------------------------
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// -- proof window: retype the exchange each time it enters view -----------
const proofAnswer = document.getElementById('proof-answer');
if (proofAnswer) {
  const fullHTML = proofAnswer.innerHTML;
  const fullText = proofAnswer.textContent;
  let typed = false;

  const proofObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !typed) {
          typed = true;
          typeAnswer();
          proofObserver.disconnect();
        }
      });
    },
    { threshold: 0.5 }
  );
  proofObserver.observe(proofAnswer);

  function typeAnswer() {
    // reveal the pre-built rich HTML by clipping it in, rather than
    // rebuilding markup character by character (keeps citation chips intact)
    proofAnswer.style.clipPath = 'inset(0 100% 0 0)';
    proofAnswer.style.opacity = '1';
    proofAnswer.innerHTML = fullHTML;
    let progress = 0;
    const duration = 1400;
    const start = performance.now();
    function step(t) {
      progress = Math.min(1, (t - start) / duration);
      proofAnswer.style.clipPath = `inset(0 ${100 - progress * 100}% 0 0)`;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
}
