// Content stays visible until motion is enabled; reduced motion restores static CSS.
export function mountHomepageMotion(root: HTMLElement) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const targets = [
    ...root.querySelectorAll<HTMLElement>(
      // Keep the disclosure and calculator outside scroll-driven transforms:
      // focusing their controls must not move the next interaction target.
      ".home-split-heading, .home-engine, .home-three-cards, .home-scale-grid, .home-centered-heading, .home-cluster-figure, .home-sizing-facts, .home-agent-cards, .home-open-source, .home-evaluate",
    ),
  ];
  let frame = 0;
  const update = () => {
    frame = 0;
    if (preference.matches) return;
    targets.forEach((element) => {
      // Layout offsets exclude our animated transforms, preventing feedback.
      let top = 0;
      for (
        let node: HTMLElement | null = element;
        node;
        node = node.offsetParent as HTMLElement | null
      ) {
        top += node.offsetTop;
      }
      const progress = Math.min(
        1,
        Math.max(
          0,
          (window.innerHeight - (top - window.scrollY)) /
            Math.max(1, window.innerHeight * 0.75),
        ),
      );
      element.style.setProperty("--reveal-progress", String(progress));
    });
  };
  // One frame per scroll batch; the homepage has a small, fixed set of sections.
  const schedule = () => {
    if (!preference.matches && !frame)
      frame = window.requestAnimationFrame(update);
  };
  const applyPreference = () => {
    window.cancelAnimationFrame(frame);
    frame = 0;
    if (preference.matches) {
      delete root.dataset.motion;
    } else {
      update();
      root.dataset.motion = "active";
    }
  };
  targets.forEach((element) => {
    element.dataset.scrollReveal = "";
  });
  applyPreference();
  preference.addEventListener("change", applyPreference);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  // Re-evaluate positions when fonts or responsive content change the page height.
  const resize = new ResizeObserver(schedule);
  resize.observe(root);
  return () => {
    window.cancelAnimationFrame(frame);
    resize.disconnect();
    preference.removeEventListener("change", applyPreference);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    delete root.dataset.motion;
    targets.forEach((element) => {
      delete element.dataset.scrollReveal;
      element.style.removeProperty("--reveal-progress");
    });
  };
}
