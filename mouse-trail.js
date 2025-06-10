 document.addEventListener('mousemove', function(e) {
    const circle = document.createElement('div');
    circle.className = 'mouse-trail-circle';
    document.body.appendChild(circle);

    const size = Math.random() * 15 + 10; // Random size between 10 and 25
    circle.style.width = size + 'px';
    circle.style.height = size + 'px';
    circle.style.left = e.clientX - size / 2 + 'px';
    circle.style.top = e.clientY - size / 2 + 'px';

    // Determine background color of the element under the cursor
    const targetElement = document.elementFromPoint(e.clientX, e.clientY);
    if (targetElement) {
        const computedStyle = getComputedStyle(targetElement);
        const bgColor = computedStyle.backgroundColor;

        // Check for primary green background (jumbotron, navbar)
        if (bgColor.includes('rgb(26, 188, 156)')) { // #1abc9c
            circle.style.backgroundColor = 'rgba(255, 255, 255, 0.7)'; // White for contrast
        }
        // Check for light grey background (bg-grey)
        else if (bgColor.includes('rgb(246, 246, 246)')) { // #f6f6f6
            circle.style.backgroundColor = 'rgba(0, 0, 0, 0.3)'; // Darker for contrast
        }
        // Check for dark mode backgrounds
        else if (document.body.classList.contains('dark-mode')) {
            // Check for dark primary background (var(--bg-dark))
            if (bgColor.includes('rgb(26, 26, 26)')) { // #1a1a1a
                circle.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'; // Lighter for contrast
            }
            // Check for dark secondary background (var(--bg-dark-secondary))
            else if (bgColor.includes('rgb(45, 45, 45)')) { // #2d2d2d
                circle.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'; // Lighter for contrast
            }
            else {
                circle.style.backgroundColor = 'rgba(26, 188, 156, 0.5)'; // Default primary green transparent
            }
        }
        else {
            circle.style.backgroundColor = 'rgba(26, 188, 156, 0.5)'; // Default primary green transparent
        }
    } else {
        circle.style.backgroundColor = 'rgba(26, 188, 156, 0.5)'; // Fallback default
    }

    // Animate growth and fade
    circle.animate([
        { transform: 'scale(0)', opacity: 1 },
        { transform: 'scale(1.5)', opacity: 0 }
    ], {
        duration: 800, // Animation duration
        easing: 'ease-out',
        fill: 'forwards'
    });

    // Remove the circle after animation
    setTimeout(() => {
        circle.remove();
    }, 800);
});