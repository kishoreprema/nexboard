/**
 * NEXBOARD - PROJECTS DASHBOARD LOGIC
 * Implements project listing and creation.
 */

// Backend API URL
const API_URL = 'http://localhost:3000/api';

// Auth Check
const currentUserLine = localStorage.getItem('nexboard_currentUser');
if (!currentUserLine) {
    window.location.href = 'login.html';
}
const currentUser = JSON.parse(currentUserLine);

// Initial State
let projects = [];
let users = [];

// Set UI name and Avatar
document.addEventListener('DOMContentLoaded', () => {
    const welcomeMsg = document.getElementById('welcome-msg');
    if (welcomeMsg) {
        welcomeMsg.innerText = `Welcome, ${currentUser.name}`;
    } else {
        console.warn('Welcome message element not found (expected #welcome-msg)');
    }
    renderUserAvatar();
});

function renderUserAvatar() {
    const avatarBtn = document.querySelector('.navbar .avatar-btn');
    if (!avatarBtn) return;

    const statusDot = document.getElementById('user-status-dot');
    const dotHTML = statusDot ? statusDot.outerHTML : '';

    if (currentUser.avatarUrl) {
        avatarBtn.style.backgroundImage = `url(${currentUser.avatarUrl})`;
        avatarBtn.style.backgroundSize = 'cover';
        avatarBtn.style.backgroundPosition = 'center';
        avatarBtn.innerHTML = dotHTML;
        avatarBtn.style.color = 'transparent';
        avatarBtn.style.border = 'none';
    } else {
        avatarBtn.style.backgroundImage = 'none';
        avatarBtn.innerHTML = dotHTML + (currentUser.initials || getInitials(currentUser.name));
        avatarBtn.style.backgroundColor = currentUser.color || '#0052CC';
        avatarBtn.style.color = 'white';
    }
}

// Fetch initial data from backend
async function fetchInitialData() {
    try {
        const [projectsRes, usersRes] = await Promise.all([
            fetch(`${API_URL}/projects?userId=${currentUser.id}&role=${currentUser.role}`),
            fetch(`${API_URL}/users`) // Still fetch users just to render avatars accurately on tasks if needed
        ]);

        if (projectsRes.ok) projects = await projectsRes.json();
        if (usersRes.ok) users = await usersRes.json();

        renderProjects();
        try {
            if (typeof Chart !== 'undefined') {
                initChart();
            } else {
                console.warn('Chart.js is not loaded yet. Skipping dashboard chart.');
            }
        } catch (chartError) {
            console.error('Error initializing dashboard chart:', chartError);
        }
    } catch (error) {
        console.error('Failed to fetch initial data:', error);
        alert('Could not connect to the backend server. Is it running?');
    }
}

function getInitials(name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
}

const avatarColors = ['#0052CC', '#00875A', '#FF5630', '#FFAB00', '#36B37E', '#6554C0'];

function getRandomColor() {
    return avatarColors[Math.floor(Math.random() * avatarColors.length)];
}

// DOM Elements
const projectsGrid = document.getElementById('projects-grid');
const searchInput = document.getElementById('project-search-input');

// ==========================================================
// RENDER LOGIC
// ==========================================================
function renderProjects(filterText = '') {
    projectsGrid.innerHTML = '';

    if (projects.length === 0) {
        projectsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px 24px; color: var(--text-secondary); background: var(--bg-surface); border-radius: var(--border-radius-lg); border: 2px dashed var(--border-color);">
                <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 16px; color: var(--border-color);"></i>
                <h3 style="margin-bottom: 8px; color: var(--text-primary); font-size: 1.25rem;">No Projects Assigned</h3>
                <p>You have not been assigned to any projects yet. Please contact a Project Manager to get access.</p>
            </div>
        `;
        return;
    }

    projects.forEach(project => {
        if (filterText && !project.name.toLowerCase().includes(filterText.toLowerCase()) && !(project.id || '').toLowerCase().includes(filterText.toLowerCase())) {
            return;
        }

        const card = document.createElement('div');
        card.classList.add('project-card');

        // When clicking a project card, redirect to the Kanban board
        card.addEventListener('click', (e) => {
            console.log(`[Dashboard] Card clicked for project: ${project.id}. Event target:`, e.target);
            window.location.href = `board.html?projectId=${project.id}`;
        });

        card.innerHTML = `
            <div class="project-card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="project-icon">
                        <i class="fa-solid fa-folder-open"></i>
                    </div>
                    <h3>${project.name}</h3>
                </div>
            </div>
            <p class="project-desc">${project.desc}</p>
            <div class="project-meta">
                <span class="project-key"><i class="fa-solid fa-key"></i> Key: ${project.id}</span>
                <span class="project-tasks"><i class="fa-solid fa-list-check"></i> ${project.taskCount} tasks</span>
            </div>
        `;

        projectsGrid.appendChild(card);
    });
}

// Removed Project Creation and Team Management blocks since employees cannot do this.

// ==========================================================
// CHART LOGIC
// ==========================================================
let globalChartInstance = null;

async function initChart() {
    const ctx = document.getElementById('global-task-chart');
    if (!ctx) return;

    // Aggregate tasks from backend
    let tasksForChart = [];
    try {
        const res = await fetch(`${API_URL}/tasks?role=${currentUser.role}&userId=${currentUser.id}`);
        if (res.ok) tasksForChart = await res.json();
    } catch (e) {
        console.error("Failed to fetch tasks for chart", e);
    }

    let todoCount = 0;
    let inProgressCount = 0;
    let doneCount = 0;

    tasksForChart.forEach(t => {
        if (t.status === 'todo') todoCount++;
        else if (t.status === 'in-progress') inProgressCount++;
        else if (t.status === 'done') doneCount++;
    });

    const data = {
        labels: ['To Do', 'In Progress', 'Done'],
        datasets: [{
            label: 'Tasks', data: [todoCount, inProgressCount, doneCount],
            borderColor: '#0052CC',
            backgroundColor: 'rgba(0, 82, 204, 0.1)',
            borderWidth: 3,
            fill: true,
            pointBackgroundColor: ['#DFE1E6', '#0052CC', '#00875A'],
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
        }]
    };

    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            tension: 0.4, // smooth curves
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: {
                            family: "'Inter', sans-serif",
                            size: 13
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    };

    // Destroy existing chart if re-rendering
    if (globalChartInstance) {
        globalChartInstance.destroy();
    }

    if (todoCount === 0 && inProgressCount === 0 && doneCount === 0) {
        // If no tasks exist, avoid passing all 0s directly to chart.js to prevent visual bugs
        // Instead, we could just show an empty grey ring, or hide the canvas. Let's do a grey ring.
        config.data.datasets[0].data = [1];
        config.data.labels = ['No tasks'];
        config.data.datasets[0].backgroundColor = ['#F4F5F7'];
    }

    try {
        globalChartInstance = new Chart(ctx, config);
    } catch (e) {
        console.error("Failed to create Global Task Chart:", e);
    }
}

// ==========================================================
// INITIALIZATION & EVENTS
// ==========================================================
function init() {
    setupEventListeners();
    fetchInitialData();
}

function setupEventListeners() {
    // Search
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderProjects(e.target.value);
        });
    }

    // Event Listeners removed since modals were removed for Employees

    // User Status logic
    const statusSelect = document.getElementById('user-status-select');
    const statusDot = document.getElementById('user-status-dot');

    if (statusSelect && statusDot) {
        // Load saved status
        const savedStatus = localStorage.getItem('nexboard_my_status') || 'available';
        statusSelect.value = savedStatus;
        updateStatusDot(savedStatus, statusDot);

        statusSelect.addEventListener('change', async (e) => {
            const newStatus = e.target.value;
            localStorage.setItem('nexboard_my_status', newStatus);
            const liveDot = document.getElementById('user-status-dot');
            if (liveDot) updateStatusDot(newStatus, liveDot);

            // Save to backend
            const currentUser = JSON.parse(localStorage.getItem('nexboard_currentUser') || '{}');
            if (currentUser.id) {
                try {
                    await fetch(`${API_URL}/users/${currentUser.id}/status`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                } catch (error) {
                    console.error("Failed to update status on server", error);
                }
            }
        });
    }
}

function updateStatusDot(status, dotEl) {
    if (status === 'available') dotEl.style.backgroundColor = '#36B37E';
    else if (status === 'busy') dotEl.style.backgroundColor = '#FF5630';
    else if (status === 'away') dotEl.style.backgroundColor = '#FFAB00';
}

// Spark it up
init();
