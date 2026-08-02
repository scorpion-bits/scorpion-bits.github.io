/* Scorpion Bits — comportamento mínimo.
   Sem física, sem loop de requestAnimationFrame solto: cada efeito é
   orientado a evento ou a IntersectionObserver. */
(() => {
    "use strict";

    /* ------------------------------------------------------ menu no dock */
    const toggle = document.querySelector("[data-dock-toggle]");
    const panel = document.getElementById("dock-panel");

    if (toggle && panel) {
        const setOpen = (open) => {
            panel.classList.toggle("is-open", open);
            toggle.setAttribute("aria-expanded", String(open));
            toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
            toggle.querySelector("use").setAttribute(
                "href",
                open ? "#i-close" : "#i-menu"
            );
        };

        toggle.addEventListener("click", () =>
            setOpen(!panel.classList.contains("is-open"))
        );

        panel.addEventListener("click", (e) => {
            if (e.target.closest("a")) setOpen(false);
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && panel.classList.contains("is-open")) {
                setOpen(false);
                toggle.focus();
            }
        });

        matchMedia("(min-width: 861px)").addEventListener("change", (e) => {
            if (e.matches) setOpen(false);
        });
    }

    /* --------------------------------------- sombra do dock ao grudar -- */
    const dock = document.querySelector(".dock");
    const sentinel = document.querySelector("[data-dock-sentinel]");

    if (dock && sentinel && "IntersectionObserver" in window) {
        new IntersectionObserver(
            ([entry]) => dock.classList.toggle("is-stuck", !entry.isIntersecting),
            { threshold: 0 }
        ).observe(sentinel);
    }

    /* ------------------------- holofote que segue o cursor nos cards -- */
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
        const SPOT = ".work-item";
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

    /* --------------------------------------------- carrossel da equipe -- */
    const rosterWrap = document.querySelector("[data-roster]");

    if (rosterWrap) {
        const stageEl = rosterWrap.querySelector("[data-stage]");
        const track = rosterWrap.querySelector("[data-track]");
        const rosterEl = rosterWrap.querySelector(".roster");
        const prevBtn = rosterWrap.querySelector("[data-prev]");
        const nextBtn = rosterWrap.querySelector("[data-next]");
        const rail = rosterWrap.querySelector("[data-rail]");
        const countEl = rosterWrap.querySelector("[data-count]");
        const pad = (n) => String(n).padStart(2, "0");

        /* Ordem sorteada a cada carregamento: ninguém fica sempre em
           primeiro. Fisher–Yates, e o mesmo sorteio é aplicado aos slides
           e aos avatares para os dois continuarem pareados. */
        const order = [...track.children].map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }

        const slidesRaw = [...track.children];
        const dotsRaw = [...rosterEl.children];
        const slides = order.map((i) => slidesRaw[i]);
        const dots = order.map((i) => dotsRaw[i]);
        slides.forEach((el) => track.appendChild(el));
        dots.forEach((el) => rosterEl.appendChild(el));

        const total = slides.length;

        // numeração é posicional, então só faz sentido depois do sorteio
        slides.forEach((el, i) => {
            el.querySelector(".slide-no").textContent = `Integrante ${pad(i + 1)}`;
        });

        dots.forEach((el, i) => {
            el.dataset.go = i;
            el.dataset.n = i + 1;
        });

        rail.parentElement.style.setProperty("--total", total);

        let index = 0;

        const ghost = rosterWrap.querySelector("[data-ghost-out]");
        let ghostTimer = null;

        const render = () => {
            track.style.transform = `translateX(-${index * 100}%)`;
            rail.style.setProperty("--i", index);
            countEl.textContent = `${pad(index + 1)} / ${pad(total)}`;

            dots.forEach((dot, i) => {
                const on = i === index;
                dot.classList.toggle("is-on", on);
                dot.setAttribute("aria-selected", String(on));
            });

            // só o slide visível recebe as animações de entrada, senão
            // todas disparariam de uma vez fora da tela
            slides.forEach((s, i) => s.classList.toggle("is-live", i === index));

            // nome gigante ao fundo: sai, troca, volta
            if (ghost) {
                ghost.classList.remove("is-in");
                clearTimeout(ghostTimer);
                ghostTimer = setTimeout(() => {
                    ghost.textContent = slides[index].dataset.ghost || "";
                    ghost.classList.add("is-in");
                }, 180);
            }
        };

        const goTo = (i) => {
            index = (i + total) % total;
            render();
        };

        dots.forEach((dot) => {
            dot.addEventListener("click", () => goTo(Number(dot.dataset.go)));
        });

        prevBtn.addEventListener("click", () => goTo(index - 1));
        nextBtn.addEventListener("click", () => goTo(index + 1));

        rosterWrap.addEventListener("keydown", (e) => {
            if (e.key === "ArrowRight") goTo(index + 1);
            if (e.key === "ArrowLeft") goTo(index - 1);
        });

        /* arrastar/deslizar o palco — ponteiro unificado (mouse + toque) */
        let dragging = false;
        let startX = 0;
        let deltaX = 0;
        let width = stageEl.clientWidth || 1;

        const onDown = (e) => {
            dragging = true;
            startX = e.clientX;
            deltaX = 0;
            width = stageEl.clientWidth || 1;
            stageEl.classList.add("is-dragging");
            stageEl.setPointerCapture?.(e.pointerId);
        };

        const onMove = (e) => {
            if (!dragging) return;
            deltaX = e.clientX - startX;
            const pct = (deltaX / width) * 100;
            track.style.transform = `translateX(calc(-${index * 100}% + ${pct}%))`;
        };

        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            stageEl.classList.remove("is-dragging");

            const threshold = width * 0.16;
            if (deltaX <= -threshold) goTo(index + 1);
            else if (deltaX >= threshold) goTo(index - 1);
            else render();
        };

        stageEl.addEventListener("pointerdown", onDown);
        stageEl.addEventListener("pointermove", onMove);
        stageEl.addEventListener("pointerup", onUp);
        stageEl.addEventListener("pointercancel", onUp);
        stageEl.addEventListener("pointerleave", (e) => {
            if (dragging && e.buttons === 0) onUp();
        });

        // arrastar não deve disparar o link dentro do slide
        track.querySelectorAll("a").forEach((a) => {
            a.addEventListener("click", (e) => {
                if (Math.abs(deltaX) > 6) e.preventDefault();
            });
        });

        window.addEventListener("resize", () => {
            width = stageEl.clientWidth || 1;
        });

        render();
    }

    /* ------------------------------------------- parallax no desktop -- */
    /* O desktop ficava parado demais em comparação ao mobile, onde cada
       bloco entra com o scroll. Aqui o mascote e o cubo reagem ao mouse.
       Só transform, um rAF por movimento, e nada disso roda no toque. */
    const canHover = matchMedia("(hover: hover) and (pointer: fine)");
    const stillMQ = matchMedia("(prefers-reduced-motion: reduce)");
    const floaters = document.querySelectorAll("[data-float]");

    if (floaters.length && canHover.matches && !stillMQ.matches) {
        let queued = false;
        let px = 0;
        let py = 0;

        window.addEventListener(
            "pointermove",
            (e) => {
                px = e.clientX / window.innerWidth - 0.5;
                py = e.clientY / window.innerHeight - 0.5;

                if (queued) return;
                queued = true;

                requestAnimationFrame(() => {
                    queued = false;
                    floaters.forEach((el) => {
                        const depth = Number(el.dataset.float) || 18;
                        el.style.setProperty("--px", `${px * depth}px`);
                        el.style.setProperty("--py", `${py * depth}px`);
                    });
                });
            },
            { passive: true }
        );
    }

    if (!("IntersectionObserver" in window)) return;

    /* --------------------------------------------- entrada das seções -- */
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
    document.querySelectorAll(".dock-link[href*='#']").forEach((link) => {
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

                const active = sections.find((s) => visible.has(s.id));

                links.forEach((link, id) => {
                    link.classList.toggle("is-active", Boolean(active) && id === active.id);
                });
            },
            { rootMargin: "-25% 0px -55% 0px", threshold: 0 }
        );

        sections.forEach((section) => spy.observe(section));
    }
})();
