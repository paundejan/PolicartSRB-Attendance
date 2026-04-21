import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle, Clock, AlertTriangle, Calendar, Database, Download, Upload, HardDrive, Package, Sun } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { format } from 'date-fns';

export default function Dashboard() {
  const getTodayStr = () => {
    const today = new Date();
    return format(today, 'yyyy-MM-dd');
  };


  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncDate, setSyncDate] = useState(getTodayStr());

  const [massiveSyncing, setMassiveSyncing] = useState(false);
  const [massiveSyncResult, setMassiveSyncResult] = useState(null);
  const [massiveStartDate, setMassiveStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return format(d, 'yyyy-MM-dd');
  });
  const [massiveEndDate, setMassiveEndDate] = useState(getTodayStr());

  const [tsYear, setTsYear] = useState(() => new Date().getFullYear());
  const [tsMonth, setTsMonth] = useState(() => new Date().getMonth() + 1);
  const [syncingTs, setSyncingTs] = useState(false);
  const [tsSyncResult, setTsSyncResult] = useState(null);

  const [stats, setStats] = useState({ todayCount: 0, totalCount: 0 });

  // Export / Import state
  const [exportEmployees, setExportEmployees] = useState(true);
  const [exportAttendance, setExportAttendance] = useState(true);
  const [exportLeaves, setExportLeaves] = useState(true);
  const [exportShifts, setExportShifts] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const importFileRef = useRef(null);

  const fetchStats = async () => {
    try {
      const dateStr = getTodayStr();
      const res = await fetch('http://localhost:3001/api/events');
      const data = await res.json();
      if (data.success && data.data) {
        const total = data.data.length;
        const todayCount = data.data.filter(r => r.date === dateStr).length;
        setStats({ todayCount, totalCount: total });
      }
    } catch(err) {
        console.error("Failed to load stats", err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('http://localhost:3001/api/sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: syncDate || null })
      });
      const result = await res.json();
      if (result.success) {
        setSyncResult({ type: 'success', text: result.message });
        fetchStats(); 
      } else {
        setSyncResult({ type: 'error', text: result.error || 'Sync failed.' });
      }
    } catch(error) {
      setSyncResult({ type: 'error', text: 'Backend unavailable. Ensure Node server is running.' });
    }
    setSyncing(false);
  };

  const handleMassiveSync = async () => {
    if (!massiveStartDate || !massiveEndDate) {
      setMassiveSyncResult({ type: 'error', text: 'Odaberite početni i krajnji datum.' });
      return;
    }
    setMassiveSyncing(true);
    setMassiveSyncResult(null);
    try {
      const res = await fetch('http://localhost:3001/api/sync/massive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: massiveStartDate, endDate: massiveEndDate })
      });
      const result = await res.json();
      if (result.success) {
        setMassiveSyncResult({ type: 'success', text: result.message });
        fetchStats();
      } else {
        setMassiveSyncResult({ type: 'error', text: result.error || 'Massive Sync failed.' });
      }
    } catch (error) {
      setMassiveSyncResult({ type: 'error', text: 'Backend unavailable.' });
    }
    setMassiveSyncing(false);
  };

  const handleSyncTimesheet = async () => {
    setSyncingTs(true);
    setTsSyncResult(null);
    try {
        const res = await fetch('http://localhost:3001/api/kadrovska/sync-timesheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year: Number(tsYear), month: Number(tsMonth) })
        });
        const data = await res.json();
        if (data.success) {
            setTsSyncResult({ type: 'success', text: `Sinhronizacija završena. Dodato/Ažurirano zapisa: ${data.count}` });
        } else {
            setTsSyncResult({ type: 'error', text: 'Greška pri sinhronizaciji: ' + data.error });
        }
    } catch (err) {
        setTsSyncResult({ type: 'error', text: 'Backend unavailable.' });
    }
    setSyncingTs(false);
  };

  const handleExport = async () => {
    if (!exportEmployees && !exportAttendance && !exportLeaves && !exportShifts) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (exportEmployees) params.set('employees', 'true');
      if (exportAttendance) params.set('attendance', 'true');
      if (exportLeaves) params.set('leaves', 'true');
      if (exportShifts) params.set('shifts', 'true');
      const res = await fetch(`http://localhost:3001/api/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `policat_backup_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
    setExporting(false);
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('http://localhost:3001/api/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setImportResult({ type: 'success', text: data.message, detected: data.detected });
        fetchStats();
      } else {
        setImportResult({ type: 'error', text: data.error });
      }
    } catch (err) {
      setImportResult({ type: 'error', text: 'Backend unavailable.' });
    }
    setImporting(false);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  return (
    <div>
      <header className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 className="page-title text-gradient">Dashboard Overview</h1>
        <p className="page-description">Održavanje Vaše Kadrovska evidencije na dnevnom i istorijskom nivou.</p>
      </header>

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', marginBottom: '2rem' }}>
        {/* Quick Sync Card */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <RefreshCw size={24} color="var(--primary-color)"/> Dnevna Sinhronizacija
            </h2>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>Povucite sve prijave i odjave za specifičan dan. Podesite kalendar ispod pre klika na dugme.</p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Calendar size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', zIndex: 10, pointerEvents: 'none' }} />
              <input 
                type="date"
                value={syncDate}
                onChange={(e) => setSyncDate(e.target.value)}
                className="input-glass"
                style={{ paddingLeft: '2.5rem', width: '100%', colorScheme: 'dark' }}
              />
            </div>
            <button className="btn-primary" onClick={handleManualSync} disabled={syncing || massiveSyncing} style={{ padding: '0.75rem 1.5rem', whiteSpace: 'nowrap' }}>
              <RefreshCw size={18} className={syncing ? 'spinning' : ''} />
              {syncing ? 'Učitavanje...' : 'Sinhronizuj Dan'}
            </button>
          </div>

          {syncResult && (
            <div style={{ padding: '1rem', borderRadius: '8px', 
              background: syncResult.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: syncResult.type === 'success' ? 'var(--success)' : 'var(--danger)',
              display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              {syncResult.type === 'success' ? <CheckCircle size={18}/> : <AlertTriangle size={18}/>}
              {syncResult.text}
            </div>
          )}
        </div>

        {/* Massive Sync Card */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', borderLeft: '4px solid var(--primary-color)' }}>
          <div>
            <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Database size={24} color="var(--primary-color)"/> Masovna Sinhronizacija (Do 31 dan)
            </h2>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>Povucite podatke iz dugačkog vremenskog perioda. Robot će pametno ignorisati sve unose koji već postoje kako bi sprečio duplikate u bazi.</p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Od (Početak)</label>
              <input 
                type="date"
                value={massiveStartDate}
                onChange={(e) => setMassiveStartDate(e.target.value)}
                className="input-glass"
                style={{ width: '100%', colorScheme: 'dark' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Do (Kraj)</label>
              <input 
                type="date"
                value={massiveEndDate}
                onChange={(e) => setMassiveEndDate(e.target.value)}
                className="input-glass"
                style={{ width: '100%', colorScheme: 'dark' }}
              />
            </div>
            <button className="btn-primary" onClick={handleMassiveSync} disabled={massiveSyncing || syncing} style={{ padding: '0.75rem 1.5rem', whiteSpace: 'nowrap' }}>
              <Database size={18} className={massiveSyncing ? 'spinning' : ''} />
              {massiveSyncing ? 'Masovni Upit Traje...' : 'Pokreni Upit'}
            </button>
          </div>

          {massiveSyncResult && (
            <div style={{ padding: '1rem', borderRadius: '8px', 
              background: massiveSyncResult.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: massiveSyncResult.type === 'success' ? 'var(--success)' : 'var(--danger)',
              display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              {massiveSyncResult.type === 'success' ? <CheckCircle size={18}/> : <AlertTriangle size={18}/>}
              {massiveSyncResult.text}
            </div>
          )}
        </div>
      </div>

      <div className="card-grid" style={{ marginBottom: '2rem' }}>
        <div className="glass-panel stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span className="stat-title">Događaji Danas</span>
             <Clock color="var(--primary-color)" />
          </div>
          <span className="stat-value text-gradient">{stats.todayCount}</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Svi obrađeni ulasci/izlasci na današnji dan</span>
        </div>
        
        <div className="glass-panel stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span className="stat-title">Totalna evidencija robota u bazi</span>
             <CheckCircle color="var(--success)" />
          </div>
          <span className="stat-value">{stats.totalCount}</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Svi skinuti pečati apsolutno sigurni na Vašem racunaru</span>
        </div>
      </div>

      <div className="card-grid" style={{ gridTemplateColumns: '1fr' }}>
        {/* Kadrovska Timesheet Odsustva Sync Card */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', borderLeft: '4px solid #3b82f6' }}>
          <div>
            <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Calendar size={24} color="#3b82f6"/> Sinhronizacija Odsustva (Kadrovska)
            </h2>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>
              Sinhronizovanje odmora, bolovanja, praznika i slobodnih dana na mesečnom nivou iz Kadrovska Timesheet aplikacije.
              <br/>
              <strong>Bezbednost obezbeđena:</strong> Sinhronizacija je zaštićena od preklapanja, prebrisavanja sa "upsert" metodom – više puta ponovljena procedura za isti mesec neće stvoriti duplikate zapisa.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Godina</label>
              <input 
                type="number"
                value={tsYear}
                onChange={(e) => setTsYear(e.target.value)}
                className="input-glass"
                style={{ width: '100%', colorScheme: 'dark' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Mesec (1-12)</label>
              <input 
                type="number"
                min="1" max="12"
                value={tsMonth}
                onChange={(e) => setTsMonth(e.target.value)}
                className="input-glass"
                style={{ width: '100%', colorScheme: 'dark' }}
              />
            </div>
            <button className="btn-primary" onClick={handleSyncTimesheet} disabled={syncingTs || syncing || massiveSyncing} style={{ padding: '0.75rem 1.5rem', whiteSpace: 'nowrap', background: '#3b82f6', border: '1px solid #2563eb' }}>
              <Calendar size={18} className={syncingTs ? 'spinning' : ''} />
              {syncingTs ? 'Učitavanje...' : 'Sinhronizuj Mesec'}
            </button>
          </div>

          {tsSyncResult && (
            <div style={{ padding: '1rem', borderRadius: '8px', 
              background: tsSyncResult.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: tsSyncResult.type === 'success' ? 'var(--success)' : 'var(--danger)',
              display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              {tsSyncResult.type === 'success' ? <CheckCircle size={18}/> : <AlertTriangle size={18}/>}
              {tsSyncResult.text}
            </div>
          )}
        </div>
      </div>

      {/* Export / Import Card */}
      <div className="card-grid" style={{ gridTemplateColumns: '1fr', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
          <div>
            <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <HardDrive size={24} color="#f59e0b"/> Backup & Restore (Export / Import)
            </h2>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>
              Napravite sigurnosnu kopiju podataka ili ih prenesite na drugi računar. Izaberite koje podatke želite da eksportujete.
              Import automatski prepoznaje sadržaj fajla i koristi upsert metodu — nema opasnosti od duplikata.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            {/* Export Section */}
            <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Download size={18} color="#f59e0b"/> Export Podataka
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={exportEmployees} onChange={e => setExportEmployees(e.target.checked)} 
                    style={{ accentColor: '#f59e0b', width: 18, height: 18 }}/>
                  <Package size={16} color="#8b5cf6"/> Zaposleni
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={exportAttendance} onChange={e => setExportAttendance(e.target.checked)}
                    style={{ accentColor: '#f59e0b', width: 18, height: 18 }}/>
                  <Clock size={16} color="#10b981"/> Prijave / Odjave
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={exportLeaves} onChange={e => setExportLeaves(e.target.checked)}
                    style={{ accentColor: '#f59e0b', width: 18, height: 18 }}/>
                  <Calendar size={16} color="#3b82f6"/> Odsustva
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={exportShifts} onChange={e => setExportShifts(e.target.checked)}
                    style={{ accentColor: '#f59e0b', width: 18, height: 18 }}/>
                  <Sun size={16} color="#f59e0b"/> Smene
                </label>
              </div>
              <button className="btn-primary" onClick={handleExport} disabled={exporting || (!exportEmployees && !exportAttendance && !exportLeaves && !exportShifts)}
                style={{ padding: '0.65rem 1.25rem', background: '#f59e0b', border: '1px solid #d97706', marginTop: '0.5rem' }}>
                <Download size={18} className={exporting ? 'spinning' : ''}/>
                {exporting ? 'Eksportovanje...' : 'Preuzmi Backup'}
              </button>
            </div>

            {/* Import Section */}
            <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Upload size={18} color="#3b82f6"/> Import Podataka
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                Odaberite <code>.json</code> backup fajl. Aplikacija automatski prepoznaje tipove podataka u njemu.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.65rem 1.25rem', borderRadius: '8px', background: '#3b82f6', color: '#fff', fontWeight: 500, fontSize: '0.9rem', transition: 'opacity 0.2s', opacity: importing ? 0.6 : 1 }}>
                <Upload size={18} className={importing ? 'spinning' : ''}/>
                {importing ? 'Uvoženje...' : 'Odaberi Fajl za Import'}
                <input type="file" accept=".json" ref={importFileRef} onChange={handleImport} style={{ display: 'none' }} disabled={importing}/>
              </label>
            </div>
          </div>

          {importResult && (
            <div style={{ padding: '1rem', borderRadius: '8px',
              background: importResult.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: importResult.type === 'success' ? 'var(--success)' : 'var(--danger)',
              display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {importResult.type === 'success' ? <CheckCircle size={18}/> : <AlertTriangle size={18}/>}
                {importResult.text}
              </div>
              {importResult.detected && importResult.detected.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Detektovano u fajlu:</span>
                  {importResult.detected.includes('employees') && <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: '0.8rem' }}>Zaposleni</span>}
                  {importResult.detected.includes('attendance') && <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.2)', color: '#34d399', fontSize: '0.8rem' }}>Prijave/Odjave</span>}
                  {importResult.detected.includes('leaves') && <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(59,130,246,0.2)', color: '#60a5fa', fontSize: '0.8rem' }}>Odsustva</span>}
                  {importResult.detected.includes('shifts') && <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(245,158,11,0.2)', color: '#fbbf24', fontSize: '0.8rem' }}>Smene</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinning { animation: spin 1s linear infinite; }
        .react-datepicker-wrapper { width: 100%; display: block; }
        .react-datepicker__input-container input { width: 100%; }
        .pl-10 { padding-left: 2.5rem !important; }
      `}</style>
    </div>
  );
}
