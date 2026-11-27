(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none)");
  const clickTarget = 'a[href], button:not(:disabled):not([aria-disabled="true"]), summary, [role="button"]:not([aria-disabled="true"])';

  const userMotionReduced = () => document.documentElement.dataset.motion === "reduced";

  function prepareReveals() {
    if (reduced.matches || userMotionReduced() || typeof IntersectionObserver !== "function") return;
    const elements = [...document.querySelectorAll("[data-reveal]")];
    const observer = new IntersectionObserver(entries => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) continue;
        target.dataset.revealState = "entering";
        observer.unobserve(target);
      }
    }, { rootMargin: "0px 0px -16px" });

    function show(element) {
      observer.unobserve(element);
      delete element.dataset.revealState;
    }

    for (const element of elements) {
      if (element.getBoundingClientRect().top < innerHeight) continue;
      element.dataset.revealState = "waiting";
      observer.observe(element);
    }

    document.addEventListener("focusin", ({ target }) => {
      for (const element of document.querySelectorAll("[data-reveal-state]")) {
        if (element.contains(target)) show(element);
      }
    });
    document.addEventListener("animationend", ({ target, animationName }) => {
      if (animationName === "tf-reveal") show(target);
    });
    function finishReveals() {
      if (!reduced.matches && !userMotionReduced()) return;
      observer.disconnect();
      for (const element of elements) delete element.dataset.revealState;
    }
    reduced.addEventListener("change", finishReveals);
    document.addEventListener("tradeforge:motionchange", finishReveals);
  }

  const guide = document.createElement("div");
  guide.className = "tf-cursor-guide";
  guide.setAttribute("aria-hidden", "true");
  guide.hidden = true;
  document.body.append(guide);

  let activeButton = null;
  let pointerEvent = null;
  let pointerFrame = 0;
  const limit = n => Math.max(-6, Math.min(6, n));

  function resetMagnet() {
    if (!activeButton) return;
    activeButton.style.removeProperty("--tf-magnet-x");
    activeButton.style.removeProperty("--tf-magnet-y");
    activeButton = null;
  }

  function clearPointer() {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pointerEvent = null;
    guide.hidden = true;
    resetMagnet();
  }

  function paintPointer() {
    pointerFrame = 0;
    const { clientX, clientY, target } = pointerEvent;
    const control = target.closest(clickTarget);
    guide.style.left = clientX + "px";
    guide.style.top = clientY + "px";
    guide.classList.toggle("is-over-control", Boolean(control));
    guide.hidden = false;

    const button = control?.closest("[data-magnetic]");
    if (activeButton !== button) resetMagnet();
    if (!button) return;
    activeButton = button;
    const { left, top, width, height } = button.getBoundingClientRect();
    button.style.setProperty("--tf-magnet-x", limit((clientX - left - width / 2) * 0.13) + "px");
    button.style.setProperty("--tf-magnet-y", limit((clientY - top - height / 2) * 0.15) + "px");
  }

  document.addEventListener("pointermove", event => {
    if (!finePointer.matches || userMotionReduced() || event.pointerType !== "mouse" ||
        !(event.target instanceof Element)) return;
    pointerEvent = event;
    if (!pointerFrame) pointerFrame = requestAnimationFrame(paintPointer);
  }, { passive: true });
  document.addEventListener("pointerleave", clearPointer);
  document.addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse") clearPointer();
  }, { passive: true });
  document.addEventListener("keydown", ({ key }) => {
    if (key === "Tab") clearPointer();
  });
  document.addEventListener("visibilitychange", clearPointer);
  window.addEventListener("blur", clearPointer);
  finePointer.addEventListener("change", clearPointer);
  document.addEventListener("tradeforge:motionchange", clearPointer);

  document.addEventListener("click", ({ target }) => {
    if (!(target instanceof Element)) return;
    target.closest(".site-mobile-menu a[href]")?.closest("details.site-mobile-menu")?.removeAttribute("open");
  });
  document.addEventListener("keydown", ({ key, target }) => {
    if (key !== "Escape" || !(target instanceof Element)) return;
    const menu = target.closest("details.site-mobile-menu[open]");
    if (!menu) return;
    menu.open = false;
    menu.querySelector("summary").focus();
  });

  prepareReveals();
})();
