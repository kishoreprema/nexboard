const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

dotenv.config();

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
async function notifyUserByEmail(userId, subject, htmlBody) {
    if (!userId) return;
    try {
        const res = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
        if (res.rows.length > 0 && res.rows[0].email) {
            sendNotificationEmail(res.rows[0].email, subject, htmlBody);
        }
    } catch (err) {
        console.error('NotifyUser error:', err.message);
    }
}

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

console.log('__dirname:', __dirname);
console.log('process.cwd():', process.cwd());

// Initialize PostgreSQL Database Pool
if (!process.env.DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL is not defined in environment variables!");
    console.error("The app will attempt to connect to localhost:5432 and likely FAIL.");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                initials VARCHAR(10),
                color VARCHAR(50),
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                avatarUrl TEXT,
                status VARCHAR(50) DEFAULT 'available'
            );

            CREATE TABLE IF NOT EXISTS projects (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                "desc" TEXT,
                taskCount INTEGER DEFAULT 0,
                managerId VARCHAR(255)
            );

            CREATE TABLE IF NOT EXISTS project_users (
                projectId VARCHAR(255),
                userId VARCHAR(255),
                PRIMARY KEY (projectId, userId)
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id VARCHAR(255) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                "desc" TEXT,
                status VARCHAR(50) NOT NULL,
                priority VARCHAR(50) NOT NULL,
                type VARCHAR(50) NOT NULL,
                assigneeId VARCHAR(255),
                projectId VARCHAR(255) NOT NULL,
                createdAt VARCHAR(255),
                completedAt VARCHAR(255),
                inProgressAt VARCHAR(255),
                startDate VARCHAR(255),
                endDate VARCHAR(255)
            );

            CREATE TABLE IF NOT EXISTS task_remarks (
                id SERIAL PRIMARY KEY,
                taskId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                remark TEXT NOT NULL,
                remarkDate VARCHAR(255) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                projectId VARCHAR(255) NOT NULL,
                userId VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                mentionedUserId VARCHAR(255),
                createdAt VARCHAR(255) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS task_activity (
                id SERIAL PRIMARY KEY,
                taskId VARCHAR(255) NOT NULL,
                userId VARCHAR(255),
                action VARCHAR(255) NOT NULL,
                details TEXT,
                createdAt VARCHAR(255) NOT NULL
            );
        `);
        console.log('Connected to the PostgreSQL database and tables verified.');

        // Seed initial users
        const usersResult = await pool.query('SELECT COUNT(*) FROM users');
        if (parseInt(usersResult.rows[0].count) === 0) {
            await pool.query(
                `INSERT INTO users (id, name, initials, color, password, role) VALUES ($1, $2, $3, $4, $5, $6)`,
                ['admin-1', 'System Admin', 'SA', '#DE350B', 'admin123', 'admin']
            );
            await pool.query(
                `INSERT INTO users (id, name, initials, color, password, role) VALUES ($1, $2, $3, $4, $5, $6)`,
                ['pm-1', 'Project Manager', 'PM', '#0052CC', 'pm123', 'pm']
            );
            await pool.query(
                `INSERT INTO users (id, name, initials, color, password, role) VALUES ($1, $2, $3, $4, $5, $6)`,
                ['emp-1', 'Employee One', 'E1', '#00875A', 'emp123', 'employee']
            );
            console.log('Inserted default users');
        }

        // Seed Global Chat project
        const globalProjResult = await pool.query("SELECT COUNT(*) FROM projects WHERE id = 'global'");
        if (parseInt(globalProjResult.rows[0].count) === 0) {
            await pool.query("INSERT INTO projects (id, name, \"desc\") VALUES ('global', 'Global Chat', 'A shared room for everyone to communicate.')");
        }
    } catch (err) {
        console.error('Error initializing database schema', err);
    }
}

// Call on startup
initDB();

// DEBUG
app.get('/api/debug', (req, res) => {
    res.json({ url: req.url, originalUrl: req.originalUrl, path: req.path, method: req.method });
});

// AUTHENTICATION
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            `SELECT id, name, email, phone, initials, color, role, avatarurl, status FROM users WHERE (id = $1 OR name = $2 OR email = $3) AND password = $4`,
            [username, username, username, password]
        );
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// USERS
app.get('/api/users', async (req, res) => {
    // For simplicity, we return all users without password. In a real app, PMs might only see certain users, but seeing everyone is fine for this demo.
    try {
        const result = await pool.query("SELECT id, name, email, phone, initials, color, role, avatarUrl, status FROM users");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    console.log("POST /api/users body:", req.body);
    const { id, name, email, phone, initials, color, password, role } = req.body;
    // Basic validation could happen here
    try {
        await pool.query(`INSERT INTO users (id, name, email, phone, initials, color, password, role) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, name, email, phone, initials, color, password, role]);
        res.json({ id, name, email, phone, initials, color, role });
    } catch (err) {
        if (err.message.includes('unique constraint') || err.message.includes('duplicate key')) {
            return res.status(400).json({ error: 'Username already exists (names must be unique in this prototype).' });
        }
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const result = await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
        await pool.query("DELETE FROM project_users WHERE userId = $1", [req.params.id]);
        res.json({ message: "deleted", changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { name, email, phone, role } = req.body;
    try {
        const result = await pool.query(`UPDATE users SET name = $1, email = $2, phone = $3, role = $4 WHERE id = $5`, [name, email, phone, role, req.params.id]);
        res.json({ message: "updated", changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/profile', async (req, res) => {
    const { avatarUrl, currentPassword, newPassword } = req.body;
    const userId = req.params.id;

    try {
        const userRes = await pool.query(`SELECT password, id, name, email, phone, initials, color, role, avatarUrl, status FROM users WHERE id = $1`, [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = userRes.rows[0];
        let finalAvatar = avatarUrl !== undefined ? avatarUrl : user.avatarurl;
        let finalPassword = user.password;

        if (currentPassword && newPassword) {
            if (currentPassword !== user.password) {
                return res.status(401).json({ error: 'Incorrect current password' });
            }
            finalPassword = newPassword;
        }

        await pool.query(
            `UPDATE users SET avatarUrl = $1, password = $2 WHERE id = $3`,
            [finalAvatar, finalPassword, userId]
        );
        res.json({
            id: user.id, name: user.name, email: user.email, phone: user.phone,
            initials: user.initials, color: user.color, role: user.role, avatarUrl: finalAvatar, status: user.status
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        await pool.query("UPDATE users SET status = $1 WHERE id = $2", [status, req.params.id]);
        res.json({ message: "status updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PROJECTS
app.get('/api/projects', async (req, res) => {
    const { userId, role } = req.query;

    try {
        if (role === 'admin') {
            // Admin sees all
            const result = await pool.query("SELECT * FROM projects");
            res.json(result.rows);
        } else if (role === 'pm' && userId) {
            // PM sees projects they manage OR are allocated to
            const result = await pool.query(`
                SELECT DISTINCT p.* 
                FROM projects p 
                LEFT JOIN project_users pu ON p.id = pu.projectId 
                WHERE p.managerId = $1 OR pu.userId = $2
            `, [userId, userId]);
            res.json(result.rows);
        } else if (userId) {
            // Employees only see allocated projects
            const result = await pool.query(`
                SELECT p.* 
                FROM projects p 
                JOIN project_users pu ON p.id = pu.projectId 
                WHERE pu.userId = $1
            `, [userId]);
            res.json(result.rows);
        } else {
            res.status(400).json({ error: "Must provide userId and role" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', async (req, res) => {
    const { id, name, desc, taskCount, managerId } = req.body;
    try {
        await pool.query(
            `INSERT INTO projects (id, name, "desc", taskCount, managerId) VALUES ($1, $2, $3, $4, $5)`,
            [id, name, desc, taskCount || 0, managerId]
        );

        // Auto-allocate the manager to their own project
        if (managerId) {
            try {
                await pool.query(`INSERT INTO project_users (projectId, userId) VALUES ($1, $2)`, [id, managerId]);
            } catch (err2) {
                console.error("Failed to auto-allocate manager:", err2.message);
            }

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
    } catch (err) {
        console.error("Failed to insert project:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        const result = await pool.query("DELETE FROM projects WHERE id = $1", [req.params.id]);
        await pool.query("DELETE FROM project_users WHERE projectId = $1", [req.params.id]);
        await pool.query("DELETE FROM tasks WHERE projectId = $1", [req.params.id]);
        res.json({ message: "deleted", changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    const { name, desc, managerId } = req.body;
    try {
        const result = await pool.query(
            `UPDATE projects SET name = $1, "desc" = $2, managerId = $3 WHERE id = $4`,
            [name, desc, managerId || null, req.params.id]
        );
        res.json({ message: "updated", changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PROJECT ALLOCATIONS
app.get('/api/projects/:id/users', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.initials, u.color, u.role
            FROM users u 
            JOIN project_users pu ON u.id = pu.userId 
            WHERE pu.projectId = $1
        `, [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects/:id/users', async (req, res) => {
    const { userId } = req.body;
    try {
        await pool.query(`INSERT INTO project_users (projectId, userId) VALUES ($1, $2)`, [req.params.id, userId]);
        res.json({ message: "allocated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:projectId/users/:userId', async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM project_users WHERE projectId = $1 AND userId = $2`, [req.params.projectId, req.params.userId]);
        res.json({ message: "deallocated", changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PROJECT EXPORT
app.get('/api/projects/:id/export', async (req, res) => {
    const projectId = req.params.id;

    // Complex query to get project details, task details, assignee details, PM details, and work done (remarks)
    const query = `
        SELECT 
            p.name as "ProjectName",
            pm.name as "ProjectManager",
            t.id as "TaskId",
            t.title as "TaskTitle",
            t."desc" as "TaskDescription",
            t.status as "Status",
            t.priority as "Priority",
            t.type as "TaskType",
            a.name as "Assignee",
            t.createdAt as "CreatedAt",
            t.inProgressAt as "StartedAt",
            t.completedAt as "CompletedAt",
            STRING_AGG(ru.name || ' (' || r.remarkDate || '): ' || r.remark, CHR(10)) as "WorkDone"
        FROM projects p
        LEFT JOIN users pm ON p.managerId = pm.id
        LEFT JOIN tasks t ON p.id = t.projectId
        LEFT JOIN users a ON t.assigneeId = a.id
        LEFT JOIN task_remarks r ON t.id = r.taskId
        LEFT JOIN users ru ON r.userId = ru.id
        WHERE p.id = $1
        GROUP BY p.name, pm.name, t.id, t.title, t."desc", t.status, t.priority, t.type, a.name, t.createdAt, t.inProgressAt, t.completedAt
        ORDER BY t.createdAt DESC
    `;

    try {
        const result = await pool.query(query, [projectId]);
        const rows = result.rows;

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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TASKS
app.get('/api/tasks', async (req, res) => {
    const { projectId, role, userId } = req.query;

    try {
        // Admins can fetch all tasks globally for the dashboard chart
        if (role === 'admin' && !projectId) {
            const result = await pool.query("SELECT * FROM tasks");
            res.json(result.rows);
            return;
        }

        // PM: get tasks from projects they manage
        if (role === 'pm' && userId && !projectId) {
            const result = await pool.query(`
                SELECT t.* FROM tasks t
                JOIN projects p ON t.projectId = p.id
                WHERE p.managerId = $1
            `, [userId]);
            res.json(result.rows || []);
            return;
        }

        // Employee: get tasks from projects they are allocated to
        if (role === 'employee' && userId && !projectId) {
            const result = await pool.query(`
                SELECT t.* FROM tasks t
                WHERE t.projectId IN (
                    SELECT pu.projectId FROM project_users pu WHERE pu.userId = $1
                )
            `, [userId]);
            res.json(result.rows || []);
            return;
        }

        if (!projectId) return res.status(400).json({ error: "projectId required" });

        const result = await pool.query("SELECT * FROM tasks WHERE projectId = $1", [projectId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks', async (req, res) => {
    const { id, title, desc, status, priority, type, assigneeId, projectId, startDate, endDate } = req.body;
    const createdAt = new Date().toISOString();
    let completedAt = null;
    let inProgressAt = null;
    if (status === 'done') {
        completedAt = new Date().toISOString();
    } else if (status === 'in-progress') {
        inProgressAt = new Date().toISOString();
    }

    try {
        await pool.query(
            `INSERT INTO tasks (id, title, "desc", status, priority, type, assigneeId, projectId, createdAt, completedAt, inProgressAt, startDate, endDate) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [id, title, desc, status, priority, type, assigneeId, projectId, createdAt, completedAt, inProgressAt, startDate || null, endDate || null]
        );

        // Update project task count
        await pool.query(`UPDATE projects SET taskCount = taskCount + 1 WHERE id = $1`, [projectId]);

        // Log activity
        logTaskActivity(id, req.body.createdByUserId || null, 'created', `Task "${title}" created with status ${status}, priority ${priority}`);
        if (assigneeId) {
            logTaskActivity(id, req.body.createdByUserId || null, 'assigned', `Task assigned`);
        }

        // Email notification to assignee
        if (assigneeId) {
            try {
                const projRes = await pool.query("SELECT name FROM projects WHERE id = $1", [projectId]);
                const projName = projRes.rows[0] ? projRes.rows[0].name : projectId;
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
            } catch (e) { }
        }
        res.json({ id, title, desc, status, priority, type, assigneeId, projectId, createdAt, completedAt, inProgressAt, startDate: startDate || null, endDate: endDate || null });
    } catch (err) {
        console.error("Failed to insert task:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const taskRes = await pool.query("SELECT projectId, title FROM tasks WHERE id = $1", [req.params.id]);
        if (taskRes.rows.length > 0) {
            const row = taskRes.rows[0];
            await pool.query("UPDATE projects SET taskCount = taskCount - 1 WHERE id = $1", [row.projectid]);
            logTaskActivity(req.params.id, req.query.userId || null, 'deleted', `Task "${row.title}" deleted`);
        }
        const result = await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
        res.json({ message: "deleted", changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/:id', async (req, res) => {
    const { title, desc, status, priority, type, assigneeId, completedAt: providedCompletedAt, inProgressAt: providedInProgressAt, startDate, endDate } = req.body;
    let completedAt = null;
    let inProgressAt = providedInProgressAt || null;
    let query, params;

    if (status === 'done') {
        completedAt = providedCompletedAt || new Date().toISOString();
        query = `UPDATE tasks SET title = $1, "desc" = $2, status = $3, priority = $4, type = $5, assigneeId = $6, completedAt = $7, inProgressAt = $8, startDate = $9, endDate = $10 WHERE id = $11`;
        params = [title, desc, status, priority, type, assigneeId, completedAt, inProgressAt, startDate || null, endDate || null, req.params.id];
    } else if (status === 'in-progress') {
        inProgressAt = providedInProgressAt || new Date().toISOString();
        query = `UPDATE tasks SET title = $1, "desc" = $2, status = $3, priority = $4, type = $5, assigneeId = $6, completedAt = NULL, inProgressAt = $7, startDate = $8, endDate = $9 WHERE id = $10`;
        params = [title, desc, status, priority, type, assigneeId, inProgressAt, startDate || null, endDate || null, req.params.id];
    } else {
        query = `UPDATE tasks SET title = $1, "desc" = $2, status = $3, priority = $4, type = $5, assigneeId = $6, completedAt = NULL, startDate = $7, endDate = $8 WHERE id = $9`;
        params = [title, desc, status, priority, type, assigneeId, startDate || null, endDate || null, req.params.id];
    }

    try {
        const result = await pool.query(query, params);

        // Log activity for task update
        const changes = [];
        if (title) changes.push(`title, description, priority: ${priority}, type: ${type}`);
        if (status) changes.push(`status → ${status}`);
        logTaskActivity(req.params.id, req.body.updatedByUserId || null, 'updated', `Task updated: ${changes.join(', ')}`);

        // If assignee changed, notify the new assignee
        if (assigneeId) {
            try {
                const taskRowRes = await pool.query("SELECT projectId FROM tasks WHERE id = $1", [req.params.id]);
                const projId = taskRowRes.rows[0] ? taskRowRes.rows[0].projectid : '';
                const projRes = await pool.query("SELECT name FROM projects WHERE id = $1", [projId]);
                const projName = projRes.rows[0] ? projRes.rows[0].name : projId;
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
            } catch (e) { }
        }

        res.json({ message: "updated", changes: result.rowCount, completedAt, inProgressAt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tasks/:id/status', async (req, res) => {
    const { status, inProgressAt: providedInProgressAt } = req.body;
    let completedAt = null;
    let inProgressAt = providedInProgressAt || null;
    let query, params;

    if (status === 'done') {
        completedAt = new Date().toISOString();
        query = `UPDATE tasks SET status = $1, completedAt = $2, inProgressAt = $3 WHERE id = $4`;
        params = [status, completedAt, inProgressAt, req.params.id];
    } else if (status === 'in-progress') {
        inProgressAt = providedInProgressAt || new Date().toISOString();
        query = `UPDATE tasks SET status = $1, completedAt = NULL, inProgressAt = $2 WHERE id = $3`;
        params = [status, inProgressAt, req.params.id];
    } else {
        query = `UPDATE tasks SET status = $1, completedAt = NULL WHERE id = $2`;
        params = [status, req.params.id];
    }

    try {
        const result = await pool.query(query, params);
        // Log status change activity
        logTaskActivity(req.params.id, req.body.userId || null, 'status_changed', `Status changed to "${status}"`);
        res.json({ message: "status updated", changes: result.rowCount, completedAt, inProgressAt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TASK REMARKS
app.get('/api/tasks/:id/remarks', async (req, res) => {
    try {
        const result = await pool.query(`SELECT r.*, u.name as "userName", u.initials, u.color FROM task_remarks r LEFT JOIN users u ON r.userId = u.id WHERE r.taskId = $1 ORDER BY r.remarkDate DESC`, [req.params.id]);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks/:id/remarks', async (req, res) => {
    const { userId, remark } = req.body;
    const remarkDate = new Date().toISOString();
    try {
        const result = await pool.query(
            `INSERT INTO task_remarks (taskId, userId, remark, remarkDate) VALUES ($1, $2, $3, $4) RETURNING id`,
            [req.params.id, userId, remark, remarkDate]
        );
        res.json({ id: result.rows[0].id, taskId: req.params.id, userId, remark, remarkDate });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PROJECT CHAT MESSAGES
app.get('/api/projects/:id/messages', async (req, res) => {
    console.log(`[GET] Fetching messages for project: ${req.params.id}`);
    try {
        const result = await pool.query(`
            SELECT m.*, u.name as "userName", u.initials, u.color,
                   mu.name as "mentionedUserName", p.name as "projectName"
            FROM messages m
            LEFT JOIN projects p ON m.projectId = p.id
            LEFT JOIN users u ON m.userId = u.id
            LEFT JOIN users mu ON m.mentionedUserId = mu.id
            WHERE m.projectId = $1
            ORDER BY m.createdAt ASC
        `, [req.params.id]);
        res.json(result.rows || []);
    } catch (err) {
        console.error(`[GET] Project messages error for ${req.params.id}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// PROJECT USERS (for mentions)
app.get('/api/projects/:id/users', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.initials, u.color, u.role
            FROM users u
            JOIN project_users pu ON u.id = pu.userId
            WHERE pu.projectId = $1
        `, [req.params.id]);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET global messages for everyone
app.get('/api/global/messages', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, u.name as "userName", u.initials, u.color, 'Global Chat' as "projectName"
            FROM messages m
            LEFT JOIN users u ON m.userId = u.id
            WHERE m.projectId = 'global'
            ORDER BY m.createdAt DESC
            LIMIT 50
        `);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all messages for projects a user belongs to (for global notifications)
app.get('/api/users/:userId/messages', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, u.name as "userName", u.initials, u.color, p.name as "projectName"
            FROM messages m
            LEFT JOIN project_users pu ON m.projectId = pu.projectId
            LEFT JOIN projects p ON m.projectId = p.id
            LEFT JOIN users u ON m.userId = u.id
            WHERE (pu.userId = $1 OR m.projectId = 'global')
            ORDER BY m.createdAt DESC
            LIMIT 30
        `, [req.params.userId]);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects/:id/messages', async (req, res) => {
    const { userId, message, mentionedUserId } = req.body;
    const createdAt = new Date().toISOString();
    console.log(`[POST] New message for project ${req.params.id} from user ${userId}`);

    try {
        const result = await pool.query(
            `INSERT INTO messages (projectId, userId, message, mentionedUserId, createdAt) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [req.params.id, userId, message, mentionedUserId || null, createdAt]
        );
        const newMsg = { id: result.rows[0].id, projectId: req.params.id, userId, message, mentionedUserId: mentionedUserId || null, createdAt };
        res.json(newMsg);
    } catch (err) {
        console.error(`[POST] Message insert error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// DUE DATE REMINDER SYSTEM
// Checks for tasks due tomorrow and sends email reminders to assignees
async function checkDueReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`[Reminder Check] Running due date check for: ${tomorrowStr}`);

    try {
        const result = await pool.query(`
            SELECT t.id, t.title, t."desc", t.endDate, t.assigneeId, t.priority, t.status,
                   p.name as "projectName", u.name as "assigneeName", u.email as "assigneeEmail"
            FROM tasks t
            LEFT JOIN projects p ON t.projectId = p.id
            LEFT JOIN users u ON t.assigneeId = u.id
            WHERE t.endDate = $1 AND t.status != 'done' AND t.assigneeId IS NOT NULL
        `, [tomorrowStr]);

        const rows = result.rows;
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
    } catch (err) {
        console.error('[Reminder Check] Error:', err.message);
    }
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
async function logTaskActivity(taskId, userId, action, details) {
    if (!taskId) return;
    const createdAt = new Date().toISOString();
    console.log(`[Activity Log] Logging: ${taskId}, ${userId}, ${action}, ${details}`);
    try {
        await pool.query(
            `INSERT INTO task_activity (taskId, userId, action, details, createdAt) VALUES ($1, $2, $3, $4, $5)`,
            [taskId, userId, action, details || '', createdAt]
        );
        console.log(`[Activity Log] Success`);
    } catch (err) {
        console.error(`[Activity Log] Error:`, err.message);
    }
}

// GET task activity log
app.get('/api/activity/task/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.*, u.name as "userName", u.initials, u.color
            FROM task_activity a
            LEFT JOIN users u ON a.userId = u.id
            WHERE a.taskId = $1
            ORDER BY a.createdAt DESC
            LIMIT 50
        `, [req.params.id]);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/debug-env', (req, res) => {
    let host = "NONE";
    if (process.env.DATABASE_URL) {
        try {
            const url = new URL(process.env.DATABASE_URL);
            host = url.host;
        } catch (e) {
            host = "INVALID_URL";
        }
    }
    res.json({
        database_url_status: process.env.DATABASE_URL ? "CONFIGURED" : "UNDEFINED",
        database_host: host,
        node_env: process.env.NODE_ENV || "UNDEFINED",
        vercel: process.env.VERCEL ? "TRUE" : "FALSE"
    });
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

module.exports = app;

