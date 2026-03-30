const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('./generated/client');
const cron = require('node-cron');
const path = require('path');
const { runScraper } = require('./scraper');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.SQLITE_DB_URL || "file:./dev.db"
        }
    }
});

const app = express();
app.use(cors());
app.use(express.json());

// Serve static compiled UI files (from Vite build)
app.use(express.static(path.join(__dirname, '..', 'public')));

const { initCronJobs } = require('./cron');

// Init Cron
initCronJobs();

app.use(express.json());

// API: Quick Sync data (run scraper for one date or today)
app.post('/api/sync', async (req, res) => {
    try {
        const { date } = req.body || {};
        const targetDates = [date || null];

        const result = await runScraper(targetDates);
        if (result.success) {
            res.json({ success: true, message: result.message || `Uspešno sinhronizovano ${result.count} zapisa.` });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Massive Sync data (up to 31 days)
app.post('/api/sync/massive', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, error: "Početni i krajnji datum su obavezni." });
        }
        
        const datesArray = [];
        let currentDate = new Date(startDate);
        const end = new Date(endDate);
        
        if (currentDate > end) {
            return res.status(400).json({ success: false, error: "Početni datum ne može biti veći od krajnjeg." });
        }
        
        let days = 0;
        while (currentDate <= end && days < 31) {
            datesArray.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
            days++;
        }

        const result = await runScraper(datesArray);
        if (result.success) {
            res.json({ success: true, message: `Masovna sinhronizacija završena: ukupno ${result.count} novih zapisa povučeno.` });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get attendance records
app.get('/api/events', async (req, res) => {
    const { date } = req.query;
    try {
        let whereClause = {};
        if (date) {
            whereClause.date = date; // Expecting YYYY-MM-DD
        }
        const records = await prisma.attendanceRecord.findMany({
            where: whereClause,
            orderBy: [
                { date: 'desc' },
                { timestamp: 'desc' }
            ]
        });
        res.json({ success: true, data: records });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get settings
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await prisma.settings.findMany();
        const config = {};
        settings.forEach(s => {
            config[s.key] = s.value;
        });
        // Remove password from response for security
        if (config.password) {
            config.password = "********";
        }
        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Update settings
app.post('/api/settings', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (email) {
            await prisma.settings.upsert({
                where: { key: 'email' },
                update: { value: email },
                create: { key: 'email', value: email }
            });
        }
        // Only update password if defined and not masked
        if (password && password !== "********") {
            await prisma.settings.upsert({
                where: { key: 'password' },
                update: { value: password },
                create: { key: 'password', value: password }
            });
        }
        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get all employees
app.get('/api/employees', async (req, res) => {
    try {
        const employees = await prisma.employee.findMany({ orderBy: { lastName: 'asc' }});
        res.json({ success: true, data: employees });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ dest: 'uploads/' });

// API: Upload Excel file
app.post('/api/employees/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        
        let imported = 0;
        for (const row of rows) {
            const keys = Object.keys(row);
            const getVal = (possibleKeys) => {
                const k = keys.find(k => possibleKeys.some(pk => k.toLowerCase().includes(pk)));
                return k ? row[k] : '';
            };
            
            let badgeId = getVal(['id', 'broj', 'sifra']);
            let firstName = getVal(['ime', 'first']);
            let lastName = getVal(['prezime', 'last']);
            let department = getVal(['sektor', 'odsek', 'departman', 'department']);
            let position = getVal(['radno', 'pozicija', 'position']);
            
            const fullNameStr = getVal(['ime i prezime', 'radnik', 'zaposleni', 'ime ']);
            if (!lastName && fullNameStr && fullNameStr.includes(' ')) {
                const parts = fullNameStr.split(' ');
                firstName = parts[0];
                lastName = parts.slice(1).join(' ');
            } else if (!firstName && fullNameStr) {
                firstName = fullNameStr;
                lastName = " ";
            }

            if (!firstName && !lastName) continue;

            const trimmedFirstName = String(firstName).trim();
            const trimmedLastName = String(lastName).trim();
            const trimmedDept = department ? String(department).trim() : null;
            const trimmedPos = position ? String(position).trim() : null;
            const trimmedBadge = badgeId ? String(badgeId).trim() : null;

            const existingEmp = await prisma.employee.findFirst({
                where: {
                    firstName: trimmedFirstName,
                    lastName: trimmedLastName
                }
            });

            if (existingEmp) {
                // Update
                await prisma.employee.update({
                    where: { id: existingEmp.id },
                    data: {
                        employeeId: trimmedBadge,
                        department: trimmedDept,
                        position: trimmedPos
                    }
                });
            } else {
                // Create
                await prisma.employee.create({
                    data: {
                        employeeId: trimmedBadge,
                        firstName: trimmedFirstName,
                        lastName: trimmedLastName,
                        department: trimmedDept,
                        position: trimmedPos
                    }
                });
            }
            imported++;
        }
        res.json({ success: true, imported });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Create an employee
app.post('/api/employees', async (req, res) => {
    try {
        const emp = await prisma.employee.create({ data: req.body });
        res.json({ success: true, data: emp });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// API: Update an employee
app.put('/api/employees/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const emp = await prisma.employee.update({ where: { id }, data: req.body });
        res.json({ success: true, data: emp });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// API: Delete an employee
app.delete('/api/employees/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.employee.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Catch-all route to serve the React SPA for non-API routes
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    } else {
        next();
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Express server listening on port ${PORT}`);
});
