const ExcelJS = require('exceljs');

const LEAVE_MAPPING = {
    odmor: 'go',
    bolovanje: 'bo',
    slobodan_dan: 'sr',
    rad_8h: 8
};

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function toDateString(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function nameMatch(n1, first, last) {
    if (!n1 || !first || !last) return false;
    const s1 = n1.toLowerCase().replace(/\s+/g, '');
    const s2 = (first + last).toLowerCase().replace(/\s+/g, '');
    const s3 = (last + first).toLowerCase().replace(/\s+/g, '');
    return s1 === s2 || s1 === s3 || s1.includes(s2) || s2.includes(s1) || s1.includes(s3) || s3.includes(s1);
}

function toMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// Attach directly to the existing express app
module.exports = function attachExcelEndpoint(app, prisma) {
    app.get('/api/reports/excel-monthly', async (req, res) => {
        try {
            const { year, month } = req.query;
            if (!year || !month) return res.status(400).json({ success: false, error: 'Nedostaje godina ili mesec' });

            const y = parseInt(year);
            const m = parseInt(month);
            const daysInMonth = getDaysInMonth(y, m);

            const startDateStr = toDateString(y, m, 1);
            const endDateStr = toDateString(y, m, daysInMonth);

            let employees = await prisma.employee.findMany({ orderBy: [{ department: 'asc' }, { lastName: 'asc' }] });
            employees = employees.filter(e => e.isActive === true);
            const attendance = await prisma.attendanceRecord.findMany({
                where: { date: { gte: startDateStr, lte: endDateStr } },
                orderBy: [{ date: 'asc' }, { timestamp: 'asc' }]
            });
            const leaves = await prisma.leaveRecord.findMany({
                where: { date: { gte: startDateStr, lte: endDateStr } }
            });
            const overtimes = await prisma.overtimeApproval.findMany({
                where: { date: { gte: startDateStr, lte: endDateStr } }
            });

            // Reconstruct data per employee
            const empData = employees.map(e => ({
                id: e.id,
                firstName: e.firstName,
                lastName: e.lastName,
                fullName: `${e.firstName} ${e.lastName}`,
                department: e.department || '-',
                position: e.position || '-',
                days: {} // date -> val (8, 'go', OVERTIME_HOURS)
            }));

            // Process Leave
            for (const lr of leaves) {
                const emp = empData.find(e => nameMatch(lr.employeeName, e.firstName, e.lastName));
                if (emp) {
                    emp.days[lr.date] = LEAVE_MAPPING[lr.leaveType] || lr.leaveType;
                }
            }

            // Process Attendance (Compute worked hours per day per employee)
            const groupedAtt = {};
            for (const rec of attendance) {
                const key = `${rec.employeeName}||${rec.date}`;
                if (!groupedAtt[key]) groupedAtt[key] = { name: rec.employeeName, date: rec.date, entries: [], exits: [] };
                if (rec.eventType === 'Prijava') groupedAtt[key].entries.push(rec.timestamp);
                if (rec.eventType === 'Odjava') groupedAtt[key].exits.push(rec.timestamp);
            }

            const eveningStartDates = new Set();
            const consumedMornings = new Set();

            let changed = true;
            while (changed) {
                changed = false;
                for (const key of Object.keys(groupedAtt)) {
                    if (eveningStartDates.has(key)) continue;
                    const g = groupedAtt[key];
                    if (g.entries.length === 0) continue;

                    let entries = [...g.entries].sort();
                    if (consumedMornings.has(key)) {
                        entries = entries.filter(t => toMinutes(t) >= 720);
                    }
                    if (entries.length === 0) continue;

                    const firstEntryMins = toMinutes(entries[0]);
                    if (firstEntryMins >= 1080) { // >= 18:00
                        eveningStartDates.add(key);
                        const nextDay = new Date(g.date + 'T12:00:00');
                        nextDay.setDate(nextDay.getDate() + 1);
                        const nextDayStr = toDateString(nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate());
                        consumedMornings.add(`${g.name}||${nextDayStr}`);
                        changed = true;
                    }
                }
            }

            for (const key of Object.keys(groupedAtt)) {
                const g = groupedAtt[key];
                const emp = empData.find(e => nameMatch(g.name, e.firstName, e.lastName));
                if (!emp) continue;

                let entries = [...g.entries].sort();
                let exits = [...g.exits].sort();

                if (consumedMornings.has(key)) {
                    entries = entries.filter(t => toMinutes(t) >= 720);
                    exits = exits.filter(t => toMinutes(t) >= 720);
                }

                if (entries.length === 0) continue;

                const firstEntry = entries[0];
                let lastExit = exits.length > 0 ? exits[exits.length - 1] : null;

                let isOvernightSession = false;
                if (eveningStartDates.has(key)) {
                    isOvernightSession = true;
                    lastExit = null;
                    const nextDay = new Date(g.date + 'T12:00:00');
                    nextDay.setDate(nextDay.getDate() + 1);
                    const nextDayStr = toDateString(nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate());
                    const nextDayKey = `${g.name}||${nextDayStr}`;
                    if (groupedAtt[nextDayKey]) {
                        const nextExits = groupedAtt[nextDayKey].exits.filter(t => toMinutes(t) < 720);
                        if (nextExits.length > 0) lastExit = nextExits[nextExits.length - 1];
                    }
                }

                let workedMins = 0;
                let entryMins = toMinutes(firstEntry);
                if (firstEntry && lastExit) {
                    let exitMins = toMinutes(lastExit);
                    if (isOvernightSession && exitMins < entryMins) exitMins += 1440;
                    workedMins = exitMins - entryMins;
                    if (workedMins < 0) workedMins = 0;
                }

                const isDateObj = new Date(g.date + 'T12:00:00');
                const isWeekend = isDateObj.getDay() === 0 || isDateObj.getDay() === 6;
                let decidedVal = 8;
                let decidedOvertime = 0;
                
                const manual = overtimes.find(o => nameMatch(o.employeeName, emp.firstName, emp.lastName) && o.date === g.date);
                
                if (isWeekend) {
                    decidedVal = "";
                    if (manual && manual.approved) {
                        const ovMins = manual.approvedMins !== null ? manual.approvedMins : workedMins;
                        decidedOvertime = +(ovMins / 60).toFixed(2);
                    } else {
                        decidedOvertime = 0;
                    }
                } else {
                    if (manual && manual.approved) {
                        const ovMins = manual.approvedMins !== null ? manual.approvedMins : (workedMins > 480 ? workedMins - 480 : 0);
                        decidedOvertime = +(ovMins / 60).toFixed(2);
                    }
                }

                const isNightShift = entryMins >= 1200 || entryMins < 240;

                if (!emp.days[g.date] || isWeekend) {
                    emp.days[g.date] = { val: decidedVal, overtime: decidedOvertime, nightShift: isNightShift };
                }
            }

            // Standalone Overtimes without attendance
            for (const ov of overtimes) {
                if (!ov.approved && !ov.approvedMins) continue;
                const emp = empData.find(e => nameMatch(ov.employeeName, e.firstName, e.lastName));
                if (!emp) continue;
                
                if (!emp.days[ov.date]) {
                    emp.days[ov.date] = {};
                }
                if (typeof emp.days[ov.date] !== 'object') {
                    // Turn scalar to object
                    emp.days[ov.date] = { val: emp.days[ov.date], overtime: 0 };
                }
                emp.days[ov.date].overtime = +((ov.approvedMins || 0) / 60).toFixed(2);
            }

            // Create Excel
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'PolicatSRB System';
            
            const mNamesStr = ['', 'Januar', 'Februar', 'Mart', 'April', 'Maj', 'Jun', 'Jul', 'Avgust', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'];
            const sheetName = `${String(m).padStart(2,'0')}_${y}`;
            const sheet = workbook.addWorksheet(sheetName, {
                views: [
                    { state: 'frozen', xSplit: 2, ySplit: 2 }
                ]
            });

            // Columns sizing
            sheet.getColumn(1).width = 4;
            sheet.getColumn(2).width = 25;
            sheet.getColumn(3).width = 22;
            sheet.getColumn(4).width = 15;
            sheet.getColumn(5).width = 12;
            sheet.getColumn(6).width = 12;
            sheet.getColumn(7).width = 12;
            sheet.getColumn(8).width = 12;
            for (let i=1; i<=31; i++) {
                sheet.getColumn(8+i).width = 7.0;
            }
            sheet.getColumn(40).width = 12; // sum
            sheet.getColumn(41).width = 15; // prekovremeno
            sheet.getColumn(42).width = 15; // ukupno radnih sati
            sheet.getColumn(43).width = 12; // radnih dana
            sheet.getColumn(44).width = 12; // dani odmora
            sheet.getColumn(45).width = 12; // bolovanje
            sheet.getColumn(46).width = 15; // slobodni dan

            // Row 1: Headers and Merged Month
            const r1 = sheet.getRow(1);
            r1.getCell(1).value = 'RB';
            r1.getCell(2).value = 'Ime I prezime';
            r1.getCell(3).value = 'Radno mesto';
            r1.getCell(4).value = 'Position';
            r1.getCell(5).value = 'Preostalo iz prošle god';
            r1.getCell(6).value = 'Iskorišćeno u god';
            r1.getCell(7).value = 'dani odmora';
            r1.getCell(8).value = 'Stanje';
            
            // Month name merged over days
            r1.getCell(9).value = mNamesStr[m];
            sheet.mergeCells(1, 9, 1, 8 + daysInMonth);

            r1.getCell(40).value = 'Ukupno sati';
            r1.getCell(41).value = 'Prekovremeno';
            r1.getCell(42).value = 'ukupno radnih sati';
            r1.getCell(43).value = 'radnih dana';
            r1.getCell(44).value = 'dani odmora';
            r1.getCell(45).value = 'Bolovanje (dani)';
            r1.getCell(46).value = 'Slobodni dani';

            // Row 2: Days
            const r2 = sheet.getRow(2);
            for (let i=1; i<=31; i++) {
                r2.getCell(8+i).value = i <= daysInMonth ? i : ''; // days
            }

            // Styling Headers
            [1, 2].forEach(rn => {
                sheet.getRow(rn).eachCell({ includeEmpty: true }, (c, colNumber) => {
                    if (colNumber > 46) return;
                    c.font = { bold: true };
                    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                    c.border = {
                        top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'}
                    };
                });
            });

            // Data Rows
            let rowIdx = 3;
            empData.forEach((emp, index) => {
                const rwTop = sheet.getRow(rowIdx);
                const rwBot = sheet.getRow(rowIdx + 1);
                
                // Merge structural and summary cells
                [1,2,3,4,5,6,7,8, 40,41,42,43,44,45,46].forEach(c => {
                    sheet.mergeCells(rowIdx, c, rowIdx + 1, c);
                });

                rwTop.getCell(1).value = index + 1;
                rwTop.getCell(2).value = emp.fullName;
                rwTop.getCell(3).value = emp.department;
                rwTop.getCell(4).value = emp.position;
                
                // Vacations placeholders
                rwTop.getCell(5).value = 0;
                rwTop.getCell(6).value = 0;
                rwTop.getCell(7).value = 0;
                rwTop.getCell(8).value = 0;

                let rowSum = 0;
                let overtimeSum = 0;
                let radniSati = 0;
                let radnihDana = 0;
                let odmorDays = 0;
                let bolovanjeDays = 0;
                let slobodniDays = 0;

                for (let i=1; i<=daysInMonth; i++) {
                    const ds = toDateString(y, m, i);
                    let val = emp.days[ds];
                    const cellTop = rwTop.getCell(8+i);
                    const cellBot = rwBot.getCell(8+i);
                    let isNight = false;
                    let displayVal = null;
                    
                    if (val) {
                        displayVal = val;
                        // Handle object for explicit overtime tracking
                        if (typeof val === 'object' && val !== null) {
                            displayVal = val.val;
                            overtimeSum += (val.overtime || 0);
                            isNight = val.nightShift;
                            
                            // Render top/bottom
                            cellTop.value = val.val || "";
                            cellBot.value = val.overtime > 0 ? val.overtime : "";
                        } else {
                            cellTop.value = displayVal;
                        }
                        
                        const isOdmor = ['go', 'ks', 'odmor', 'GO', 'PO', 'DP N', 'VP'].includes(displayVal);
                        const isBolovanje = ['bo', 'bolovanje', 'B30', 'B31', 'OR', 'POD'].includes(displayVal);
                        const isSlobodan = ['sr', 'slobodan_dan', 'SD', 'SL'].includes(displayVal);

                        if (typeof displayVal === 'number') {
                            rowSum += displayVal;
                            radniSati += displayVal;
                            if (displayVal > 0) radnihDana++;
                        } else if (isOdmor) {
                            rowSum += 8;
                            odmorDays++;
                        } else if (isBolovanje) {
                            rowSum += 8;
                            bolovanjeDays++;
                        } else if (isSlobodan) {
                            slobodniDays++;
                        }
                    }

                    // Background coloring prioritization
                    const dayOfWeek = new Date(y, m-1, i).getDay();
                    const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
                    
                    const isOdmorCdt = ['go', 'ks', 'odmor', 'GO', 'PO', 'DP N', 'VP'].includes(displayVal);
                    const isBolCdt = ['bo', 'bolovanje', 'B30', 'B31', 'OR', 'POD'].includes(displayVal);
                    const isSloCdt = ['sr', 'slobodan_dan', 'SD', 'SL'].includes(displayVal);

                    [cellTop, cellBot].forEach(cell => {
                        if (isOdmorCdt) {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } }; // Green
                        } else if (isBolCdt) {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } }; // Orange
                        } else if (isSloCdt) {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } }; // Blue
                        } else if (isNight) {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow
                        } else if (isWeekendDay) {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; // Gray
                        }
                        
                        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    });
                }

                rwTop.getCell(40).value = rowSum;
                rwTop.getCell(41).value = overtimeSum;
                rwTop.getCell(42).value = radniSati + overtimeSum;
                rwTop.getCell(43).value = radnihDana;
                rwTop.getCell(44).value = odmorDays;
                rwTop.getCell(45).value = bolovanjeDays;
                rwTop.getCell(46).value = slobodniDays;
                
                [1,2,3,4,5,6,7,8, 40,41,42,43,44,45,46].forEach(c => {
                    [rwTop, rwBot].forEach(r => {
                        r.getCell(c).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                        r.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
                    });
                });
                
                [40,41,42,43,44,45,46].forEach(c => {
                   rwTop.getCell(c).font = { bold: true };
                });

                rowIdx += 2;
            });

            // Write and send
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Prisutnost_${String(m).padStart(2,'0')}_${y}.xlsx`);

            await workbook.xlsx.write(res);
            res.end();
            
        } catch(error) {
            console.error('Excel export error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
};
