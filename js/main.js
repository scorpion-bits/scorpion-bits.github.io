document.addEventListener("DOMContentLoaded", () => {
    const bgContainer = document.getElementById("floating-background");
    const fgContainer = document.getElementById("floating-foreground");
    if (!bgContainer || !fgContainer) return;

    const cubes = [];

    function createCube(container, isForeground, xPercent, yPercent) {
        const cube = document.createElement("img");
        cube.src = "assets/scorpion_bits_cube_thick_stroke.png";
        cube.alt = "Cubo Decorativo";
        cube.className = "floating-cube";

        const size = isForeground
            ? Math.floor(Math.random() * 20) + 25   
            : Math.floor(Math.random() * 40) + 50;  

        const opacity = isForeground
            ? (Math.random() * 0.20) + 0.30  
            : (Math.random() * 0.06) + 0.04; 

        cube.style.width = `${size}px`;
        cube.style.height = "auto";
        cube.style.opacity = opacity;

        const width = window.innerWidth;
        const height = window.innerHeight;

        const startX = (xPercent / 100) * width;
        const startY = (yPercent / 100) * height;

        container.appendChild(cube);

        cubes.push({
            element: cube,
            xPercent: xPercent,
            yPercent: yPercent,
            baseX: startX,
            baseY: startY,
            currentX: startX,
            currentY: startY,
            vx: (Math.random() - 0.5) * 0.2, 
            vy: (Math.random() - 0.5) * 0.2,
            rot: Math.random() * 360,
            rotSpeed: (Math.random() * 0.06) - 0.03, 
            mass: isForeground ? 1.0 : 2.5
        });
    }

    // Spawn Background Cubes in a 4x5 Grid (20 cubes)
    const BG_ROWS = 4;
    const BG_COLS = 5;
    for (let r = 0; r < BG_ROWS; r++) {
        for (let c = 0; c < BG_COLS; c++) {
            const xPercent = (c * 100 / BG_COLS) + (Math.random() * (100 / BG_COLS * 0.6)) + (100 / BG_COLS * 0.2);
            const yPercent = (r * 100 / BG_ROWS) + (Math.random() * (100 / BG_ROWS * 0.6)) + (100 / BG_ROWS * 0.2);
            createCube(bgContainer, false, xPercent, yPercent);
        }
    }

    // Spawn Foreground Cubes in a 3x4 Grid (12 cubes)
    const FG_ROWS = 3;
    const FG_COLS = 4;
    for (let r = 0; r < FG_ROWS; r++) {
        for (let c = 0; c < FG_COLS; c++) {
            const xPercent = (c * 100 / FG_COLS) + (Math.random() * (100 / FG_COLS * 0.6)) + (100 / FG_COLS * 0.2);
            const yPercent = (r * 100 / FG_ROWS) + (Math.random() * (100 / FG_ROWS * 0.6)) + (100 / FG_ROWS * 0.2);
            createCube(fgContainer, true, xPercent, yPercent);
        }
    }

    window.addEventListener("resize", () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        cubes.forEach(cube => {
            cube.baseX = (cube.xPercent / 100) * width;
            cube.baseY = (cube.yPercent / 100) * height;
        });
    });

    let mouseX = -1000;
    let mouseY = -1000;
    let isMouseActive = false;

    window.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        isMouseActive = true;
    });

    window.addEventListener("mouseleave", () => {
        isMouseActive = false;
    });

    function animate() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // 1. Pairwise repulsion between cubes
        for (let i = 0; i < cubes.length; i++) {
            const c1 = cubes[i];
            const w1 = parseFloat(c1.element.style.width) || 50;
            for (let j = i + 1; j < cubes.length; j++) {
                const c2 = cubes[j];
                const w2 = parseFloat(c2.element.style.width) || 50;
                
                const dx = c2.currentX - c1.currentX;
                const dy = c2.currentY - c1.currentY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                const minDistance = (w1 + w2) * 0.65;
                
                if (dist < minDistance && dist > 0) {
                    const overlap = minDistance - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    
                    c1.currentX -= nx * overlap * 0.5;
                    c1.currentY -= ny * overlap * 0.5;
                    c2.currentX += nx * overlap * 0.5;
                    c2.currentY += ny * overlap * 0.5;
                    
                    const k = 0.03;
                    c1.vx -= nx * overlap * k;
                    c1.vy -= ny * overlap * k;
                    c2.vx += nx * overlap * k;
                    c2.vy += ny * overlap * k;
                }
            }
        }

        // 2. Physics updates, spring pull towards base, mouse push, boundary bouncing
        cubes.forEach((cube) => {
            // Very gentle spring pull back to home base (gravity coordinates)
            const springForce = 0.00015; 
            cube.vx += (cube.baseX - cube.currentX) * springForce;
            cube.vy += (cube.baseY - cube.currentY) * springForce;

            cube.currentX += cube.vx;
            cube.currentY += cube.vy;
            cube.rot += cube.rotSpeed;

            // Damping (drift friction)
            cube.vx *= 0.98;
            cube.vy *= 0.98;

            // Mouse push acceleration
            if (isMouseActive) {
                const dx = cube.currentX - mouseX;
                const dy = cube.currentY - mouseY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const repelRadius = 220;

                if (dist < repelRadius && dist > 0) {
                    const force = (repelRadius - dist) / repelRadius;
                    const accel = force * 0.8; 
                    cube.vx += (dx / dist) * accel;
                    cube.vy += (dy / dist) * accel;
                }
            }

            // Bounce off edges with low restitution to stay inside spring space
            const margin = 100;
            const bounceDamping = -0.4;
            if (cube.currentX < -margin) {
                cube.currentX = -margin;
                cube.vx *= bounceDamping;
            } else if (cube.currentX > width + margin) {
                cube.currentX = width + margin;
                cube.vx *= bounceDamping;
            }

            if (cube.currentY < -margin) {
                cube.currentY = -margin;
                cube.vy *= bounceDamping;
            } else if (cube.currentY > height + margin) {
                cube.currentY = height + margin;
                cube.vy *= bounceDamping;
            }

            cube.element.style.transform = `translate3d(${cube.currentX}px, ${cube.currentY}px, 0) rotate(${cube.rot}deg)`;
        });

        requestAnimationFrame(animate);
    }

    animate();

    const track = document.getElementById("carousel-track");
    const nextBtn = document.getElementById("next-btn");
    const prevBtn = document.getElementById("prev-btn");

    if (track && nextBtn && prevBtn) {
        let currentIndex = 0;

        function getVisibleSlidesCount() {
            const width = window.innerWidth;
            if (width > 900) return 3;
            if (width > 600) return 2;
            return 1;
        }

        function updateCarousel() {
            const slides = track.querySelectorAll(".carousel-slide");
            if (slides.length === 0) return;

            const slideWidth = slides[0].getBoundingClientRect().width;

            const visibleCount = getVisibleSlidesCount();
            const maxIndex = slides.length - visibleCount;
            if (currentIndex > maxIndex) currentIndex = maxIndex;
            if (currentIndex < 0) currentIndex = 0;

            track.style.transform = `translateX(-${currentIndex * slideWidth}px)`;

            prevBtn.style.opacity = currentIndex === 0 ? "0.3" : "1";
            prevBtn.style.pointerEvents = currentIndex === 0 ? "none" : "auto";
            nextBtn.style.opacity = currentIndex === maxIndex ? "0.3" : "1";
            nextBtn.style.pointerEvents = currentIndex === maxIndex ? "none" : "auto";
        }

        nextBtn.addEventListener("click", () => {
            const visibleCount = getVisibleSlidesCount();
            const maxIndex = track.querySelectorAll(".carousel-slide").length - visibleCount;
            if (currentIndex < maxIndex) {
                currentIndex++;
                updateCarousel();
            }
        });

        prevBtn.addEventListener("click", () => {
            if (currentIndex > 0) {
                currentIndex--;
                updateCarousel();
            }
        });

        window.addEventListener("resize", updateCarousel);

        setTimeout(updateCarousel, 150);
    }

    const menuToggle = document.getElementById("menu-toggle");
    const navMenu = document.getElementById("nav-menu-list");

    if (menuToggle && navMenu) {
        menuToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            navMenu.classList.toggle("active");
            const icon = menuToggle.querySelector("i");
            if (navMenu.classList.contains("active")) {
                icon.className = "fa-solid fa-xmark";
            } else {
                icon.className = "fa-solid fa-bars";
            }
        });

        document.addEventListener("click", (e) => {
            if (!navMenu.contains(e.target) && !menuToggle.contains(e.target)) {
                navMenu.classList.remove("active");
                const icon = menuToggle.querySelector("i");
                if (icon) icon.className = "fa-solid fa-bars";
            }
        });

        const navLinks = navMenu.querySelectorAll(".nav-link");
        navLinks.forEach((link) => {
            link.addEventListener("click", () => {
                navMenu.classList.remove("active");
                const icon = menuToggle.querySelector("i");
                if (icon) icon.className = "fa-solid fa-bars";
            });
        });
    }

    const sections = document.querySelectorAll("section[id]");
    const navLinks = document.querySelectorAll(".nav-link");

    const scrollSpyOptions = {
        rootMargin: "-30% 0px -30% 0px",
        threshold: 0
    };

    const scrollSpyObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute("id");

                navLinks.forEach((link) => {
                    link.classList.remove("active");
                    const href = link.getAttribute("href");
                    if (href && (href === `#${id}` || href.endsWith(`#${id}`))) {
                        link.classList.add("active");
                    }
                });
            }
        });
    }, scrollSpyOptions);

    sections.forEach((section) => {
        scrollSpyObserver.observe(section);
    });

    const revealObserverOptions = {
        threshold: 0.05
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("revealed");
                
                // Trigger pixelate animation for titles inside this section!
                const titles = entry.target.querySelectorAll(".hero-title, .section-title, .portfolio-section h2, .contact-section h2, h1.gradient-text");
                titles.forEach(title => {
                    title.classList.add("revealed");
                    pixelateText(title);
                });
                
                observer.unobserve(entry.target);
            }
        });
    }, revealObserverOptions);

    const revealSections = document.querySelectorAll(".reveal-section");
    revealSections.forEach((section) => {
        revealObserver.observe(section);
    });

    // Glitch/Pixel Text Reveal DOM Helper
    function prepareGlitchText(element) {
        let charIndex = 0;
        
        function traverse(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;
                const chars = Array.from(text); // Correctly handles surrogate pairs (emojis)
                const fragment = document.createDocumentFragment();
                for (let i = 0; i < chars.length; i++) {
                    const char = chars[i];
                    if (char === " " || char === "\n" || char === "\r" || char === "\t") {
                        fragment.appendChild(document.createTextNode(char));
                    } else {
                        const span = document.createElement("span");
                        span.className = "glitch-char";
                        span.textContent = char; // For layout spacing
                        span.setAttribute("data-char", char); // Store final correct char
                        span.style.setProperty("--char-index", charIndex);
                        charIndex++;
                        fragment.appendChild(span);
                    }
                }
                node.parentNode.replaceChild(fragment, node);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const children = Array.from(node.childNodes);
                children.forEach(child => traverse(child));
            }
        }
        
        traverse(element);
    }

    // Pixelate text reveal effect
    function pixelateText(element) {
        if (element.classList.contains("pixel-started")) return;
        element.classList.add("pixel-started");

        const chars = element.querySelectorAll(".glitch-char");
        chars.forEach((span, index) => {
            const correctChar = span.getAttribute("data-char");
            if (!correctChar) return;

            // Start hidden
            span.style.opacity = "0";
            
            const delay = index * 40; // 40ms stagger per letter
            
            setTimeout(() => {
                // Step 1: Solid block
                span.style.opacity = "1";
                span.textContent = "█";
                
                // Step 2: Dense block
                setTimeout(() => {
                    span.textContent = "▓";
                }, 60);
                
                // Step 3: Medium block
                setTimeout(() => {
                    span.textContent = "▒";
                }, 120);
                
                // Step 4: Sparse block
                setTimeout(() => {
                    span.textContent = "░";
                }, 180);
                
                // Step 5: Final character
                setTimeout(() => {
                    span.textContent = correctChar;
                    span.classList.add("done");
                }, 240);
                
            }, delay);
        });
    }

    // Initialize Glitch Text on selected titles
    const titlesToGlitch = document.querySelectorAll(".hero-title, .section-title, .portfolio-section h2, .contact-section h2, h1.gradient-text");
    titlesToGlitch.forEach(title => {
        prepareGlitchText(title);
        const parentSection = title.closest(".reveal-section");
        if (!parentSection) {
            setTimeout(() => {
                title.classList.add("revealed");
                pixelateText(title);
            }, 150);
        }
    });
});
