(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const icons = {
    file: '<path d="M6 2.5h7l5 5V21.5H6z"/><path d="M13 2.5v5h5M9 12h6M9 16h6"/>',
    message: '<path d="M4 4.5h16v12H9l-5 4z"/><path d="M8 9h8M8 12.5h5"/>',
    receipt: '<path d="M6 3l2 1.5L10 3l2 1.5L14 3l2 1.5L18 3v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 15l2 2 5-5"/>',
    clipboard: '<path d="M9 4h6l1 3h3v14H5V7h3z"/><path d="M9 4V2h6v2M9 12h6M9 16h5"/>',
    inbox: '<path d="M4 4h16l2 11v5H2v-5z"/><path d="M2 15h6l2 3h4l2-3h6"/>',
    list: '<path d="M10 7h10M10 12h10M10 17h10M4 7l1.5 1.5L8 5.5M4 12l1.5 1.5L8 10.5M4 17l1.5 1.5L8 15.5"/>',
    package: '<path d="M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10"/><path d="M8 5l8 4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/>',
    check: '<path d="M5 12.5l4 4L19 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };

  const reviewItems = [
    ['file', 'Send the revised proposal?', 'Your agent prepared it from the approved scope.'],
    ['message', 'Send three drafted replies?', 'Your agent used the customer history and your response guide.'],
    ['receipt', 'Send the invoice reminder?', 'Your agent drafted a friendly follow-up for the overdue invoice.'],
    ['calendar', 'Use the proposed schedule changes?', 'Your agent found a way to resolve two delivery conflicts.'],
    ['clipboard', 'Share the proposal first draft?', 'Your agent assembled the first draft for your review.'],
  ];

  const handledItems = [
    ['inbox', 'New customer requests sorted', 'Seven requests were categorized and sent to the right owners.'],
    ['list', 'Meeting follow-ups assigned', 'Owners and due dates were added to every action item.'],
    ['message', 'Customer questions routed', 'Questions were matched to the teams best placed to answer.'],
    ['clipboard', 'Vendor paperwork checked', 'Missing fields and expiration dates were flagged.'],
    ['package', 'Order status summarized', 'Exceptions and next steps were organized for the team.'],
    ['calendar', 'Renewal reminders queued', 'Upcoming renewals were prepared for timely follow-up.'],
    ['search', 'Weekly operations brief prepared', 'The week’s changes, blockers, and priorities were summarized.'],
  ];

  function setIcon(target, name) {
    target.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
  }

  function setupNavigation() {
    const nav = document.querySelector('.site-nav');
    if (!nav) return;
    const update = () => {
      nav.dataset.scrolled = String(window.scrollY > 8);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function setupAgentDesk() {
    const scene = document.querySelector('[data-agent-scene]');
    if (!scene) return;

    const title = scene.querySelector('[data-activity-title]');
    const detail = scene.querySelector('[data-activity-detail]');
    const icon = scene.querySelector('[data-activity-icon]');
    const row = scene.querySelector('[data-activity-row]');
    const heading = scene.querySelector('[data-queue-heading]');
    const state = scene.querySelector('[data-queue-state]');
    const actions = scene.querySelector('[data-decision-actions]');
    const result = scene.querySelector('[data-decision-result]');
    const handled = scene.querySelector('[data-handled-status]');
    const approve = scene.querySelector('[data-approve]');
    const deny = scene.querySelector('[data-deny]');
    let active = 0;
    let paused = false;
    let decision = 'pending';
    let transitionTimer = 0;

    function currentItem() {
      const isReview = active % 2 === 0;
      const index = Math.floor(active / 2);
      return {
        isReview,
        item: isReview
          ? reviewItems[index % reviewItems.length]
          : handledItems[index % handledItems.length],
      };
    }

    function render() {
      const { isReview, item } = currentItem();
      const [iconName, itemTitle, itemDetail] = item;
      heading.textContent = isReview ? 'Needs your review' : 'Handled by agents';
      title.textContent = itemTitle;
      detail.textContent = itemDetail;
      setIcon(icon, decision === 'pending' ? iconName : decision === 'approved' ? 'check' : 'close');
      icon.dataset.kind = isReview
        ? decision === 'pending' ? 'review' : decision
        : 'handled';

      state.hidden = !isReview;
      state.dataset.state = decision;
      state.textContent = decision === 'pending'
        ? '1 waiting'
        : decision === 'approved' ? 'Approved' : 'Denied';

      actions.hidden = !isReview || decision !== 'pending';
      result.hidden = !isReview || decision === 'pending';
      handled.hidden = isReview;
      if (decision !== 'pending') {
        result.dataset.state = decision;
        result.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[decision === 'approved' ? 'check' : 'close']}</svg>${decision === 'approved' ? 'Approved' : 'Denied'} <small>Change</small>`;
      }

      row.dataset.transition = 'in';
    }

    function next() {
      if (paused) return;
      if (reducedMotion.matches) {
        active = (active + 1) % 10;
        decision = 'pending';
        render();
        return;
      }
      row.dataset.transition = 'out';
      window.clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(() => {
        active = (active + 1) % 10;
        decision = 'pending';
        render();
      }, 215);
    }

    function decide(nextDecision) {
      decision = nextDecision;
      paused = true;
      render();
    }

    approve.addEventListener('click', () => decide('approved'));
    deny.addEventListener('click', () => decide('denied'));
    result.addEventListener('click', () => {
      decision = 'pending';
      render();
    });
    scene.addEventListener('mouseenter', () => {
      paused = true;
    });
    scene.addEventListener('mouseleave', () => {
      paused = false;
    });
    scene.addEventListener('focusin', () => {
      paused = true;
    });
    scene.addEventListener('focusout', (event) => {
      if (!scene.contains(event.relatedTarget)) paused = false;
    });

    render();
    window.setInterval(next, 4400);
  }

  function setupOutcomes() {
    const carousel = document.querySelector('[data-outcomes]');
    if (!carousel) return;

    const track = carousel.querySelector('[data-outcome-track]');
    const cards = Array.from(track.children);
    const previous = carousel.querySelector('[data-outcome-previous]');
    const next = carousel.querySelector('[data-outcome-next]');
    const count = carousel.querySelector('[data-outcome-count]');
    const media = window.matchMedia('(max-width: 1000px)');
    let visible = media.matches ? 1 : 3;
    let active = 0;
    let paused = false;
    let changing = false;
    let transitionTimer = 0;

    function render() {
      const maxIndex = cards.length - visible;
      active = Math.min(active, maxIndex);
      track.style.setProperty('--visible-count', visible);
      count.textContent = visible === 1
        ? `${String(active + 1).padStart(2, '0')} of ${cards.length}`
        : `${String(active + 1).padStart(2, '0')}–${String(active + visible).padStart(2, '0')} of ${cards.length}`;
      cards.forEach((card, index) => {
        const visibleIndex = index - active;
        const isVisible = visibleIndex >= 0 && visibleIndex < visible;
        card.hidden = !isVisible;
        card.setAttribute('aria-hidden', String(!isVisible));
        if (isVisible) {
          card.dataset.position = visibleIndex === 0
            ? 'first'
            : visibleIndex === visible - 1 ? 'last' : 'middle';
        } else {
          delete card.dataset.position;
        }
      });
    }

    function transitionTo(nextIndex) {
      if (changing) return;
      if (reducedMotion.matches) {
        active = nextIndex;
        render();
        return;
      }
      changing = true;
      track.dataset.transition = 'out';
      window.clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(() => {
        active = nextIndex;
        render();
        track.dataset.transition = 'in';
        changing = false;
      }, 195);
    }

    function goNext() {
      const maxIndex = cards.length - visible;
      transitionTo(active >= maxIndex ? 0 : active + 1);
    }

    function goPrevious() {
      const maxIndex = cards.length - visible;
      transitionTo(active <= 0 ? maxIndex : active - 1);
    }

    previous.addEventListener('click', goPrevious);
    next.addEventListener('click', goNext);
    media.addEventListener('change', (event) => {
      visible = event.matches ? 1 : 3;
      changing = false;
      window.clearTimeout(transitionTimer);
      delete track.dataset.transition;
      render();
    });
    carousel.addEventListener('mouseenter', () => {
      paused = true;
    });
    carousel.addEventListener('mouseleave', () => {
      paused = false;
    });
    carousel.addEventListener('focusin', () => {
      paused = true;
    });
    carousel.addEventListener('focusout', (event) => {
      if (!carousel.contains(event.relatedTarget)) paused = false;
    });
    window.setInterval(() => {
      if (!paused && !reducedMotion.matches && !document.hidden) goNext();
    }, 5600);
    render();
  }

  function setupReveals() {
    const targets = Array.from(document.querySelectorAll('.reveal'));
    document.documentElement.dataset.motion = 'ready';
    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      targets.forEach((target) => {
        target.dataset.visible = 'true';
      });
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.visible = 'true';
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach((target) => observer.observe(target));
  }

  function setupContactForm() {
    const form = document.querySelector('#contact-form');
    if (!form) return;
    const endpoint = 'https://crest88-form.phillip-8ea.workers.dev';
    const status = form.querySelector('[data-form-status]');
    const submit = form.querySelector('button[type="submit"]');
    const submitLabel = submit.querySelector('[data-submit-label]');

    function showStatus(kind, content) {
      status.dataset.visible = 'true';
      status.dataset.kind = kind;
      status.innerHTML = content;
      status.focus();
    }

    function clearError(field) {
      field.removeAttribute('aria-invalid');
      const error = form.querySelector(`#${field.id}-error`);
      if (error) error.textContent = '';
    }

    function setError(field, message) {
      field.setAttribute('aria-invalid', 'true');
      const error = form.querySelector(`#${field.id}-error`);
      if (error) error.textContent = message;
    }

    form.querySelectorAll('input, textarea').forEach((field) => {
      field.addEventListener('input', () => clearError(field));
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = form.elements.name;
      const email = form.elements.email;
      let valid = true;
      [name, email].forEach(clearError);

      if (!name.value.trim()) {
        setError(name, 'Enter your name so we know who to reply to.');
        valid = false;
      }
      if (!email.value.trim()) {
        setError(email, 'Enter your work email.');
        valid = false;
      } else if (!email.validity.valid) {
        setError(email, 'Enter a valid email address, such as name@company.com.');
        valid = false;
      }
      if (!valid) {
        form.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }

      submit.disabled = true;
      submitLabel.textContent = 'Sending…';
      status.dataset.visible = 'false';
      const data = new FormData(form);
      const payload = {
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim(),
        company: String(data.get('company') || '').trim(),
        website: String(data.get('website') || '').trim(),
        size: String(data.get('size') || '').trim(),
        notes: String(data.get('notes') || '').trim(),
      };

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          throw new Error(result.error || `Request failed with status ${response.status}`);
        }
        form.reset();
        showStatus(
          'success',
          '<strong>Thank you.</strong> Your message is in. Check your inbox for a confirmation; we’ll reply within one business day.',
        );
      } catch (error) {
        showStatus(
          'error',
          '<strong>Your message could not be sent.</strong> Try again, or email <a href="mailto:hello@crest88.com">hello@crest88.com</a> directly.',
        );
        console.error('Crest88 contact form submission failed:', error);
      } finally {
        submit.disabled = false;
        submitLabel.textContent = 'Send inquiry';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.Crest88Orb?.mountAll();
    setupNavigation();
    setupAgentDesk();
    setupOutcomes();
    setupReveals();
    setupContactForm();
  });
})();
