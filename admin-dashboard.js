/**
 * NEXBOARD - ADMIN DASHBOARD LOGIC
 * Implements user management and global project oversight.
 */

// Backend API URL
const API_URL = '/api';

// Auth Check
const currentUserLine = localStorage.getItem('nexboard_currentUser');
if (!currentUserLine) {
    console.warn('[AdminDashboard] No current user found. Redirecting...');
    window.location.href = 'login.html';
    // Throwing an error here stops script execution
    throw new Error('Not logged in');
}
const currentUser = JSON.parse(currentUserLine);
if (currentUser.role !== 'admin') {
    console.warn('[AdminDashboard] User is not admin. Redirecting...');
    window.location.href = 'login.html';
    throw new Error('Unauthorized');
}

// Global error handler for easier debugging
window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.error(`[AdminDashboardError] ${msg} at ${lineNo}:${columnNo}`);
    return false;
};

// Initial State (Will be loaded from Backend)
let projects = [];
let editingProjectId = null;
let users = [];
let editingUserId = null;

// Set UI name and Avatar
document.addEventListener('DOMContentLoaded', () => {
    const welcomeMsg = document.getElementById('welcome-msg');
    if (welcomeMsg) {
        welcomeMsg.innerText = `Welcome Admin, ${currentUser.name}`;
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
            fetch(`${API_URL}/users`)
        ]);

        if (projectsRes.ok) projects = await projectsRes.json();
        if (usersRes.ok) users = await usersRes.json();

        renderProjects();
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
const avatarColors = ['#0052CC', '#00875A', '#FF5630', '#FFAB00', '#36B37E', '#6554C0'];

function getInitials(name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
}

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
const projectManagerSelect = document.getElementById('project-manager');

// Delete Modal DOM Elements
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete');
const cancelDeleteBtn = document.getElementById('cancel-delete');
let projectToDelete = null;

const manageTeamBtn = document.getElementById('manage-team-btn');
const teamModal = document.getElementById('team-modal');
const closeTeamModalBtn = document.getElementById('close-team-modal');
const teamForm = document.getElementById('team-form');
const teamList = document.getElementById('team-list');

// ==========================================================
// RENDER LOGIC
// ==========================================================
function renderProjects(filterText = '') {
    if (!projectsGrid) {
        console.error('[AdminDashboard] projectsGrid element not found, cannot render projects');
        return;
    }

    projectsGrid.innerHTML = '';

    if (!projects || projects.length === 0) {
        projectsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px 24px; color: var(--text-secondary); background: var(--bg-surface); border-radius: var(--border-radius-lg); border: 2px dashed var(--border-color);">
                <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 16px; color: var(--border-color);"></i>
                <h3 style="margin-bottom: 8px; color: var(--text-primary); font-size: 1.25rem;">No Projects Found</h3>
                <p>Click "Create Project" to get started.</p>
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

        // When clicking a project card, redirect to the Kanban board with projectId
        card.addEventListener('click', (e) => {
            console.log(`[AdminDashboard] Card clicked for project: ${project.id}. Event target:`, e.target);
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
                    <button class="edit-btn" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary); font-size: 1rem;"><i class="fa-solid fa-pen" style="pointer-events: none;"></i></button>
                    <button class="delete-btn" style="background: transparent; border: none; cursor: pointer; color: var(--accent-red); font-size: 1rem;"><i class="fa-solid fa-trash" style="pointer-events: none;"></i></button>
                </div>
            </div>
            <p class="project-desc">${project.desc}</p>
            <div class="project-meta">
                <span class="project-key"><i class="fa-solid fa-key"></i> Key: ${project.id}</span>
                <span class="project-tasks"><i class="fa-solid fa-list-check"></i> ${project.taskCount} tasks</span>
            </div>
        `;

        // Export functionality (downloads CSV)
        card.querySelector('.export-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = `${API_URL}/projects/${project.id}/export`;
        });

        card.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openProjectModal(project.id);
        });

        card.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            projectToDelete = project.id;
            deleteModal.classList.remove('hidden');
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

    // Populate PM dropdown
    projectManagerSelect.innerHTML = '<option value="">No Manager Assigned</option>';
    const pms = users.filter(u => u.role === 'pm');
    pms.forEach(pm => {
        const option = document.createElement('option');
        option.value = pm.id;
        option.textContent = pm.name;
        projectManagerSelect.appendChild(option);
    });

    if (typeof projectId === 'string') {
        editingProjectId = projectId;
        const project = projects.find(p => p.id === projectId);
        document.getElementById('project-name').value = project.name;
        document.getElementById('project-key').value = project.id;
        document.getElementById('project-desc').value = project.desc;
        projectManagerSelect.value = project.managerId || '';
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
    const managerId = document.getElementById('project-manager').value;

    if (!name || !key) return;

    if (editingProjectId) {
        const projectIndex = projects.findIndex(p => p.id === editingProjectId);
        if (projectIndex > -1) {
            const updatedProject = { ...projects[projectIndex], name, desc, managerId: managerId || null };
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
            managerId: managerId || null
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

// Delete Custom Modal Handlers
cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    projectToDelete = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (!projectToDelete) return;

    const originalText = confirmDeleteBtn.textContent;
    confirmDeleteBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Deleting...';
    confirmDeleteBtn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/projects/${projectToDelete}`, { method: 'DELETE' });
        if (res.ok) {
            projects = projects.filter(p => p.id !== projectToDelete);
            renderProjects(searchInput.value);
            deleteModal.classList.add('hidden');
        } else {
            alert("Failed to delete project.");
        }
    } catch (err) {
        console.error("Error deleting project:", err);
    } finally {
        confirmDeleteBtn.innerHTML = originalText;
        confirmDeleteBtn.disabled = false;
        projectToDelete = null;
    }
});

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
            <div style="display: flex; gap: 8px;">
                <button class="edit-user-btn" data-id="${user.id}" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary); padding: 4px;">
                    <i class="fa-solid fa-pen" style="pointer-events: none;"></i>
                </button>
                <button class="delete-user-btn" data-id="${user.id}" style="background: transparent; border: none; cursor: pointer; color: var(--accent-red); padding: 4px;">
                    <i class="fa-solid fa-trash" style="pointer-events: none;"></i>
                </button>
            </div>
        `;

        const editBtn = div.querySelector('.edit-user-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;

                // Prevent editing the default admin to avoid lockouts during testing
                if (id === 'admin-1') {
                    alert("You cannot edit the default system admin.");
                    return;
                }

                editingUserId = id;
                const userToEdit = users.find(u => u.id === id);

                document.getElementById('new-user-name').value = userToEdit.name;
                document.getElementById('new-user-email').value = userToEdit.email || '';
                document.getElementById('new-user-phone').value = userToEdit.phone || '';
                document.getElementById('new-user-role').value = userToEdit.role;
                document.getElementById('new-user-password').value = '********'; // Masked
                document.getElementById('new-user-password').disabled = true; // Can't change password here for now

                document.getElementById('team-form-title').textContent = 'Edit User';
                const submitBtn = document.getElementById('save-user-btn') || document.querySelector('#team-form button[type="submit"]');
                if (submitBtn) submitBtn.textContent = 'Update User';
                document.getElementById('cancel-edit-user').classList.remove('hidden');
            });
        }

        const deleteBtn = div.querySelector('.delete-user-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;

                // Prevent deleting the default admin or yourself
                if (id === 'admin-1' || id === currentUser.id) {
                    alert("You cannot delete the default admin or yourself.");
                    return;
                }

                if (confirm(`Remove ${user.name} from the system?`)) {
                    const originalHtml = e.currentTarget.innerHTML;
                    e.currentTarget.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    e.currentTarget.disabled = true;

                    try {
                        const res = await fetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
                        if (res.ok) {
                            users = users.filter(u => u.id !== id);
                            renderTeam();
                        } else {
                            alert("Failed to delete user.");
                            e.currentTarget.innerHTML = originalHtml;
                            e.currentTarget.disabled = false;
                        }
                    } catch (err) {
                        console.error("Error deleting user:", err);
                        e.currentTarget.innerHTML = originalHtml;
                        e.currentTarget.disabled = false;
                    }
                }
            });
        }

        teamList.appendChild(div);
    });
}

function openTeamModal() {
    renderTeam();
    resetTeamForm();
    teamModal.classList.remove('hidden');
    document.getElementById('new-user-name').focus();
}

function closeTeamModal() {
    teamModal.classList.add('hidden');
    resetTeamForm();
}

function resetTeamForm() {
    teamForm.reset();
    editingUserId = null;
    document.getElementById('new-user-password').disabled = false;

    // Safely update title and button if they exist
    const titleEl = document.getElementById('team-form-title');
    if (titleEl) titleEl.textContent = 'Add New User';

    // The submit button in the HTML might not have an ID, so query by selector
    const submitBtn = document.getElementById('save-user-btn') || teamForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Create User';

    const cancelBtn = document.getElementById('cancel-edit-user');
    if (cancelBtn) cancelBtn.classList.add('hidden');
}

document.getElementById('cancel-edit-user')?.addEventListener('click', resetTeamForm);

async function handleTeamSubmit(e) {
    if (e) e.preventDefault();
    console.log("Team submit clicked");

    const nameInput = document.getElementById('new-user-name');
    const emailInput = document.getElementById('new-user-email');
    const phoneInput = document.getElementById('new-user-phone');
    const name = nameInput.value.trim();
    const email = emailInput ? emailInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const roleInput = document.getElementById('new-user-role');
    const role = roleInput ? roleInput.value : 'employee';
    const passwordInput = document.getElementById('new-user-password');
    const password = passwordInput ? passwordInput.value : 'password123';

    if (!name) return;

    if (editingUserId) {
        // UPDATE EXISTING USER
        const updatedUserData = { name, email, phone, role };

        try {
            const res = await fetch(`${API_URL}/users/${editingUserId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedUserData)
            });

            if (res.ok) {
                // Update local state
                const userIndex = users.findIndex(u => u.id === editingUserId);
                if (userIndex > -1) {
                    users[userIndex] = { ...users[userIndex], ...updatedUserData, initials: getInitials(name) };
                }
                resetTeamForm();
                renderTeam();
            } else {
                const errData = await res.json();
                alert(`Failed to update user: ${errData.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error("Error updating user:", err);
            alert("Network error updating user. Check console.");
        }
    } else {
        // CREATE NEW USER
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
                resetTeamForm();
                renderTeam();
            } else {
                const errData = await res.json();
                alert(`Failed to add user: ${errData.error || 'Unknown error. Check console.'}`);
            }
        } catch (err) {
            console.error("Error creating user:", err);
            alert("Network error. Check console.");
        }
    }
}

// ==========================================================
// CHART LOGIC
// ==========================================================
let globalChartInstance = null;

async function initChart() {
    const ctx = document.getElementById('global-task-chart');
    if (!ctx) return;

    let tasksForChart = [];
    try {
        const res = await fetch(`${API_URL}/tasks?userId=${currentUser.id}&role=${currentUser.role}`);
        if (res.ok) {
            tasksForChart = await res.json();
        } else {
            console.error("Failed to fetch tasks for chart, status:", res.status);
            // It's not a fatal error if there are no tasks, just don't re-throw to avoid the alert
        }
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
            label: 'Tasks',
            data: [todoCount, inProgressCount, doneCount],
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
    console.log('[AdminDashboard] Starting setupEventListeners');

    // Search
    if (searchInput) {
        console.log('[AdminDashboard] Attaching searchInput listener');
        searchInput.addEventListener('input', (e) => {
            renderProjects(e.target.value);
        });
    }

    // Modal Events
    if (createProjectBtn) {
        console.log('[AdminDashboard] Attaching createProjectBtn listener');
        createProjectBtn.addEventListener('click', () => openProjectModal());
    } else {
        console.warn('[AdminDashboard] createProjectBtn (#create-project-btn) not found');
    }

    if (closeProjectModalBtn) {
        console.log('[AdminDashboard] Attaching closeProjectModalBtn listener');
        closeProjectModalBtn.addEventListener('click', closeProjectModal);
    }
    if (cancelProjectBtn) {
        console.log('[AdminDashboard] Attaching cancelProjectBtn listener');
        cancelProjectBtn.addEventListener('click', closeProjectModal);
    }

    // Close modal on outside click
    if (projectModal) {
        console.log('[AdminDashboard] Attaching projectModal listener');
        projectModal.addEventListener('click', e => {
            if (e.target === projectModal) closeProjectModal();
        });
    }

    // Form Submit
    if (projectForm) {
        console.log('[AdminDashboard] Attaching projectForm submit listener');
        projectForm.addEventListener('submit', handleProjectSubmit);
    }

    // Team Modal Events
    if (manageTeamBtn) {
        console.log('[AdminDashboard] Attaching manageTeamBtn listener');
        manageTeamBtn.addEventListener('click', openTeamModal);
    } else {
        console.warn('[AdminDashboard] manageTeamBtn (#manage-team-btn) not found');
    }

    if (closeTeamModalBtn) {
        console.log('[AdminDashboard] Attaching closeTeamModalBtn listener');
        closeTeamModalBtn.addEventListener('click', closeTeamModal);
    }

    // Explicitly bind the button
    const teamSubmitBtn = document.getElementById('save-user-btn');
    if (teamSubmitBtn) {
        console.log('[AdminDashboard] Attaching teamSubmitBtn listener');
        teamSubmitBtn.addEventListener('click', handleTeamSubmit);
    }

    if (teamModal) {
        console.log('[AdminDashboard] Attaching teamModal listener');
        teamModal.addEventListener('click', e => {
            if (e.target === teamModal) closeTeamModal();
        });
    }

    // User Status logic
    const statusSelect = document.getElementById('user-status-select');
    const statusDot = document.getElementById('user-status-dot');

    if (statusSelect && statusDot) {
        console.log('[AdminDashboard] Attaching statusSelect listener');
        const savedStatus = localStorage.getItem('nexboard_my_status') || 'available';
        statusSelect.value = savedStatus;
        updateStatusDot(savedStatus, statusDot);

        statusSelect.addEventListener('change', async (e) => {
            const newStatus = e.target.value;
            localStorage.setItem('nexboard_my_status', newStatus);
            const liveDot = document.getElementById('user-status-dot');
            if (liveDot) updateStatusDot(newStatus, liveDot);

            const currentUser = JSON.parse(localStorage.getItem('nexboard_currentUser') || '{}');
            if (currentUser.id) {
                try {
                    await fetch(`${API_URL}/users/${currentUser.id}/status`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                } catch (error) {
                    console.error("[AdminDashboard] Failed to update status on server", error);
                }
            }
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        console.log('[AdminDashboard] Attaching logoutBtn listener');
        logoutBtn.addEventListener('click', () => {
            console.log('[AdminDashboard] Logout button clicked - performing cleanup');
            localStorage.removeItem('nexboard_currentUser');
            window.location.href = 'login.html';
        });
    } else {
        console.error('[AdminDashboard] logoutBtn (#logout-btn) not found');
    }

    console.log('[AdminDashboard] Finished setupEventListeners');
}

function updateStatusDot(status, dotEl) {
    if (status === 'available') dotEl.style.backgroundColor = '#36B37E';
    else if (status === 'busy') dotEl.style.backgroundColor = '#FF5630';
    else if (status === 'away') dotEl.style.backgroundColor = '#FFAB00';
}

// Spark it up
init();
