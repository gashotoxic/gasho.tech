// Enhanced Theme Detection with System Preference, Time-based, and Manual Control

function toggleTheme() {
    const body = document.body;
    const icon = document.querySelector('.theme-toggle i');

    body.classList.toggle('dark-mode');

    // Toggle icon
    if (body.classList.contains('dark-mode')) {
        icon.classList.remove('fa-moon-o');
        icon.classList.add('fa-sun-o');
        localStorage.setItem('theme', 'dark');
    } else {
        icon.classList.remove('fa-sun-o');
        icon.classList.add('fa-moon-o');
        localStorage.setItem('theme', 'light');
    }
}

// Check if it's night time (between 6 PM and 6 AM)
function isNightTime() {
    const hour = new Date().getHours();
    return hour < 6 || hour >= 18; // Night: 6 PM to 6 AM
}

// Detect system theme preference
function getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

// Initialize theme based on priority: Manual > System > Time
function initializeTheme() {
    const body = document.body;
    const icon = document.querySelector('.theme-toggle i');
    const savedTheme = localStorage.getItem('theme');

    let theme = 'light';

    // Priority 1: Manual user selection
    if (savedTheme) {
        theme = savedTheme;
    }
    // Priority 2: System preference
    else if (window.matchMedia) {
        const systemTheme = getSystemTheme();
        theme = systemTheme;
    }
    // Priority 3: Time-based (default fallback)
    else {
        theme = isNightTime() ? 'dark' : 'light';
    }

    // Apply theme
    if (theme === 'dark') {
        body.classList.add('dark-mode');
        if (icon) {
            icon.classList.remove('fa-moon-o');
            icon.classList.add('fa-sun-o');
        }
    } else {
        body.classList.remove('dark-mode');
        if (icon) {
            icon.classList.remove('fa-sun-o');
            icon.classList.add('fa-moon-o');
        }
    }
}

// Listen for system theme changes
function setupSystemThemeListener() {
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (e) => {
            // Only auto-switch if user hasn't manually set a preference
            const savedTheme = localStorage.getItem('theme');
            if (!savedTheme) {
                if (e.matches) {
                    document.body.classList.add('dark-mode');
                    const icon = document.querySelector('.theme-toggle i');
                    if (icon) {
                        icon.classList.remove('fa-moon-o');
                        icon.classList.add('fa-sun-o');
                    }
                } else {
                    document.body.classList.remove('dark-mode');
                    const icon = document.querySelector('.theme-toggle i');
                    if (icon) {
                        icon.classList.remove('fa-sun-o');
                        icon.classList.add('fa-moon-o');
                    }
                }
            }
        });
    }
}

// Auto-adjust theme based on time (runs every minute)
function setupTimeBasedTheme() {
    // Check immediately
    const savedTheme = localStorage.getItem('theme');
    const hasSystemPreference = window.matchMedia && localStorage.getItem('hasSystemPreference') === 'true';

    // Only auto-adjust if user hasn't manually set preference
    if (!savedTheme) {
        const body = document.body;
        const icon = document.querySelector('.theme-toggle i');
        const shouldBeDark = isNightTime();

        if (shouldBeDark && !body.classList.contains('dark-mode')) {
            body.classList.add('dark-mode');
            if (icon) {
                icon.classList.remove('fa-moon-o');
                icon.classList.add('fa-sun-o');
            }
        } else if (!shouldBeDark && body.classList.contains('dark-mode')) {
            body.classList.remove('dark-mode');
            if (icon) {
                icon.classList.remove('fa-sun-o');
                icon.classList.add('fa-moon-o');
            }
        }
    }

    // Check again every minute
    setTimeout(setupTimeBasedTheme, 60000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Save system preference detection
    if (window.matchMedia) {
        const systemTheme = getSystemTheme();
        if (localStorage.getItem('theme') === null) {
            localStorage.setItem('hasSystemPreference', 'true');
        }
    }

    // Initialize theme
    initializeTheme();

    // Set up listeners
    setupSystemThemeListener();
    setupTimeBasedTheme();
});
