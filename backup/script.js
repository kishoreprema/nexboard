/**
 * NEXBOARD - JIRA CLONE LOGIC
 * Implements Drag and Drop, Task Creation, and Basic State Management.
 */

// Backend API URL
var API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : '/api';

// Auth Check
var currentUserLine = currentUserLine || localStorage.getItem('nexboard_currentUser');
if (!currentUserLine) {
    window.location.href = 'login.html';
}
var currentUser = currentUser || JSON.parse(currentUserLine);

// Query URL Params
const urlParams = new URLSearchParams(window.location.search);
const currentProjectId = urlParams.get('projectId');
const isOnBoard = window.location.pathname.includes('board.html');

if (!currentProjectId && isOnBoard) {
    // Redirect back to dashboard if no project specified ONLY if we are on the board page
    if (currentUser.role === 'admin') window.location.href = 'admin-dashboard.html';
    else if (currentUser.role === 'pm') window.location.href = 'pm-dashboard.html';
    else window.location.href = 'index.html';
}

// Initial State (Will be loaded from Backend)
let tasks = [];
let users = [];
let projects = [];

const avatarColors = ['#DE350B', '#00875A', '#FF991F', '#6554C0', '#0052CC', '#00A3BF', '#403294', '#0747A6'];

function getInitials(name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
}

function getRandomColor() {
    return avatarColors[Math.floor(Math.random() * avatarColors.length)];
}

let draggedTaskId = null;
let editingTaskId = null;
let taskCounter = 5; // To assign new NEX-X IDs. In a real DB, the backend handles this or we fetch max ID.

// Fetch initial data from backend (RENAME to avoid collision)
async function fetchBoardData() {
    try {
        if (!currentProjectId) return;

        const [tasksRes, usersRes, projectsRes] = await Promise.all([
            fetch(`${API_URL}/tasks?projectId=${currentProjectId}&userId=${currentUser.id}&role=${currentUser.role}`),
            fetch(`${API_URL}/users`), // Fetch all users so anyone can be assigned
            fetch(`${API_URL}/projects?userId=${currentUser.id}&role=${currentUser.role}`)
        ]);

        if (tasksRes.ok) tasks = await tasksRes.json();
        if (usersRes.ok) users = await usersRes.json();
        if (projectsRes.ok) projects = await projectsRes.json();

        // Set Board Title
        const boardTitle = document.getElementById('board-title');
        const currentProject = projects.find(p => String(p.id) === String(currentProjectId));
        if (currentProject && boardTitle) {
            boardTitle.innerText = currentProject.name;
            const subtitle = document.querySelector('.subtitle');
            if (subtitle) subtitle.innerText = currentProject.desc;
        }

        // Find max task ID to continue numbering
        if (tasks.length > 0) {
            const maxId = Math.max(...tasks.map(t => {
                const num = parseInt(t.id.split('-')[1]);
                return isNaN(num) ? 0 : num;
            }));
            taskCounter = maxId + 1;
        }

        renderTasks();
        try {
            if (typeof Chart !== 'undefined') {
                initProjectChart();
            } else {
                console.warn('Chart.js not loaded. Skipping project chart.');
            }
        } catch (chartErr) {
            console.error('Project chart init err:', chartErr);
        }

        setupChat();
        startChatPolling();
        loadChatMessages(); // Initial load to set baseline count
    } catch (error) {
        if (isOnBoard) {
            console.error('Failed to fetch board data:', error);
            alert('Could not connect to the backend server. Is it running?');
        } else {
            console.warn('Dashboard background chat fetch failed:', error.message);
        }
    }
}

// DOM Elements
const todoList = document.getElementById('todo-list');
const inProgressList = document.getElementById('in-progress-list');
const doneList = document.getElementById('done-list');
const lists = [todoList, inProgressList, doneList];

// Modal Elements
const modal = document.getElementById('task-modal');
const createTaskBtn = document.getElementById('add-task-btn');
const closeModalBtn = document.getElementById('close-modal');
const cancelTaskBtn = document.getElementById('cancel-task');
const taskForm = document.getElementById('task-form');
const searchInput = document.getElementById('search-input');

// Team Modal Elements
const manageTeamBtn = document.getElementById('manage-team-btn');
const teamModal = document.getElementById('team-modal');
const closeTeamModalBtn = document.getElementById('close-team-modal');
const teamForm = document.getElementById('team-form');
const teamList = document.getElementById('team-list');


// ==========================================================
// INITIALIZATION
// ==========================================================
// RENAME to avoid collision with dashboard scripts
function initBoard() {
    setupEventListeners();
    if (isOnBoard) {
        fetchBoardData();
    } else {
        // Just start chat features on dashboards
        setupChat();
        startChatPolling();
    }
}

// ==========================================================
// RENDER LOGIC
// ==========================================================
function renderTasks(filterText = '') {
    // Defensive check: if list containers don't exist, we're likely on a dashboard
    if (!todoList || !inProgressList || !doneList) return;

    // Clear current lists
    todoList.innerHTML = '';
    inProgressList.innerHTML = '';
    doneList.innerHTML = '';

    let todoCount = 0;
    let inProgressCount = 0;
    let doneCount = 0;

    tasks.forEach(task => {
        // Simple search filtering
        if (filterText && !task.title.toLowerCase().includes(filterText.toLowerCase())) {
            return;
        }

        const taskElement = createTaskElement(task);

        if (task.status === 'todo') {
            todoList.appendChild(taskElement);
            todoCount++;
        } else if (task.status === 'in-progress') {
            inProgressList.appendChild(taskElement);
            inProgressCount++;
        } else if (task.status === 'done') {
            doneList.appendChild(taskElement);
            doneCount++;
        }
    });

    // Update Counters
    document.getElementById('todo-count').textContent = todoCount;
    document.getElementById('in-progress-count').textContent = inProgressCount;
    document.getElementById('done-count').textContent = doneCount;
}

function createTaskElement(task) {
    const card = document.createElement('div');
    card.classList.add('task-card');
    card.setAttribute('draggable', 'true');
    card.dataset.id = task.id;

    // Badges/Icons HTML
    const typeIconClass = task.type === 'bug' ? 'fa-spider' : (task.type === 'feature' ? 'fa-star' : 'fa-check');
    const priorityIcon = `<span class="badge priority-${task.priority}">${task.priority}</span>`;

    let assigneeAvatarHtml = '';
    if (task.assigneeId) {
        const user = users.find(u => u.id === task.assigneeId);
        if (user) {
            assigneeAvatarHtml = `<div class="task-assignee-avatar" style="width: 24px; height: 24px; border-radius: 50%; background-color: ${user.color}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7rem; margin-right: 8px;" title="Assigned to ${user.name}">${user.initials}</div>`;
        }
    }

    // Due date badge
    let dueDateHtml = '';
    let dueSoonHtml = '';
    if (task.startDate || task.endDate) {
        const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        const endD = task.endDate ? new Date(task.endDate + 'T00:00:00') : null;
        const isOverdue = endD && endD < today && task.status !== 'done';
        const isDueToday = endD && endD.getTime() === today.getTime() && task.status !== 'done';
        const isDueTomorrow = endD && endD.getTime() === tomorrow.getTime() && task.status !== 'done';
        const isDone = task.status === 'done';
        const badgeColor = isDone ? '#00875A' : isOverdue ? '#DE350B' : (isDueToday || isDueTomorrow) ? '#FF8B00' : '#5E6C84';
        const badgeBg = isDone ? 'rgba(0,135,90,0.08)' : isOverdue ? 'rgba(222,53,11,0.08)' : (isDueToday || isDueTomorrow) ? 'rgba(255,139,0,0.1)' : 'rgba(94,108,132,0.08)';
        const label = task.startDate && task.endDate ? `${fmt(task.startDate)} – ${fmt(task.endDate)}` : task.endDate ? `Due ${fmt(task.endDate)}` : `Start ${fmt(task.startDate)}`;
        dueDateHtml = `<div style="display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: ${badgeColor}; background: ${badgeBg}; padding: 3px 8px; border-radius: 4px; margin-top: 8px; width: fit-content;"><i class="fa-regular fa-calendar"></i> ${isOverdue ? '⚠ ' : ''}${label}</div>`;

        // "Due in 1 day" or "Due today" warning badge
        if (isDueToday) {
            dueSoonHtml = `<div style="display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: #DE350B; background: rgba(222,53,11,0.1); padding: 3px 8px; border-radius: 4px; margin-top: 4px; width: fit-content; font-weight: 600;"><i class="fa-solid fa-clock"></i> ⏰ Due today!</div>`;
        } else if (isDueTomorrow) {
            dueSoonHtml = `<div style="display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: #FF8B00; background: rgba(255,139,0,0.1); padding: 3px 8px; border-radius: 4px; margin-top: 4px; width: fit-content; font-weight: 600;"><i class="fa-solid fa-clock"></i> ⏰ Due in 1 day</div>`;
        }
    }

    card.innerHTML = `
        <div class="task-content">
            <h4>${task.title}</h4>
            ${task.desc ? `<p class="task-desc">${task.desc}</p>` : ''}
            ${dueDateHtml}
            ${dueSoonHtml}
            <div class="task-dates" style="font-size: 0.72rem; color: var(--text-tertiary); margin-top: 6px;">
                ${task.createdAt ? `<div>Created: ${new Date(task.createdAt).toLocaleString()}</div>` : ''}
                ${task.inProgressAt ? `<div>Started: ${new Date(task.inProgressAt).toLocaleString()}</div>` : ''}
                ${task.completedAt ? `<div>Completed: ${new Date(task.completedAt).toLocaleString()}</div>` : ''}
            </div>
        </div>
        <div class="task-meta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
            <div style="display: flex; align-items: center;">
                <span class="type-${task.type}" title="${task.type}" style="margin-right: 8px;">
                    <i class="fa-solid ${typeIconClass}"></i>
                </span>
                <div class="task-badges" style="display: flex; align-items: center; gap: 4px;">
                    ${priorityIcon}
                    <span class="task-id">${task.id}</span>
                </div>
            </div>
            <div style="display: flex; align-items: center;">
                ${assigneeAvatarHtml}
                <div class="task-actions" style="display: flex; gap: 4px;">
                    <button class="edit-task-btn" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary); font-size: 0.9rem;" title="${currentUser.role === 'employee' ? 'Log Work' : 'Edit Task'}"><i class="fa-solid ${currentUser.role === 'employee' ? 'fa-clipboard-list' : 'fa-pen'}" style="pointer-events: none;"></i></button>
                    ${currentUser.role !== 'employee' ? `<button class="delete-task-btn" style="background: transparent; border: none; cursor: pointer; color: var(--accent-red); font-size: 0.9rem;"><i class="fa-solid fa-trash" style="pointer-events: none;"></i></button>` : ''}
                </div>
            </div>
        </div>
    `;

    // Attach edit/delete listeners
    card.querySelector('.edit-task-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(task.id);
    });

    const deleteBtn = card.querySelector('.delete-task-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete task '${task.title}'?`)) {
                try {
                    const res = await fetch(`${API_URL}/tasks/${task.id}?userId=${currentUser.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        tasks = tasks.filter(t => t.id !== task.id);
                        renderTasks(searchInput.value);
                    } else {
                        alert("Failed to delete task.");
                    }
                } catch (err) {
                    console.error("Error deleting task:", err);
                }
            }
        });
    }

    // Drag Events for the Card
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);

    return card;
}


// ==========================================================
// DRAG AND DROP LOGIC
// ==========================================================
function handleDragStart(e) {
    draggedTaskId = e.target.dataset.id;
    setTimeout(() => {
        e.target.classList.add('dragging');
    }, 0);
    // Required for Firefox
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedTaskId);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

// Setup drop zones for columns
function setupEventListeners() {
    // Column Drag & Drop
    lists.forEach(list => {
        list.addEventListener('dragover', e => {
            e.preventDefault(); // allow drop
            e.dataTransfer.dropEffect = 'move';

            // Highlight column to show it's a valid drop target
            const draggingCard = document.querySelector('.dragging');
            if (draggingCard) {
                list.classList.add('drag-over');
                // Insert indicator logic could go here (DOM reordering on hover)
                // For simplicity, we just append on drop currently
            }
        });

        list.addEventListener('dragleave', e => {
            list.classList.remove('drag-over');
        });

        list.addEventListener('drop', e => {
            e.preventDefault();
            list.classList.remove('drag-over');

            const columnId = list.parentElement.dataset.status;

            if (draggedTaskId) {
                updateTaskStatus(draggedTaskId, columnId);
            }
        });
    });

    // Modal Events
    if (createTaskBtn) {
        if (currentUser.role === 'employee') {
            createTaskBtn.style.display = 'none';
        } else {
            createTaskBtn.addEventListener('click', () => openModal());
        }
    }
    closeModalBtn.addEventListener('click', closeModal);
    cancelTaskBtn.addEventListener('click', closeModal);

    // Team Modal Events
    if (manageTeamBtn) {
        manageTeamBtn.addEventListener('click', openTeamModal);
        closeTeamModalBtn.addEventListener('click', closeTeamModal);
        teamForm.addEventListener('submit', handleTeamSubmit);
        teamModal.addEventListener('click', e => {
            if (e.target === teamModal) closeTeamModal();
        });
    }

    // Logout Event
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }

    // Dynamic Back Navigation based on Role
    const backBtn = document.getElementById('back-to-projects-btn');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentUser.role === 'admin') {
                window.location.href = 'admin-dashboard.html';
            } else if (currentUser.role === 'pm') {
                window.location.href = 'pm-dashboard.html';
            } else {
                window.location.href = 'index.html';
            }
        });
    }

    // Close modal on outside click
    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // Form Submit
    if (taskForm) {
        taskForm.addEventListener('submit', handleTaskSubmit);
    }

    // Add Remark Button
    const addRemarkBtn = document.getElementById('add-remark-btn');
    if (addRemarkBtn) {
        addRemarkBtn.addEventListener('click', async () => {
            const remarkInput = document.getElementById('remark-input');
            const remark = remarkInput.value.trim();
            if (!remark || !editingTaskId) return;

            try {
                const res = await fetch(`${API_URL}/tasks/${editingTaskId}/remarks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id, remark })
                });
                if (res.ok) {
                    remarkInput.value = '';
                    loadRemarks(editingTaskId);
                } else {
                    alert('Failed to add remark.');
                }
            } catch (err) {
                console.error('Error adding remark:', err);
            }
        });
    }
    // Search
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderTasks(e.target.value);
        });
    }

    // User Status logic
    const statusSelect = document.getElementById('user-status-select');
    const statusDot = document.getElementById('user-status-dot');

    if (statusSelect && statusDot) {
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

    initProjectChart();
}

function updateStatusDot(status, dotEl) {
    if (status === 'available') dotEl.style.backgroundColor = '#36B37E';
    else if (status === 'busy') dotEl.style.backgroundColor = '#FF5630';
    else if (status === 'away') dotEl.style.backgroundColor = '#FFAB00';
}

async function updateTaskStatus(taskId, newStatus) {
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex > -1) {
        // Optimistic update
        const oldStatus = tasks[taskIndex].status;
        const oldCompletedAt = tasks[taskIndex].completedAt;
        const oldInProgressAt = tasks[taskIndex].inProgressAt;

        tasks[taskIndex].status = newStatus;
        if (newStatus === 'done') {
            tasks[taskIndex].completedAt = new Date().toISOString();
        } else {
            tasks[taskIndex].completedAt = null;
        }

        if (newStatus === 'in-progress') {
            tasks[taskIndex].inProgressAt = oldInProgressAt || new Date().toISOString();
        } else if (newStatus === 'todo') {
            tasks[taskIndex].inProgressAt = null; // Reset if moved back to todo
        }

        renderTasks(searchInput.value);

        try {
            const res = await fetch(`${API_URL}/tasks/${taskId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: newStatus,
                    inProgressAt: tasks[taskIndex].inProgressAt,
                    userId: currentUser.id
                })
            });

            if (!res.ok) throw new Error("Failed to update status on server");

            const data = await res.json();
            if (data.completedAt !== undefined) {
                tasks[taskIndex].completedAt = data.completedAt;
            }
            if (data.inProgressAt !== undefined) {
                tasks[taskIndex].inProgressAt = data.inProgressAt;
            }
            renderTasks(searchInput.value);
        } catch (err) {
            console.error("Error updating status:", err);
            // Revert optimistic update on failure
            tasks[taskIndex].status = oldStatus;
            tasks[taskIndex].completedAt = oldCompletedAt;
            tasks[taskIndex].inProgressAt = oldInProgressAt;
            renderTasks(searchInput.value);
            alert("Could not save status change to the server.");
        }
    }
}


// ==========================================================
// MODAL & TASK CREATION
// ==========================================================
function openModal(taskId = null) {
    modal.classList.remove('hidden');
    const submitBtn = document.querySelector('#task-form button[type="submit"]');
    const assigneeSelect = document.getElementById('task-assignee');
    const remarksSection = document.getElementById('remarks-section');
    const activityLogSection = document.getElementById('activity-log-section');
    const isEmployee = currentUser.role === 'employee';

    // List of form fields to disable for employees
    const formFields = [
        document.getElementById('task-title'),
        document.getElementById('task-desc'),
        document.getElementById('task-priority'),
        document.getElementById('task-type'),
        document.getElementById('task-assignee'),
        document.getElementById('task-start-date'),
        document.getElementById('task-end-date')
    ];

    // Populate assignees
    assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
    const currentUsers = users || [];
    const employees = currentUsers.filter(u => u.role === 'employee');
    employees.forEach(u => {
        assigneeSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`;
    });

    // Hide remarks and activity by default
    if (remarksSection) remarksSection.style.display = 'none';
    if (activityLogSection) activityLogSection.style.display = 'none';

    // Enable all fields by default (reset from previous employee view)
    formFields.forEach(f => { if (f) f.disabled = false; });
    if (submitBtn) submitBtn.style.display = '';

    // Restore form groups if they were hidden for employees
    const modalBody = document.querySelector('#task-form .modal-body');
    if (modalBody) {
        modalBody.querySelectorAll('.form-group, .form-group-row').forEach(g => g.style.display = '');
    }
    const existingSummary = document.getElementById('employee-task-summary');
    if (existingSummary) existingSummary.style.display = 'none';

    if (typeof taskId === 'string') {
        editingTaskId = taskId;
        const task = tasks.find(t => t.id === taskId);
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-desc').value = task.desc || '';
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-type').value = task.type;
        document.getElementById('task-assignee').value = task.assigneeId || '';

        // Populate start/end dates
        document.getElementById('task-start-date').value = task.startDate || '';
        document.getElementById('task-end-date').value = task.endDate || '';

        const datesDisplay = document.getElementById('task-dates-display');
        const createdDateEl = document.getElementById('task-created-date');
        const inProgressDateEl = document.getElementById('task-in-progress-date');
        const completedDateEl = document.getElementById('task-completed-date');

        if (datesDisplay && createdDateEl && completedDateEl) {
            datesDisplay.style.display = 'block';
            createdDateEl.innerHTML = task.createdAt ? `<strong>Created:</strong> ${new Date(task.createdAt).toLocaleString()}` : '<strong>Created:</strong> N/A';

            if (inProgressDateEl) {
                inProgressDateEl.innerHTML = task.inProgressAt ? `<strong>Started:</strong> ${new Date(task.inProgressAt).toLocaleString()}` : '<strong>Started:</strong> Not started';
            }

            completedDateEl.innerHTML = task.completedAt ? `<strong>Completed:</strong> ${new Date(task.completedAt).toLocaleString()}` : '<strong>Completed:</strong> Not yet completed';
        }

        if (isEmployee) {
            // READ-ONLY mode for employees — hide form fields, show compact summary
            document.querySelector('.modal-header h2').textContent = 'Log Work — ' + task.title;
            if (submitBtn) submitBtn.style.display = 'none';

            // Hide all form-group elements to free up space
            const modalBody = document.querySelector('#task-form .modal-body');
            const formGroups = modalBody.querySelectorAll('.form-group, .form-group-row');
            formGroups.forEach(g => g.style.display = 'none');

            // Also hide dates display (we'll show inline instead)
            if (datesDisplay) datesDisplay.style.display = 'none';

            // Inject a compact task summary at the top
            let summaryDiv = document.getElementById('employee-task-summary');
            if (!summaryDiv) {
                summaryDiv = document.createElement('div');
                summaryDiv.id = 'employee-task-summary';
                modalBody.insertBefore(summaryDiv, modalBody.firstChild);
            }

            const assignee = users.find(u => u.id === task.assigneeId);
            summaryDiv.style.display = 'block';
            summaryDiv.innerHTML = `
                <div style="background: var(--bg-main); border-radius: var(--border-radius-sm); padding: 14px; border: 1px solid var(--border-color); font-size: 0.9rem; line-height: 1.7;">
                    ${task.desc ? `<div style="color: var(--text-secondary); margin-bottom: 8px;">${task.desc}</div>` : ''}
                    <div><strong>Priority:</strong> <span class="badge priority-${task.priority}">${task.priority}</span> &nbsp; <strong>Type:</strong> ${task.type}</div>
                    <div><strong>Assignee:</strong> ${assignee ? assignee.name : 'Unassigned'}</div>
                    ${task.startDate ? `<div><strong>Start:</strong> ${task.startDate} &nbsp; <strong>End:</strong> ${task.endDate || 'N/A'}</div>` : ''}
                    <div style="margin-top: 4px; font-size: 0.8rem; color: var(--text-tertiary);">
                        Created: ${task.createdAt ? new Date(task.createdAt).toLocaleString() : 'N/A'}
                        ${task.inProgressAt ? ' · Started: ' + new Date(task.inProgressAt).toLocaleString() : ''}
                        ${task.completedAt ? ' · Completed: ' + new Date(task.completedAt).toLocaleString() : ''}
                    </div>
                </div>
            `;

            // Show remarks for ALL statuses for employees
            if (remarksSection) {
                remarksSection.style.display = 'block';
                loadRemarks(taskId);
            }
            if (activityLogSection) {
                activityLogSection.style.display = 'block';
                loadActivityLog(taskId);
            }
        } else {
            // Full edit mode for PM/Admin
            document.querySelector('.modal-header h2').textContent = 'Update Task';
            submitBtn.textContent = 'Update Task';

            // Show remarks for all tasks so PM/Admin can review employee work
            if (remarksSection) {
                remarksSection.style.display = 'block';
                loadRemarks(taskId);
            }
            if (activityLogSection) {
                activityLogSection.style.display = 'block';
                loadActivityLog(taskId);
            }
        }
    } else {
        editingTaskId = null;
        taskForm.reset();
        document.querySelector('.modal-header h2').textContent = 'Create New Task';
        submitBtn.textContent = 'Create Task';
        document.getElementById('task-start-date').value = '';
        document.getElementById('task-end-date').value = '';

        const datesDisplay = document.getElementById('task-dates-display');
        if (datesDisplay) datesDisplay.style.display = 'none';
    }

    document.getElementById('task-title').focus();
}

async function loadRemarks(taskId) {
    const remarksList = document.getElementById('remarks-list');
    if (!remarksList) return;
    remarksList.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center;">Loading...</p>';

    try {
        const res = await fetch(`${API_URL}/tasks/${taskId}/remarks`);
        if (res.ok) {
            const remarks = await res.json();
            if (remarks.length === 0) {
                remarksList.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center;">No remarks yet.</p>';
            } else {
                remarksList.innerHTML = remarks.map(r => {
                    const date = new Date(r.remarkDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const time = new Date(r.remarkDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    return `<div style="display: flex; gap: 8px; align-items: flex-start; padding: 8px; background: white; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="width: 28px; height: 28px; border-radius: 50%; background: ${r.color || '#0052CC'}; color: white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; flex-shrink: 0;">${r.initials || '??'}</div>
                        <div style="flex: 1;">
                            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 2px;"><strong>${r.userName || 'User'}</strong> &middot; ${date} ${time}</div>
                            <div style="font-size: 0.85rem; color: var(--text-primary);">${r.remark}</div>
                        </div>
                    </div>`;
                }).join('');
            }
        }
    } catch (err) {
        remarksList.innerHTML = '<p style="color: var(--accent-red); font-size: 0.85rem; text-align: center;">Failed to load remarks.</p>';
        console.error(err);
    }
}

async function loadActivityLog(taskId) {
    const activityList = document.getElementById('activity-log-list');
    if (!activityList) return;
    activityList.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center;">Loading...</p>';

    try {
        const res = await fetch(`${API_URL}/activity/task/${taskId}`);
        if (res.ok) {
            const activities = await res.json();
            if (activities.length === 0) {
                activityList.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center;">No activity yet.</p>';
            } else {
                activityList.innerHTML = activities.map(a => {
                    const time = new Date(a.createdAt).toLocaleString();
                    let iconClass = 'fa-circle-info';
                    let iconColor = 'var(--text-secondary)';

                    if (a.action === 'created') { iconClass = 'fa-plus-circle'; iconColor = 'var(--accent-green)'; }
                    else if (a.action === 'status_changed') { iconClass = 'fa-arrows-rotate'; iconColor = 'var(--primary-blue)'; }
                    else if (a.action === 'assigned') { iconClass = 'fa-user-plus'; iconColor = 'var(--accent-purple)'; }
                    else if (a.action === 'updated') { iconClass = 'fa-pen-to-square'; iconColor = 'var(--accent-yellow)'; }

                    return `
                        <div class="activity-item">
                            <div class="activity-user-icon" style="background: ${a.color || '#5E6C84'}">${a.initials || '??'}</div>
                            <div class="activity-content">
                                <div class="activity-header">
                                    <strong>${a.userName || 'System'}</strong> &middot; ${new Date(a.createdAt).toLocaleDateString()}
                                </div>
                                <div class="activity-details">
                                    <i class="fa-solid ${iconClass}" style="color: ${iconColor}; font-size: 0.8rem; margin-right: 4px;"></i>
                                    ${a.details}
                                </div>
                                <div class="activity-time">${new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (err) {
        activityList.innerHTML = '<p style="color: var(--accent-red); font-size: 0.85rem; text-align: center;">Failed to load activity.</p>';
        console.error(err);
    }
}

function closeModal() {
    modal.classList.add('hidden');
    taskForm.reset();
    editingTaskId = null;
}

async function handleTaskSubmit(e) {
    e.preventDefault();

    const title = document.getElementById('task-title').value.trim();
    const desc = document.getElementById('task-desc').value.trim();
    const priority = document.getElementById('task-priority').value;
    const type = document.getElementById('task-type').value;
    const assigneeId = document.getElementById('task-assignee').value;
    const startDate = document.getElementById('task-start-date').value || null;
    const endDate = document.getElementById('task-end-date').value || null;

    if (!title) return;

    if (editingTaskId) {
        const taskIndex = tasks.findIndex(t => t.id === editingTaskId);
        if (taskIndex > -1) {
            const body = {
                title, desc, priority, type, assigneeId, startDate, endDate,
                updatedByUserId: currentUser.id
            };

            try {
                const res = await fetch(`${API_URL}/tasks/${editingTaskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (res.ok) {
                    const data = await res.json();
                    tasks[taskIndex] = { ...tasks[taskIndex], ...body, completedAt: data.completedAt, inProgressAt: data.inProgressAt };
                    renderTasks(searchInput && searchInput.value ? searchInput.value : '');
                    closeModal();
                } else {
                    alert("Failed to update task.");
                }
            } catch (err) {
                console.error("Error updating task:", err);
            }
        }
    } else {
        const body = {
            id: 'TASK-' + Date.now(),
            title, desc, priority, type, assigneeId, startDate, endDate,
            projectId: currentProjectId,
            status: 'todo',
            createdByUserId: currentUser.id
        };

        try {
            const res = await fetch(`${API_URL}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const createdTask = await res.json();
                tasks.push(createdTask);
                renderTasks(searchInput && searchInput.value ? searchInput.value : '');
                closeModal();
            } else {
                const errData = await res.json();
                alert(`Failed to create task: ${errData.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error("Error creating task:", err);
            alert("Network error creating task.");
        }
    }
}

// Removed Team Management from board view as it is handled in dashboards, but just in case keeping it minimal or deleting it
function renderTeam() {
    // Handled in dashboard now
}

// ==========================================================
// CHART LOGIC
// ==========================================================
let projectChartInstance = null;

function initProjectChart() {
    const ctx = document.getElementById('project-task-chart');
    if (!ctx) {
        console.log('[Chart] Chart container not found, skipping chart init (likely dashboard view)');
        return;
    }

    let todoCount = 0;
    let inProgressCount = 0;
    let doneCount = 0;

    tasks.forEach(t => {
        if (t.status === 'todo') todoCount++;
        else if (t.status === 'in-progress') inProgressCount++;
        else if (t.status === 'done') doneCount++;
    });

    const data = {
        labels: ['To Do', 'In Progress', 'Done'],
        datasets: [{
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
            tension: 0.4,
            plugins: {
                legend: {
                    display: false // Hide legend to save space
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

    if (projectChartInstance) {
        projectChartInstance.destroy();
    }

    try {
        projectChartInstance = new Chart(ctx, config);
    } catch (e) {
        console.error("Failed to create Project Task Chart:", e);
    }
}

// ==========================================================
// PROJECT CHAT SYSTEM
// ==========================================================
// NOTE: Chat logic has been extracted to chat-widget.js to enable global dashboard notifications safely.

// Spark it up
initBoard();
