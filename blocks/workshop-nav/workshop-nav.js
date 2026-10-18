import { toClassName } from '../../scripts/aem.js';

const LESSON_RE = /^(lesson|lab|module)\b/i;

function group(title, headings) {
  const wrap = document.createElement('div');
  wrap.className = 'workshop-nav-group';
  const label = document.createElement('p');
  label.className = 'workshop-nav-label';
  label.textContent = title;
  const list = document.createElement('ul');
  headings.forEach((h) => {
    if (!h.id) h.id = toClassName(h.textContent);
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent.trim();
    a.addEventListener('click', (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${h.id}`);
    });
    li.append(a);
    list.append(li);
  });
  wrap.append(label, list);
  return wrap;
}

function decorateBar(block) {
  const main = block.closest('main');
  const section = block.closest('.section');
  const headings = [...main.querySelectorAll('.section:not(.recommendations) .default-content-wrapper h2')];
  const wrapper = block.parentElement;
  if (!headings.length) {
    wrapper.remove();
    return;
  }

  const nav = document.createElement('nav');
  nav.className = 'workshop-nav-bar';
  nav.setAttribute('aria-label', 'On this page');
  const list = document.createElement('ul');
  headings.forEach((h) => {
    if (!h.id) h.id = toClassName(h.textContent);
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent.trim().replace(/^\d+\.\s*/, '');
    a.addEventListener('click', (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${h.id}`);
    });
    li.append(a);
    list.append(li);
  });
  nav.append(list);

  // the bar lives directly in <main> so it stays sticky across every section
  const sentinel = document.createElement('div');
  sentinel.className = 'workshop-nav-sentinel';
  main.insertBefore(sentinel, section);
  main.insertBefore(nav, section);
  wrapper.remove();
  if (!section.querySelector(':scope > div')) section.remove();
  document.body.classList.add('has-subnav');

  // once the bar reaches the header, hide the header and pin the bar to the top
  new IntersectionObserver(([entry]) => {
    const pinned = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    document.body.classList.toggle('subnav-pinned', pinned);
  }, { rootMargin: '-64px 0px 0px 0px' }).observe(sentinel);

  const links = [...list.querySelectorAll('a')];
  let current = headings[0];
  const spy = () => {
    const passed = headings.filter((h) => h.getBoundingClientRect().top < 140);
    const active = passed[passed.length - 1] || headings[0];
    if (active === current) return;
    current = active;
    links.forEach((a) => {
      const on = a.getAttribute('href') === `#${active.id}`;
      a.classList.toggle('active', on);
      if (on) list.scrollTo({ left: a.offsetLeft - 24, behavior: 'smooth' });
    });
  };
  window.addEventListener('scroll', spy, { passive: true });
  links[0].classList.add('active');
}

/**
 * Sticky sidebar for workshop pages, built from the section's h2/h3 headings.
 * Headings starting with "Lesson", "Lab" or "Module" are listed under Lessons.
 * Optional block rows add extra links (e.g. lesson pages) under Lessons.
 */
export default function decorate(block) {
  const isWorkshop = window.location.pathname.startsWith('/workshops/');
  const hasLessons = [...document.querySelectorAll('main :is(h2, h3)')]
    .some((h) => LESSON_RE.test(h.textContent.trim()));
  const sidebar = block.classList.contains('sidebar')
    || (!block.classList.contains('bar') && (isWorkshop || hasLessons || block.querySelector('a')));
  if (!sidebar) {
    decorateBar(block);
    return;
  }

  const section = block.closest('.section');
  const extra = [...block.querySelectorAll('a')];
  block.textContent = '';
  if (!section) return;

  const headings = [...section.querySelectorAll('.default-content-wrapper :is(h2, h3)')];
  const sections = headings.filter((h) => !LESSON_RE.test(h.textContent.trim()));
  const lessons = headings.filter((h) => LESSON_RE.test(h.textContent.trim()));

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Workshop contents');
  if (sections.length) nav.append(group('Sections', sections));
  if (lessons.length || extra.length) {
    const g = group('Lessons', lessons);
    extra.forEach((a) => {
      const li = document.createElement('li');
      li.append(a);
      g.querySelector('ul').append(li);
    });
    nav.append(g);
  }
  block.append(nav);

  section.classList.add('workshop-layout');
  const content = document.createElement('div');
  content.className = 'workshop-content';
  section.querySelectorAll(':scope > div:not(.workshop-nav-wrapper)').forEach((d) => content.append(d));
  section.append(content);

  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  headings.forEach((h) => observer.observe(h));
}
