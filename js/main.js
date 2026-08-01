/* Scorpion Bits — comportamento mínimo.
   Sem loop de animação, sem física, sem sequestro de scroll.
   Tudo aqui é orientado a evento ou IntersectionObserver. */
(() => {
    "use strict";

    /* ---------------------------------------------------- menu no celular */
    const toggle = document.querySelector("[data-menu-toggle]");
    const menu = document.getElementById("nav-menu");

    if (toggle && menu) {
        const setOpen = (open) => {
            menu.classList.toggle("is-open", open);
            toggle.setAttribute("aria-expanded", String(open));
            toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
            toggle.querySelector("use").setAttribute(
                "href",
                open ? "#i-close" : "#i-menu"
            );
        };

        toggle.addEventListener("click", () =>
            setOpen(!menu.classList.contains("is-open"))
        );

        menu.addEventListener("click", (e) => {
            if (e.target.closest("a")) setOpen(false);
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && menu.classList.contains("is-open")) {
                setOpen(false);
                toggle.focus();
            }
        });

        // se a janela voltar ao tamanho de desktop, a gaveta não pode ficar presa
        matchMedia("(min-width: 821px)").addEventListener("change", (e) => {
            if (e.matches) setOpen(false);
        });
    }

    /* ------------------------------------ sombra do cabeçalho ao rolar */
    const header = document.querySelector(".site-header");
    const sentinel = document.querySelector("[data-header-sentinel]");

    if (header && sentinel && "IntersectionObserver" in window) {
        new IntersectionObserver(
            ([entry]) => header.classList.toggle("is-stuck", !entry.isIntersecting),
            { threshold: 0 }
        ).observe(sentinel);
    }

    /* ------------------------------------ holofote que segue o cursor */
    /* Um listener por página, delegado. Só escreve duas custom properties;
       o gradiente já está pintado, então não há reflow. Ignorado no toque. */
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
        const SPOT = ".card, .status-item, .member, .tool-group";
        let pending = null;

        document.addEventListener(
            "pointermove",
            (e) => {
                const card = e.target.closest(SPOT);
                if (!card) return;

                pending = { card, x: e.clientX, y: e.clientY };

                requestAnimationFrame(() => {
                    if (!pending) return;
                    const { card, x, y } = pending;
                    pending = null;
                    const r = card.getBoundingClientRect();
                    card.style.setProperty("--mx", `${x - r.left}px`);
                    card.style.setProperty("--my", `${y - r.top}px`);
                });
            },
            { passive: true }
        );
    }

    if (!("IntersectionObserver" in window)) return;

    /* --------------------------------- contagem dos números do hero */
    const stats = document.querySelectorAll("[data-count]");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (stats.length && !still) {
        const countObserver = new IntersectionObserver(
            (entries, obs) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    obs.unobserve(entry.target);

                    const el = entry.target;
                    const target = Number(el.dataset.count);
                    const start = performance.now();
                    const dur = 900;

                    const step = (now) => {
                        const p = Math.min((now - start) / dur, 1);
                        // easeOutCubic: rápido no começo, assenta no fim
                        const eased = 1 - Math.pow(1 - p, 3);
                        el.textContent = Math.round(target * eased);
                        if (p < 1) requestAnimationFrame(step);
                    };

                    el.textContent = "0";
                    requestAnimationFrame(step);
                });
            },
            { threshold: 0.6 }
        );

        stats.forEach((el) => countObserver.observe(el));
    }

    /* ------------------------------------------- entrada suave das seções */
    const revealed = document.querySelectorAll(".reveal");

    if (revealed.length) {
        const revealObserver = new IntersectionObserver(
            (entries, obs) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("is-visible");
                    obs.unobserve(entry.target);
                });
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
        );

        revealed.forEach((el) => revealObserver.observe(el));
    }

    /* ------------------------------------------- link ativo na navegação */
    const links = new Map();
    document.querySelectorAll(".nav-link[href*='#']").forEach((link) => {
        const id = link.getAttribute("href").split("#")[1];
        if (id) links.set(id, link);
    });

    const sections = [...links.keys()]
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    if (sections.length) {
        const visible = new Set();

        const spy = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) visible.add(entry.target.id);
                    else visible.delete(entry.target.id);
                });

                // a seção ativa é a primeira visível na ordem do documento
                const active = sections.find((s) => visible.has(s.id));

                links.forEach((link, id) => {
                    const on = Boolean(active) && id === active.id;
                    link.classList.toggle("is-active", on);
                    if (on) link.setAttribute("aria-current", "true");
                    else link.removeAttribute("aria-current");
                });
            },
            { rootMargin: "-25% 0px -55% 0px", threshold: 0 }
        );

        sections.forEach((section) => spy.observe(section));
    }
})();
