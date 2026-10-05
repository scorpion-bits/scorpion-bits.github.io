/* ==========================================================================
   Rabo de Cubos — o jogo escondido no escorpião da home.

   Snake isométrico em PixiJS: o escorpião (o cubo com a carinha >_<) come
   bits, e cada bit vira um cubo na cauda — a mesma cauda de cubinhos da logo.

   Este arquivo NÃO entra no carregamento da página. Quem puxa ele (junto com
   assets/vendor/pixi.min.js e css/game.css) é o botão do escorpião, em
   main.js, no primeiro hover/foco/toque. Quem nunca clica nunca baixa nada.

   Tudo é desenhado por código — texturas dos cubos, sombras, partículas — e
   os sons são sintetizados com Web Audio. Não há nenhum arquivo de arte ou
   de áudio novo: o jogo herda a paleta do cubo da logo e do CSS do site.

   API pública: window.ScorpionGame.open({ origin, getOrigin, lite, audioCtx,
   onClose }). Detalhes em `abrir`.
   ========================================================================== */
(() => {
    "use strict";

    const PIXI = window.PIXI;
    if (!PIXI || window.ScorpionGame) return;
    const { Application, Container, Graphics, Sprite, Texture, Rectangle, Text } = PIXI;

    /* ------------------------------------------------------- geometria -- */
    /* Projeção isométrica "de verdade" (a da logo): o losango do chão tem
       largura √3 vezes a altura, e a aresta vertical de um cubo é igual à
       altura desse losango. Todo o desenho parte destas três medidas. */
    const TW = 72; // largura do ladrilho
    const TH = TW / Math.sqrt(3); // altura do ladrilho (≈ 41,6)
    const K = 0.86; // quanto do ladrilho o cubo ocupa (o resto é respiro)
    const CH = TH * K; // altura de um cubo

    /* Direções em ordem horária NA TELA, começando em "cima". O índice é o
       mesmo da tecla (↑ → ↓ ←), então virar à direita é +1 e o oposto é +2.
       Em isométrico não existe "cima" de verdade na grade: as quatro setas
       viram as quatro diagonais, girando a grade em 45°. */
    const DIRS = [
        { x: 0, y: -1 }, // ↑  sobe para a direita
        { x: 1, y: 0 }, //  →  desce para a direita
        { x: 0, y: 1 }, //  ↓  desce para a esquerda
        { x: -1, y: 0 }, // ←  sobe para a esquerda
    ];
    const TECLAS = {
        ArrowUp: 0, w: 0, W: 0,
        ArrowRight: 1, d: 1, D: 1,
        ArrowDown: 2, s: 2, S: 2,
        ArrowLeft: 3, a: 3, A: 3,
    };

    /* --------------------------------------------------------- paleta -- */
    const LINHA = "#0f2539"; // o contorno grosso da logo
    const RAMPA = [
        // ciano da logo → azul → índigo → violeta, do pescoço até a ponta
        { top: "#9bdcff", left: "#5fd0ff", right: "#2f8ccc" },
        { top: "#86b9ff", left: "#58a6f8", right: "#2f6fc0" },
        { top: "#9aa2ff", left: "#6b78f4", right: "#3a46b4" },
        { top: "#c0a4ff", left: "#9068f4", right: "#5a3cb4" },
    ];
    const PASSOS_RAMPA = 8;

    const hex = (s) => parseInt(s.slice(1), 16);
    const lerpN = (a, b, t) => a + (b - a) * t;
    const mixCor = (a, b, t) => {
        const ca = hex(a), cb = hex(b);
        const ch = (sh) => Math.round(lerpN((ca >> sh) & 255, (cb >> sh) & 255, t));
        return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
    };
    const rampa = (t) => {
        const p = Math.min(0.9999, Math.max(0, t)) * (RAMPA.length - 1);
        const i = Math.floor(p), f = p - i;
        const a = RAMPA[i], b = RAMPA[i + 1];
        return {
            top: mixCor(a.top, b.top, f),
            left: mixCor(a.left, b.left, f),
            right: mixCor(a.right, b.right, f),
        };
    };

    /* ----------------------------------------------------- utilidades -- */
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const easeOutBack = (t) => {
        const c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };
    const rnd = (a, b) => a + Math.random() * (b - a);

    /* ------------------------------------------------ progresso salvo -- */
    const CHAVE = "sb-game";
    const lerDados = () => {
        const base = { best: 0, bits: 0, plays: 0, unlocked: [] };
        try {
            return Object.assign(base, JSON.parse(localStorage.getItem(CHAVE) || "{}"));
        } catch (e) {
            return base;
        }
    };
    const gravarDados = (d) => {
        try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch (e) { /* privado */ }
    };

    /* Os power-ups: cada projeto e cada integrante do estúdio "mora" num cubo
       colorido que a cobra pode pegar. Destravam com o total de bits comidos
       (somando todas as partidas) e passam a aparecer no tabuleiro: um a cada
       4 bits, sorteado entre os já destravados. O poder tem a ver com o dono:
       a coroa de Tirania, o compasso do Thales (música), o dash do AstroDash...
       `dur` em ms; sem `dur` o efeito é instantâneo. */
    const COLECAO = [
        { id: "tirania", rotulo: "Tirania", at: 5, cor: "#ff5f6d", poder: { id: "coroa", nome: "Coroa", desc: "pontos ×2", dur: 10000 } },
        { id: "thales", rotulo: "Thales", at: 12, cor: "#5fe3a1", poder: { id: "compasso", nome: "Compasso", desc: "câmera lenta", dur: 8000 } },
        { id: "astrodash", rotulo: "AstroDash", at: 20, cor: "#ff6ad5", poder: { id: "turbo", nome: "Turbo", desc: "rápido, pontos ×3", dur: 6000 } },
        { id: "christian", rotulo: "Christian", at: 30, cor: "#a78bfa", poder: { id: "borracha", nome: "Borracha", desc: "encolhe o rabo" } },
        { id: "tower", rotulo: "Tower Defence", at: 42, cor: "#ff8a3d", poder: { id: "escudo", nome: "Escudo", desc: "aguenta 1 batida", dur: 20000 } },
        { id: "giovane", rotulo: "Giovane", at: 56, cor: "#b6e35a", poder: { id: "ima", nome: "Ímã", desc: "puxa os bits", dur: 10000 } },
        { id: "sitis", rotulo: "Sitis", at: 72, cor: "#2dd4bf", poder: { id: "gota", nome: "Gota", desc: "combo não expira", dur: 10000 } },
        { id: "milan", rotulo: "Milan", at: 90, cor: "#f9a8d4", poder: { id: "upgrade", nome: "Upgrade", desc: "+100 pontos" } },
        { id: "noir", rotulo: "Projeto noir", at: 110, cor: "#dfe7ef", poder: { id: "sombra", nome: "Sombra", desc: "atravessa o rabo", dur: 6000 } },
    ];
    const PU_VIDA = 10000; // quanto tempo o cubo fica no tabuleiro antes de sumir
    const PU_A_CADA = 4; //   um power-up a cada tantos bits

    const cuboSVG = (cor, aceso) => {
        const c = aceso ? cor : "#34495d";
        return (
            `<svg viewBox="0 0 40 46" aria-hidden="true">` +
            `<path d="M20 3 37 12.5 20 22 3 12.5Z" fill="${c}"/>` +
            `<path d="M3 12.5 20 22v21L3 33.5Z" fill="${c}"/><path d="M3 12.5 20 22v21L3 33.5Z" fill="#000" opacity=".16"/>` +
            `<path d="M37 12.5 20 22v21l17-9.5Z" fill="${c}"/><path d="M37 12.5 20 22v21l17-9.5Z" fill="#000" opacity=".36"/>` +
            `<path d="M20 3 37 12.5v21L20 43 3 33.5v-21Z M3 12.5 20 22 37 12.5 M20 22v21" fill="none" stroke="#0f2539" stroke-width="2.4" stroke-linejoin="round"/>` +
            `</svg>`
        );
    };

    /* ================================================================ SOM
       Tudo sintetizado: osciladores e ruído filtrado. Nada de arquivo de
       áudio — o jogo continua sem nenhum asset novo e o som sai instantâneo.
       O contexto vem do clique que abriu o jogo (main.js o cria dentro do
       gesto, o que o Safari exige) e é reaproveitado entre as partidas. */
    const som = (() => {
        let ctx = null, master = null, ruido = null;
        let mudo = false;
        const MESTRE = 0.9; // volume geral
        const GANHO = 2.4; // os `vol` abaixo são relativos entre si; isto os leva ao nível audível
        try { mudo = localStorage.getItem("sb-game-mudo") === "1"; } catch (e) { /* ok */ }

        const garantir = () => {
            if (!ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                try { ctx = new AC(); } catch (e) { return null; }
            }
            if (!master) {
                master = ctx.createGain();
                master.gain.value = mudo ? 0 : MESTRE;
                // limitador suave: segura picos de sons empilhados (combo + tremor)
                // sem achatar cada efeito
                const comp = ctx.createDynamicsCompressor();
                comp.threshold.value = -9;
                comp.knee.value = 10;
                comp.ratio.value = 4;
                comp.attack.value = 0.003;
                comp.release.value = 0.15;
                master.connect(comp);
                comp.connect(ctx.destination);
                const n = ctx.sampleRate * 0.6;
                ruido = ctx.createBuffer(1, n, ctx.sampleRate);
                const d = ruido.getChannelData(0);
                for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
            }
            if (ctx.state === "suspended") ctx.resume().catch(() => {});
            return ctx;
        };

        const tom = (f0, f1, dur, o = {}) => {
            if (!garantir() || mudo) return;
            const t0 = ctx.currentTime + (o.atraso || 0);
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = o.tipo || "square";
            osc.frequency.setValueAtTime(f0, t0);
            if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
            const vol = (o.vol == null ? 0.2 : o.vol) * GANHO;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(vol, t0 + (o.ataque || 0.006));
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            let saida = osc;
            if (o.lp) {
                const f = ctx.createBiquadFilter();
                f.type = "lowpass";
                f.frequency.value = o.lp;
                osc.connect(f);
                saida = f;
            }
            saida.connect(g);
            g.connect(master);
            osc.start(t0);
            osc.stop(t0 + dur + 0.05);
        };

        const sopro = (dur, o = {}) => {
            if (!garantir() || mudo) return;
            const t0 = ctx.currentTime + (o.atraso || 0);
            const src = ctx.createBufferSource();
            src.buffer = ruido;
            const f = ctx.createBiquadFilter();
            f.type = o.filtro || "lowpass";
            f.frequency.setValueAtTime(o.f0 || 1800, t0);
            f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1 || 300), t0 + dur);
            const g = ctx.createGain();
            g.gain.setValueAtTime((o.vol == null ? 0.3 : o.vol) * GANHO, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            src.connect(f);
            f.connect(g);
            g.connect(master);
            src.start(t0);
            src.stop(t0 + dur + 0.05);
        };

        // escala pentatônica maior: qualquer sequência de bits soa "bem"
        const PENTA = [0, 2, 4, 7, 9];
        const nota = (n) => 392 * Math.pow(2, (PENTA[n % 5] + 12 * Math.floor(n / 5)) / 12);

        return {
            adotar(c) { if (c && !ctx) ctx = c; },
            destravar: garantir,
            get mudo() { return mudo; },
            alternarMudo() {
                mudo = !mudo;
                try { localStorage.setItem("sb-game-mudo", mudo ? "1" : "0"); } catch (e) { /* ok */ }
                if (master) master.gain.setTargetAtTime(mudo ? 0 : MESTRE, ctx.currentTime, 0.02);
                if (!mudo) this.ui();
                return mudo;
            },
            suspender() { if (ctx && ctx.state === "running") ctx.suspend().catch(() => {}); },
            // abertura: varredura que sobe, com cintilação no fim
            abrir() {
                tom(120, 640, 0.5, { tipo: "sawtooth", vol: 0.1, lp: 1400, ataque: 0.05 });
                sopro(0.45, { filtro: "bandpass", f0: 400, f1: 3200, vol: 0.12 });
                [0, 1, 2].forEach((i) => tom(nota(i + 4), nota(i + 4), 0.12, { tipo: "triangle", vol: 0.1, atraso: 0.38 + i * 0.07 }));
            },
            // chão se montando
            ladrilhos() {
                for (let i = 0; i < 7; i++) tom(180 + i * 38, 150 + i * 30, 0.05, { tipo: "triangle", vol: 0.06, atraso: i * 0.07 });
            },
            pouso() {
                tom(150, 48, 0.28, { tipo: "sine", vol: 0.34 });
                sopro(0.12, { f0: 1200, f1: 200, vol: 0.18 });
            },
            comecar() {
                tom(330, 660, 0.12, { tipo: "square", vol: 0.1, lp: 2400 });
                tom(660, 990, 0.14, { tipo: "square", vol: 0.1, lp: 2400, atraso: 0.09 });
            },
            ui() { tom(660, 880, 0.06, { tipo: "square", vol: 0.07, lp: 3000 }); },
            virar() { tom(300, 190, 0.045, { tipo: "triangle", vol: 0.08 }); },
            comer(combo) {
                const n = Math.min(combo - 1, 14);
                const f = nota(n);
                tom(f, f * 1.03, 0.13, { tipo: "triangle", vol: 0.3 });
                tom(f * 2, f * 2, 0.1, { tipo: "sine", vol: 0.13, atraso: 0.045 });
                tom(f * 3, f * 3, 0.07, { tipo: "sine", vol: 0.05, atraso: 0.09 });
            },
            surgir() { tom(700, 1500, 0.16, { tipo: "sine", vol: 0.1 }); },
            poder() {
                [0, 4, 7, 12, 16].forEach((st, i) =>
                    tom(440 * Math.pow(2, st / 12), 440 * Math.pow(2, st / 12), 0.14, { tipo: "square", vol: 0.1, lp: 3400, atraso: i * 0.045 })
                );
                tom(1760, 1760, 0.3, { tipo: "sine", vol: 0.1, atraso: 0.22 });
            },
            escudo() {
                tom(900, 300, 0.25, { tipo: "triangle", vol: 0.25 });
                tom(1800, 600, 0.18, { tipo: "sine", vol: 0.1 });
                sopro(0.15, { f0: 3000, f1: 500, vol: 0.18 });
            },
            fimEfeito() { tom(520, 300, 0.12, { tipo: "triangle", vol: 0.1 }); },
            desbloquear() {
                [0, 4, 7, 12].forEach((s, i) =>
                    tom(523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.22, { tipo: "triangle", vol: 0.2, atraso: i * 0.085 })
                );
                tom(1568, 1568, 0.4, { tipo: "sine", vol: 0.08, atraso: 0.34 });
            },
            pausar(entrando) {
                if (entrando) tom(520, 330, 0.12, { tipo: "triangle", vol: 0.14 });
                else tom(330, 520, 0.12, { tipo: "triangle", vol: 0.14 });
            },
            morrer() {
                tom(260, 38, 0.65, { tipo: "sawtooth", vol: 0.22, lp: 1100 });
                tom(120, 34, 0.5, { tipo: "square", vol: 0.16, lp: 600, atraso: 0.03 });
                sopro(0.4, { f0: 2400, f1: 160, vol: 0.32 });
            },
            fimDeJogo() {
                [392, 330, 262].forEach((f, i) => tom(f, f * 0.98, 0.3, { tipo: "triangle", vol: 0.14, atraso: 0.5 + i * 0.16 }));
            },
            recorde() {
                [523, 659, 784, 1047, 1319].forEach((f, i) => tom(f, f, 0.16, { tipo: "square", vol: 0.08, lp: 3200, atraso: 0.9 + i * 0.07 }));
            },
        };
    })();

    /* ===================================================== marcação (DOM)
       HUD, menus e avisos são HTML por cima do canvas: herdam as fontes do
       site, ganham foco/teclado/leitor de tela de graça e não custam nada
       no laço de desenho. */
    const ICO = {
        fechar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
        pausa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
        som: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        mudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    };

    const MODELO = `
        <div class="sbg-bg" aria-hidden="true"></div>
        <div class="sbg-stage" data-stage></div>
        <div class="sbg-flash" data-flash aria-hidden="true"></div>

        <header class="sbg-hud" data-hud>
            <div class="sbg-stat">
                <span class="sbg-label">Pontos</span>
                <b data-score>0</b>
            </div>
            <div class="sbg-combo" data-combo hidden aria-hidden="true"><span data-combo-n>x2</span><i></i></div>
            <div class="sbg-stat sbg-stat--best">
                <span class="sbg-label">Recorde</span>
                <b data-best>0</b>
            </div>
            <div class="sbg-tools">
                <button type="button" class="sbg-tool" data-act="mudo" aria-pressed="false" aria-label="Som">${ICO.som}</button>
                <button type="button" class="sbg-tool" data-act="pausa" aria-label="Pausar">${ICO.pausa}</button>
                <button type="button" class="sbg-tool" data-act="sair" aria-label="Fechar o jogo">${ICO.fechar}</button>
            </div>
        </header>

        <div class="sbg-buffs" data-buffs aria-hidden="true"></div>

        <p class="sbg-hint" data-hint hidden>
            <span class="sbg-keys">Use as setas ou WASD</span><span class="sbg-touch">Deslize ou toque nos lados</span> para começar
        </p>
        <p class="sbg-toast" data-toast role="status" aria-live="polite"></p>

        <section class="sbg-panel" data-panel="pronto" hidden aria-labelledby="sbg-t1">
            <p class="sbg-kicker">Scorpion Bits · game lab</p>
            <h2 id="sbg-t1" class="sbg-title">Rabo de <em>Cubos</em></h2>
            <p class="sbg-lead">Coma os bits e deixe a cauda crescer. Parede e rabo são fatais.</p>
            <ul class="sbg-howto">
                <li class="sbg-keys"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> ou <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></li>
                <li class="sbg-touch">Deslize, ou toque na esquerda / direita da tela para virar</li>
                <li>Bits em sequência valem mais: mantenha o combo</li>
                <li>Comendo bits você destrava <b>power-ups</b>: cada cubo colorido vem de um projeto ou de alguém do time</li>
            </ul>
            <div class="sbg-actions">
                <button type="button" class="btn btn--solid btn--lg" data-act="jogar">Jogar</button>
            </div>
            <p class="sbg-foot sbg-keys">Esc para pausar ou sair</p>
        </section>

        <section class="sbg-panel sbg-panel--sm" data-panel="pausa" hidden aria-labelledby="sbg-t2">
            <h2 id="sbg-t2" class="sbg-title sbg-title--sm">Pausado</h2>
            <div class="sbg-actions">
                <button type="button" class="btn btn--solid" data-act="continuar">Continuar</button>
                <button type="button" class="btn btn--wire" data-act="sair">Sair do jogo</button>
            </div>
        </section>

        <section class="sbg-panel" data-panel="fim" hidden aria-labelledby="sbg-t3">
            <p class="sbg-kicker" data-fim-kicker>Fim de jogo</p>
            <h2 id="sbg-t3" class="sbg-title sbg-title--sm"><span data-fim-pontos>0</span> <small>pontos</small></h2>
            <p class="sbg-lead" data-fim-info></p>
            <p class="sbg-colecao-h">Power-ups do estúdio <span data-colecao-n></span></p>
            <ul class="sbg-colecao" data-colecao></ul>
            <div class="sbg-actions">
                <button type="button" class="btn btn--solid btn--lg" data-act="again">Jogar de novo</button>
                <button type="button" class="btn btn--wire btn--lg" data-act="sair">Sair</button>
            </div>
            <p class="sbg-foot sbg-foot--links">
                <a href="#equipe" data-ir>Conhecer o time</a><span aria-hidden="true">·</span><a href="#contato" data-ir>Falar com a gente</a>
            </p>
        </section>
    `;

    /* ================================================================ ABRIR
       opts.origin    {x, y} em px da janela: de onde a tela se abre (o centro
                      do escorpião). Padrão: centro da janela.
       opts.getOrigin função que devolve a origem na hora de fechar (a página
                      pode ter rolado).
       opts.lite      true em máquina fraca: sem partículas, tremor e brilhos,
                      resolução 1x.
       opts.audioCtx  AudioContext criado dentro do clique (exigência do Safari).
       opts.onClose   chamado quando tudo foi desmontado.

       Devolve uma promessa que resolve quando a animação de abertura acaba e
       o jogo está pronto para jogar; rejeita se o WebGL não subir. */
    let ativo = null;

    function abrir(opts = {}) {
        if (ativo) return ativo.pronto;
        som.adotar(opts.audioCtx);

        const lite = !!opts.lite;
        const reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dados = lerDados();
        dados.plays += 1;
        gravarDados(dados);

        /* ------------------------------------------------ casca (DOM) -- */
        const el = document.createElement("div");
        el.className = "sbg" + (lite ? " sbg--lite" : "");
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-modal", "true");
        el.setAttribute("aria-label", "Rabo de Cubos, o jogo da Scorpion Bits");
        el.tabIndex = -1;
        el.innerHTML = MODELO;
        document.body.appendChild(el);

        const $ = (s) => el.querySelector(s);
        const palco = $("[data-stage]");
        const hud = $("[data-hud]");
        const elPontos = $("[data-score]");
        const elRecorde = $("[data-best]");
        const elCombo = $("[data-combo]");
        const elComboN = $("[data-combo-n]");
        const elDica = $("[data-hint]");
        const elAviso = $("[data-toast]");
        const elFlash = $("[data-flash]");
        const elBuffs = $("[data-buffs]");
        const painel = {
            pronto: $('[data-panel="pronto"]'),
            pausa: $('[data-panel="pausa"]'),
            fim: $('[data-panel="fim"]'),
        };
        const btnMudo = $('[data-act="mudo"]');

        // o resto da página sai do foco e da árvore de acessibilidade
        const inertes = [];
        [...document.body.children].forEach((n) => {
            if (n === el || n.tagName === "SCRIPT" || n.hasAttribute("inert")) return;
            n.setAttribute("inert", "");
            inertes.push(n);
        });

        const origem = opts.origin || { x: innerWidth / 2, y: innerHeight / 2 };
        const raioMax = (o) =>
            Math.hypot(Math.max(o.x, innerWidth - o.x), Math.max(o.y, innerHeight - o.y)) + 40;
        const circulo = (r, o) => `circle(${r}px at ${o.x}px ${o.y}px)`;

        /* Abertura: um círculo cresce a partir do escorpião, com um anel de
           luz na borda. O anel fica fora do overlay (que é recortado pelo
           próprio círculo) e usa a mesma curva, então acompanha a borda. */
        const R0 = raioMax(origem);
        const anel = document.createElement("div");
        anel.className = "sbg-ring";
        anel.style.cssText = `left:${origem.x - R0}px;top:${origem.y - R0}px;width:${R0 * 2}px;height:${R0 * 2}px`;
        document.body.appendChild(anel);

        const CURVA = "cubic-bezier(.65,0,.35,1)";
        const DUR_ABRIR = lite ? 420 : 760;
        const revelar = el.animate(
            [{ clipPath: circulo(0, origem) }, { clipPath: circulo(R0, origem) }],
            { duration: DUR_ABRIR, easing: CURVA, fill: "both" }
        );
        const animAnel = anel.animate(
            [
                { transform: "scale(0.001)", opacity: 1 },
                { transform: "scale(1)", opacity: 0.9, offset: 0.85 },
                { transform: "scale(1.02)", opacity: 0 },
            ],
            { duration: DUR_ABRIR + 120, easing: CURVA, fill: "both" }
        );
        animAnel.finished.then(() => anel.remove(), () => anel.remove());
        som.abrir();

        /* ------------------------------------------------ estado geral -- */
        let app = null;
        let estado = "carregando"; // carregando|intro|pronto|jogando|pausado|morrendo|fim|fechando
        let vivo = true;
        let tempo = 0; // ms desde que o Pixi subiu
        const limpezas = []; // funções que desfazem tudo no fechar

        const ouvir = (alvo, tipo, fn, o) => {
            alvo.addEventListener(tipo, fn, o);
            limpezas.push(() => alvo.removeEventListener(tipo, fn, o));
        };

        const mostrar = (nome) => {
            Object.keys(painel).forEach((k) => { painel[k].hidden = k !== nome; });
        };
        let aviso = 0;
        const avisar = (txt, ms = 2600) => {
            elAviso.textContent = txt;
            elAviso.classList.add("is-on");
            clearTimeout(aviso);
            aviso = setTimeout(() => elAviso.classList.remove("is-on"), ms);
        };
        const flash = () => {
            elFlash.classList.remove("is-on");
            void elFlash.offsetWidth;
            elFlash.classList.add("is-on");
        };
        const foco = (alvo) => (alvo || el).focus({ preventScroll: true });

        elRecorde.textContent = dados.best;
        const pintarMudo = () => {
            btnMudo.innerHTML = som.mudo ? ICO.mudo : ICO.som;
            btnMudo.setAttribute("aria-pressed", String(som.mudo));
            btnMudo.setAttribute("aria-label", som.mudo ? "Ligar o som" : "Desligar o som");
        };
        pintarMudo();

        /* ================================================= o JOGO (Pixi) */
        const iniciar = async () => {
            const resolucao = lite ? 1 : Math.min(window.devicePixelRatio || 1, 2);
            app = new Application();
            await app.init({
                resizeTo: palco,
                backgroundAlpha: 0,
                // tudo no jogo é textura pré-suavizada (2x): o MSAA do renderer
                // só encareceria o quadro, sobretudo no celular
                antialias: false,
                // a entrada é toda do DOM (teclado e ponteiro no palco): o
                // sistema de eventos do Pixi só ia brigar por ponteiros
                eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
                autoDensity: true,
                resolution: resolucao,
                preference: "webgl",
            });
            if (!vivo) throw new Error("fechado");
            palco.appendChild(app.canvas);
            try { await document.fonts.load('800 30px "Grotesk"'); } catch (e) { /* cai na fonte do sistema */ }
            if (!vivo) throw new Error("fechado");
            return montar();
        };

        const montar = () => {
            const N = innerWidth / innerHeight < 0.85 ? 9 : 12; // retrato: tabuleiro menor
            const meio = (N - 1) / 2;
            const proj = (gx, gy) => ({ x: ((gx - gy) * TW) / 2, y: ((gx + gy - (N - 1)) * TH) / 2 });
            const R = app.renderer;

            /* -------------------------------------------- texturas -- */
            const gerar = (g, frame) => {
                const tex = R.generateTexture({ target: g, frame, resolution: 2, antialias: true });
                g.destroy();
                return { tex, ax: -frame.x / frame.width, ay: -frame.y / frame.height };
            };

            /* Mapeia um ponto (u,v) de 0 a 1 de uma face do cubo para o
               plano da tela, para a carinha ficar "colada" na face em vez de
               um adesivo reto por cima. */
            const noFace = (o, U, V) => (u, v) => [o[0] + U[0] * u + V[0] * v, o[1] + U[1] * u + V[1] * v];

            const carinha = (g, mapa, lw) => {
                const traco = (pts, larg, cor, a) => {
                    pts.forEach((p, i) => {
                        const [x, y] = mapa(p[0], p[1]);
                        if (i) g.lineTo(x, y); else g.moveTo(x, y);
                    });
                    g.stroke({ width: larg, color: cor, alpha: a, cap: "round", join: "round" });
                };
                const olho1 = [[0.13, 0.3], [0.31, 0.46], [0.13, 0.62]]; // >
                const olho2 = [[0.87, 0.3], [0.69, 0.46], [0.87, 0.62]]; // <
                const boca = [[0.4, 0.72], [0.6, 0.72]]; //                  _
                [olho1, olho2, boca].forEach((p) => traco(p, lw * 3.2, "#6ad8fe", 0.22)); // brilho
                [olho1, olho2, boca].forEach((p) => traco(p, lw * 1.25, "#aef0ff", 1)); //   miolo
            };

            const desenharCubo = (g, o) => {
                const lw = o.lw == null ? 3 : o.lw;
                const w = (TW * o.k) / 2, d = (TH * o.k) / 2, h = o.h;
                const T = [0, -d - h, w, -h, 0, d - h, -w, -h];
                const L = [-w, -h, 0, d - h, 0, d, -w, 0];
                const Rr = [0, d - h, w, -h, w, 0, 0, d];
                const tr = { width: lw, color: o.linha || LINHA, join: "round" };

                const dentroL = o.rosto === "L", dentroR = o.rosto === "R";
                g.poly(L).fill(dentroL ? "#1a3957" : o.left).stroke(tr);
                g.poly(Rr).fill(dentroR ? "#1a3957" : o.right).stroke(tr);
                g.poly(T).fill(o.top).stroke(tr);

                if (o.brilho !== false) {
                    // o brilho em arco da logo, bem simplificado
                    g.poly([-w * 0.62, -h - d * 0.2, 0, -d - h + lw * 1.1, w * 0.62, -h - d * 0.2, 0, -h - d * 0.52]).fill({ color: 0xffffff, alpha: 0.24 });
                    if (!dentroL) g.poly([-w + lw * 1.3, -h + lw * 1.4, -w + lw * 3.4, -h + lw * 2.2, -w + lw * 3.4, -lw * 2.4, -w + lw * 1.3, -lw * 1.6]).fill({ color: 0xffffff, alpha: 0.2 });
                }
                if (dentroR) carinha(g, noFace([0, d - h], [w, -d], [0, h]), lw);
                if (dentroL) carinha(g, noFace([-w, -h], [w, d], [0, h]), lw);

                const pad = lw + 3;
                return new Rectangle(-w - pad, -d - h - pad, 2 * (w + pad), 2 * d + h + 2 * pad);
            };

            const cubo = (o) => {
                const g = new Graphics();
                const frame = desenharCubo(g, o);
                return gerar(g, frame);
            };

            const T = {
                cabeca: {
                    R: cubo({ k: 0.9, h: CH * 1.04, top: "#8fd8ff", left: "#5fd0ff", right: "#2f8ccc", rosto: "R" }),
                    L: cubo({ k: 0.9, h: CH * 1.04, top: "#8fd8ff", left: "#5fd0ff", right: "#2f8ccc", rosto: "L" }),
                },
                cauda: Array.from({ length: PASSOS_RAMPA }, (_, i) => cubo({ k: K, h: CH, ...rampa(i / (PASSOS_RAMPA - 1)) })),
                bit: cubo({ k: 0.5, h: CH * 0.5, top: "#ffe3ad", left: "#ffc46b", right: "#e0963a", lw: 2.4 }),
                parede: cubo({ k: 0.99, h: CH * 0.55, top: "#243a5c", left: "#192b47", right: "#10203a", linha: "#355b82", lw: 2.2, brilho: false }),
                miniAmbar: cubo({ k: 0.24, h: CH * 0.24, top: "#ffe3ad", left: "#ffc46b", right: "#e0963a", lw: 1.4, brilho: false }),
                miniCiano: cubo({ k: 0.24, h: CH * 0.24, top: "#9bdcff", left: "#5fd0ff", right: "#2f8ccc", lw: 1.4, brilho: false }),
            };

            // um cubo por power-up, na cor do projeto/integrante, maiorzinho que o bit
            T.poderes = {};
            COLECAO.forEach((c) => {
                T.poderes[c.id] = cubo({
                    k: 0.64, h: CH * 0.64, lw: 2.6,
                    top: mixCor(c.cor, "#ffffff", 0.5), left: c.cor, right: mixCor(c.cor, "#000000", 0.38),
                });
            });

            const ladrilho = (cor, lado) => {
                const g = new Graphics();
                const w = TW / 2 - 1.4, d = TH / 2 - 0.8, p = 9;
                g.poly([-w, 0, 0, d, 0, d + p, -w, p]).fill("#0a1522");
                g.poly([0, d, w, 0, w, p, 0, d + p]).fill("#070f19");
                g.poly([0, -d, w, 0, 0, d, -w, 0]).fill(cor).stroke({ width: 1.2, color: "#1f4a6b", alpha: 0.85, join: "round" });
                g.poly([0, -d + 3, w - 5, 0, 0, d - 3, -w + 5, 0]).fill({ color: lado, alpha: 0.07 });
                return gerar(g, new Rectangle(-w - 3, -d - 3, 2 * w + 6, 2 * d + p + 6));
            };
            T.chaoA = ladrilho("#0e1d2e", 0xffffff);
            T.chaoB = ladrilho("#11243a", 0xffffff);

            // sombra e brilho: gradientes radiais num canvas 2D, viram textura
            const radial = (tam, paradas) => {
                const c = document.createElement("canvas");
                c.width = c.height = tam;
                const x = c.getContext("2d");
                const gr = x.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
                paradas.forEach(([o, cor]) => gr.addColorStop(o, cor));
                x.fillStyle = gr;
                x.fillRect(0, 0, tam, tam);
                return Texture.from(c);
            };
            T.sombra = radial(64, [[0, "rgba(0,0,0,.62)"], [0.55, "rgba(0,0,0,.28)"], [1, "rgba(0,0,0,0)"]]);
            // brilho e anel são brancos e ganham a cor de quem os usa (bit âmbar, power-up da cor dele)
            T.brilho = radial(128, [[0, "rgba(255,255,255,.85)"], [0.35, "rgba(255,255,255,.26)"], [1, "rgba(255,255,255,0)"]]);
            T.aura = radial(128, [[0, "rgba(255,255,255,.6)"], [0.4, "rgba(255,255,255,.18)"], [1, "rgba(255,255,255,0)"]]);

            // anel que pulsa no chão embaixo do bit
            {
                const g = new Graphics();
                const w = TW * 0.5, d = TH * 0.5;
                g.poly([0, -d, w, 0, 0, d, -w, 0]).stroke({ width: 2.2, color: "#ffffff", join: "round" });
                T.anel = gerar(g, new Rectangle(-w - 4, -d - 4, 2 * w + 8, 2 * d + 8));
            }

            // cubo de arame, como os que orbitam o escorpião no site
            {
                const g = new Graphics();
                const w = 9 * 0.866, h = 9;
                g.poly([0, -h, w, -h / 2, w, h / 2, 0, h, -w, h / 2, -w, -h / 2]).stroke({ width: 1.1, color: "#6ad8fe", join: "round" });
                g.moveTo(0, 0).lineTo(0, -h).moveTo(0, 0).lineTo(-w, h / 2).moveTo(0, 0).lineTo(w, h / 2).stroke({ width: 1.1, color: "#6ad8fe", join: "round" });
                T.arame = gerar(g, new Rectangle(-w - 2, -h - 2, 2 * w + 4, 2 * h + 4));
            }

            const spr = (t, pai) => {
                const s = new Sprite(t.tex);
                s.anchor.set(t.ax, t.ay);
                if (pai) pai.addChild(s);
                return s;
            };

            /* --------------------------------------------- camadas -- */
            const fundo = new Container(); // cubos de arame à deriva (espaço da tela)
            const mundo = new Container();
            const chao = new Container();
            const sombras = new Container();
            const entidades = new Container();
            const fx = new Container();
            entidades.sortableChildren = true;
            mundo.addChild(chao, sombras, entidades, fx);
            app.stage.addChild(fundo, mundo);

            // aura que acompanha a cabeça enquanto há um efeito ativo, na cor do mais recente
            const aura = new Sprite(T.aura);
            aura.anchor.set(0.5);
            aura.blendMode = "add";
            aura.visible = false;
            if (!lite) fx.addChild(aura);

            const centro = (T0, x, y) => {
                const s = spr(T0);
                s.position.set(x, y);
                return s;
            };

            // chão
            const tiles = [];
            for (let s = 0; s <= 2 * (N - 1); s++) {
                for (let gx = 0; gx < N; gx++) {
                    const gy = s - gx;
                    if (gy < 0 || gy >= N) continue;
                    const p = proj(gx, gy);
                    const sp = centro((gx + gy) % 2 ? T.chaoB : T.chaoA, p.x, p.y);
                    chao.addChild(sp);
                    tiles.push({ sp, y: p.y, atraso: Math.hypot(gx - meio, gy - meio) * 46 });
                }
            }

            // moldura: parede baixa em volta, para a borda ser legível
            const paredes = [];
            for (let gx = -1; gx <= N; gx++) {
                for (let gy = -1; gy <= N; gy++) {
                    if (gx >= 0 && gx < N && gy >= 0 && gy < N) continue;
                    const p = proj(gx, gy);
                    const sp = centro(T.parede, p.x, p.y);
                    sp.zIndex = gx + gy - 0.2;
                    entidades.addChild(sp);
                    paredes.push({ sp, y: p.y, atraso: 380 + Math.hypot(gx - meio, gy - meio) * 30 });
                }
            }

            // cubos de arame ao fundo
            const motes = [];
            if (!lite) {
                for (let i = 0; i < 16; i++) {
                    const s = spr(T.arame, fundo);
                    const m = { s, x: Math.random(), y: Math.random(), v: rnd(0.008, 0.026), ph: Math.random() * 6.28, esc: rnd(0.8, 1.9) };
                    s.scale.set(m.esc);
                    motes.push(m);
                }
            }

            /* ----------------------------------------------- cobra -- */
            let dirIdx = 1;
            let fila = [];
            let cobra = [];
            let acum = 0;
            let passoMs = 172;
            let bit = null;
            let pontos = 0;
            let bitsRun = 0;
            let combo = 0;
            let comboMs = 0;
            let pulsoComer = 0;
            let tremor = 0;
            let zoom = 0;
            let morte = null;
            let novosRun = [];
            let pu = null; //     o power-up que está no tabuleiro (no máximo um)
            const buffs = {}; //  efeitos ativos: id -> { ms, dur, c }
            const chips = {};
            let baseEsc = 1, baseX = 0, baseY = 0;
            const COMBO_JANELA = 3000;

            const texCauda = (i) => T.cauda[Math.min(PASSOS_RAMPA - 1, Math.floor(((i - 1) / 22) * PASSOS_RAMPA))];
            const faceDe = (idx) => (idx <= 1 ? "R" : "L");

            const novoSeg = (gx, gy, i, nasc) => {
                const t = i === 0 ? T.cabeca[faceDe(dirIdx)] : texCauda(i);
                const s = spr(t, entidades);
                const sh = new Sprite(T.sombra);
                sh.anchor.set(0.5);
                sh.alpha = 0;
                sombras.addChild(sh);
                return { gx, gy, pgx: gx, pgy: gy, s, sh, nasc: nasc == null ? -1e9 : nasc, i };
            };

            const zerarCobra = () => {
                cobra.forEach((c) => { c.s.destroy(); c.sh.destroy(); });
                cobra = [];
            };

            const posInicial = () => ({ x: Math.floor(N * 0.33) + 1, y: Math.floor((N - 1) / 2) });

            const spawnBit = () => {
                const livres = [];
                for (let gx = 0; gx < N; gx++) {
                    for (let gy = 0; gy < N; gy++) {
                        if (cobra.some((c) => c.gx === gx && c.gy === gy)) continue;
                        if (pu && pu.gx === gx && pu.gy === gy) continue;
                        livres.push([gx, gy]);
                    }
                }
                if (!livres.length) { bit = null; return; }
                const [gx, gy] = livres[Math.floor(Math.random() * livres.length)];
                if (!bit) {
                    bit = {
                        gx, gy, dx: gx, dy: gy, nasc: tempo,
                        s: spr(T.bit, entidades),
                        brilho: new Sprite(T.brilho),
                        anel: spr(T.anel, sombras),
                    };
                    bit.brilho.anchor.set(0.5);
                    bit.brilho.blendMode = "add";
                    bit.brilho.tint = 0xffc46b;
                    bit.anel.tint = 0xffc46b;
                    if (lite) bit.brilho.visible = false;
                    fx.addChild(bit.brilho);
                } else {
                    bit.gx = gx; bit.gy = gy; bit.dx = gx; bit.dy = gy; bit.nasc = tempo;
                }
            };

            /* ----------------------------------------- power-ups --- */
            const recalcPasso = () => {
                const novo = Math.max(86, 172 - bitsRun * 2.4) * (buffs.compasso ? 1.6 : 1) * (buffs.turbo ? 0.62 : 1);
                if (passoMs) acum *= novo / passoMs; // sem salto visual no meio de um passo
                passoMs = novo;
            };

            const chipLigar = (c) => {
                let e = chips[c.poder.id];
                if (!e) {
                    e = document.createElement("div");
                    e.className = "sbg-buff";
                    e.style.setProperty("--c", c.cor);
                    e.innerHTML = `<i></i><span>${c.poder.nome}</span><b></b>`;
                    elBuffs.appendChild(e);
                    chips[c.poder.id] = e;
                }
                e.style.setProperty("--p", "1");
            };
            const chipDesligar = (id) => {
                if (chips[id]) { chips[id].remove(); delete chips[id]; }
            };
            const limparEfeitos = () => {
                Object.keys(buffs).forEach((id) => { delete buffs[id]; chipDesligar(id); });
            };

            const removerPu = () => {
                if (!pu) return;
                pu.s.destroy(); pu.anel.destroy(); pu.brilho.destroy();
                if (pu.feixe) pu.feixe.destroy();
                pu = null;
            };

            const spawnPu = (escolhido) => {
                if (pu) return;
                const pool = COLECAO.filter((c) => dados.unlocked.includes(c.id));
                if (!pool.length) return;
                const c = escolhido || pool[Math.floor(Math.random() * pool.length)];
                const livres = [];
                for (let gx = 0; gx < N; gx++) {
                    for (let gy = 0; gy < N; gy++) {
                        if (cobra.some((s) => s.gx === gx && s.gy === gy)) continue;
                        if (bit && bit.gx === gx && bit.gy === gy) continue;
                        livres.push([gx, gy]);
                    }
                }
                if (!livres.length) return;
                const [gx, gy] = livres[Math.floor(Math.random() * livres.length)];
                pu = {
                    c, gx, gy, nasc: tempo, vida: PU_VIDA,
                    s: spr(T.poderes[c.id], entidades),
                    anel: spr(T.anel, sombras),
                    brilho: new Sprite(T.brilho),
                };
                pu.brilho.anchor.set(0.5);
                pu.brilho.blendMode = "add";
                pu.brilho.tint = hex(c.cor);
                pu.anel.tint = hex(c.cor);
                if (lite) pu.brilho.visible = false;
                fx.addChild(pu.brilho);
                if (!lite) {
                    // coluna de luz: de longe já se vê que não é um bit comum
                    pu.feixe = new Sprite(T.aura);
                    pu.feixe.anchor.set(0.5, 1);
                    pu.feixe.blendMode = "add";
                    pu.feixe.tint = hex(c.cor);
                    fx.addChild(pu.feixe);
                }
                som.surgir();
            };

            const pegarPu = () => {
                const c = pu.c, pd = c.poder;
                const p = proj(pu.gx, pu.gy);
                estourar(p.x, p.y - CH * 0.5, 14, T.miniCiano, 1.3);
                flutuar(pd.nome, p.x, p.y - CH * 1.8, c.cor);
                removerPu();
                som.poder();
                abalar(5);
                zoom = Math.max(zoom, 0.035);
                avisar(`${pd.nome}: ${pd.desc}`, 2400);

                if (pd.id === "borracha") {
                    // tira até 4 cubos da ponta, mas nunca deixa menos que a cabeça + 2
                    const tirar = Math.min(4, cobra.length - 3);
                    for (let i = 0; i < tirar; i++) {
                        const sg = cobra.pop();
                        const q = proj(sg.gx, sg.gy);
                        estourar(q.x, q.y - CH * 0.4, 5, T.miniCiano, 1);
                        sg.s.destroy(); sg.sh.destroy();
                    }
                } else if (pd.id === "upgrade") {
                    setPontos(pontos + 100);
                    flutuar("+100", p.x, p.y - CH * 2.6, "#ffe3ad");
                } else {
                    buffs[pd.id] = { ms: pd.dur, dur: pd.dur, c };
                    chipLigar(c);
                }
                recalcPasso();
            };

            const resetar = () => {
                zerarCobra();
                const p = posInicial();
                dirIdx = 1;
                fila = [];
                for (let i = 0; i < 3; i++) cobra.push(novoSeg(p.x - i, p.y, i));
                acum = 0;
                passoMs = 172;
                pontos = 0;
                bitsRun = 0;
                combo = 0;
                comboMs = 0;
                morte = null;
                novosRun = [];
                pulsoComer = 0;
                elPontos.textContent = "0";
                elCombo.hidden = true;
                removerPu();
                limparEfeitos();
                if (bit) { bit.nasc = tempo; }
                spawnBit();
            };

            /* ---------------------------------- partículas e textos -- */
            const parts = [];
            const flutuantes = [];
            const MAX_PARTS = lite ? 30 : 140;

            const jogarCubo = (t, x, y, vx, vy, vida, g, escala, gira) => {
                if (parts.length >= MAX_PARTS) {
                    const velha = parts.shift();
                    velha.s.destroy();
                }
                const s = spr(t, fx);
                s.position.set(x, y);
                s.scale.set(escala || 1);
                parts.push({ s, vx, vy, vida, t: 0, g, gira: gira || 0 });
            };

            const estourar = (x, y, qtd, tex, forca) => {
                const n = lite ? Math.ceil(qtd / 2) : qtd;
                for (let i = 0; i < n; i++) {
                    const a = rnd(0, Math.PI * 2);
                    const v = rnd(0.08, 0.3) * (forca || 1);
                    jogarCubo(tex, x, y, Math.cos(a) * v, Math.sin(a) * v * 0.6 - rnd(0.1, 0.3), rnd(420, 760), 0.0007, rnd(0.8, 1.4), rnd(-0.01, 0.01));
                }
            };

            const flutuar = (txt, x, y, cor) => {
                const t = new Text({
                    text: txt,
                    style: {
                        fontFamily: 'Grotesk, "Segoe UI", system-ui, sans-serif',
                        fontSize: 30,
                        fontWeight: "800",
                        fill: cor || "#ffe3ad",
                        stroke: { color: "#0f2539", width: 7, join: "round" },
                    },
                });
                t.anchor.set(0.5);
                t.position.set(x, y);
                t.scale.set(0.2);
                fx.addChild(t);
                flutuantes.push({ t, y0: y, tt: 0 });
            };

            const abalar = (px) => { if (!lite && !reduzMovimento) tremor = Math.max(tremor, px); };

            /* ------------------------------------------- placar/HUD -- */
            const setPontos = (v) => {
                pontos = v;
                elPontos.textContent = v;
                elPontos.classList.remove("is-bump");
                void elPontos.offsetWidth;
                elPontos.classList.add("is-bump");
            };

            const pintarCombo = () => {
                if (combo < 2) { elCombo.hidden = true; return; }
                elCombo.hidden = false;
                elComboN.textContent = "x" + Math.min(combo, 6);
                elCombo.setAttribute("aria-hidden", "false");
            };

            const checarDesbloqueios = () => {
                COLECAO.forEach((c) => {
                    if (dados.bits >= c.at && !dados.unlocked.includes(c.id)) {
                        dados.unlocked.push(c.id);
                        novosRun.push(c.id);
                        som.desbloquear();
                        avisar(`Power-up desbloqueado: ${c.poder.nome} (${c.rotulo})`, 3400);
                        const p = proj(cobra[0].gx, cobra[0].gy);
                        flutuar(c.rotulo, p.x, p.y - 130, c.cor);
                        spawnPu(c); // já aparece no tabuleiro para estrear
                    }
                });
            };

            /* --------------------------------------------- jogo --- */
            const comerBit = () => {
                combo = comboMs > 0 ? combo + 1 : 1;
                comboMs = COMBO_JANELA;
                const mult = Math.min(combo, 6);
                const ganho = 10 * mult * (buffs.coroa ? 2 : 1) * (buffs.turbo ? 3 : 1);
                bitsRun += 1;
                dados.bits += 1;
                recalcPasso();
                setPontos(pontos + ganho);
                pintarCombo();
                som.comer(combo);
                pulsoComer = 1;
                zoom = Math.max(zoom, 0.025);
                const p = proj(bit.gx, bit.gy);
                estourar(p.x, p.y - CH * 0.4, 9, combo > 2 ? T.miniCiano : T.miniAmbar, 1);
                flutuar("+" + ganho, p.x, p.y - CH * 1.6, mult > 3 ? "#9bdcff" : "#ffe3ad");
                spawnBit();
                if (bitsRun % PU_A_CADA === 0) spawnPu();
                checarDesbloqueios();
                gravarDados(dados);
            };

            const crescer = (gx, gy) => {
                const sg = novoSeg(gx, gy, cobra.length, tempo);
                cobra.push(sg);
            };

            const morrer = (tipo, nx, ny) => {
                estado = "morrendo";
                cobra.forEach((c) => { c.pgx = c.gx; c.pgy = c.gy; });
                morte = { t: 0, tipo, d: DIRS[dirIdx], estourou: false };
                som.morrer();
                abalar(15);
                flash();
                elCombo.hidden = true;
                combo = 0;
                comboMs = 0;
                removerPu();
                limparEfeitos();
                gravarDados(dados);
            };

            const fimDeJogo = () => {
                estado = "fim";
                const recorde = pontos > 0 && pontos > dados.best;
                dados.best = Math.max(dados.best, pontos);
                gravarDados(dados);
                $("[data-fim-pontos]").textContent = pontos;
                $("[data-fim-kicker]").textContent = recorde ? "Novo recorde!" : "Fim de jogo";
                $("[data-fim-info]").textContent =
                    `${bitsRun} ${bitsRun === 1 ? "bit" : "bits"} nesta partida · recorde ${dados.best}`;
                elRecorde.textContent = dados.best;

                const tot = COLECAO.length;
                const n = dados.unlocked.length;
                $("[data-colecao-n]").textContent = `${n}/${tot}`;
                $("[data-colecao]").innerHTML = COLECAO.map((c) => {
                    const on = dados.unlocked.includes(c.id);
                    const novo = novosRun.includes(c.id);
                    const falta = Math.max(0, c.at - dados.bits);
                    return on
                        ? `<li class="sbg-slot is-on${novo ? " is-new" : ""}">${cuboSVG(c.cor, true)}<b>${c.poder.nome}</b><small>${c.poder.desc}</small><em>${c.rotulo}</em></li>`
                        : `<li class="sbg-slot">${cuboSVG(c.cor, false)}<b>???</b><small>faltam ${falta} ${falta === 1 ? "bit" : "bits"}</small></li>`;
                }).join("");
                if (n === tot) $("[data-fim-info]").textContent += " · todos os power-ups!";

                if (recorde) som.recorde();
                som.fimDeJogo();
                mostrar("fim");
                foco(painel.fim.querySelector('[data-act="again"]'));
            };

            const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
            const bateNoCorpo = (x, y, ate) => {
                for (let i = 0; i < ate; i++) if (cobra[i].gx === x && cobra[i].gy === y) return true;
                return false;
            };

            const passo = () => {
                if (fila.length) dirIdx = fila.shift();
                let d = DIRS[dirIdx];
                const cab = cobra[0];
                let nx = cab.gx + d.x, ny = cab.gy + d.y;
                let comer = bit && nx === bit.gx && ny === bit.gy;
                // a ponta da cauda sai do lugar quando a cobra não cresce, então pode ser pisada
                const limite = () => (comer ? cobra.length : cobra.length - 1);
                let batida = !dentro(nx, ny) ? "parede" : !buffs.sombra && bateNoCorpo(nx, ny, limite()) ? "corpo" : null;

                if (batida && buffs.escudo) {
                    // o escudo gasta a batida e desvia para o primeiro lado livre
                    for (const delta of [3, 1]) {
                        const di = (dirIdx + delta) % 4, dd = DIRS[di];
                        const tx = cab.gx + dd.x, ty = cab.gy + dd.y;
                        if (dentro(tx, ty) && (buffs.sombra || !bateNoCorpo(tx, ty, cobra.length - 1))) {
                            dirIdx = di; d = dd; nx = tx; ny = ty;
                            comer = bit && nx === bit.gx && ny === bit.gy;
                            batida = null;
                            break;
                        }
                    }
                    if (!batida) {
                        delete buffs.escudo;
                        chipDesligar("escudo");
                        som.escudo();
                        abalar(8);
                        flash();
                        avisar("Escudo salvou você!", 1800);
                        const q = proj(cab.gx, cab.gy);
                        estourar(q.x, q.y - CH * 0.5, 12, T.miniCiano, 1.2);
                    }
                }
                if (batida) return morrer(batida, nx, ny);

                const ponta = cobra[cobra.length - 1];
                const cx = ponta.gx, cy = ponta.gy;
                for (let i = cobra.length - 1; i > 0; i--) {
                    const sg = cobra[i], pr = cobra[i - 1];
                    sg.pgx = sg.gx; sg.pgy = sg.gy; sg.gx = pr.gx; sg.gy = pr.gy;
                }
                cab.pgx = cab.gx; cab.pgy = cab.gy; cab.gx = nx; cab.gy = ny;
                cab.s.texture = T.cabeca[faceDe(dirIdx)].tex;
                if (comer) { crescer(cx, cy); comerBit(); }
                if (pu && nx === pu.gx && ny === pu.gy) pegarPu();

                if (buffs.ima && bit) {
                    // puxa o bit, até 2 casas por passo, para a casa à frente da cabeça
                    const ax = clamp(nx + d.x, 0, N - 1), ay = clamp(ny + d.y, 0, N - 1);
                    for (let k = 0; k < 2; k++) {
                        const ddx = ax - bit.gx, ddy = ay - bit.gy;
                        if (Math.abs(ddx) + Math.abs(ddy) > 7 || (!ddx && !ddy)) break;
                        const mx = Math.abs(ddx) >= Math.abs(ddy) ? Math.sign(ddx) : 0;
                        const my = mx ? 0 : Math.sign(ddy);
                        const tx = bit.gx + mx, ty = bit.gy + my;
                        if (cobra.some((sg) => sg.gx === tx && sg.gy === ty) || (pu && pu.gx === tx && pu.gy === ty)) break;
                        bit.gx = tx; bit.gy = ty;
                    }
                }
            };

            const comecar = (dir) => {
                if (estado !== "pronto") return;
                if (dir != null && dir !== (dirIdx + 2) % 4) {
                    dirIdx = dir;
                    cobra[0].s.texture = T.cabeca[faceDe(dirIdx)].tex;
                }
                estado = "jogando";
                acum = passoMs * 0.55; // primeiro passo logo, sem tempo morto
                mostrar(null);
                elDica.hidden = true;
                som.comecar();
                foco();
            };

            const virar = (idx) => {
                if (estado === "pronto") return comecar(idx);
                if (estado !== "jogando") return;
                const ultima = fila.length ? fila[fila.length - 1] : dirIdx;
                if (idx === ultima || idx === (ultima + 2) % 4 || fila.length >= 2) return;
                fila.push(idx);
                som.virar();
            };
            const virarRel = (delta) => {
                const base = fila.length ? fila[fila.length - 1] : dirIdx;
                virar((base + delta + 4) % 4);
            };

            const pausar = (liga) => {
                if (liga && estado === "jogando") {
                    estado = "pausado";
                    som.pausar(true);
                    mostrar("pausa");
                    foco(painel.pausa.querySelector('[data-act="continuar"]'));
                } else if (!liga && estado === "pausado") {
                    estado = "jogando";
                    som.pausar(false);
                    mostrar(null);
                    foco();
                }
            };

            const reiniciar = () => {
                resetar();
                estado = "pronto";
                mostrar(null);
                elDica.hidden = false;
                morte = null;
                dados.plays += 1;
                gravarDados(dados);
                som.ui();
                foco();
            };

            /* ------------------------------------------------ entrada */
            const aoTecla = (e) => {
                if (e.metaKey || e.ctrlKey || e.altKey) return;
                const k = e.key;
                if (k === "Escape") {
                    e.preventDefault();
                    if (estado === "jogando") pausar(true);
                    else if (estado === "pausado") pausar(false);
                    else fechar();
                    return;
                }
                if (k in TECLAS) {
                    e.preventDefault();
                    if (e.repeat) return;
                    virar(TECLAS[k]);
                    return;
                }
                if (k === "p" || k === "P") {
                    e.preventDefault();
                    pausar(estado === "jogando");
                    return;
                }
                if (k === " " || k === "Enter") {
                    if (e.target.closest && e.target.closest("button, a")) return; // o botão cuida
                    e.preventDefault();
                    if (estado === "pronto") comecar();
                    else if (estado === "jogando") pausar(true);
                    else if (estado === "pausado") pausar(false);
                    else if (estado === "fim") reiniciar();
                }
            };
            ouvir(document, "keydown", aoTecla, true);
            // a página por trás não rola com a roda do mouse
            ouvir(el, "wheel", (e) => e.preventDefault(), { passive: false });

            // toque: deslizar escolhe a diagonal, tocar vira para o lado do dedo
            let toque = null;
            ouvir(palco, "pointerdown", (e) => {
                som.destravar();
                toque = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
            });
            const soltar = (e) => {
                if (!toque || e.pointerId !== toque.id) return;
                const dx = e.clientX - toque.x, dy = e.clientY - toque.y;
                const dist = Math.hypot(dx, dy);
                const t = toque;
                toque = null;
                if (e.type === "pointercancel") return;
                if (dist > 26) {
                    if (Math.abs(dx) > Math.abs(dy)) virar(dx > 0 ? 1 : 3);
                    else virar(dy > 0 ? 2 : 0);
                } else if (performance.now() - t.t < 400) {
                    if (estado === "pronto") comecar();
                    else virarRel(e.clientX < palco.clientWidth / 2 ? -1 : 1);
                }
            };
            ouvir(palco, "pointerup", soltar);
            ouvir(palco, "pointercancel", soltar);

            ouvir(el, "click", (e) => {
                som.destravar();
                const ir = e.target.closest("[data-ir]");
                if (ir) {
                    e.preventDefault();
                    const alvo = ir.getAttribute("href");
                    fechar(() => {
                        const n = document.querySelector(alvo);
                        if (n) n.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                    return;
                }
                const b = e.target.closest("[data-act]");
                if (!b) return;
                switch (b.dataset.act) {
                    case "jogar": som.ui(); comecar(); break;
                    case "again": reiniciar(); break;
                    case "continuar": pausar(false); break;
                    case "pausa":
                        if (estado === "jogando") pausar(true);
                        else if (estado === "pausado") pausar(false);
                        foco();
                        break;
                    case "mudo": som.alternarMudo(); pintarMudo(); foco(); break;
                    case "sair": fechar(); break;
                }
            });

            // aba escondida ou janela sem foco: pausa sozinho
            const autoPausa = () => { if (estado === "jogando") pausar(true); };
            ouvir(document, "visibilitychange", () => { if (document.hidden) autoPausa(); });
            ouvir(window, "blur", autoPausa);

            /* ------------------------------------------------ layout */
            const layout = () => {
                const W = app.screen.width, H = app.screen.height;
                const topo = W < 640 ? 74 : 84;
                const aW = W - 20, aH = H - topo - 14;
                const bw = (N + 2) * TW + 20;
                const bh = (N + 1) * TH + CH * 1.7 + 30;
                baseEsc = clamp(Math.min(aW / bw, aH / bh), 0.2, 1.5);
                baseX = W / 2;
                baseY = topo + aH / 2 + 6 * baseEsc;
            };
            layout();
            ouvir(window, "resize", layout);

            /* ------------------------------------------- desenhar */
            const posCob = (c, t) => {
                const gx = lerpN(c.pgx, c.gx, t), gy = lerpN(c.pgy, c.gy, t);
                return { gx, gy, ...proj(gx, gy) };
            };

            let intro = { t: 0, pouso: false, ladr: false, hud: false };

            const quadro = (tk) => {
                const dt = Math.min(tk.deltaMS, 50);
                tempo += dt;

                // ------- lógica
                if (estado === "intro") {
                    intro.t += dt;
                    if (!intro.ladr) { intro.ladr = true; som.ladrilhos(); }
                    if (!intro.hud && intro.t > 1100) {
                        intro.hud = true;
                        el.classList.add("is-hud");
                    }
                    if (!intro.pouso && intro.t > 810) {
                        intro.pouso = true;
                        som.pouso();
                        const p = proj(cobra[0].gx, cobra[0].gy);
                        estourar(p.x, p.y, 14, T.miniCiano, 1.2);
                        abalar(7);
                        pulsoComer = 1;
                    }
                    if (intro.t > 1750) {
                        estado = "pronto";
                        mostrar("pronto");
                        foco(painel.pronto.querySelector('[data-act="jogar"]'));
                        resolverPronto();
                    }
                } else if (estado === "jogando") {
                    acum += dt;
                    if (comboMs > 0) {
                        if (!buffs.gota) comboMs -= dt; // "Gota": a janela do combo não corre
                        if (comboMs <= 0) { combo = 0; pintarCombo(); }
                        elCombo.style.setProperty("--p", clamp(comboMs / COMBO_JANELA, 0, 1).toFixed(3));
                    }
                    Object.keys(buffs).forEach((id) => {
                        const b = buffs[id];
                        b.ms -= dt;
                        if (chips[id]) chips[id].style.setProperty("--p", clamp(b.ms / b.dur, 0, 1).toFixed(3));
                        if (b.ms <= 0) {
                            delete buffs[id];
                            chipDesligar(id);
                            som.fimEfeito();
                            recalcPasso();
                        }
                    });
                    if (pu) {
                        pu.vida -= dt;
                        if (pu.vida <= 0) {
                            const q = proj(pu.gx, pu.gy);
                            estourar(q.x, q.y - CH * 0.4, 6, T.miniAmbar, 0.7);
                            removerPu();
                        }
                    }
                    let guarda = 0;
                    while (estado === "jogando" && acum >= passoMs && guarda++ < 4) {
                        acum -= passoMs;
                        passo();
                    }
                } else if (estado === "morrendo") {
                    morte.t += dt;
                    if (!morte.estourou && morte.t > 160) {
                        morte.estourou = true;
                        cobra.forEach((c, i) => {
                            const p = proj(c.gx, c.gy);
                            const t = i === 0 ? T.cabeca[faceDe(dirIdx)] : texCauda(i);
                            // a cauda inteira vira detrito
                            const s = spr(t, fx);
                            s.position.set(p.x, p.y);
                            parts.push({ s, vx: rnd(-0.18, 0.18) + (i === 0 ? morte.d.x * -0.05 : 0), vy: rnd(-0.55, -0.2), vida: 1100, t: 0, g: 0.0013, gira: rnd(-0.004, 0.004), grande: true });
                            c.s.visible = false;
                            c.sh.visible = false;
                        });
                    }
                    if (morte.t > 1150) fimDeJogo();
                }

                // ------- efeitos
                pulsoComer = Math.max(0, pulsoComer - dt / 240);
                zoom *= Math.pow(0.9, dt / 16.7);
                tremor *= Math.pow(0.9, dt / 16.7);
                if (tremor < 0.15) tremor = 0;
                const esc = baseEsc * (1 + zoom);
                mundo.scale.set(esc);
                mundo.position.set(
                    baseX + (tremor ? rnd(-tremor, tremor) : 0),
                    baseY + (tremor ? rnd(-tremor, tremor) : 0)
                );

                for (let i = parts.length - 1; i >= 0; i--) {
                    const p = parts[i];
                    p.t += dt;
                    p.vy += p.g * dt;
                    p.s.x += p.vx * dt;
                    p.s.y += p.vy * dt;
                    p.s.rotation += p.gira * dt;
                    const f = p.t / p.vida;
                    p.s.alpha = f < 0.6 ? 1 : Math.max(0, 1 - (f - 0.6) / 0.4);
                    if (p.t >= p.vida) { p.s.destroy(); parts.splice(i, 1); }
                }
                for (let i = flutuantes.length - 1; i >= 0; i--) {
                    const f = flutuantes[i];
                    f.tt += dt;
                    const k = f.tt / 900;
                    f.t.y = f.y0 - easeOutCubic(Math.min(1, k)) * 54;
                    f.t.scale.set(Math.min(1, easeOutBack(Math.min(1, f.tt / 220)) * 1.05));
                    f.t.alpha = k < 0.65 ? 1 : Math.max(0, 1 - (k - 0.65) / 0.35);
                    if (k >= 1) { f.t.destroy(); flutuantes.splice(i, 1); }
                }

                const W = app.screen.width, H = app.screen.height;
                motes.forEach((m) => {
                    m.y -= m.v * dt / 1000 * 4;
                    if (m.y < -0.06) { m.y = 1.06; m.x = Math.random(); }
                    m.s.position.set(m.x * W + Math.sin(tempo / 2400 + m.ph) * 14, m.y * H);
                    m.s.alpha = 0.16 + 0.16 * Math.sin(tempo / 1500 + m.ph);
                });

                // ------- cena
                const t = estado === "jogando" || estado === "pausado" ? clamp(acum / passoMs, 0, 1) : 0;
                const noIntro = estado === "intro";

                tiles.forEach((tl) => {
                    if (noIntro) {
                        const p = clamp((intro.t - tl.atraso) / 420, 0, 1);
                        tl.sp.y = tl.y + (1 - easeOutBack(p)) * 150;
                        tl.sp.alpha = Math.min(1, p * 2.2);
                    } else {
                        tl.sp.y = tl.y;
                        tl.sp.alpha = 1;
                    }
                });
                paredes.forEach((w) => {
                    if (noIntro) {
                        const p = clamp((intro.t - w.atraso) / 380, 0, 1);
                        w.sp.y = w.y + (1 - easeOutCubic(p)) * 110;
                        w.sp.alpha = Math.min(1, p * 2.4);
                    } else {
                        w.sp.y = w.y;
                        w.sp.alpha = 1;
                    }
                });

                cobra.forEach((c, i) => {
                    if (!c.s.visible) return;
                    let { gx, gy, x, y } = posCob(c, t);
                    let sx = 1, sy = 1, alt = 0, alfa = 1;

                    if (estado === "morrendo" && i === 0) {
                        // a cabeça bate na parede/corpo e quica de volta
                        const k = clamp(morte.t / 170, 0, 1);
                        const ida = Math.sin(k * Math.PI * 0.5) * 0.46;
                        const volta = morte.t > 170 ? Math.min(1, (morte.t - 170) / 200) * 0.18 : 0;
                        const q = proj(c.gx + morte.d.x * (ida - volta), c.gy + morte.d.y * (ida - volta));
                        x = q.x; y = q.y;
                        gx = c.gx + morte.d.x * ida; gy = c.gy + morte.d.y * ida;
                    }

                    // ondinha na cauda: cada cubo um pouco fora de fase
                    alt += Math.sin(tempo / 130 - i * 0.62) * (estado === "jogando" ? 1.8 : 1.2);
                    if (i === 0) {
                        if (estado === "jogando") alt += Math.sin(Math.PI * t) * 3.2;
                        else alt += (Math.sin(tempo / 360) + 1) * 1.6;
                        const pu = pulsoComer;
                        sx = 1 + 0.2 * pu; sy = 1 - 0.16 * pu;
                    }

                    if (noIntro) {
                        // cai do céu em ordem: cabeça primeiro, cauda atrás
                        const p = clamp((intro.t - 330 - i * 90) / 480, 0, 1);
                        alt += (1 - easeOutBack(p)) * 460;
                        alfa = Math.min(1, p * 4);
                        if (i === 0 && intro.t > 810) {
                            const q = clamp((intro.t - 810) / 260, 0, 1);
                            sx *= 1 + 0.14 * (1 - q);
                            sy *= 1 - 0.18 * (1 - q);
                        }
                    }
                    const nasc = clamp((tempo - c.nasc) / 240, 0, 1);
                    const crescendo = nasc < 1 ? easeOutBack(nasc) : 1;

                    if (buffs.sombra) alfa *= i === 0 ? 0.85 : 0.5;
                    c.s.position.set(x, y - alt);
                    c.s.scale.set(sx * crescendo, sy * crescendo);
                    c.s.alpha = alfa;
                    c.s.zIndex = gx + gy + 0.05;
                    const alto = clamp(alt / 60, 0, 1);
                    c.sh.position.set(x, y + 3);
                    c.sh.scale.set((TW * 0.036) * (1 - alto * 0.4) * crescendo, TH * 0.034 * (1 - alto * 0.4) * crescendo);
                    c.sh.alpha = alfa * 0.85;
                });

                if (bit) {
                    // o ímã arrasta o bit casa a casa: a posição desenhada vai atrás da lógica
                    const suave = Math.min(1, dt / 70);
                    bit.dx += (bit.gx - bit.dx) * suave;
                    bit.dy += (bit.gy - bit.dy) * suave;
                    const p = proj(bit.dx, bit.dy);
                    const k = clamp((tempo - bit.nasc - (noIntro ? 0 : 0)) / 320, 0, 1);
                    const surgir = noIntro ? clamp((intro.t - 1300) / 400, 0, 1) : easeOutBack(k);
                    const boia = 4 + Math.sin(tempo / 260 + bit.gx) * 3;
                    bit.s.position.set(p.x, p.y - CH * 0.22 - boia);
                    bit.s.scale.set(surgir);
                    bit.s.zIndex = bit.dx + bit.dy + 0.03;
                    bit.brilho.position.set(p.x, p.y - CH * 0.4 - boia);
                    bit.brilho.scale.set(0.95 + 0.2 * Math.sin(tempo / 300) * surgir);
                    bit.brilho.alpha = surgir * (0.7 + 0.3 * Math.sin(tempo / 300));
                    const pul = (tempo % 1100) / 1100;
                    bit.anel.position.set(p.x, p.y);
                    bit.anel.scale.set((0.6 + pul * 0.7) * surgir);
                    bit.anel.alpha = (1 - pul) * 0.75 * surgir;
                }

                if (pu) {
                    const p = proj(pu.gx, pu.gy);
                    const k = clamp((tempo - pu.nasc) / 380, 0, 1);
                    const surgir = easeOutBack(k);
                    // nos últimos 3 s pisca, avisando que vai sumir
                    const pisca = pu.vida < 3000 ? (Math.sin(tempo / 70) > 0 ? 1 : 0.25) : 1;
                    const boia = 7 + Math.sin(tempo / 300) * 4;
                    pu.s.position.set(p.x, p.y - CH * 0.32 - boia);
                    pu.s.scale.set(surgir);
                    pu.s.alpha = pisca;
                    pu.s.zIndex = pu.gx + pu.gy + 0.04;
                    pu.brilho.position.set(p.x, p.y - CH * 0.55 - boia);
                    pu.brilho.scale.set((1.25 + 0.25 * Math.sin(tempo / 240)) * surgir);
                    pu.brilho.alpha = surgir * pisca * 0.85;
                    if (pu.feixe) {
                        pu.feixe.position.set(p.x, p.y);
                        pu.feixe.scale.set(0.6 * surgir, 2.3 * surgir);
                        pu.feixe.alpha = surgir * pisca * 0.7;
                    }
                    const pul = (tempo % 900) / 900;
                    pu.anel.position.set(p.x, p.y);
                    pu.anel.scale.set((0.7 + pul * 0.9) * surgir);
                    pu.anel.alpha = (1 - pul) * pisca;
                }

                // aura na cabeça, na cor do efeito mais recente
                const ids = Object.keys(buffs);
                if (!lite && ids.length && cobra[0] && cobra[0].s.visible) {
                    const ult = buffs[ids[ids.length - 1]];
                    aura.visible = true;
                    aura.tint = hex(ult.c.cor);
                    aura.position.set(cobra[0].s.x, cobra[0].s.y - CH * 0.3);
                    aura.scale.set(1.3 + 0.12 * Math.sin(tempo / 180));
                    aura.alpha = ult.ms < 1800 && Math.sin(tempo / 60) > 0 ? 0.3 : 0.85;
                } else {
                    aura.visible = false;
                }
            };

            let resolverPronto = () => {};
            const promessaPronta = new Promise((ok) => { resolverPronto = ok; });

            resetar();
            estado = "intro";
            // gancho só para testes automatizados: quem chama open() à mão
            // pode receber uma janela para o estado interno. O site não usa.
            if (opts.expor) {
                opts.expor({
                    N,
                    get estado() { return estado; },
                    get bit() { return bit && { gx: bit.gx, gy: bit.gy }; },
                    get cobra() { return cobra.map((c) => ({ gx: c.gx, gy: c.gy })); },
                    get dir() { return dirIdx; },
                    get pontos() { return pontos; },
                    get passoMs() { return passoMs; },
                    get fps() { return app.ticker.FPS; },
                    get app() { return app; },
                    get pu() { return pu && { id: pu.c.id, gx: pu.gx, gy: pu.gy }; },
                    get buffs() { return Object.keys(buffs); },
                    forcarPu: (id) => spawnPu(COLECAO.find((c) => c.id === id)),
                    dados,
                });
            }
            app.ticker.add(quadro);
            limpezas.push(() => app.ticker.remove(quadro));
            return promessaPronta;
        };

        /* ------------------------------------------------- fechar ---- */
        let fechar = (depois) => {
            if (estado === "fechando") return;
            estado = "fechando";
            vivo = false;
            som.ui();
            el.classList.remove("is-hud");
            Object.keys(painel).forEach((k) => { painel[k].hidden = true; });
            elDica.hidden = true;
            const o = (opts.getOrigin && opts.getOrigin()) || origem;
            const R1 = raioMax(o);
            revelar.cancel();
            const volta = el.animate(
                [{ clipPath: circulo(R1, o) }, { clipPath: circulo(0, o) }],
                { duration: lite ? 300 : 520, easing: CURVA, fill: "both" }
            );
            volta.finished.then(
                () => desmontar(depois),
                () => desmontar(depois)
            );
        };

        const desmontar = (depois) => {
            limpezas.forEach((f) => { try { f(); } catch (e) { /* segue */ } });
            limpezas.length = 0;
            if (app) {
                try { app.destroy(true, { children: true, texture: true, textureSource: true }); } catch (e) { /* segue */ }
                app = null;
            }
            clearTimeout(aviso);
            el.remove();
            anel.remove();
            inertes.forEach((n) => n.removeAttribute("inert"));
            som.suspender();
            ativo = null;
            if (opts.onClose) opts.onClose();
            if (depois) depois();
        };

        /* -------------------------------------------------- partida -- */
        // `pronto` resolve quando a intro acaba (o jogo vira jogável) e
        // rejeita se o WebGL não subir
        const pronto = iniciar();

        ativo = { pronto, fechar: () => fechar() };
        pronto.catch(() => {
            // falhou antes do jogo existir (WebGL indisponível, por exemplo)
            if (vivo && estado === "carregando") {
                desmontar();
            }
        });
        return pronto;
    }

    window.ScorpionGame = {
        open: abrir,
        close: () => { if (ativo) ativo.fechar(); },
        get aberto() { return !!ativo; },
    };
})();
