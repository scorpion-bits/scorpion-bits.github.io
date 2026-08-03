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

    /* ------------------------------------------- mascote animado -- */
    /* O poster estático (48 KB) entra no primeiro paint; a animação só
       começa a baixar depois do load e substitui o poster com um fade.
       Assim ela nunca atrasa a renderização inicial.

       É um WebP animado, e não um vídeo, porque o Safari decodifica VP9
       mas não implementa canal alpha em WebM — tocaria um retângulo preto
       no lugar da transparência. WebP animado com alpha ele suporta desde
       a versão 14, então dá para servir um arquivo só para todo mundo e
       dispensar a detecção de capacidade que existia aqui.

       1,1 MB é caro para um enfeite, então três portas ficam fechadas:
       modo de economia de dados, conexão lenta e quem pediu menos
       movimento — um WebP animado não tem como pausar depois de carregado,
       então nesse caso o certo é não baixar. Em qualquer uma delas fica o
       poster, que é o quadro 0 da própria animação. */
    {
        const anim = document.querySelector("img[data-anim]");
        const poster = document.querySelector("img.hero-mascot:not([data-anim])");
        const rede = navigator.connection || {};
        const lenta = /2g/.test(rede.effectiveType || "");
        const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (anim && poster && !rede.saveData && !lenta && !calmo) {
            const iniciar = () => {
                anim.addEventListener(
                    "load",
                    () => {
                        anim.classList.add("is-on");
                        poster.classList.add("is-off");
                    },
                    { once: true }
                );

                anim.addEventListener("error", () => anim.remove(), { once: true });
                anim.src = anim.dataset.anim;
            };

            if (document.readyState === "complete") iniciar();
            else addEventListener("load", iniciar, { once: true });
        }
    }

    /* ------------------------------------ título: máquina de escrever -- */
    /* Escreve, apaga e alterna entre as duas frases, com um cursor de
       terminal piscando no fim da linha que está sendo digitada.

       O texto de verdade vive num `.hero-sr` invisível: as duas linhas
       visíveis são `aria-hidden`, senão o leitor de tela anunciaria o
       título de novo a cada letra.

       Nada disso roda com `prefers-reduced-motion`: é movimento contínuo
       e sem fim, exatamente o que a preferência pede para desligar. */
    {
        const titulo = document.querySelector(".hero-type");
        const linhas = titulo && [
            titulo.querySelector(".hero-l1 .hero-ln"),
            titulo.querySelector(".hero-l3 .hero-ln"),
        ];
        const calmo = matchMedia("(prefers-reduced-motion: reduce)");

        const FRASES = [
            ["Ideias que", "viram jogo."],
            ["Scorpion", "Bits."],
        ];
        const ESCREVE = 46;
        const APAGA = 24;
        const PAUSA_CHEIA = 3600;
        const PAUSA_VAZIA = 480;

        /* o ponto final é ciano, como na marca — montado por nó de texto,
           sem innerHTML */
        const pinta = (el, txt) => {
            el.textContent = "";
            if (txt.endsWith(".")) {
                if (txt.length > 1) el.append(txt.slice(0, -1));
                const em = document.createElement("em");
                em.textContent = ".";
                el.append(em);
            } else if (txt) {
                el.append(txt);
            }
            // a cópia para o brilho líquido lê daqui
            el.parentElement.dataset.text = txt;
        };

        if (linhas && linhas[0] && linhas[1] && !calmo.matches) {
            let frase = 0;
            let n = 0;
            let apagando = false;
            let timer = 0;
            let parado = false;

            const passo = () => {
                const [a, b] = FRASES[frase];
                const total = a.length + b.length;

                pinta(linhas[0], a.slice(0, Math.min(n, a.length)));
                pinta(linhas[1], b.slice(0, Math.max(0, n - a.length)));
                linhas[0].classList.toggle("is-caret", n <= a.length);
                linhas[1].classList.toggle("is-caret", n > a.length);

                let espera;
                if (!apagando) {
                    if (n < total) {
                        n += 1;
                        espera = ESCREVE + Math.random() * 58; // cadência humana
                    } else {
                        apagando = true;
                        espera = PAUSA_CHEIA;
                    }
                } else if (n > 0) {
                    n -= 1;
                    espera = APAGA;
                } else {
                    apagando = false;
                    frase = (frase + 1) % FRASES.length;
                    espera = PAUSA_VAZIA;
                }

                if (!parado) timer = setTimeout(passo, espera);
            };

            // some com o texto do HTML no mesmo quadro em que o script roda,
            // antes da primeira pintura — não chega a piscar
            n = 0;
            passo();

            // aba em segundo plano não precisa de timer rodando
            document.addEventListener("visibilitychange", () => {
                parado = document.hidden;
                clearTimeout(timer);
                if (!parado) passo();
            });
        }
    }

    /* ------------------------------ brilho líquido sob o ponteiro -- */
    /* Só desktop, e só enquanto o ponteiro está no herói. A bolha persegue
       o mouse com atraso (interpolação de 14% por quadro) e respira com os
       dois raios fora de fase — junto, isso lê como gota, não como lanterna.
       Um único rAF escreve quatro custom properties; o resto é CSS. */
    {
        const titulo = document.querySelector(".hero-type");
        const heroi = document.querySelector(".hero");
        const alvos = titulo
            ? [titulo.querySelector(".hero-l1"), titulo.querySelector(".hero-l3")]
            : [];
        const podeApontar = matchMedia("(hover: hover) and (pointer: fine)");
        const calmo = matchMedia("(prefers-reduced-motion: reduce)");

        if (heroi && alvos[0] && alvos[1] && podeApontar.matches && !calmo.matches) {
            const estado = alvos.map(() => ({ x: 0, y: 0, iniciado: false }));
            let mx = 0;
            let my = 0;
            let t = 0;
            let raf = 0;
            let dentro = false;
            let desligaEm = 0;

            const quadro = () => {
                t += 1 / 60;
                // lê todos os retângulos antes de escrever qualquer estilo,
                // senão cada escrita força um recálculo de layout
                const caixas = alvos.map((el) => el.getBoundingClientRect());
                const gw = 158 + Math.sin(t * 1.7) * 30;
                const gh = 124 + Math.sin(t * 2.35 + 1.1) * 34;

                caixas.forEach((r, i) => {
                    const st = estado[i];
                    const ax = mx - r.left;
                    const ay = my - r.top;
                    if (!st.iniciado) {
                        st.x = ax;
                        st.y = ay;
                        st.iniciado = true;
                    } else {
                        st.x += (ax - st.x) * 0.14;
                        st.y += (ay - st.y) * 0.14;
                    }
                    const el = alvos[i];
                    el.style.setProperty("--gx", `${st.x.toFixed(1)}px`);
                    el.style.setProperty("--gy", `${st.y.toFixed(1)}px`);
                    el.style.setProperty("--gw", `${gw.toFixed(1)}px`);
                    el.style.setProperty("--gh", `${gh.toFixed(1)}px`);
                });

                // depois de sair, ainda roda o tempo do fade para a bolha
                // não congelar no meio da tela
                if (dentro || performance.now() < desligaEm) raf = requestAnimationFrame(quadro);
                else raf = 0;
            };

            heroi.addEventListener(
                "pointermove",
                (e) => {
                    if (e.pointerType !== "mouse") return;
                    mx = e.clientX;
                    my = e.clientY;
                    dentro = true;
                    titulo.classList.add("is-glow");
                    if (!raf) raf = requestAnimationFrame(quadro);
                },
                { passive: true }
            );

            heroi.addEventListener("pointerleave", () => {
                dentro = false;
                desligaEm = performance.now() + 400;
                titulo.classList.remove("is-glow");
                estado.forEach((st) => {
                    st.iniciado = false;
                });
            });
        }
    }

    /* --------------------------------------- parallax de rolagem -- */
    /* Publica scrollY numa custom property; as camadas do fundo aplicam
       o próprio multiplicador (--par) em CSS. Um listener passivo, uma
       escrita de estilo por quadro, e o deslocamento vai em `translate` —
       propriedade separada do `transform` que carrega os loops, então as
       duas compõem sem se sobrescrever. */
    {
        const root = document.documentElement;
        let ticking = false;

        const sync = () => {
            ticking = false;
            root.style.setProperty("--sy", `${window.scrollY}px`);
        };

        addEventListener(
            "scroll",
            () => {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(sync);
            },
            { passive: true }
        );

        sync();
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
