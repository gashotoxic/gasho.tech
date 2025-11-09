document.addEventListener('DOMContentLoaded', () => {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const body = document.body;

    // Set dark mode as default (if no saved preference)
    const savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
        body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
    }

    darkModeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');

        // Save theme preference
        if (body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }
    });
});
