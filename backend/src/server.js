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
const attachExcelEndpoint = require('./excelExport');
attachExcelEndpoint(app, prisma);

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
        let currentDate = new Date(startDate + 'T12:00:00');
        const end = new Date(endDate + 'T12:00:00');
        
        if (currentDate > end) {
            return res.status(400).json({ success: false, error: "Početni datum ne može biti veći od krajnjeg." });
        }
        
        let days = 0;
        while (currentDate <= end && days < 31) {
            datesArray.push(toLocalDateStr(currentDate));
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

// Helper: format Date to YYYY-MM-DD using LOCAL time (avoids UTC timezone shift)
function toLocalDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Helper: match names robustly (handles inversions and middle initials, e.g. "Ivan M. Ilic" vs "Ilic Ivan M")
function extractNameWords(str) {
    return (str || '').toLowerCase().replace(/[.,()]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
}
function nameMatch(rawName, firstName, lastName) {
    return extractNameWords(rawName) === extractNameWords(`${firstName} ${lastName}`);
}

// API: Weekly Report — matches employees to shifts, handles overnight, calculates overtime
app.get('/api/reports/weekly', async (req, res) => {
    try {
        const { weekStart } = req.query;
        if (!weekStart) return res.status(400).json({ success: false, error: 'weekStart je obavezan parametar.' });

        // Build 7-day range + 1 extra day for overnight exit lookups
        const dates = [];
        const start = new Date(weekStart + 'T12:00:00');
        for (let i = 0; i < 8; i++) { // 8 days to catch next-day exits
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            dates.push(toLocalDateStr(d));
        }
        const reportDates = dates.slice(0, 7); // only show 7 days

        // Fetch all records for the range (including day 8 for overnight exits)
        const records = await prisma.attendanceRecord.findMany({
            where: { date: { in: dates } },
            orderBy: [{ date: 'asc' }, { timestamp: 'asc' }]
        });

        const shifts = await prisma.shift.findMany();
        let employees = await prisma.employee.findMany();
        employees = employees.filter(e => e.isActive === true);

        // Fetch existing overtime approvals for this week
        const approvals = await prisma.overtimeApproval.findMany({
            where: { date: { in: reportDates } }
        });
        const approvalMap = {};
        approvals.forEach(a => { approvalMap[`${a.employeeName}||${a.date}`] = a; });

        // Fetch leave records for this week
        const leaveRecords = await prisma.leaveRecord.findMany({
            where: { date: { in: reportDates } }
        });
        const leaveMap = {}; // "name||date" -> leaveType
        leaveRecords.forEach(lr => { leaveMap[`${lr.employeeName}||${lr.date}`] = lr.leaveType; });

        // Group records by employeeName + date
        const grouped = {};
        for (const rec of records) {
            const key = `${rec.employeeName}||${rec.date}`;
            if (!grouped[key]) grouped[key] = { name: rec.employeeName, date: rec.date, entries: [], exits: [] };
            if (rec.eventType === 'Prijava') grouped[key].entries.push(rec.timestamp);
            if (rec.eventType === 'Odjava') grouped[key].exits.push(rec.timestamp);
        }

        // ============================================================
        // ITERATIVE TIME-BASED overnight detection
        // Key insight: a date is "overnight start" ONLY if the FIRST
        // entry (after filtering consumed mornings) is >= 18:00.
        // If first entry is afternoon (e.g. 13:32), evening entries
        // are just break re-entries of the SAME shift (e.g. Druga Smena).
        // ============================================================

        const eveningStartDates = new Set(); // dates confirmed as overnight shift starts
        const consumedMornings = new Set();  // dates whose morning records belong to prev night

        // Iterative: discover overnight starts, mark next-day mornings, repeat
        let changed = true;
        while (changed) {
            changed = false;
            for (const key of Object.keys(grouped)) {
                if (eveningStartDates.has(key)) continue; // already confirmed
                const g = grouped[key];
                if (g.entries.length === 0) continue;

                let entries = [...g.entries];

                // Filter consumed morning entries (from a previous overnight)
                if (consumedMornings.has(key)) {
                    entries = entries.filter(t => toMinutes(t) >= 720);
                }

                if (entries.length === 0) continue;

                // Check if the FIRST remaining entry is in the evening
                const firstEntryMins = toMinutes(entries[0]);
                if (firstEntryMins >= 1080) { // >= 18:00
                    eveningStartDates.add(key);

                    // Mark next day's morning as consumed
                    const nextDay = new Date(g.date + 'T12:00:00');
                    nextDay.setDate(nextDay.getDate() + 1);
                    const nextDayStr = toLocalDateStr(nextDay);
                    consumedMornings.add(`${g.name}||${nextDayStr}`);

                    changed = true;
                }
            }
        }

        // Process each employee-day
        const reportRows = [];
        for (const key of Object.keys(grouped)) {
            const g = grouped[key];
            if (!reportDates.includes(g.date)) continue;

            let entries = [...g.entries];
            let exits = [...g.exits];

            // Filter consumed morning records
            if (consumedMornings.has(key)) {
                entries = entries.filter(t => toMinutes(t) >= 720);
                exits = exits.filter(t => toMinutes(t) >= 720);
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

            // Overnight: if this date is confirmed as evening start, grab exit from next morning
            let isOvernightSession = false;
            if (eveningStartDates.has(key)) {
                isOvernightSession = true;
                // Clear same-day exits (they are breaks, not final exit)
                lastExit = null;

                const nextDay = new Date(g.date + 'T12:00:00');
                nextDay.setDate(nextDay.getDate() + 1);
                const nextDayStr = toLocalDateStr(nextDay);
                const nextDayKey = `${g.name}||${nextDayStr}`;

                if (grouped[nextDayKey]) {
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
            const dayOfWeek = new Date(g.date + 'T12:00:00').getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            let overtimeMins = isWeekend ? workedMins : (workedMins > 480 ? workedMins - 480 : 0);

            // Find employee info
            const empMatch = employees.find(e => nameMatch(g.name, e.firstName, e.lastName));
            if (!empMatch) continue; // Skip attendance if employee is deleted or unmapped

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

            // Check overtime approval and overrides
            const uniformName = `${empMatch.firstName} ${empMatch.lastName}`;
            const approvalKey = `${uniformName}||${g.date}`;
            const overtimeData = approvalMap[approvalKey];
            const overtimeApproved = overtimeData ? overtimeData.approved : false;
            
            if (overtimeData && overtimeData.approvedMins !== null && overtimeData.approvedMins !== undefined) {
                overtimeMins = overtimeData.approvedMins;
            }

            reportRows.push({
                employeeName: uniformName,
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

        // Add leave rows for ALL employees (including those with no attendance)
        const LEAVE_LABELS = { odmor: 'Odmor', bolovanje: 'Bolovanje', slobodan_dan: 'Slobodan dan' };
        const attendanceKeys = new Set(reportRows.map(r => `${r.employeeName}||${r.date}`));

        for (const lr of leaveRecords) {
            if (!reportDates.includes(lr.date)) continue;
            
            // Find employee info
            const empMatch = employees.find(e => nameMatch(lr.employeeName, e.firstName, e.lastName));
            if (!empMatch) continue; // Skip leaves if employee is deleted or unmapped
            
            const uniformName = `${empMatch.firstName} ${empMatch.lastName}`;
            const key = `${uniformName}||${lr.date}`;
            if (attendanceKeys.has(key)) {
                // Employee has attendance AND leave on same day — just tag the existing row
                const existing = reportRows.find(r => r.employeeName === uniformName && r.date === lr.date);
                if (existing) existing.leaveType = lr.leaveType;
                continue;
            }

            reportRows.push({
                employeeName: uniformName,
                date: lr.date,
                firstEntry: null,
                lastExit: null,
                isOvernightSession: false,
                shiftName: '-',
                shiftColor: '#6366f1',
                shiftStart: '-',
                shiftEnd: '-',
                workedMins: 0,
                workedFormatted: '-',
                overtimeMins: 0,
                overtimeFormatted: null,
                overtimeApproved: false,
                lateMins: 0,
                status: LEAVE_LABELS[lr.leaveType] || lr.leaveType,
                leaveType: lr.leaveType,
                department: empMatch ? empMatch.department : '-',
                position: empMatch ? empMatch.position : '-'
            });
            // add to keys so overtime loop doesn't duplicate if it has both
            attendanceKeys.add(key);
        }

        // Add standalone overtime rows for ALL employees (if no attendance and no leave but has overtime)
        for (const ov of approvals) {
            if (!reportDates.includes(ov.date)) continue;
            if (!ov.approved && !ov.approvedMins) continue;
            
            // Find employee info
            const empMatch = employees.find(e => nameMatch(ov.employeeName, e.firstName, e.lastName));
            if (!empMatch) continue; // Skip overtimes if employee is deleted or unmapped

            const uniformName = `${empMatch.firstName} ${empMatch.lastName}`;
            const key = `${uniformName}||${ov.date}`;
            if (attendanceKeys.has(key)) {
                // Pre-existing row (either from attendance or leave)
                const existing = reportRows.find(r => r.employeeName === uniformName && r.date === ov.date);
                if (existing && existing.overtimeMins === 0 && !existing.firstEntry) {
                    existing.overtimeApproved = ov.approved;
                    existing.overtimeMins = ov.approvedMins || 0;
                    existing.overtimeFormatted = existing.overtimeMins > 0 ? `${Math.floor(existing.overtimeMins/60)}h ${existing.overtimeMins%60}m` : null;
                }
                continue;
            }

            reportRows.push({
                employeeName: uniformName,
                date: ov.date,
                firstEntry: null,
                lastExit: null,
                isOvernightSession: false,
                shiftName: '-',
                shiftColor: '#6366f1',
                shiftStart: '-',
                shiftEnd: '-',
                workedMins: 0,
                workedFormatted: '-',
                overtimeMins: ov.approvedMins || 0,
                overtimeFormatted: (ov.approvedMins || 0) > 0 ? `${Math.floor(ov.approvedMins/60)}h ${ov.approvedMins%60}m` : null,
                overtimeApproved: ov.approved,
                lateMins: 0,
                status: 'Ručni Unos',
                leaveType: null,
                department: empMatch ? empMatch.department : '-',
                position: empMatch ? empMatch.position : '-'
            });
            attendanceKeys.add(key);
        }

        // Re-sort after adding extra rows
        reportRows.sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.date.localeCompare(b.date));

        res.json({ success: true, data: reportRows, dates: reportDates });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Toggle overtime approval
app.post('/api/overtime/approve', async (req, res) => {
    try {
        const { employeeName, date, approved, approvedMins } = req.body;
        if (!employeeName || !date) return res.status(400).json({ success: false, error: 'employeeName i date su obavezni.' });

        const minVal = (approvedMins !== undefined && approvedMins !== null && approvedMins !== '') ? parseInt(approvedMins) : null;

        await prisma.overtimeApproval.upsert({
            where: { employeeName_date: { employeeName, date } },
            update: { approved: !!approved, approvedMins: minVal },
            create: { employeeName, date, approved: !!approved, approvedMins: minVal }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Create leave record(s) — supports period
app.post('/api/leave', async (req, res) => {
    try {
        const { employeeName, startDate, endDate, leaveType, note } = req.body;
        if (!employeeName || !startDate || !leaveType) {
            return res.status(400).json({ success: false, error: 'employeeName, startDate i leaveType su obavezni.' });
        }

        const end = endDate || startDate;
        const dates = [];
        const d = new Date(startDate + 'T12:00:00');
        const last = new Date(end + 'T12:00:00');
        while (d <= last) {
            // Skip weekends (0=Sun, 6=Sat)
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) {
                dates.push(toLocalDateStr(d));
            }
            d.setDate(d.getDate() + 1);
        }

        let created = 0;
        for (const date of dates) {
            try {
                await prisma.leaveRecord.upsert({
                    where: { employeeName_date: { employeeName, date } },
                    update: { leaveType, note: note || null },
                    create: { employeeName, date, leaveType, note: note || null }
                });
                created++;
            } catch (e) { /* skip duplicates */ }
        }

        res.json({ success: true, message: `Kreirano ${created} dana odsustva.`, count: created });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Delete leave record
app.delete('/api/leave', async (req, res) => {
    try {
        const { employeeName, date } = req.body;
        if (!employeeName || !date) return res.status(400).json({ success: false, error: 'employeeName i date su obavezni.' });

        await prisma.leaveRecord.deleteMany({
            where: { employeeName, date }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get leave records (optional filters)
app.get('/api/leave', async (req, res) => {
    try {
        const where = {};
        if (req.query.employeeName) where.employeeName = req.query.employeeName;
        if (req.query.startDate && req.query.endDate) {
            where.date = { gte: req.query.startDate, lte: req.query.endDate };
        }
        const records = await prisma.leaveRecord.findMany({ where, orderBy: { date: 'asc' } });
        res.json({ success: true, data: records });
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
