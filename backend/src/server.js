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
// API: Get all shifts
app.get('/api/shifts', async (req, res) => {
    try {
        const shifts = await prisma.shift.findMany({ orderBy: { startTime: 'asc' }});
        res.json({ success: true, data: shifts });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// API: Create a shift
app.post('/api/shifts', async (req, res) => {
    try {
        const shift = await prisma.shift.create({ data: req.body });
        res.json({ success: true, data: shift });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// API: Update a shift
app.put('/api/shifts/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const shift = await prisma.shift.update({ where: { id }, data: req.body });
        res.json({ success: true, data: shift });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// API: Delete a shift
app.delete('/api/shifts/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.shift.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Helper: convert HH:mm or HH:mm:ss to minutes since midnight
function toMinutes(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// API: Weekly Report — matches employees to shifts, handles overnight, calculates overtime
app.get('/api/reports/weekly', async (req, res) => {
    try {
        const { weekStart } = req.query;
        if (!weekStart) return res.status(400).json({ success: false, error: 'weekStart je obavezan parametar.' });

        // Build 7-day range + 1 extra day for overnight exit lookups
        const dates = [];
        const start = new Date(weekStart);
        for (let i = 0; i < 8; i++) { // 8 days to catch next-day exits
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        const reportDates = dates.slice(0, 7); // only show 7 days

        // Fetch all records for the range (including day 8 for overnight exits)
        const records = await prisma.attendanceRecord.findMany({
            where: { date: { in: dates } },
            orderBy: [{ date: 'asc' }, { timestamp: 'asc' }]
        });

        const shifts = await prisma.shift.findMany();
        const employees = await prisma.employee.findMany();

        // Fetch existing overtime approvals for this week
        const approvals = await prisma.overtimeApproval.findMany({
            where: { date: { in: reportDates } }
        });
        const approvalMap = {};
        approvals.forEach(a => { approvalMap[`${a.employeeName}||${a.date}`] = a.approved; });

        // Group records by employeeName + date
        const grouped = {};
        for (const rec of records) {
            const key = `${rec.employeeName}||${rec.date}`;
            if (!grouped[key]) grouped[key] = { name: rec.employeeName, date: rec.date, entries: [], exits: [] };
            if (rec.eventType === 'Prijava') grouped[key].entries.push(rec.timestamp);
            if (rec.eventType === 'Odjava') grouped[key].exits.push(rec.timestamp);
        }

        // ============================================================
        // PURELY TIME-BASED overnight detection (no shift definitions)
        // ============================================================

        // Step 1: Build a set of employee+dates that have an evening entry (>= 18:00)
        const hasEveningEntry = new Set(); // "name||date"
        for (const key of Object.keys(grouped)) {
            const g = grouped[key];
            if (g.entries.some(t => toMinutes(t) >= 1080)) {
                hasEveningEntry.add(key);
            }
        }

        // Step 2: Process each employee-day
        const reportRows = [];
        for (const key of Object.keys(grouped)) {
            const g = grouped[key];
            if (!reportDates.includes(g.date)) continue;

            let entries = [...g.entries];
            let exits = [...g.exits];

            const eveningEntries = entries.filter(t => toMinutes(t) >= 1080);
            const hasEvening = eveningEntries.length > 0;

            // CASE A: This date has evening entries
            // → Use ONLY the first evening entry (morning records = break noise from prev night)
            // → Exit comes from next day morning
            if (hasEvening) {
                entries = eveningEntries;
                exits = []; // will be fetched from next day
            } else {
                // CASE B: This date has ONLY morning/afternoon entries
                // → Check if PREVIOUS date had an evening entry for this employee
                const prevDay = new Date(g.date);
                prevDay.setDate(prevDay.getDate() - 1);
                const prevDayStr = prevDay.toISOString().split('T')[0];
                const prevDayKey = `${g.name}||${prevDayStr}`;

                if (hasEveningEntry.has(prevDayKey)) {
                    // Previous day had an evening entry → this morning is break noise → SKIP
                    continue;
                }
                // Otherwise: this is a normal day shift, keep all entries/exits
            }

            if (entries.length === 0) continue;

            const firstEntry = entries[0];
            let lastExit = exits.length > 0 ? exits[exits.length - 1] : null;

            // Match best shift based on firstEntry
            let bestShift = null;
            let bestDiff = Infinity;
            if (shifts.length > 0) {
                const entryMins = toMinutes(firstEntry);
                for (const shift of shifts) {
                    const shiftStartMins = toMinutes(shift.startTime);
                    let diff = Math.abs(entryMins - shiftStartMins);
                    if (diff < bestDiff) {
                        bestDiff = diff;
                        bestShift = shift;
                    }
                }
            }

            // Overnight handling (purely time-based): evening entry → exit on next day
            let isOvernightSession = false;
            const entryMins = toMinutes(firstEntry);
            if (entryMins >= 1080) { // entry is after 18:00
                isOvernightSession = true;
                const nextDay = new Date(g.date);
                nextDay.setDate(nextDay.getDate() + 1);
                const nextDayStr = nextDay.toISOString().split('T')[0];
                const nextDayKey = `${g.name}||${nextDayStr}`;

                if (grouped[nextDayKey]) {
                    // Take the LAST exit before noon on next day
                    const morningExits = grouped[nextDayKey].exits.filter(t => toMinutes(t) < 720);
                    if (morningExits.length > 0) {
                        lastExit = morningExits[morningExits.length - 1];
                    }
                }
            }

            // Calculate worked minutes (first entry to last exit, ignoring breaks)
            let workedMins = 0;
            if (firstEntry && lastExit) {
                const entryMins = toMinutes(firstEntry);
                let exitMins = toMinutes(lastExit);
                if (isOvernightSession && exitMins < entryMins) {
                    exitMins += 1440;
                }
                workedMins = exitMins - entryMins;
                if (workedMins < 0) workedMins = 0;
            }

            const workedHours = Math.floor(workedMins / 60);
            const workedRemMins = workedMins % 60;
            const overtimeMins = workedMins > 480 ? workedMins - 480 : 0;

            // Find employee info
            const nameLower = (g.name || '').toLowerCase();
            const empMatch = employees.find(e => {
                const fLow = e.firstName.toLowerCase();
                const lLow = e.lastName.toLowerCase();
                return nameLower.includes(fLow) && nameLower.includes(lLow);
            });

            // Check lateness
            let status = 'Nepoznato';
            let lateMins = 0;
            if (firstEntry && bestShift) {
                const entryMins = toMinutes(firstEntry);
                const shiftStartMins = toMinutes(bestShift.startTime);
                const diff = entryMins - shiftStartMins;
                if (diff <= 0) {
                    status = 'Na vreme';
                } else if (diff <= bestShift.toleranceMins) {
                    status = 'U toleranciji';
                } else {
                    lateMins = diff;
                    status = `Kasni ${diff} min`;
                }
            }

            // Check overtime approval
            const approvalKey = `${g.name}||${g.date}`;
            const overtimeApproved = approvalMap[approvalKey] || false;

            reportRows.push({
                employeeName: g.name,
                date: g.date,
                firstEntry,
                lastExit: lastExit,
                isOvernightSession,
                shiftName: bestShift ? bestShift.name : '-',
                shiftColor: bestShift ? bestShift.color : '#6366f1',
                shiftStart: bestShift ? bestShift.startTime : '-',
                shiftEnd: bestShift ? bestShift.endTime : '-',
                workedMins,
                workedFormatted: `${workedHours}h ${workedRemMins}m`,
                overtimeMins,
                overtimeFormatted: overtimeMins > 0 ? `${Math.floor(overtimeMins/60)}h ${overtimeMins%60}m` : null,
                overtimeApproved,
                lateMins,
                status,
                department: empMatch ? empMatch.department : '-',
                position: empMatch ? empMatch.position : '-'
            });
        }

        // Sort by name, then date
        reportRows.sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.date.localeCompare(b.date));

        res.json({ success: true, data: reportRows, dates: reportDates });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Toggle overtime approval
app.post('/api/overtime/approve', async (req, res) => {
    try {
        const { employeeName, date, approved } = req.body;
        if (!employeeName || !date) return res.status(400).json({ success: false, error: 'employeeName i date su obavezni.' });

        await prisma.overtimeApproval.upsert({
            where: { employeeName_date: { employeeName, date } },
            update: { approved: !!approved },
            create: { employeeName, date, approved: !!approved }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
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
