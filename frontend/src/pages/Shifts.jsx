import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Moon, Sun, ShieldAlert, Timer } from 'lucide-react';

// Custom 24h time input component
function TimeInput24h({ value, onChange, label }) {
  const [displayVal, setDisplayVal] = useState(value || '00:00');

  useEffect(() => { setDisplayVal(value || '00:00'); }, [value]);

  const handleChange = (e) => {
    let raw = e.target.value.replace(/[^0-9:]/g, '');  // only digits and colon
    // Auto-insert colon after 2 digits if user didn't type one
    if (raw.length === 2 && !raw.includes(':')) raw += ':';
    if (raw.length > 5) raw = raw.slice(0, 5);
    setDisplayVal(raw);
  };

  const handleBlur = () => {
    // Validate and normalize on blur
    const parts = displayVal.split(':');
    let h = parseInt(parts[0]) || 0;
    let m = parseInt(parts[1]) || 0;
    if (h > 23) h = 23;
    if (m > 59) m = 59;
    const normalized = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    setDisplayVal(normalized);
    onChange(normalized);
  };

  return (
    <div className="form-group">
      <label>{label}</label>
      <div style={{ position: 'relative' }}>
        <Clock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="input-glass"
          value={displayVal}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="HH:MM"
          maxLength={5}
          style={{ paddingLeft: '2.5rem', fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '0.1em' }}
          required
        />
      </div>
    </div>
  );
}

export default function Shifts() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('15:00');
  const [isOvernight, setIsOvernight] = useState(false);
  const [maxBreakMins, setMaxBreakMins] = useState(30);
  const [toleranceMins, setToleranceMins] = useState(15);
  const [color, setColor] = useState('#3b82f6'); // Default primary blue

  useEffect(() => {
    fetchShifts();
  }, []);

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/shifts');
      const data = await res.json();
      if (data.success) {
        setShifts(data.data);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleAddShift = async (e) => {
    e.preventDefault();
    if (!name || !startTime || !endTime) return;
    try {
      const res = await fetch('http://localhost:3001/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          startTime, 
          endTime, 
          isOvernight,
          maxBreakMins: parseInt(maxBreakMins) || 0,
          toleranceMins: parseInt(toleranceMins) || 0,
          color 
        })
      });
      const data = await res.json();
      if (data.success) {
        setName('');
        setStartTime('07:00');
        setEndTime('15:00');
        setIsOvernight(false);
        setMaxBreakMins(30);
        setToleranceMins(15);
        setColor('#3b82f6');
        fetchShifts();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Da li ste sigurni da želite da obrišete ovu smenu?")) return;
    try {
      await fetch(`http://localhost:3001/api/shifts/${id}`, { method: 'DELETE' });
      fetchShifts();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title text-gradient">Sistemske Smene</h1>
        <p className="page-description">Kreiranje šablona ponašanja smena, tolerancija kašnjenja i vremenskih vizuala.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
        
        {/* ADD SHIFT FORM */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 className="h2" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={20} color="var(--primary-color)" /> Nova Smena
          </h2>
          
          <form onSubmit={handleAddShift} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label>Naziv (Identifikator) smene</label>
              <input 
                type="text" 
                className="input-glass" 
                placeholder="Npr. Prva Smena, Dežurstvo..." 
                value={name} onChange={e => setName(e.target.value)} required 
              />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <TimeInput24h label="Početak (Uključivanje)" value={startTime} onChange={setStartTime} />
              <TimeInput24h label="Kraj (Isključivanje)" value={endTime} onChange={setEndTime} />
            </div>

            <div className="form-group" style={{ 
              background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '1rem', borderRadius: '8px',
              display: 'flex', alignItems: 'center', gap: '1rem'
            }}>
              <input 
                type="checkbox" 
                id="isOvernight"
                checked={isOvernight} 
                onChange={e => setIsOvernight(e.target.checked)} 
                style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label htmlFor="isOvernight" style={{ margin: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', fontWeight: 600 }}>
                  <Moon size={16} color="var(--primary-color)" /> Noćna smena (Prelazi u sutra)
                </label>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Štiklirajte ovo ako se kraj smene dešava narednog kalendarskog dana!</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Timer size={14}/> Max Pauza (min)
                </label>
                <input 
                  type="number" 
                  className="input-glass" 
                  min="0"
                  value={maxBreakMins} onChange={e => setMaxBreakMins(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShieldAlert size={14}/> Tolerancija (min)
                </label>
                <input 
                  type="number" 
                  className="input-glass" 
                  min="0"
                  title="Tolerancija kašnjenja ili ranijeg izlaska"
                  value={toleranceMins} onChange={e => setToleranceMins(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Vizuelna Boja Smene</label>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <input 
                  type="color" 
                  value={color} onChange={e => setColor(e.target.value)} 
                  style={{ width: '50px', height: '40px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Koristiće se za obeležavanje rekorda</span>
              </div>
            </div>

            <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>
              Sačuvaj Smenu
            </button>
          </form>
        </div>

        {/* SHIFTS LIST */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 className="h2" style={{ paddingLeft: '0.5rem' }}>Aktivne Smene</h2>
          
          {loading ? (
            <p style={{ color: 'var(--text-muted)', paddingLeft: '0.5rem' }}>Učitavanje smena...</p>
          ) : shifts.length === 0 ? (
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Nemate kreiranih parametara za smene u bazi.
            </div>
          ) : (
            shifts.map(shift => (
              <div key={shift.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `6px solid ${shift.color}` }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'white' }}>{shift.name}</h3>
                    {shift.isOvernight && (
                      <span title="Noćna Smena" style={{ display: 'flex', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary-color)', padding: '4px 8px', borderRadius: '20px', fontSize: '0.75rem', alignItems: 'center', gap: '4px' }}>
                        <Moon size={12}/> Noćna
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sun size={14} color="#f59e0b" />
                      {shift.startTime} - {shift.endTime}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Timer size={14} color="var(--text-muted)" />
                      {shift.maxBreakMins}m pauza
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldAlert size={14} color="var(--success)" />
                      ±{shift.toleranceMins}m tolerancije
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => handleDelete(shift.id)}
                  style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer', transition: 'var(--transition)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                  title="Obriši Smenu"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
