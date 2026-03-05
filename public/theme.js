// Dark Mode Toggle - Shared across all pages
(function () {
    // Apply saved theme immediately (before DOM renders)
    const savedTheme = localStorage.getItem('nexboard_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    document.addEventListener('DOMContentLoaded', () => {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (!toggleBtn) return;

        // Set correct icon
        updateToggleIcon(toggleBtn, savedTheme);

        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('nexboard_theme', next);
            updateToggleIcon(toggleBtn, next);
        });
    });

    function updateToggleIcon(btn, theme) {
        if (theme === 'dark') {
            btn.innerHTML = '<i class="fa-solid fa-sun"></i>';
            btn.title = 'Switch to Light Mode';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            btn.title = 'Switch to Dark Mode';
        }
    }
})();
