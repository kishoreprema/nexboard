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
if (currentUser.role !== 'pm' && currentUser.role !== 'admin') {
    window.location.href = 'login.html';
}

// Initial State (Will be loaded from Backend)
let projects = [];
let editingProjectId = null;
let users = [];
let pmUsers = []; // Users created by this PM or allocatable users

// Set UI name and Avatar
document.addEventListener('DOMContentLoaded', () => {
    const welcomeMsg = document.getElementById('welcome-msg');
    if (welcomeMsg) {
        welcomeMsg.innerText = `Welcome PM, ${currentUser.name}`;
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
async function fetchInitialData() {
    try {
        const [projectsRes, usersRes] = await Promise.all([
            fetch(`${API_URL}/projects?userId=${currentUser.id}&role=${currentUser.role}`),
            fetch(`${API_URL}/users`) // PM fetches all users so they can allocate them
        ]);

        if (projectsRes.ok) projects = await projectsRes.json();
        if (usersRes.ok) users = await usersRes.json();

        renderProjects();

        // Safely initialize charts
        try {
            if (typeof Chart !== 'undefined') {
                initChart();
                if (typeof renderAvailabilityChart === 'function') renderAvailabilityChart();
            } else {
                console.warn('Chart.js not loaded. Skipping charts.');
            }
        } catch (chartErr) {
            console.error('Chart init error:', chartErr);
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

const avatarColors = [
    '#0052CC', '#36B37E', '#FF5630', '#FFAB00', '#6554C0', '#00B8D9', '#FF7452', '#4C9AFF'
];

function getRandomColor() {
    return avatarColors[Math.floor(Math.random() * avatarColors.length)];
}

// DOM Elements
const projectsGrid = document.getElementById('projects-grid');
const searchInput = document.getElementById('project-search-input');
const createProjectBtn = document.getElementById('create-project-btn');
const projectModal = document.getElementById('project-modal');
const closeProjectModalBtn = document.getElementById('close-project-modal');
const cancelProjectBtn = document.getElementById('cancel-project');
const projectForm = document.getElementById('project-form');

const manageTeamBtn = document.getElementById('manage-team-btn');
const teamModal = document.getElementById('team-modal');
const closeTeamModalBtn = document.getElementById('close-team-modal');
const teamForm = document.getElementById('team-form');
const teamList = document.getElementById('team-list');

// ==========================================================
// RENDER LOGIC
// ==========================================================
function renderProjects(filterText = '') {
    projectsGrid.innerHTML = '';

    projects.forEach(project => {
        if (filterText && !project.name.toLowerCase().includes(filterText.toLowerCase()) && !(project.id || '').toLowerCase().includes(filterText.toLowerCase())) {
            return;
        }

        const card = document.createElement('div');
        card.classList.add('project-card');

        // When clicking a project card, redirect to the Kanban board
        card.addEventListener('click', (e) => {
            console.log(`[PMDashboard] Card clicked for project: ${project.id}. Event target:`, e.target);
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
                <div class="project-actions" style="display: flex; gap: 8px;">
                    <button class="export-btn" title="Export Project Data to CSV" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary); font-size: 1rem;"><i class="fa-solid fa-file-export" style="pointer-events: none;"></i></button>
                    <button class="access-btn" title="Manage Access" style="background: transparent; border: none; cursor: pointer; color: var(--text-primary); font-size: 1rem;"><i class="fa-solid fa-user-plus" style="pointer-events: none;"></i></button>
                    <button class="edit-btn" title="Edit Project" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary); font-size: 1rem;"><i class="fa-solid fa-pen" style="pointer-events: none;"></i></button>
                    <button class="delete-btn" title="Delete Project" style="background: transparent; border: none; cursor: pointer; color: var(--accent-red); font-size: 1rem;"><i class="fa-solid fa-trash" style="pointer-events: none;"></i></button>
                </div>
            </div>
            <p class="project-desc">${project.desc}</p>
            <div class="project-meta">
                <span class="project-key"><i class="fa-solid fa-key"></i> Key: ${project.id}</span>
                <span class="project-tasks"><i class="fa-solid fa-list-check"></i> ${project.taskCount} tasks</span>
            </div>
        `;

        // Export functionality
        card.querySelector('.export-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = `${API_URL}/projects/${project.id}/export`;
        });

        card.querySelector('.access-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openAccessModal(project.id, project.name);
        });

        card.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openProjectModal(project.id);
        });

        card.querySelector('.delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete project '${project.name}'?`)) {
                try {
                    const res = await fetch(`${API_URL}/projects/${project.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        projects = projects.filter(p => p.id !== project.id);
                        renderProjects(searchInput.value);
                    } else {
                        alert("Failed to delete project.");
                    }
                } catch (err) {
                    console.error("Error deleting project:", err);
                }
            }
        });

        projectsGrid.appendChild(card);
    });
}

// ==========================================================
// MODAL & NEW PROJECT LOGIC
// ==========================================================
function openProjectModal(projectId = null) {
    projectModal.classList.remove('hidden');
    const submitBtn = document.querySelector('#project-form button[type="submit"]');

    if (typeof projectId === 'string') {
        editingProjectId = projectId;
        const project = projects.find(p => p.id === projectId);
        document.getElementById('project-name').value = project.name;
        document.getElementById('project-key').value = project.id;
        document.getElementById('project-desc').value = project.desc;
        submitBtn.textContent = 'Update Project';
    } else {
        editingProjectId = null;
        projectForm.reset();
        submitBtn.textContent = 'Create Project';
    }

    document.getElementById('project-name').focus();
}

function closeProjectModal() {
    projectModal.classList.add('hidden');
    projectForm.reset();
    editingProjectId = null;
}

async function handleProjectSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('project-name').value.trim();
    const key = document.getElementById('project-key').value.trim().toUpperCase();
    const desc = document.getElementById('project-desc').value.trim();

    if (!name || !key) return;

    if (editingProjectId) {
        const projectIndex = projects.findIndex(p => p.id === editingProjectId);
        if (projectIndex > -1) {
            const updatedProject = { ...projects[projectIndex], name, desc };
            try {
                const res = await fetch(`${API_URL}/projects/${editingProjectId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedProject)
                });
                if (res.ok) {
                    projects[projectIndex] = updatedProject;
                    renderProjects(searchInput.value);
                    closeProjectModal();
                } else {
                    const errData = await res.json();
                    alert(`Failed to update project: ${errData.error || 'Unknown error'}`);
                }
            } catch (err) {
                console.error("Error updating project:", err);
                alert("Network error updating project.");
            }
        }
    } else {
        const newProject = {
            id: key,
            name,
            desc,
            taskCount: 0,
            managerId: currentUser.id
        };
        try {
            const res = await fetch(`${API_URL}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newProject)
            });
            if (res.ok) {
                projects.push(newProject);
                renderProjects(searchInput.value);
                closeProjectModal();
            } else {
                const errData = await res.json();
                alert(`Failed to create project: ${errData.error || 'Unknown error. Are you sure the Project Key is unique?'}`);
            }
        } catch (err) {
            console.error("Error creating project:", err);
            alert("Network error creating project.");
        }
    }
}

// ==========================================================
// TEAM MANAGEMENT LOGIC
// ==========================================================
function renderTeam() {
    teamList.innerHTML = '';
    if (users.length === 0) {
        teamList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; font-size: 0.9rem;">No team members yet.</p>';
        return;
    }

    users.forEach(user => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';
        div.style.padding = '8px';
        div.style.border = '1px solid var(--border-color)';
        div.style.borderRadius = 'var(--border-radius-sm)';

        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div class="user-avatar" style="width: 32px; height: 32px; border-radius: 50%; background-color: ${user.color}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem;">
                    ${user.initials}
                </div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 500; font-size: 0.95rem;">${user.name}</span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">${user.role}</span>
                </div>
            </div>
            <button class="delete-user-btn" data-id="${user.id}" style="background: transparent; border: none; cursor: pointer; color: var(--accent-red); padding: 4px;">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        div.querySelector('.delete-user-btn').addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm(`Remove ${user.name} from the team?`)) {
                try {
                    const res = await fetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        users = users.filter(u => u.id !== id);
                        renderTeam();
                    } else {
                        alert("Failed to delete user.");
                    }
                } catch (err) {
                    console.error("Error deleting user:", err);
                }
            }
        });

        teamList.appendChild(div);
    });
}

function openTeamModal() {
    renderTeam();
    teamModal.classList.remove('hidden');
    document.getElementById('new-user-name').focus();
}

function closeTeamModal() {
    teamModal.classList.add('hidden');
    teamForm.reset();
}

async function handleTeamSubmit(e) {
    if (e) e.preventDefault();
    console.log("Team submit clicked");
    try {
        const nameInput = document.getElementById('new-user-name');
        const emailInput = document.getElementById('new-user-email');
        const phoneInput = document.getElementById('new-user-phone');
        const name = nameInput.value.trim();
        const email = emailInput ? emailInput.value.trim() : '';
        const phone = phoneInput ? phoneInput.value.trim() : '';
        const roleInput = document.getElementById('new-user-role');
        const role = roleInput ? roleInput.value : 'employee'; // PMs can't create admins
        const passwordInput = document.getElementById('new-user-password');
        const password = passwordInput ? passwordInput.value : 'password123';

        if (!name) return;

        const newUser = {
            id: 'usr-' + Date.now(),
            name,
            email,
            phone,
            initials: getInitials(name),
            color: getRandomColor(),
            password,
            role
        };

        try {
            const res = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });

            if (res.ok) {
                users.push(newUser);
                nameInput.value = '';
                if (emailInput) emailInput.value = '';
                if (phoneInput) phoneInput.value = '';
                if (passwordInput) passwordInput.value = '';
                renderTeam();
            } else {
                const errData = await res.json();
                alert(`Failed to add user: ${errData.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error("Error adding user:", err);
            alert("Network error. Check console.");
        }
    } catch (err) {
        console.error("Javascript or Network Error creating user:", err);
        alert(`Error executing Add User: ${err.message}`);
    }
}

// ==========================================================
// ACCESS MANAGEMENT LOGIC
// ==========================================================
let currentAccessProjectId = null;
const accessModal = document.getElementById('access-modal');
const closeAccessModalBtn = document.getElementById('close-access-modal');
const accessList = document.getElementById('access-list');

async function openAccessModal(projectId, projectName) {
    currentAccessProjectId = projectId;
    document.getElementById('access-project-name').textContent = projectName;

    // Fetch users currently assigned to this project
    try {
        const res = await fetch(`${API_URL}/projects/${projectId}/users`);
        const assignedUsers = await res.json();
        const assignedIds = assignedUsers.map(u => u.id);

        renderAccessList(assignedIds);
        accessModal.classList.remove('hidden');
    } catch (err) {
        console.error("Failed to fetch project users", err);
    }
}

function closeAccessModal() {
    accessModal.classList.add('hidden');
    currentAccessProjectId = null;
}

function renderAccessList(assignedIds) {
    accessList.innerHTML = '';

    users.forEach(user => {
        if (user.role === 'admin') return; // Don't show admins here as they have global access

        const isAssigned = assignedIds.includes(user.id);
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';
        div.style.padding = '8px';
        div.style.border = '1px solid var(--border-color)';
        div.style.borderRadius = 'var(--border-radius-sm)';

        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div class="user-avatar" style="width: 32px; height: 32px; border-radius: 50%; background-color: ${user.color}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem;">
                    ${user.initials}
                </div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 500; font-size: 0.95rem;">${user.name}</span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">${user.role}</span>
                </div>
            </div>
            <button class="toggle-access-btn ${isAssigned ? 'assigned' : 'unassigned'}" data-id="${user.id}" data-assigned="${isAssigned}" style="padding: 6px 12px; border-radius: 4px; border: 1px solid ${isAssigned ? 'var(--accent-red)' : 'var(--primary-color)'}; background: ${isAssigned ? '#FFF0F0' : '#EAF2FF'}; color: ${isAssigned ? 'var(--accent-red)' : 'var(--primary-color)'}; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
                ${isAssigned ? 'Remove Access' : 'Grant Access'}
            </button>
        `;

        div.querySelector('.toggle-access-btn').addEventListener('click', async (e) => {
            const userId = e.currentTarget.dataset.id;
            const currentlyAssigned = e.currentTarget.dataset.assigned === 'true';

            try {
                if (currentlyAssigned) {
                    await fetch(`${API_URL}/projects/${currentAccessProjectId}/users/${userId}`, { method: 'DELETE' });
                } else {
                    await fetch(`${API_URL}/projects/${currentAccessProjectId}/users`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId })
                    });
                }
                // Refresh list
                const res = await fetch(`${API_URL}/projects/${currentAccessProjectId}/users`);
                const newAssignedUsers = await res.json();
                renderAccessList(newAssignedUsers.map(u => u.id));
            } catch (err) {
                console.error("Toggle access failed", err);
            }
        });

        accessList.appendChild(div);
    });
}

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

let availabilityChartInstance = null;

function renderAvailabilityChart() {
    const ctx = document.getElementById('availabilityChart');
    if (!ctx) return;

    let availableCount = 0;
    let busyCount = 0;
    let awayCount = 0;

    users.forEach(u => {
        const s = (u.status || 'available').toLowerCase();
        if (s === 'available') availableCount++;
        else if (s === 'busy') busyCount++;
        else if (s === 'away') awayCount++;
        else availableCount++;
    });

    const data = {
        labels: [`Available (${availableCount})`, `Busy (${busyCount})`, `Away (${awayCount})`],
        datasets: [{
            data: [availableCount, busyCount, awayCount],
            backgroundColor: ['#36B37E', '#FF5630', '#FFAB00'],
            borderColor: ['#fff', '#fff', '#fff'],
            borderWidth: 2,
            hoverOffset: 8
        }]
    };

    const config = {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 16,
                        font: {
                            family: "'Inter', sans-serif",
                            size: 12
                        },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const value = context.parsed;
                            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                            return ` ${context.label}: ${pct}%`;
                        }
                    }
                }
            }
        }
    };

    if (availabilityChartInstance) {
        availabilityChartInstance.destroy();
    }

    if (availableCount === 0 && busyCount === 0 && awayCount === 0) {
        config.data.datasets[0].data = [1];
        config.data.labels = ['No users'];
        config.data.datasets[0].backgroundColor = ['#F4F5F7'];
    }

    try {
        availabilityChartInstance = new Chart(ctx, config);
    } catch (e) {
        console.error("Failed to create Availability Chart:", e);
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

    // Modal Events
    createProjectBtn.addEventListener('click', () => openProjectModal());
    closeProjectModalBtn.addEventListener('click', closeProjectModal);
    cancelProjectBtn.addEventListener('click', closeProjectModal);

    // Close modal on outside click
    projectModal.addEventListener('click', e => {
        if (e.target === projectModal) {
            closeProjectModal();
        }
    });

    // Form Submit
    if (typeof projectForm !== 'undefined' && projectForm) {
        projectForm.addEventListener('submit', handleProjectSubmit);
    }

    // Team Modal Events
    manageTeamBtn.addEventListener('click', openTeamModal);
    closeTeamModalBtn.addEventListener('click', closeTeamModal);

    // Explicitly bind the button to bypass form validation quirks
    const teamSubmitBtn = document.getElementById('save-user-btn');
    if (teamSubmitBtn) {
        teamSubmitBtn.addEventListener('click', handleTeamSubmit);
    }

    teamModal.addEventListener('click', e => {
        if (e.target === teamModal) closeTeamModal();
    });

    if (closeAccessModalBtn) closeAccessModalBtn.addEventListener('click', closeAccessModal);
    if (accessModal) {
        accessModal.addEventListener('click', e => {
            if (e.target === accessModal) closeAccessModal();
        });
    }

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
