import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, Clock, AlertTriangle, Calendar, Database } from 'lucide-react';
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

  const [stats, setStats] = useState({ todayCount: 0, totalCount: 0 });

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

      <div className="card-grid">
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
