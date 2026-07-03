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
        let activeTimeout;
        const slides = Array.from(track.querySelectorAll(".carousel-slide"));

        function updateCarousel() {
            if (slides.length === 0) return;
            const maxIndex = slides.length - 1;
            if (currentIndex > maxIndex) currentIndex = maxIndex;
            if (currentIndex < 0) currentIndex = 0;
            
            clearTimeout(activeTimeout);

            slides.forEach((slide, index) => {
                slide.classList.remove('active', 'active-done', 'prev', 'next', 'hidden-left', 'hidden-right');
                
                if (index === currentIndex) {
                    slide.classList.add('active');
                } else if (index === currentIndex - 1) {
                    slide.classList.add('prev');
                } else if (index === currentIndex + 1) {
                    slide.classList.add('next');
                } else if (index < currentIndex - 1) {
                    slide.classList.add('hidden-left');
                } else if (index > currentIndex + 1) {
                    slide.classList.add('hidden-right');
                }
            });

            activeTimeout = setTimeout(() => {
                if (slides[currentIndex]) {
                    slides[currentIndex].classList.add('active-done');
                }
            }, 600); // Matches CSS transition duration

            prevBtn.style.opacity = currentIndex === 0 ? "0.3" : "1";
            prevBtn.style.pointerEvents = currentIndex === 0 ? "none" : "auto";
            nextBtn.style.opacity = currentIndex === maxIndex ? "0.3" : "1";
            nextBtn.style.pointerEvents = currentIndex === maxIndex ? "none" : "auto";
        }

        nextBtn.addEventListener("click", () => {
            if (currentIndex < slides.length - 1) {
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

        // Make side cards clickable
        slides.forEach((slide, index) => {
            slide.addEventListener("click", () => {
                if (index !== currentIndex) {
                    currentIndex = index;
                    updateCarousel();
                }
            });
        });

        setTimeout(updateCarousel, 50);
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
                
                let navId = id;
                if (id === 'ferramentas' || id === 'equipe') {
                    navId = 'sobre';
                }

                navLinks.forEach((link) => {
                    link.classList.remove("active");
                    const href = link.getAttribute("href");
                    if (href && (href === `#${navId}` || href.endsWith(`#${navId}`))) {
                        link.classList.add("active");
                    }
                });

                const dots = document.querySelectorAll(".scroll-dot");
                if (dots.length > 0) {
                    dots.forEach(dot => {
                        dot.classList.remove("active");
                        if (dot.getAttribute("data-target") === id) {
                            dot.classList.add("active");
                        }
                    });
                }
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
                
                // Trigger linear wipe animation for titles inside this section!
                const titles = entry.target.querySelectorAll(".hero-title, .section-title, .portfolio-section h2, .contact-section h2, h1.gradient-text");
                titles.forEach(title => {
                    title.classList.add("revealed");
                });
                
                observer.unobserve(entry.target);
            }
        });
    }, revealObserverOptions);

    const revealSections = document.querySelectorAll(".reveal-section");
    revealSections.forEach((section) => {
        revealObserver.observe(section);
    });

    // Initialize standalone titles to reveal on load
    const titlesToGlitch = document.querySelectorAll(".hero-title, .section-title, .portfolio-section h2, .contact-section h2, h1.gradient-text");
    titlesToGlitch.forEach(title => {
        const parentSection = title.closest(".reveal-section");
        if (!parentSection) {
            setTimeout(() => {
                title.classList.add("revealed");
            }, 150);
        }
    });

    // Create random animated RGB pixels in the header
    function createHeaderPixels() {
        const header = document.querySelector(".site-header");
        if (!header) return;
        
        const pixelCount = 24;
        const colors = ["#ff0055", "#00ffcc", "#0066ff", "#ff00c1", "#00d2ff"];
        const segmentWidth = 100 / pixelCount;
        
        for (let i = 0; i < pixelCount; i++) {
            const pixel = document.createElement("div");
            pixel.className = "navbar-pixel";
            
            // Uniform horizontal distribution with a slight random jitter
            const jitter = (Math.random() - 0.5) * (segmentWidth * 0.7);
            const left = (i * segmentWidth) + (segmentWidth / 2) + jitter;
            
            // Random vertical position within the header boundaries
            const top = Math.random() * 60 + 20; // Between 20% and 80%
            
            pixel.style.top = `${top}%`;
            pixel.style.left = `${left}%`;
            
            // Random sizing (2px to 4px)
            const size = Math.floor(Math.random() * 3) + 2;
            pixel.style.width = `${size}px`;
            pixel.style.height = `${size}px`;
            
            // Assign random color and glow
            const color = colors[Math.floor(Math.random() * colors.length)];
            pixel.style.backgroundColor = color;
            pixel.style.boxShadow = `0 0 8px ${color}`;
            
            // Random animation speed and delay
            const duration = Math.random() * 3 + 2; // 2s to 5s
            const delay = Math.random() * 4;        // 0s to 4s
            
            pixel.style.animation = `pixelGlow ${duration}s ease-in-out ${delay}s infinite alternate`;
            
            header.appendChild(pixel);
        }
    }

    function createCardPixels() {
        const cards = document.querySelectorAll(".about-section .team-card");
        if (cards.length === 0) return;
        
        cards.forEach(card => {
            const snakeLength = 15; // Length of each snake trail
            const duration = 5; // 5 seconds for a full lap
            const gap = 0.035; // Delay between each segment
            
            const cardOffset = Math.random() * duration; // Different offset per card
            
            // Create 2 snakes per card (starting on opposite sides)
            for (let s = 0; s < 2; s++) {
                const baseDelay = cardOffset + (s * (duration / 2)); 
                
                for (let i = 0; i < snakeLength; i++) {
                    const pixel = document.createElement("div");
                    pixel.className = "card-pixel";
                    
                    // The head of the snake is solid, the tail fades
                    const opacity = 1 - (i / snakeLength); 
                    pixel.style.opacity = opacity;
                    
                    // Sizing: sharp 8-bit squares
                    const size = i === 0 ? 5 : 3.5; // Head is slightly bigger
                    pixel.style.width = `${size}px`;
                    pixel.style.height = `${size}px`;
                    pixel.style.borderRadius = '0'; // Pixel art
                    
                    // Colors: Head is white, body is neon cyan
                    pixel.style.backgroundColor = i === 0 ? "#ffffff" : "#00d2ff"; 
                    pixel.style.boxShadow = `0 0 ${i === 0 ? 12 : 5}px #00d2ff`;
                    
                    // The head (i=0) needs the most negative delay to be at the front
                    const offsetIndex = snakeLength - 1 - i; 
                    const delay = -(baseDelay + (offsetIndex * gap));
                    
                    pixel.style.animation = `cardPixelSnake ${duration}s linear ${delay}s infinite`;
                    
                    card.appendChild(pixel);
                }
            }
        });
    }

    createHeaderPixels();
    createCardPixels();
});
