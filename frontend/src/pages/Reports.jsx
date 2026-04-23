import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Download, Calendar, ChevronLeft, ChevronRight, Clock, LogIn, LogOut, AlertTriangle, CheckCircle, ShieldAlert, Timer, Moon, Building2, Palmtree, HeartPulse, CalendarOff, X, Plus, Briefcase, FileSpreadsheet } from 'lucide-react';

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function toDMY(dateStr) { const [y, m, d] = dateStr.split('-'); return `${d}.${m}.${y}`; }

const DAY_NAMES = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

export default function Reports() {
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => toISO(getMonday(new Date())));
  const [weeklyData, setWeeklyData] = useState([]);
  const [weeklyDates, setWeeklyDates] = useState([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('weekly');
  const [filterDept, setFilterDept] = useState('__all__');
  const [selectedEmps, setSelectedEmps] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [actionModal, setActionModal] = useState(null); // { employeeName, date, tab: 'leave'|'overtime', defaultMins: null }
  const [excelMonth, setExcelMonth] = useState(() => toISO(new Date()).substring(0, 7));
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'odmor', startDate: '', endDate: '', note: '' });
  const [showBulkLeave, setShowBulkLeave] = useState(false);
  const [bulkLeaveEmp, setBulkLeaveEmp] = useState('');

  useEffect(() => { fetchChartData(); fetchEmployees(); }, []);
  useEffect(() => { fetchWeeklyReport(); }, [weekStart]);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/employees');
      const data = await res.json();
      if (data.success) setEmployees(data.data);
    } catch (err) { console.error(err); }
  };

  const fetchChartData = () => {
    setChartLoading(true);
    fetch('http://localhost:3001/api/events').then(r => r.json()).then(result => {
      if (result.success && result.data) setChartData(processChartData(result.data));
    }).catch(console.error).finally(() => setChartLoading(false));
  };

  const fetchWeeklyReport = useCallback(async (silent = false) => {
    if (!silent) setWeeklyLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/reports/weekly?weekStart=${weekStart}`);
      const result = await res.json();
      if (result.success) { setWeeklyData(result.data); setWeeklyDates(result.dates || []); }
    } catch (err) { console.error(err); }
    if (!silent) setWeeklyLoading(false);
  }, [weekStart]);

  const processChartData = (records) => {
    const summary = {};
    records.forEach(r => {
      if (!summary[r.date]) summary[r.date] = { date: r.date, Prijave: 0, Odjave: 0 };
      if (r.eventType === 'Prijava') summary[r.date].Prijave += 1;
      if (r.eventType === 'Odjava') summary[r.date].Odjave += 1;
    });
    return Object.values(summary).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-14);
  };

  const shiftWeek = (dir) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + (dir * 7));
    setWeekStart(toISO(d));
  };

  const toggleOvertime = async (employeeName, date, currentApproved) => {
    try {
      await fetch('http://localhost:3001/api/overtime/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeName, date, approved: !currentApproved })
      });
      fetchWeeklyReport(true); // silent fetch to preserve scroll
    } catch (err) { console.error(err); }
  };

  const saveOvertimeMins = async (employeeName, date, approvedMins) => {
    try {
      await fetch('http://localhost:3001/api/overtime/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeName, date, approved: true, approvedMins })
      });
      setActionModal(null);
      fetchWeeklyReport(true); // silent fetch
    } catch (err) { console.error(err); }
  };

  const LEAVE_CONFIG = {
    rad_8h:       { label: 'Rad (8h)',     icon: Briefcase,  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    // Kadrovska Timesheet mapping
    'VP':         { label: 'Verski Praznik',       icon: Palmtree,      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    'B30':        { label: 'Bolovanje do 30',      icon: HeartPulse,    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    'B31':        { label: 'Bolovanje preko 30',   icon: HeartPulse,    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    'PO':         { label: 'Plaćeno Odsustvo',     icon: Palmtree,      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    'NO':         { label: 'Neplaćeno Odsustvo',   icon: CalendarOff,   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    'GO':         { label: 'Godišnji Odmor',       icon: Palmtree,      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    'SD':         { label: 'Slobodan Dan',         icon: CalendarOff,   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    'OR':         { label: 'Nega deteta',          icon: HeartPulse,    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    'POD':        { label: 'Porodiljsko',          icon: HeartPulse,    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    'NI':         { label: 'Neopravdani',          icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    'UR':         { label: 'Udaljenje sa Rada',    icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    'SL':         { label: 'Službeni Put',         icon: Briefcase,     color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    'MR':         { label: 'Mirovanje',            icon: CalendarOff,   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    'DP N':       { label: 'Državni Praznik',      icon: Palmtree,      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  };

  const assignLeave = async (employeeName, date, leaveType) => {
    try {
      await fetch('http://localhost:3001/api/leave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeName, startDate: date, leaveType })
      });
      setActionModal(null);
      fetchWeeklyReport(true);
    } catch (err) { console.error(err); }
  };

  const removeLeave = async (employeeName, date) => {
    if (!window.confirm(`Da li ste sigurni da želite da obrišete ovaj unos za ${employeeName}?`)) return;
    try {
      await fetch('http://localhost:3001/api/leave', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeName, date })
      });
      fetchWeeklyReport(true);
    } catch (err) { console.error(err); }
  };

  const submitBulkLeave = async () => {
    if (!bulkLeaveEmp || !leaveForm.startDate || !leaveForm.leaveType) return;
    try {
      await fetch('http://localhost:3001/api/leave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeName: bulkLeaveEmp, startDate: leaveForm.startDate, endDate: leaveForm.endDate || leaveForm.startDate, leaveType: leaveForm.leaveType, note: leaveForm.note })
      });
      setShowBulkLeave(false);
      setLeaveForm({ leaveType: 'odmor', startDate: '', endDate: '', note: '' });
      setBulkLeaveEmp('');
      fetchWeeklyReport(true);
    } catch (err) { console.error(err); }
  };

  // Process data for charts
  const getAbsenceStats = () => {
    let leaves = 0, late = 0;
    weeklyData.forEach(d => {
      if (d.leaveType) leaves++;
      if (d.lateMins > 0) late++;
    });
    return [
      { name: 'Redovni', value: weeklyData.length - leaves },
      { name: 'Odsutni', value: leaves },
      { name: 'Kašnjenja', value: late }
    ];
  };

  // Unique departments from employees DB
  const allDepts = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();
  // Group by employee
  const groupedByEmployee = {};
  
  // Seed with all employees first so those with 0 attendance also appear
  employees.forEach(emp => {
    const fullName = `${emp.firstName} ${emp.lastName}`;
    groupedByEmployee[fullName] = { name: fullName, department: emp.department || '-', position: emp.position || '-', days: {} };
  });

  weeklyData.forEach(row => {
    if (!groupedByEmployee[row.employeeName]) {
      groupedByEmployee[row.employeeName] = { name: row.employeeName, department: row.department, position: row.position, days: {} };
    }
    groupedByEmployee[row.employeeName].days[row.date] = row;
  });

  // Calculate weekly summaries per employee  
  const employeeList = Object.values(groupedByEmployee).map(emp => {
    let totalWorkedMins = 0, totalOvertimeMins = 0, totalLateMins = 0, totalLeaveDays = 0;
    Object.values(emp.days).forEach(day => {
      const dayOfWeek = new Date(day.date + 'T12:00:00').getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (day.leaveType && !day.firstEntry && !isWeekend) {
        // Leave day with no attendance = 8h paid leave
        totalWorkedMins += 480;
        totalLeaveDays++;
      } else if (day.firstEntry && !isWeekend) {
        totalWorkedMins += 480;
      }
      if (day.overtimeApproved) totalOvertimeMins += day.overtimeMins || 0;
      totalLateMins += day.lateMins || 0;
    });
    return {
      ...emp,
      totalWorkedMins,
      totalOvertimeMins,
      totalLateMins,
      totalLeaveDays,
      totalWorkedFormatted: `${Math.floor(totalWorkedMins / 60)}h`,
      totalOvertimeFormatted: `${Math.floor(totalOvertimeMins / 60)}h ${totalOvertimeMins % 60}m`,
      totalLateFormatted: `${Math.floor(totalLateMins / 60)}h ${totalLateMins % 60}m`,
    };
  }).sort((a, b) => (a.department || 'zzz').localeCompare(b.department || 'zzz') || a.name.localeCompare(b.name));

  // Filter by department
  let filteredEmployees = employeeList;
  if (filterDept !== '__all__') {
    filteredEmployees = filteredEmployees.filter(e => (e.department || '-') === filterDept);
  }

  // List of available employees for the employee dropdown
  const availableEmployeesForFilter = [...filteredEmployees];

  // Filter by specific employees (multiple)
  if (selectedEmps.length > 0) {
    filteredEmployees = filteredEmployees.filter(e => selectedEmps.includes(e.name));
  }

  // Group filtered employees by department for section headers
  const deptGroups = {};
  filteredEmployees.forEach(emp => {
    const dept = emp.department || 'Bez odseka';
    if (!deptGroups[dept]) deptGroups[dept] = [];
    deptGroups[dept].push(emp);
  });
  const deptGroupEntries = Object.entries(deptGroups);

  const exportCSV = () => {
    if (weeklyData.length === 0) { alert("Nema podataka."); return; }
    const headers = "Ime,Datum,Prva Prijava,Poslednja Odjava,Smena,Rad,Prekovremeno,Status,Odsek,Pozicija\n";
    const csv = headers + weeklyData.map(r =>
      `"${r.employeeName}",${toDMY(r.date)},${r.firstEntry || '-'},${r.lastExit || '-'},"${r.shiftName}","${r.workedFormatted}","${r.overtimeFormatted || '0'}","${r.status}","${r.department}","${r.position}"`
    ).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', ''); a.setAttribute('href', url);
    a.setAttribute('download', `nedeljni_raport_${weekStart}.csv`);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const exportExcel = () => {
    if (!excelMonth) return;
    const [y, m] = excelMonth.split('-');
    window.open(`http://localhost:3001/api/reports/excel-monthly?year=${y}&month=${m}`, '_blank');
  };

  const exportWeeklyOvertimeExcel = async () => {
    // We only want employees who have approved overtime > 0
    const employeesWithOvertime = filteredEmployees.filter(emp => emp.totalOvertimeMins > 0);
    
    if (employeesWithOvertime.length === 0) {
      alert("Nema odobrenog prekovremenog rada u izabranoj nedelji.");
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/reports/excel-overtime-weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart,
          weeklyDates,
          employees: employeesWithOvertime
        })
      });
      
      if (!response.ok) throw new Error('Greška pri generisanju Excela');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('hidden', ''); 
      a.setAttribute('href', url);
      a.setAttribute('download', `Nedeljno_Prekovremeno_${weekStart}.xlsx`);
      document.body.appendChild(a); 
      a.click(); 
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("Došlo je do greške prilikom preuzimanja Excel fajla.");
    }
  };

  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${toDMY(weekStart)} — ${toDMY(toISO(weekEnd))}`;

  // Badge components
  const StatusBadge = ({ status }) => {
    let bg, color, Icon;
    if (status === 'Na vreme') { bg = 'rgba(16,185,129,0.15)'; color = 'var(--success)'; Icon = CheckCircle; }
    else if (status === 'U toleranciji') { bg = 'rgba(245,158,11,0.15)'; color = 'var(--warning)'; Icon = ShieldAlert; }
    else if (status.startsWith('Kasni')) { bg = 'rgba(239,68,68,0.15)'; color = 'var(--danger)'; Icon = AlertTriangle; }
    else { bg = 'rgba(99,102,241,0.1)'; color = 'var(--text-muted)'; Icon = Clock; }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
        <Icon size={10} /> {status}
      </span>
    );
  };

  const thStyle = { padding: '0.5rem 0.4rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.75rem', borderBottom: '1px solid var(--surface-border)' };
  const stickyCol = { position: 'sticky', left: 0, background: 'rgba(15,23,42,0.97)', zIndex: 2 };
  const summaryCol = { padding: '0.4rem 0.3rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, borderRight: '2px solid rgba(99,102,241,0.3)' };

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 2rem)' }}>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', flexShrink: 0 }}>
        <div>
          <h1 className="page-title text-gradient">Izveštaji</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-success" onClick={exportCSV}><Download size={18} /> Nedeljni CSV</button>
          <button className="btn-primary" onClick={exportWeeklyOvertimeExcel} style={{ background: '#f59e0b', color: 'white' }}>
            <FileSpreadsheet size={18} /> Prekovremeno (Excel)
          </button>
          <div style={{ width: '1px', height: '24px', background: 'var(--surface-border)', margin: '0 0.5rem' }}></div>
          <input 
            type="month" 
            value={excelMonth} 
            onChange={e => setExcelMonth(e.target.value)} 
            className="input-glass" 
            style={{ width: '140px', padding: '0.5rem' }} 
            title="Izaberite mesec za Excel"
          />
          <button className="btn-primary" onClick={exportExcel} style={{ background: '#10b981', color: 'white' }}>
            <FileSpreadsheet size={18} /> Matrični Excel
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Week Navigator + Dept Filter */}
          <div className="glass-panel" style={{ padding: '0.75rem 1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', flexShrink: 0 }}>
            <button onClick={() => shiftWeek(-1)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: 'white', borderRadius: '8px', padding: '0.4rem 0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit', fontSize: '0.85rem' }}>
              <ChevronLeft size={16} /> Prethodna
            </button>

            {/* Bulk leave button */}
            <button onClick={() => setShowBulkLeave(true)} style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: '8px', padding: '0.4rem 0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600 }}>
              <Plus size={14} /> Odsustvo
            </button>

            {/* Department and Employee filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Building2 size={16} color="var(--text-muted)" />
                  <select
                    value={filterDept}
                    onChange={e => { setFilterDept(e.target.value); setSelectedEmps([]); }}
                    className="input-glass"
                    style={{ width: 'auto', minWidth: '160px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    <option value="__all__">Svi Odseci</option>
                    {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
                    <option value="-">Bez odseka</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <select
                    value=""
                    onChange={e => {
                      const val = e.target.value;
                      if (val && !selectedEmps.includes(val)) {
                        setSelectedEmps([...selectedEmps, val]);
                      }
                    }}
                    className="input-glass"
                    style={{ width: 'auto', minWidth: '180px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    <option value="">+ Dodaj Radnika</option>
                    {availableEmployeesForFilter.filter(e => !selectedEmps.includes(e.name)).map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
                  </select>
                </div>
              </div>
              
              {/* Selected Employees Chips */}
              {selectedEmps.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '2px' }}>
                  {selectedEmps.map(empName => (
                    <span key={empName} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--primary-color)', color: 'white', padding: '2px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {empName}
                      <button onClick={() => setSelectedEmps(selectedEmps.filter(n => n !== empName))} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }} title="Ukloni">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <button onClick={() => setSelectedEmps([])} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600, marginLeft: '4px' }}>Očisti sve</button>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700 }}>{weekLabel}</span>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{filteredEmployees.length} radnika</p>
            </div>
            <button onClick={() => shiftWeek(1)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: 'white', borderRadius: '8px', padding: '0.4rem 0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit', fontSize: '0.85rem' }}>
              Sledeća <ChevronRight size={16} />
            </button>
          </div>

          {/* Table */}
          <div className="glass-panel" style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0, WebkitOverflowScrolling: 'touch', width: '100%', maxWidth: '100%' }}>
            {weeklyLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Učitavanje...</div>
            ) : filteredEmployees.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nema aktivnosti za ovu nedelju{filterDept !== '__all__' ? ` u odseku "${filterDept}"` : ''}.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1400px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0f172a', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}>
                  <tr>
                    <th style={{ ...thStyle, ...stickyCol, textAlign: 'left', minWidth: '160px', padding: '0.5rem 1rem', background: '#0f172a', zIndex: 11 }}>Ime Radnika</th>
                    {/* Summary columns */}
                    <th style={{ ...thStyle, minWidth: '70px', borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
                      <div>Ukupno</div><div style={{ fontSize: '0.6rem', opacity: 0.7 }}>Rad</div>
                    </th>
                    <th style={{ ...thStyle, minWidth: '70px' }}>
                      <div>Ukupno</div><div style={{ fontSize: '0.6rem', opacity: 0.7 }}>Prekovr.</div>
                    </th>
                    <th style={{ ...thStyle, minWidth: '70px', borderRight: '2px solid rgba(99,102,241,0.3)' }}>
                      <div>Ukupno</div><div style={{ fontSize: '0.6rem', opacity: 0.7 }}>Kašnjenje</div>
                    </th>
                    {/* Day columns */}
                    {weeklyDates.map((date, i) => (
                      <th key={date} style={{ ...thStyle, minWidth: '140px' }}>
                        <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>{DAY_NAMES[i]}</div>
                        <div>{toDMY(date)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deptGroupEntries.map(([dept, emps]) => (
                    <React.Fragment key={dept}>
                      {/* Department header row */}
                      {filterDept === '__all__' && (
                        <tr>
                          <td colSpan={4 + weeklyDates.length} style={{ padding: '0.6rem 1rem', background: 'rgba(99,102,241,0.08)', borderBottom: '2px solid rgba(99,102,241,0.25)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary-color)', position: 'sticky', left: 0, zIndex: 1 }}>
                            <Building2 size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                            {dept} ({emps.length})
                          </td>
                        </tr>
                      )}
                      {emps.map((emp) => (
                        <tr key={emp.name} style={{ borderBottom: '1px solid var(--surface-border)' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                          <td style={{ padding: '0.5rem 1rem', fontWeight: 600, fontSize: '0.85rem', ...stickyCol, zIndex: 1 }}>
                            <div>{emp.name}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                              {emp.position !== '-' ? emp.position : ''}
                            </div>
                          </td>
                          <td style={{ ...summaryCol, color: 'var(--success)', borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
                            <Clock size={11} style={{ verticalAlign: 'middle' }} /> {emp.totalWorkedFormatted}
                          </td>
                          <td style={{ ...summaryCol, color: emp.totalOvertimeMins > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                            <Timer size={11} style={{ verticalAlign: 'middle' }} /> {emp.totalOvertimeFormatted}
                          </td>
                          <td style={{ ...summaryCol, color: emp.totalLateMins > 0 ? 'var(--danger)' : 'var(--text-muted)', borderRight: '2px solid rgba(99,102,241,0.3)' }}>
                            <AlertTriangle size={11} style={{ verticalAlign: 'middle' }} /> {emp.totalLateFormatted}
                          </td>
                          {weeklyDates.map(date => {
                            const d = emp.days[date];
                            // Empty cell — clickable to assign leave or overtime
                            if (!d) return (
                              <td key={date} style={{ padding: '0.3rem', textAlign: 'center', cursor: 'pointer', position: 'relative' }}
                                onClick={() => setActionModal({ employeeName: emp.name, date, tab: 'overtime', defaultMins: '' })}>
                                <span style={{ color: 'var(--text-muted)', opacity: 0.3, fontSize: '0.8rem' }}>—</span>
                              </td>
                            );
                            // Leave day (no attendance)
                            if (d.leaveType && !d.firstEntry) {
                              const lc = LEAVE_CONFIG[d.leaveType] || LEAVE_CONFIG.slobodan_dan;
                              const LeaveIcon = lc.icon;
                              return (
                                <td key={date} style={{ padding: '0.4rem 0.3rem', verticalAlign: 'top', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', background: lc.bg, border: `1px solid ${lc.color}44`, cursor: 'pointer' }}
                                      onClick={() => removeLeave(d.employeeName, d.date)} title="Klikni za brisanje">
                                      <LeaveIcon size={12} color={lc.color} />
                                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: lc.color }}>{lc.label}</span>
                                    </div>
                                    {d.leaveType !== 'rad_8h' && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>8h</span>}
                                    {d.leaveType === 'rad_8h' && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Regularan Rad</span>}
                                  </div>
                                </td>
                              );
                            }
                            // Normal attendance cell
                            return (
                              <td key={date} onClick={() => setActionModal({ employeeName: d.employeeName, date: d.date, tab: 'leave', defaultMins: null, hasAttendance: true })} style={{ padding: '0.4rem 0.3rem', verticalAlign: 'top', textAlign: 'center', cursor: 'pointer' }} title="Kliknite za izmenu ili brisanje prijave">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, background: `${d.shiftColor}22`, color: d.shiftColor, border: `1px solid ${d.shiftColor}44` }}>{d.shiftName}</span>
                                    {d.isOvernightSession && <Moon size={10} color="var(--primary-color)" title="Noćna" />}
                                  </div>
                                  <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                                    <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '2px' }}><LogIn size={10} /> {d.firstEntry ? d.firstEntry.substring(0, 5) : '-'}</span>
                                    <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '2px' }}><LogOut size={10} /> {d.lastExit ? d.lastExit.substring(0, 5) : '-'}</span>
                                  </div>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{d.workedFormatted}</span>
                                  {d.overtimeMins > 0 && d.status !== 'Ručni Unos' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '1px 6px', borderRadius: '6px', background: d.overtimeApproved ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${d.overtimeApproved ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                                      <input type="checkbox" checked={d.overtimeApproved} onChange={(e) => { e.stopPropagation(); toggleOvertime(d.employeeName, d.date, d.overtimeApproved); }} style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: 'var(--success)' }} title={d.overtimeApproved ? 'Prihvaćeno' : 'Prihvati prekovremeno'} />
                                      <span onClick={(e) => { e.stopPropagation(); setActionModal({ employeeName: d.employeeName, date: d.date, tab: 'overtime', defaultMins: d.overtimeMins }); }} style={{ fontSize: '0.65rem', fontWeight: 700, color: d.overtimeApproved ? 'var(--success)' : 'var(--warning)', cursor: 'pointer' }} title="Klikni za izmenu">+{d.overtimeFormatted}</span>
                                    </div>
                                  )}
                                  {/* Add overtime button when no overtime exists */}
                                  {(!d.overtimeMins || d.overtimeMins === 0) && d.status !== 'Ručni Unos' && (
                                    <span onClick={(e) => { e.stopPropagation(); setActionModal({ employeeName: d.employeeName, date: d.date, tab: 'overtime', defaultMins: '' }); }}
                                      style={{ fontSize: '0.6rem', color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.5, padding: '1px 6px', borderRadius: '4px', border: '1px dashed rgba(255,255,255,0.15)', transition: 'opacity 0.2s' }}
                                      onMouseEnter={e => e.target.style.opacity = 1}
                                      onMouseLeave={e => e.target.style.opacity = 0.5}
                                      title="Dodaj prekovremeno ručno">+ Prekovr.</span>
                                  )}
                                  {/* Special visual block for manual overtime record (where no attendance exists) */}
                                  {d.status === 'Ručni Unos' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', border: `1px solid rgba(16,185,129,0.4)` }}>
                                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--success)' }}>Prekovr. (ručno)</span>
                                      <span onClick={(e) => { e.stopPropagation(); setActionModal({ employeeName: d.employeeName, date: d.date, tab: 'overtime', defaultMins: d.overtimeMins }); }} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--success)', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', padding:'1px 5px', borderRadius:'4px' }} title="Klikni za izmenu">+{d.overtimeFormatted}</span>
                                    </div>
                                  )}
                                  {d.status !== 'Ručni Unos' && <StatusBadge status={d.status} />}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', padding: '0 0.5rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><LogIn size={13} color="var(--success)" /> Prva prijava</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><LogOut size={13} color="var(--danger)" /> Poslednja odjava</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Moon size={13} color="var(--primary-color)" /> Noćna smena</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Palmtree size={13} color="#3b82f6" /> Odmor (8h)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><HeartPulse size={13} color="#ef4444" /> Bolovanje (8h)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><CalendarOff size={13} color="#94a3b8" /> Slobodan dan (8h)</span>
          </div>
        </div>

    </div>

      <ActionModal />
      <BulkLeaveModal />
    </>
  );

  // Unified popup for Leave and Overtime
  function ActionModal() {
    if (!actionModal) return null;
    
    // local state for overtime inputs
    const [h, setH] = useState(actionModal.defaultMins ? Math.floor(actionModal.defaultMins / 60) : 0);
    const [m, setM] = useState(actionModal.defaultMins ? actionModal.defaultMins % 60 : 0);

    const isLeave = actionModal.tab === 'leave';

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setActionModal(null)}>
        <div style={{ background: '#1e293b', border: '1px solid var(--surface-border)', borderRadius: '16px', padding: '1.5rem', minWidth: '320px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Unos Akcije</h3>
            <button onClick={() => setActionModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>{actionModal.employeeName}</span>
            <span>{toDMY(actionModal.date)}</span>
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem' }}>
            <button onClick={() => setActionModal({ ...actionModal, tab: 'overtime' })} style={{ flex: 1, padding: '0.5rem', background: !isLeave ? 'var(--primary-color)' : 'transparent', color: !isLeave ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Prekovremeno</button>
            <button onClick={() => setActionModal({ ...actionModal, tab: 'leave' })} style={{ flex: 1, padding: '0.5rem', background: isLeave ? 'var(--primary-color)' : 'transparent', color: isLeave ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Odsustvo</button>
          </div>

          {!isLeave ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Sati
                  <input type="number" min="0" value={h} onChange={e => setH(Number(e.target.value))} className="input-glass" style={{ marginTop: '0.3rem', textAlign: 'center' }} />
                </label>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Minuti
                  <input type="number" min="0" max="59" value={m} onChange={e => setM(Number(e.target.value))} className="input-glass" style={{ marginTop: '0.3rem', textAlign: 'center' }} />
                </label>
              </div>
              <button onClick={() => saveOvertimeMins(actionModal.employeeName, actionModal.date, h * 60 + m)} className="btn-success" style={{ padding: '0.6rem', justifyContent: 'center' }}>
                <CheckCircle size={16} /> Sačuvaj i odobri
              </button>
              {actionModal.defaultMins > 0 && (
                <button onClick={() => saveOvertimeMins(actionModal.employeeName, actionModal.date, null)} style={{ padding: '0.4rem', border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer' }}>
                  Poništi ručni unos
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.entries(LEAVE_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button key={key} onClick={() => assignLeave(actionModal.employeeName, actionModal.date, key)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: '10px', border: `1px solid ${cfg.color}44`, background: cfg.bg, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, color: cfg.color }}>
                    <Icon size={16} /> {cfg.label}
                  </button>
                );
              })}
              {actionModal.hasAttendance && (
                <button onClick={async () => {
                  if(!window.confirm(`Ovo će obrisati sve prijave i odjave za ${actionModal.employeeName} na dan ${actionModal.date}. Da li ste sigurni?`)) return;
                  try {
                    await fetch('http://localhost:3001/api/attendance/day', {
                      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ employeeName: actionModal.employeeName, date: actionModal.date })
                    });
                    setActionModal(null);
                    fetchWeeklyReport(true);
                  } catch(e) { console.error(e); }
                }} style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, color: '#ef4444' }}>
                  <X size={16} /> Obriši prijave/odjave (Očisti dan)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Bulk leave modal (period)
  function BulkLeaveModal() {
    if (!showBulkLeave) return null;
    // Build employee name list from all available employees
    const allNames = [...new Set([
      ...employees.map(e => `${e.lastName} ${e.firstName}`.toUpperCase()),
      ...weeklyData.map(r => r.employeeName)
    ])].sort();

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setShowBulkLeave(false)}>
        <div style={{ background: '#1e293b', border: '1px solid var(--surface-border)', borderRadius: '16px', padding: '2rem', minWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Masovni unos odsustva</h3>
            <button onClick={() => setShowBulkLeave(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Zaposleni</label>
              <select value={bulkLeaveEmp} onChange={e => setBulkLeaveEmp(e.target.value)} className="input-glass" style={{ width: '100%' }}>
                <option value="">— Izaberite —</option>
                {allNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Tip odsustva</label>
              <select value={leaveForm.leaveType} onChange={e => setLeaveForm(f => ({ ...f, leaveType: e.target.value }))} className="input-glass" style={{ width: '100%' }}>
                {Object.entries(LEAVE_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Od</label>
                <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))} className="input-glass" style={{ width: '100%', colorScheme: 'dark' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Do</label>
                <input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))} className="input-glass" style={{ width: '100%', colorScheme: 'dark' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Napomena (opciono)</label>
              <input type="text" value={leaveForm.note} onChange={e => setLeaveForm(f => ({ ...f, note: e.target.value }))} className="input-glass" style={{ width: '100%' }} placeholder="Npr. godišnji odmor" />
            </div>
            <button onClick={submitBulkLeave} className="btn-primary" style={{ width: '100%', padding: '0.7rem', justifyContent: 'center' }}>
              <Plus size={16} /> Sačuvaj odsustvo
            </button>
          </div>
        </div>
      </div>
    );
  }
}
