import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Download, Calendar, ChevronLeft, ChevronRight, Clock, LogIn, LogOut, AlertTriangle, CheckCircle, ShieldAlert, Timer, Moon, Building2 } from 'lucide-react';

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}
function toISO(d) { return d.toISOString().split('T')[0]; }
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
  const [employees, setEmployees] = useState([]);

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

  const fetchWeeklyReport = useCallback(async () => {
    setWeeklyLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/reports/weekly?weekStart=${weekStart}`);
      const result = await res.json();
      if (result.success) { setWeeklyData(result.data); setWeeklyDates(result.dates || []); }
    } catch (err) { console.error(err); }
    setWeeklyLoading(false);
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
      fetchWeeklyReport();
    } catch (err) { console.error(err); }
  };

  // Unique departments from employees DB
  const allDepts = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();

  // Group by employee
  const groupedByEmployee = {};
  weeklyData.forEach(row => {
    if (!groupedByEmployee[row.employeeName]) {
      groupedByEmployee[row.employeeName] = { name: row.employeeName, department: row.department, position: row.position, days: {} };
    }
    groupedByEmployee[row.employeeName].days[row.date] = row;
  });

  // Calculate weekly summaries per employee  
  const employeeList = Object.values(groupedByEmployee).map(emp => {
    let totalWorkedMins = 0, totalOvertimeMins = 0, totalLateMins = 0;
    Object.values(emp.days).forEach(day => {
      if (day.firstEntry) totalWorkedMins += 480;
      if (day.overtimeApproved) totalOvertimeMins += day.overtimeMins || 0;
      totalLateMins += day.lateMins || 0;
    });
    return {
      ...emp,
      totalWorkedMins,
      totalOvertimeMins,
      totalLateMins,
      totalWorkedFormatted: `${Math.floor(totalWorkedMins / 60)}h`,
      totalOvertimeFormatted: `${Math.floor(totalOvertimeMins / 60)}h ${totalOvertimeMins % 60}m`,
      totalLateFormatted: `${Math.floor(totalLateMins / 60)}h ${totalLateMins % 60}m`,
    };
  }).sort((a, b) => (a.department || 'zzz').localeCompare(b.department || 'zzz') || a.name.localeCompare(b.name));

  // Filter by department
  const filteredEmployees = filterDept === '__all__' ? employeeList : employeeList.filter(e => (e.department || '-') === filterDept);

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
    <div>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title text-gradient">Izveštaji</h1>
          <p className="page-description">Nedeljni raport sa automatskim uklapanjem u smene i prekovremenim radom.</p>
        </div>
        <button className="btn-success" onClick={exportCSV}><Download size={20} /> Preuzmi CSV</button>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[['weekly', 'Nedeljni Raport'], ['chart', 'Grafikon']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: '0.6rem 1.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', fontSize: '0.9rem', transition: 'var(--transition)',
            background: activeTab === key ? 'var(--primary-color)' : 'transparent', color: activeTab === key ? 'white' : 'var(--text-muted)'
          }}>{label}</button>
        ))}
      </div>

      {activeTab === 'weekly' && (
        <div>
          {/* Week Navigator + Dept Filter */}
          <div className="glass-panel" style={{ padding: '0.75rem 1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button onClick={() => shiftWeek(-1)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: 'white', borderRadius: '8px', padding: '0.4rem 0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit', fontSize: '0.85rem' }}>
              <ChevronLeft size={16} /> Prethodna
            </button>

            {/* Department filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building2 size={16} color="var(--text-muted)" />
              <select
                value={filterDept}
                onChange={e => setFilterDept(e.target.value)}
                className="input-glass"
                style={{ width: 'auto', minWidth: '180px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                <option value="__all__">Svi Odseci</option>
                {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
                <option value="-">Bez odseka</option>
              </select>
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
          <div className="glass-panel" style={{ overflow: 'auto' }}>
            {weeklyLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Učitavanje...</div>
            ) : filteredEmployees.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nema aktivnosti za ovu nedelju{filterDept !== '__all__' ? ` u odseku "${filterDept}"` : ''}.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1400px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <th style={{ ...thStyle, ...stickyCol, textAlign: 'left', minWidth: '160px', padding: '0.5rem 1rem' }}>Ime Radnika</th>
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
                            if (!d) return <td key={date} style={{ padding: '0.3rem', textAlign: 'center', color: 'var(--text-muted)', opacity: 0.3 }}>—</td>;
                            return (
                              <td key={date} style={{ padding: '0.4rem 0.3rem', verticalAlign: 'top', textAlign: 'center' }}>
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
                                  {d.overtimeMins > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '1px 6px', borderRadius: '6px', background: d.overtimeApproved ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${d.overtimeApproved ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                                      <input type="checkbox" checked={d.overtimeApproved} onChange={() => toggleOvertime(d.employeeName, d.date, d.overtimeApproved)} style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: 'var(--success)' }} title={d.overtimeApproved ? 'Prihvaćeno' : 'Prihvati prekovremeno'} />
                                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: d.overtimeApproved ? 'var(--success)' : 'var(--warning)' }}>+{d.overtimeFormatted}</span>
                                    </div>
                                  )}
                                  <StatusBadge status={d.status} />
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
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', padding: '0 0.5rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><LogIn size={13} color="var(--success)" /> Prva prijava</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><LogOut size={13} color="var(--danger)" /> Poslednja odjava</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Moon size={13} color="var(--primary-color)" /> Noćna smena (izlaz sutradan)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><input type="checkbox" checked readOnly style={{ width: '12px', height: '12px', accentColor: 'var(--success)' }} /> Prihvaćeno prekovremeno</span>
          </div>
        </div>
      )}

      {activeTab === 'chart' && (
        <div className="glass-panel" style={{ padding: '2rem', height: '500px' }}>
          {chartLoading ? (
            <div style={{ color: 'var(--text-muted)' }}>Učitavanje grafikona...</div>
          ) : chartData.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>Nema podataka. Pokrenite sinhronizaciju!</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="var(--text-muted)" />
                <YAxis stroke="var(--text-muted)" allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-color)', border: '1px solid var(--surface-border)', borderRadius: '8px' }} itemStyle={{ color: 'var(--text-main)' }} />
                <Legend />
                <Bar dataKey="Prijave" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Odjave" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
