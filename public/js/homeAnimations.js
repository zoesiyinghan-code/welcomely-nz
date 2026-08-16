gsap.registerPlugin(ScrollTrigger);

/* ================================
   HERO MASKED TEXT REVEAL
================================ */
gsap.utils.toArray(".masked-text").forEach((el, i) => {
    gsap.to(el, {
        y: 0,
        opacity: 1,
        duration: 1.4,
        delay: i * 0.2,
        ease: "power4.out"
    });
});


/* ================================
   STAGGERED CONTENT
================================ */
gsap.utils.toArray(".stagger").forEach((el) => {
    gsap.from(el, {
        opacity: 0,
        y: 30,
        duration: 1,
        ease: "power2.out",
        scrollTrigger: {
            trigger: el,
            start: "top 85%"
        }
    });
});


/* ================================
   SLIDE-IN ILLUSTRATIONS
================================ */
gsap.utils.toArray(".illustrated-slide").forEach(el => {
    gsap.to(el, {
        x: 0,
        y: 0,
        opacity: 1,
        duration: 1.4,
        ease: "expo.out",
        scrollTrigger: {
            trigger: el,
            start: "top 80%"
        }
    });
});


/* ================================
   PARALLAX ILLUSTRATIONS (per-slide)
================================ */
gsap.utils.toArray(".parallax").forEach(img => {
    gsap.to(img, {
        y: -80,
        ease: "none",
        scrollTrigger: {
            trigger: img,
            scrub: 1.2
        }
    });
});


/* ================================
   FLOATING BACKGROUND SHAPES
================================ */
gsap.utils.toArray(".float-shape").forEach(shape => {
    gsap.to(shape, {
        y: "+=60",
        duration: 6,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
    });
});


/* ================================
   SECTION FADE TRANSITIONS
================================ */
gsap.utils.toArray(".snap-section").forEach(section => {
    gsap.from(section, {
        opacity: 0,
        duration: 1.2,
        scrollTrigger: {
            trigger: section,
            start: "top 90%"
        }
    });
});


/* ================================
   SCROLL PROGRESS BAR
================================ */
window.addEventListener("scroll", () => {
    const scrollTop = document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const progress = (scrollTop / height) * 100;
    document.querySelector(".scroll-progress").style.width = progress + "%";
});


/* ===========================================================
   GLOBAL APPLE-STYLE TRIPLE DEPTH PARALLAX (FIXED BACKGROUND)
=========================================================== */

// scroll parallax for entire page
gsap.to(".layer-back", {
    y: -60,
    ease: "none",
    scrollTrigger: {
        trigger: ".home-page",
        start: "top top",
        end: "bottom bottom",
        scrub: 1.2
    }
});

gsap.to(".layer-mid", {
    y: -120,
    ease: "none",
    scrollTrigger: {
        trigger: ".home-page",
        start: "top top",
        end: "bottom bottom",
        scrub: 1.2
    }
});

gsap.to(".layer-front", {
    y: -180,
    ease: "none",
    scrollTrigger: {
        trigger: ".home-page",
        start: "top top",
        end: "bottom bottom",
        scrub: 1.2
    }
});


/* ===========================================================
   MOUSE PARALLAX FOR TRIPLE DEPTH
=========================================================== */
document.addEventListener("mousemove", (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 30;
    const y = (e.clientY / window.innerHeight - 0.5) * 30;

    gsap.to(".layer-back",  { x: x * 0.2, y: y * 0.2, duration: 0.6, ease: "sine.out" });
    gsap.to(".layer-mid",   { x: x * 0.4, y: y * 0.4, duration: 0.6, ease: "sine.out" });
    gsap.to(".layer-front", { x: x * 0.6, y: y * 0.6, duration: 0.6, ease: "sine.out" });
});
/* =============================================
   BRAND LOGO + NAME HERO ENTRANCE
============================================= */

gsap.to(".brand-logo", {
    opacity: 1,
    scale: 1,
    duration: 1.2,
    ease: "power3.out"
});

gsap.to(".brand-name", {
    opacity: 1,
    y: 0,
    duration: 1.2,
    ease: "power3.out",
    delay: 0.2
});
