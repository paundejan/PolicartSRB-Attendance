import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Pencil, Trash2, Upload, CheckSquare } from 'lucide-react';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({ employeeId: '', firstName: '', lastName: '', department: '', position: '', email: '' });
  
  // Bulk assign state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkDept, setBulkDept] = useState('');
  const [bulkPos, setBulkPos] = useState('');

  const fileInputRef = useRef(null);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/employees');
      const data = await res.json();
      if (data.success) setEmployees(data.data);
    } catch (err) { console.error("Could not fetch employees", err); }
    setLoading(false);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/employees/upload', { method: 'POST', body: fd });
      const result = await res.json();
      if (result.success) { alert(`Uspešno uvezeno/ažurirano ${result.imported} zaposlenih!`); fetchEmployees(); }
      else { alert("Greška pri uvozu: " + result.error); }
    } catch (e) { alert("Network error: " + e.message); }
    setLoading(false);
    event.target.value = null;
  };

  useEffect(() => { fetchEmployees(); }, []);

  // Existing unique departments and positions for suggestions
  const existingDepts = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();
  const existingPos = [...new Set(employees.map(e => e.position).filter(Boolean))].sort();

  const openAddModal = () => {
    setEditId(null);
    setFormData({ employeeId: '', firstName: '', lastName: '', department: '', position: '', email: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (emp) => {
    setEditId(emp.id);
    setFormData({ employeeId: emp.employeeId || '', firstName: emp.firstName, lastName: emp.lastName, department: emp.department || '', position: emp.position || '', email: emp.email || '' });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Da li ste sigurni da želite da obrišete ovog zaposlenog?")) return;
    try { await fetch(`http://localhost:3001/api/employees/${id}`, { method: 'DELETE' }); fetchEmployees(); }
    catch (e) { console.error("Delete failed", e); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editId ? `http://localhost:3001/api/employees/${editId}` : 'http://localhost:3001/api/employees';
      const method = editId ? 'PUT' : 'POST';
      
      const payload = { ...formData };
      if (payload.employeeId === '') payload.employeeId = null;
      if (payload.email === '') payload.email = null;

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      
      if (!result.success) {
        alert("Greška pri unosu: " + result.error);
        return;
      }
      
      setIsModalOpen(false);
      fetchEmployees();
    } catch (err) { alert("Greška: " + err.message); console.error("Save failed", err); }
  };

  // Bulk selection
  const toggleSelect = (id) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const selectAll = () => {
    if (selectedIds.size === employees.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(employees.map(e => e.id)));
  };

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0) { alert('Izaberite bar jednog radnika.'); return; }
    if (!bulkDept && !bulkPos) { alert('Unesite odsek ili poziciju za masovnu dodelu.'); return; }
    setLoading(true);
    try {
      for (const id of selectedIds) {
        const updateData = {};
        if (bulkDept) updateData.department = bulkDept;
        if (bulkPos) updateData.position = bulkPos;
        await fetch(`http://localhost:3001/api/employees/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) });
      }
      alert(`Uspešno ažurirano ${selectedIds.size} zaposlenih!`);
      setSelectedIds(new Set()); setBulkDept(''); setBulkPos(''); setBulkMode(false);
      fetchEmployees();
    } catch (err) { console.error(err); alert('Greška: ' + err.message); }
    setLoading(false);
  };

  return (
    <div>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title text-gradient">Zaposleni</h1>
          <p className="page-description">Upravljanje listom radnika i njihovim profilima.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
            style={{ background: bulkMode ? 'var(--warning)' : 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'inherit', fontSize: '0.95rem', transition: 'var(--transition)' }}>
            <CheckSquare size={18} /> {bulkMode ? 'Otkaži Selekciju' : 'Masovna Dodela'}
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls, .csv" style={{ display: 'none' }} />
          <button className="btn-success" onClick={() => fileInputRef.current.click()}><Upload size={20} /> Uvezi iz Excela</button>
          <button className="btn-primary" onClick={openAddModal}><Plus size={20} /> Dodaj Radnika</button>
        </div>
      </header>

      {/* Bulk Assign Panel */}
      {bulkMode && (
        <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', borderLeft: '4px solid var(--warning)' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Odsek za selektovane</label>
            <input className="input-glass" list="bulk-dept-list" placeholder="Izaberite ili ukucajte..." value={bulkDept} onChange={e => setBulkDept(e.target.value)} />
            <datalist id="bulk-dept-list">{existingDepts.map(d => <option key={d} value={d} />)}</datalist>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>Pozicija za selektovane</label>
            <input className="input-glass" list="bulk-pos-list" placeholder="Izaberite ili ukucajte..." value={bulkPos} onChange={e => setBulkPos(e.target.value)} />
            <datalist id="bulk-pos-list">{existingPos.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <button className="btn-success" onClick={handleBulkAssign} style={{ whiteSpace: 'nowrap' }}>
            Primeni na {selectedIds.size} radnika
          </button>
        </div>
      )}

      {/* Hidden datalists for individual modal */}
      <datalist id="dept-list">{existingDepts.map(d => <option key={d} value={d} />)}</datalist>
      <datalist id="pos-list">{existingPos.map(p => <option key={p} value={p} />)}</datalist>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid var(--surface-border)' }}>
            <tr>
              {bulkMode && (
                <th style={{ padding: '1rem 0.5rem', width: '40px', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedIds.size === employees.length && employees.length > 0} onChange={selectAll} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)' }} />
                </th>
              )}
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>ID #</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Ime</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Prezime</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Odsek</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Pozicija</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Akcije</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={bulkMode ? 8 : 7} style={{ padding: '2rem', textAlign: 'center' }}>Učitavanje...</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={bulkMode ? 8 : 7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nema zaposlenih u bazi.</td></tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} style={{ borderBottom: '1px solid var(--surface-border)', transition: 'var(--transition)', background: selectedIds.has(emp.id) ? 'rgba(99,102,241,0.08)' : 'transparent' }}
                    onMouseEnter={e => { if (!selectedIds.has(emp.id)) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; }}
                    onMouseLeave={e => { if (!selectedIds.has(emp.id)) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                  {bulkMode && (
                    <td style={{ padding: '1rem 0.5rem', textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedIds.has(emp.id)} onChange={() => toggleSelect(emp.id)} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)' }} />
                    </td>
                  )}
                  <td style={{ padding: '1rem', fontFamily: 'monospace', color: 'var(--primary-color)' }}>{emp.employeeId || '-'}</td>
                  <td style={{ padding: '1rem' }}>{emp.firstName}</td>
                  <td style={{ padding: '1rem' }}>{emp.lastName}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{emp.department || '-'}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{emp.position || '-'}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button onClick={() => openEditModal(emp)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', marginRight: '1rem' }}><Pencil size={18} /></button>
                    <button onClick={() => handleDelete(emp.id)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '2rem', width: '420px', background: 'var(--bg-color)', border: '1px solid var(--surface-border)' }}>
            <h2 className="h2" style={{ marginBottom: '1.5rem' }}>{editId ? 'Uredi Podatke Radnika' : 'Dodaj Radnika'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Matični Broj / Broj Bedža</label>
                <input className="input-glass" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Ime</label>
                  <input required className="input-glass" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Prezime</label>
                  <input required className="input-glass" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Odsek (Sektor)</label>
                <input className="input-glass" list="dept-list" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="Ukucajte ili izaberite postojeći..." />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Pozicija</label>
                <input className="input-glass" list="pos-list" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} placeholder="Ukucajte ili izaberite postojeću..." />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Snimi</button>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--surface-border)', color: 'white', borderRadius: '8px', cursor: 'pointer' }}>Otkaži</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
