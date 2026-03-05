const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const nodemailer = require('nodemailer');

// Gmail SMTP Transport
const mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'kishoreprema2001@gmail.com',
        pass: 'wkrh mbwk rmam sqdq'
    }
});

// Helper: Send notification email (fire-and-forget, non-blocking)
function sendNotificationEmail(toEmail, subject, htmlBody) {
    if (!toEmail) return;
    const mailOptions = {
        from: '"NexBoard" <kishoreprema2001@gmail.com>',
        to: toEmail,
        subject: subject,
        html: htmlBody
    };
    mailTransporter.sendMail(mailOptions, (err, info) => {
        if (err) console.error('Email send error:', err.message);
        else console.log('Email sent:', info.response);
    });
}

// Helper: Look up user email and send notification
function notifyUserByEmail(userId, subject, htmlBody) {
    if (!userId) return;
    db.get("SELECT email FROM users WHERE id = ?", [userId], (err, row) => {
        if (row && row.email) {
            sendNotificationEmail(row.email, subject, htmlBody);
        }
    });
}

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Initialize SQLite Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Create tables
        db.serialize(() => {
            // Users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                initials TEXT,
                color TEXT,
                password TEXT NOT NULL,
                role TEXT NOT NULL, -- 'admin', 'pm', 'employee'
                avatarUrl TEXT,
                status TEXT DEFAULT 'available'
            )`);

            // Projects table
            db.run(`CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                desc TEXT,
                taskCount INTEGER DEFAULT 0,
                managerId TEXT -- ID of the PM who created it
            )`);

            // Project Users (Many-to-Many allocation)
            db.run(`CREATE TABLE IF NOT EXISTS project_users (
                projectId TEXT,
                userId TEXT,
                PRIMARY KEY (projectId, userId)
            )`);

            // Tasks table
            db.run(`CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                desc TEXT,
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                type TEXT NOT NULL,
                assigneeId TEXT,
                projectId TEXT NOT NULL,
                createdAt TEXT,
                completedAt TEXT,
                inProgressAt TEXT,
                startDate TEXT,
                endDate TEXT
            )`);

            // Task Remarks table
            db.run(`CREATE TABLE IF NOT EXISTS task_remarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                taskId TEXT NOT NULL,
                userId TEXT NOT NULL,
                remark TEXT NOT NULL,
                remarkDate TEXT NOT NULL
            )`);

            // Messages table (Project Chat)
            db.run(`CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                projectId TEXT NOT NULL,
                userId TEXT NOT NULL,
                message TEXT NOT NULL,
                mentionedUserId TEXT,
                createdAt TEXT NOT NULL
            )`);

            // Task Activity Log table
            db.run(`CREATE TABLE IF NOT EXISTS task_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                taskId TEXT NOT NULL,
                userId TEXT,
                action TEXT NOT NULL,
                details TEXT,
                createdAt TEXT NOT NULL
            )`);

            // The ALTER TABLE statements below are for adding columns to an existing database.
            // For a fresh database, the above CREATE TABLE statement is sufficient.
            // If you're running this on an existing database, you might need to run these manually once.
            db.run(`ALTER TABLE tasks ADD COLUMN createdAt TEXT`, () => { });
            db.run(`ALTER TABLE tasks ADD COLUMN completedAt TEXT`, () => { });
            db.run(`ALTER TABLE tasks ADD COLUMN inProgressAt TEXT`, () => { });

            db.run(`ALTER TABLE users ADD COLUMN avatarUrl TEXT`, () => { });
            db.run(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'available'`, () => { });

            db.run(`ALTER TABLE tasks ADD COLUMN startDate TEXT`, () => { });
            db.run(`ALTER TABLE tasks ADD COLUMN endDate TEXT`, () => { });

            // Add managerId to projects if it doesn't exist
            db.run(`ALTER TABLE projects ADD COLUMN managerId TEXT`, () => { });


            console.log('Database tables created or already exist.');

            // Seed initial users
            db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
                if (row.count === 0) {
                    const stmt = db.prepare("INSERT INTO users (id, name, initials, color, password, role) VALUES (?, ?, ?, ?, ?, ?)");
                    // Default Admin
                    stmt.run('admin-1', 'System Admin', 'SA', '#DE350B', 'admin123', 'admin');
                    // Default PM
                    stmt.run('pm-1', 'Project Manager', 'PM', '#0052CC', 'pm123', 'pm');
                    // Default Employee
                    stmt.run('emp-1', 'Employee One', 'E1', '#00875A', 'emp123', 'employee');
                    stmt.finalize();
                }
            });

            // Seed Global Chat project
            db.get("SELECT COUNT(*) as count FROM projects WHERE id = 'global'", (err, row) => {
                if (row && row.count === 0) {
                    db.run("INSERT INTO projects (id, name, desc) VALUES ('global', 'Global Chat', 'A shared room for everyone to communicate.')");
                }
            });
        });
    }
});

// --- API Endpoints ---

// AUTHENTICATION
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Allow login by id, name or email
    db.get(`SELECT id, name, email, phone, initials, color, role, avatarUrl, status FROM users WHERE (id = ? OR name = ? OR email = ?) AND password = ?`, [username, username, username, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: 'Invalid credentials' });
        res.json(row);
    });
});

// USERS
app.get('/api/users', (req, res) => {
    // For simplicity, we return all users without password. In a real app, PMs might only see certain users, but seeing everyone is fine for this demo.
    db.all("SELECT id, name, email, phone, initials, color, role, avatarUrl, status FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', (req, res) => {
    console.log("POST /api/users body:", req.body);
    const { id, name, email, phone, initials, color, password, role } = req.body;
    // Basic validation could happen here
    db.run(`INSERT INTO users (id, name, email, phone, initials, color, password, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, email, phone, initials, color, password, role],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint')) return res.status(400).json({ error: 'Username already exists (names must be unique in this prototype).' });
                return res.status(500).json({ error: err.message });
            }
            res.json({ id, name, email, phone, initials, color, role });
        });
});

app.delete('/api/users/:id', (req, res) => {
    db.run("DELETE FROM users WHERE id = ?", req.params.id, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        // Also cleanup their allocations
        db.run("DELETE FROM project_users WHERE userId = ?", req.params.id);
        res.json({ message: "deleted", changes: this.changes });
    });
});

app.put('/api/users/:id', (req, res) => {
    const { name, email, phone, role } = req.body;
    db.run(`UPDATE users SET name = ?, email = ?, phone = ?, role = ? WHERE id = ?`,
        [name, email, phone, role, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "updated", changes: this.changes });
        });
});

app.put('/api/users/:id/profile', (req, res) => {
    const { avatarUrl, currentPassword, newPassword } = req.body;
    const userId = req.params.id;

    db.get(`SELECT password, id, name, email, phone, initials, color, role, avatarUrl FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });

        let finalAvatar = avatarUrl !== undefined ? avatarUrl : user.avatarUrl;
        let finalPassword = user.password;

        if (currentPassword && newPassword) {
            if (currentPassword !== user.password) {
                return res.status(401).json({ error: 'Incorrect current password' });
            }
            finalPassword = newPassword;
        }

        db.run(`UPDATE users SET avatarUrl = ?, password = ? WHERE id = ?`,
            [finalAvatar, finalPassword, userId],
            function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({
                    id: user.id, name: user.name, email: user.email, phone: user.phone,
                    initials: user.initials, color: user.color, role: user.role, avatarUrl: finalAvatar, status: user.status
                });
            });
    });
});

app.put('/api/users/:id/status', (req, res) => {
    const { status } = req.body;
    db.run("UPDATE users SET status = ? WHERE id = ?", [status, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "status updated" });
    });
});

// PROJECTS
app.get('/api/projects', (req, res) => {
    const { userId, role } = req.query;

    if (role === 'admin') {
        // Admin sees all
        db.all("SELECT * FROM projects", [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    } else if (role === 'pm' && userId) {
        // PM sees projects they manage OR are allocated to
        db.all(`
            SELECT DISTINCT p.* 
            FROM projects p 
            LEFT JOIN project_users pu ON p.id = pu.projectId 
            WHERE p.managerId = ? OR pu.userId = ?
        `, [userId, userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    } else if (userId) {
        // Employees only see allocated projects
        db.all(`
            SELECT p.* 
            FROM projects p 
            JOIN project_users pu ON p.id = pu.projectId 
            WHERE pu.userId = ?
        `, [userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    } else {
        res.status(400).json({ error: "Must provide userId and role" });
    }
});

app.post('/api/projects', (req, res) => {
    const { id, name, desc, taskCount, managerId } = req.body;
    db.run(`INSERT INTO projects (id, name, desc, taskCount, managerId) VALUES (?, ?, ?, ?, ?)`,
        [id, name, desc, taskCount || 0, managerId],
        function (err) {
            if (err) {
                console.error("Failed to insert project:", err.message);
                return res.status(500).json({ error: err.message });
            }

            // Auto-allocate the manager to their own project
            if (managerId) {
                db.run(`INSERT INTO project_users (projectId, userId) VALUES (?, ?)`, [id, managerId], function (err2) {
                    if (err2) console.error("Failed to auto-allocate manager:", err2.message);
                });

                // Email notification to PM
                notifyUserByEmail(managerId,
                    `🚀 New Project Assigned: ${name}`,
                    `<div style="font-family:Inter,sans-serif;max-width:500px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
                        <div style="background:#00875A;color:white;padding:16px 20px"><h2 style="margin:0;font-size:18px">New Project Assigned</h2></div>
                        <div style="padding:20px">
                            <h3 style="margin:0 0 8px">${name}</h3>
                            ${desc ? `<p style="color:#666;margin:0 0 12px">${desc}</p>` : ''}
                            <p style="margin:16px 0 0;font-size:13px;color:#999">You have been assigned as the Project Manager. — NexBoard</p>
                        </div>
                    </div>`
                );
            }
            res.json({ id, name, desc, taskCount, managerId });
        });
});

app.delete('/api/projects/:id', (req, res) => {
    db.run("DELETE FROM projects WHERE id = ?", req.params.id, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run("DELETE FROM project_users WHERE projectId = ?", req.params.id);
        db.run("DELETE FROM tasks WHERE projectId = ?", req.params.id);
        res.json({ message: "deleted", changes: this.changes });
    });
});

app.put('/api/projects/:id', (req, res) => {
    const { name, desc, managerId } = req.body;
    db.run(`UPDATE projects SET name = ?, desc = ?, managerId = ? WHERE id = ?`,
        [name, desc, managerId || null, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "updated", changes: this.changes });
        });
});

// PROJECT ALLOCATIONS
app.get('/api/projects/:id/users', (req, res) => {
    db.all(`
        SELECT u.id, u.name, u.initials, u.color, u.role
        FROM users u 
        JOIN project_users pu ON u.id = pu.userId 
        WHERE pu.projectId = ?
    `, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/projects/:id/users', (req, res) => {
    const { userId } = req.body;
    db.run(`INSERT INTO project_users (projectId, userId) VALUES (?, ?)`,
        [req.params.id, userId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "allocated" });
        });
});

app.delete('/api/projects/:projectId/users/:userId', (req, res) => {
    db.run(`DELETE FROM project_users WHERE projectId = ? AND userId = ?`,
        [req.params.projectId, req.params.userId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "deallocated", changes: this.changes });
        });
});

// PROJECT EXPORT
app.get('/api/projects/:id/export', (req, res) => {
    const projectId = req.params.id;

    // Complex query to get project details, task details, assignee details, PM details, and work done (remarks)
    const query = `
        SELECT 
            p.name as ProjectName,
            pm.name as ProjectManager,
            t.id as TaskId,
            t.title as TaskTitle,
            t.desc as TaskDescription,
            t.status as Status,
            t.priority as Priority,
            t.type as TaskType,
            a.name as Assignee,
            t.createdAt as CreatedAt,
            t.inProgressAt as StartedAt,
            t.completedAt as CompletedAt,
            GROUP_CONCAT(ru.name || ' (' || r.remarkDate || '): ' || r.remark, CHAR(10)) as WorkDone
        FROM projects p
        LEFT JOIN users pm ON p.managerId = pm.id
        LEFT JOIN tasks t ON p.id = t.projectId
        LEFT JOIN users a ON t.assigneeId = a.id
        LEFT JOIN task_remarks r ON t.id = r.taskId
        LEFT JOIN users ru ON r.userId = ru.id
        WHERE p.id = ?
        GROUP BY t.id
        ORDER BY t.createdAt DESC
    `;

    db.all(query, [projectId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!rows || rows.length === 0) {
            return res.status(404).send("Project not found or has no data.");
        }

        // CSV Header
        const headers = ["Project Name", "Project Manager", "Task ID", "Task Title", "Description", "Status", "Priority", "Type", "Assignee", "Created At", "Started At", "Completed At", "Work Done"];
        let csvContent = headers.join(',') + '\n';

        // CSV Rows
        rows.forEach(row => {
            // Escape quotes and wrap strings in quotes to handle commas in text
            const escapeCSV = (str) => {
                if (str === null || str === undefined) return '""';
                const s = String(str).replace(/"/g, '""');
                return `"${s}"`;
            };

            const rowData = [
                escapeCSV(row.ProjectName),
                escapeCSV(row.ProjectManager || 'Unassigned'),
                escapeCSV(row.TaskId || ''),
                escapeCSV(row.TaskTitle || ''),
                escapeCSV(row.TaskDescription || ''),
                escapeCSV(row.Status || ''),
                escapeCSV(row.Priority || ''),
                escapeCSV(row.TaskType || ''),
                escapeCSV(row.Assignee || 'Unassigned'),
                escapeCSV(row.CreatedAt ? new Date(row.CreatedAt).toLocaleString() : ''),
                escapeCSV(row.StartedAt ? new Date(row.StartedAt).toLocaleString() : ''),
                escapeCSV(row.CompletedAt ? new Date(row.CompletedAt).toLocaleString() : ''),
                escapeCSV(row.WorkDone || 'No remarks')
            ];
            csvContent += rowData.join(',') + '\n';
        });

        // Set Headers for File Download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="project-${projectId}-export.csv"`);
        res.status(200).send(csvContent);
    });
});

// TASKS
app.get('/api/tasks', (req, res) => {
    const { projectId, role, userId } = req.query;

    // Admins can fetch all tasks globally for the dashboard chart
    if (role === 'admin' && !projectId) {
        db.all("SELECT * FROM tasks", [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
        return;
    }

    // PM: get tasks from projects they manage
    if (role === 'pm' && userId && !projectId) {
        db.all(`SELECT t.* FROM tasks t
                JOIN projects p ON t.projectId = p.id
                WHERE p.managerId = ?`, [userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
        return;
    }

    // Employee: get tasks from projects they are allocated to
    if (role === 'employee' && userId && !projectId) {
        db.all(`SELECT t.* FROM tasks t
                WHERE t.projectId IN (
                    SELECT pu.projectId FROM project_users pu WHERE pu.userId = ?
                )`, [userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
        return;
    }

    if (!projectId) return res.status(400).json({ error: "projectId required" });

    db.all("SELECT * FROM tasks WHERE projectId = ?", [projectId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tasks', (req, res) => {
    const { id, title, desc, status, priority, type, assigneeId, projectId, startDate, endDate } = req.body;
    const createdAt = new Date().toISOString();
    let completedAt = null;
    let inProgressAt = null;
    if (status === 'done') {
        completedAt = new Date().toISOString();
    } else if (status === 'in-progress') {
        inProgressAt = new Date().toISOString();
    }

    db.run(`INSERT INTO tasks (id, title, desc, status, priority, type, assigneeId, projectId, createdAt, completedAt, inProgressAt, startDate, endDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title, desc, status, priority, type, assigneeId, projectId, createdAt, completedAt, inProgressAt, startDate || null, endDate || null],
        function (err) {
            if (err) {
                console.error("Failed to insert task:", err.message);
                return res.status(500).json({ error: err.message });
            }
            // Update project task count
            db.run(`UPDATE projects SET taskCount = taskCount + 1 WHERE id = ?`, [projectId]);

            // Log activity
            logTaskActivity(id, req.body.createdByUserId || null, 'created', `Task "${title}" created with status ${status}, priority ${priority}`);
            if (assigneeId) {
                const assignee = null; // will be resolved in email block
                logTaskActivity(id, req.body.createdByUserId || null, 'assigned', `Task assigned`);
            }

            // Email notification to assignee
            if (assigneeId) {
                db.get("SELECT name FROM projects WHERE id = ?", [projectId], (e, proj) => {
                    const projName = proj ? proj.name : projectId;
                    notifyUserByEmail(assigneeId,
                        `📋 New Task Assigned: ${title}`,
                        `<div style="font-family:Inter,sans-serif;max-width:500px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
                            <div style="background:#0052CC;color:white;padding:16px 20px"><h2 style="margin:0;font-size:18px">New Task Assigned</h2></div>
                            <div style="padding:20px">
                                <h3 style="margin:0 0 8px">${title}</h3>
                                ${desc ? `<p style="color:#666;margin:0 0 12px">${desc}</p>` : ''}
                                <table style="font-size:14px;color:#333;width:100%">
                                    <tr><td style="padding:4px 0"><strong>Project:</strong></td><td>${projName}</td></tr>
                                    <tr><td style="padding:4px 0"><strong>Priority:</strong></td><td>${priority}</td></tr>
                                    <tr><td style="padding:4px 0"><strong>Type:</strong></td><td>${type}</td></tr>
                                    ${startDate ? `<tr><td style="padding:4px 0"><strong>Start:</strong></td><td>${startDate}</td></tr>` : ''}
                                    ${endDate ? `<tr><td style="padding:4px 0"><strong>Due:</strong></td><td>${endDate}</td></tr>` : ''}
                                </table>
                                <p style="margin:16px 0 0;font-size:13px;color:#999">— NexBoard</p>
                            </div>
                        </div>`
                    );
                });
            }

            res.json({ id, title, desc, status, priority, type, assigneeId, projectId, createdAt, completedAt, inProgressAt, startDate: startDate || null, endDate: endDate || null });
        });
});

app.delete('/api/tasks/:id', (req, res) => {
    // Need to get projectId first to decrement count
    db.get("SELECT projectId, title FROM tasks WHERE id = ?", [req.params.id], (err, row) => {
        if (row) {
            db.run("UPDATE projects SET taskCount = taskCount - 1 WHERE id = ?", [row.projectId]);
            logTaskActivity(req.params.id, req.query.userId || null, 'deleted', `Task "${row.title}" deleted`);
        }
        db.run("DELETE FROM tasks WHERE id = ?", req.params.id, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "deleted", changes: this.changes });
        });
    });
});

app.put('/api/tasks/:id', (req, res) => {
    const { title, desc, status, priority, type, assigneeId, completedAt: providedCompletedAt, inProgressAt: providedInProgressAt, startDate, endDate } = req.body;
    let completedAt = null;
    let inProgressAt = providedInProgressAt || null;
    let query, params;

    if (status === 'done') {
        completedAt = providedCompletedAt || new Date().toISOString();
        query = `UPDATE tasks SET title = ?, desc = ?, status = ?, priority = ?, type = ?, assigneeId = ?, completedAt = ?, inProgressAt = ?, startDate = ?, endDate = ? WHERE id = ?`;
        params = [title, desc, status, priority, type, assigneeId, completedAt, inProgressAt, startDate || null, endDate || null, req.params.id];
    } else if (status === 'in-progress') {
        inProgressAt = providedInProgressAt || new Date().toISOString();
        query = `UPDATE tasks SET title = ?, desc = ?, status = ?, priority = ?, type = ?, assigneeId = ?, completedAt = NULL, inProgressAt = ?, startDate = ?, endDate = ? WHERE id = ?`;
        params = [title, desc, status, priority, type, assigneeId, inProgressAt, startDate || null, endDate || null, req.params.id];
    } else {
        query = `UPDATE tasks SET title = ?, desc = ?, status = ?, priority = ?, type = ?, assigneeId = ?, completedAt = NULL, startDate = ?, endDate = ? WHERE id = ?`;
        params = [title, desc, status, priority, type, assigneeId, startDate || null, endDate || null, req.params.id];
    }

    db.run(query, params,
        function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // Log activity for task update
            const changes = [];
            if (title) changes.push(`title, description, priority: ${priority}, type: ${type}`);
            if (status) changes.push(`status → ${status}`);
            logTaskActivity(req.params.id, req.body.updatedByUserId || null, 'updated', `Task updated: ${changes.join(', ')}`);

            // If assignee changed, notify the new assignee
            if (assigneeId) {
                db.get("SELECT projectId FROM tasks WHERE id = ?", [req.params.id], (e, taskRow) => {
                    const projId = taskRow ? taskRow.projectId : '';
                    db.get("SELECT name FROM projects WHERE id = ?", [projId], (e2, proj) => {
                        const projName = proj ? proj.name : projId;
                        notifyUserByEmail(assigneeId,
                            `📋 Task Updated: ${title}`,
                            `<div style="font-family:Inter,sans-serif;max-width:500px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
                                <div style="background:#FF991F;color:white;padding:16px 20px"><h2 style="margin:0;font-size:18px">Task Updated / Assigned</h2></div>
                                <div style="padding:20px">
                                    <h3 style="margin:0 0 8px">${title}</h3>
                                    <table style="font-size:14px;color:#333;width:100%">
                                        <tr><td style="padding:4px 0"><strong>Project:</strong></td><td>${projName}</td></tr>
                                        <tr><td style="padding:4px 0"><strong>Status:</strong></td><td>${status}</td></tr>
                                        <tr><td style="padding:4px 0"><strong>Priority:</strong></td><td>${priority}</td></tr>
                                    </table>
                                    <p style="margin:16px 0 0;font-size:13px;color:#999">— NexBoard</p>
                                </div>
                            </div>`
                        );
                    });
                });
            }

            res.json({ message: "updated", changes: this.changes, completedAt, inProgressAt });
        });
});

app.put('/api/tasks/:id/status', (req, res) => {
    const { status, inProgressAt: providedInProgressAt } = req.body;
    let completedAt = null;
    let inProgressAt = providedInProgressAt || null;
    let query, params;

    if (status === 'done') {
        completedAt = new Date().toISOString();
        query = `UPDATE tasks SET status = ?, completedAt = ?, inProgressAt = ? WHERE id = ?`;
        params = [status, completedAt, inProgressAt, req.params.id];
    } else if (status === 'in-progress') {
        inProgressAt = providedInProgressAt || new Date().toISOString();
        query = `UPDATE tasks SET status = ?, completedAt = NULL, inProgressAt = ? WHERE id = ?`;
        params = [status, inProgressAt, req.params.id];
    } else {
        query = `UPDATE tasks SET status = ?, completedAt = NULL WHERE id = ?`;
        params = [status, req.params.id];
    }

    db.run(query, params,
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            // Log status change activity
            logTaskActivity(req.params.id, req.body.userId || null, 'status_changed', `Status changed to "${status}"`);
            res.json({ message: "status updated", changes: this.changes, completedAt, inProgressAt });
        });
});

// TASK REMARKS
app.get('/api/tasks/:id/remarks', (req, res) => {
    db.all(`SELECT r.*, u.name as userName, u.initials, u.color FROM task_remarks r LEFT JOIN users u ON r.userId = u.id WHERE r.taskId = ? ORDER BY r.remarkDate DESC`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/tasks/:id/remarks', (req, res) => {
    const { userId, remark } = req.body;
    const remarkDate = new Date().toISOString();
    db.run(`INSERT INTO task_remarks (taskId, userId, remark, remarkDate) VALUES (?, ?, ?, ?)`,
        [req.params.id, userId, remark, remarkDate],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, taskId: req.params.id, userId, remark, remarkDate });
        });
});

// PROJECT CHAT MESSAGES
app.get('/api/projects/:id/messages', (req, res) => {
    console.log(`[GET] Fetching messages for project: ${req.params.id}`);
    db.all(`
        SELECT m.*, u.name as userName, u.initials, u.color,
               mu.name as mentionedUserName, p.name as projectName
        FROM messages m
        LEFT JOIN projects p ON m.projectId = p.id
        LEFT JOIN users u ON m.userId = u.id
        LEFT JOIN users mu ON m.mentionedUserId = mu.id
        WHERE m.projectId = ?
        ORDER BY m.createdAt ASC
    `, [req.params.id], (err, rows) => {
        if (err) {
            console.error(`[GET] Project messages error for ${req.params.id}: ${err.message}`);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// PROJECT USERS (for mentions)
app.get('/api/projects/:id/users', (req, res) => {
    db.all(`
        SELECT u.id, u.name, u.initials, u.color, u.role
        FROM users u
        JOIN project_users pu ON u.id = pu.userId
        WHERE pu.projectId = ?
    `, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// GET global messages for everyone
app.get('/api/global/messages', (req, res) => {
    db.all(`
        SELECT m.*, u.name as userName, u.initials, u.color, 'Global Chat' as projectName
        FROM messages m
        LEFT JOIN users u ON m.userId = u.id
        WHERE m.projectId = 'global'
        ORDER BY m.createdAt DESC
        LIMIT 50
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// GET all messages for projects a user belongs to (for global notifications)
app.get('/api/users/:userId/messages', (req, res) => {
    db.all(`
        SELECT m.*, u.name as userName, u.initials, u.color, p.name as projectName
        FROM messages m
        LEFT JOIN project_users pu ON m.projectId = pu.projectId
        LEFT JOIN projects p ON m.projectId = p.id
        LEFT JOIN users u ON m.userId = u.id
        WHERE (pu.userId = ? OR m.projectId = 'global')
        ORDER BY m.createdAt DESC
        LIMIT 30
    `, [req.params.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});


app.post('/api/projects/:id/messages', (req, res) => {
    const { userId, message, mentionedUserId } = req.body;
    const createdAt = new Date().toISOString();
    console.log(`[POST] New message for project ${req.params.id} from user ${userId}`);

    db.run(`INSERT INTO messages (projectId, userId, message, mentionedUserId, createdAt) VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, userId, message, mentionedUserId || null, createdAt],
        function (err) {
            if (err) {
                console.error(`[POST] Message insert error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }

            const newMsg = { id: this.lastID, projectId: req.params.id, userId, message, mentionedUserId: mentionedUserId || null, createdAt };
            res.json(newMsg);
        });
});

// DUE DATE REMINDER SYSTEM
// Checks for tasks due tomorrow and sends email reminders to assignees
function checkDueReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`[Reminder Check] Running due date check for: ${tomorrowStr}`);

    db.all(`
        SELECT t.id, t.title, t.desc, t.endDate, t.assigneeId, t.priority, t.status,
               p.name as projectName, u.name as assigneeName, u.email as assigneeEmail
        FROM tasks t
        LEFT JOIN projects p ON t.projectId = p.id
        LEFT JOIN users u ON t.assigneeId = u.id
        WHERE t.endDate = ? AND t.status != 'done' AND t.assigneeId IS NOT NULL
    `, [tomorrowStr], (err, rows) => {
        if (err) {
            console.error('[Reminder Check] Error:', err.message);
            return;
        }

        if (!rows || rows.length === 0) {
            console.log('[Reminder Check] No tasks due tomorrow.');
            return;
        }

        console.log(`[Reminder Check] Found ${rows.length} task(s) due tomorrow. Sending reminders...`);

        rows.forEach(task => {
            if (task.assigneeEmail) {
                sendNotificationEmail(task.assigneeEmail,
                    `⏰ Reminder: "${task.title}" is due tomorrow!`,
                    `<div style="font-family:Inter,sans-serif;max-width:500px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
                        <div style="background:#FF8B00;color:white;padding:16px 20px"><h2 style="margin:0;font-size:18px">⏰ Task Due Tomorrow</h2></div>
                        <div style="padding:20px">
                            <h3 style="margin:0 0 8px">${task.title}</h3>
                            ${task.desc ? `<p style="color:#666;margin:0 0 12px">${task.desc}</p>` : ''}
                            <table style="font-size:14px;color:#333;width:100%">
                                <tr><td style="padding:4px 0"><strong>Project:</strong></td><td>${task.projectName || 'N/A'}</td></tr>
                                <tr><td style="padding:4px 0"><strong>Priority:</strong></td><td>${task.priority}</td></tr>
                                <tr><td style="padding:4px 0"><strong>Due Date:</strong></td><td style="color:#DE350B;font-weight:600">${task.endDate}</td></tr>
                            </table>
                            <p style="margin:16px 0 0;font-size:13px;color:#999">Please complete this task before the deadline. — NexBoard</p>
                        </div>
                    </div>`
                );
                console.log(`[Reminder Check] Sent reminder to ${task.assigneeName} (${task.assigneeEmail}) for task "${task.title}"`);
            }
        });
    });
}

// Manual trigger endpoint for due reminders
app.get('/api/reminders/check-due', (req, res) => {
    checkDueReminders();
    res.json({ message: 'Due date reminder check triggered.' });
});

// Run reminder check every hour (3600000 ms)
setInterval(checkDueReminders, 60 * 60 * 1000);

// Run once on server startup after a short delay
setTimeout(checkDueReminders, 5000);

// TASK ACTIVITY LOG
// Helper: Log task activity
function logTaskActivity(taskId, userId, action, details) {
    if (!taskId) return;
    const createdAt = new Date().toISOString();
    console.log(`[Activity Log] Logging: ${taskId}, ${userId}, ${action}, ${details}`);
    db.run(`INSERT INTO task_activity (taskId, userId, action, details, createdAt) VALUES (?, ?, ?, ?, ?)`,
        [taskId, userId, action, details || '', createdAt], (err) => {
            if (err) console.error(`[Activity Log] Error:`, err.message);
            else console.log(`[Activity Log] Success`);
        });
}

// GET task activity log
app.get('/api/activity/task/:id', (req, res) => {
    db.all(`SELECT a.*, u.name as userName, u.initials, u.color
            FROM task_activity a
            LEFT JOIN users u ON a.userId = u.id
            WHERE a.taskId = ?
            ORDER BY a.createdAt DESC
            LIMIT 50`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

module.exports = app;

