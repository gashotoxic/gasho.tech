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

// Check for saved theme preference
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.querySelector('.theme-toggle i').classList.remove('fa-moon-o');
        document.querySelector('.theme-toggle i').classList.add('fa-sun-o');
    }
});