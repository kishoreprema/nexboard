const http = require('http');

const runTest = async () => {
    const postData = (path, data) => new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });

    const getData = (path) => new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET'
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
        });
        req.on('error', reject);
        req.end();
    });

    try {
        console.log("1. Creating Admin User");
        const adminUser = await postData('/api/users', {
            id: 'pgadmin',
            name: 'PG Admin',
            email: 'admin@pg.com',
            phone: '12345',
            initials: 'PA',
            color: '#ff0000',
            password: 'password',
            role: 'admin'
        });
        console.log("Admin Create:", adminUser);

        console.log("\n2. Admin Login");
        const login = await postData('/api/login', {
            username: 'pgadmin',
            password: 'password'
        });
        console.log("Login Status:", login.status);
        console.log("Login User:", login.body);

        console.log("\n3. Creating Project");
        const proj = await postData('/api/projects', {
            id: 'PRJ1',
            name: 'Test Project',
            desc: 'A test project',
            managerId: 'pgadmin'
        });
        console.log("Project Create:", proj);

        console.log("\n4. Getting Projects for Admin");
        const projects = await getData('/api/projects?role=admin&userId=pgadmin');
        console.log("Projects:", projects.body);

    } catch (err) {
        console.error("Test Error:", err);
    }
}

runTest();
