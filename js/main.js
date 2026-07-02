document.addEventListener("DOMContentLoaded", () => {
    const bgContainer = document.getElementById("floating-background");
    const fgContainer = document.getElementById("floating-foreground");
    if (!bgContainer || !fgContainer) return;

    const cubes = [];

    function createCube(container, isForeground) {
        const cube = document.createElement("img");
        cube.src = "assets/scorpion_bits_cube_thick_stroke.png";
        cube.alt = "Cubo Decorativo";
        cube.className = "floating-cube";

        const size = isForeground
            ? Math.floor(Math.random() * 25) + 30   
            : Math.floor(Math.random() * 60) + 60;  

        const opacity = isForeground
            ? (Math.random() * 0.25) + 0.35  
            : (Math.random() * 0.08) + 0.04; 

        cube.style.width = `${size}px`;
        cube.style.height = "auto";
        cube.style.opacity = opacity;

        const xPercent = Math.random() * 95;
        const yPercent = Math.random() * 85;

        const width = window.innerWidth;
        const height = window.innerHeight;
        let startX, startY;
        const edge = Math.floor(Math.random() * 4); 

        if (edge === 0) { 
            startX = Math.random() * width;
            startY = -150;
        } else if (edge === 1) { 
            startX = Math.random() * width;
            startY = height + 150;
        } else if (edge === 2) { 
            startX = -150;
            startY = Math.random() * height;
        } else { 
            startX = width + 150;
            startY = Math.random() * height;
        }

        container.appendChild(cube);

        cubes.push({
            element: cube,
            xPercent: xPercent,
            yPercent: yPercent,
            baseX: (xPercent / 100) * width,
            baseY: (yPercent / 100) * height,
            currentX: startX,
            currentY: startY,
            phase: Math.random() * Math.PI * 2, 
            speed: (Math.random() * 0.012) + 0.005, 
            amplitude: isForeground
                ? (Math.random() * 12) + 8   
                : (Math.random() * 25) + 15,  
            rot: Math.random() * 360,
            rotSpeed: (Math.random() * 0.12) - 0.06, 
            lerpFactor: (Math.random() * 0.02) + 0.03 
        });
    }

    const BG_COUNT = 9;
    for (let i = 0; i < BG_COUNT; i++) {
        createCube(bgContainer, false);
    }

    const FG_COUNT = 6;
    for (let i = 0; i < FG_COUNT; i++) {
        createCube(fgContainer, true);
    }

    window.addEventListener("resize", () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        cubes.forEach(cube => {
            cube.baseX = (cube.xPercent / 100) * width;
            cube.baseY = (cube.yPercent / 100) * height;
        });
    });

    function animate() {
        cubes.forEach((cube) => {

            cube.phase += cube.speed;
            cube.rot += cube.rotSpeed;

            const destX = cube.baseX;
            const destY = cube.baseY + Math.sin(cube.phase) * cube.amplitude;

            cube.currentX += (destX - cube.currentX) * cube.lerpFactor;
            cube.currentY += (destY - cube.currentY) * cube.lerpFactor;

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
        threshold: 0.15
    };

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("revealed");
            } else {
                entry.target.classList.remove("revealed"); 
            }
        });
    }, revealObserverOptions);

    const revealSections = document.querySelectorAll(".reveal-section");
    revealSections.forEach((section) => {
        revealObserver.observe(section);
    });
});
