import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Pencil, Trash2, Upload } from 'lucide-react';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({ employeeId: '', firstName: '', lastName: '', department: '', position: '', email: '' });
  
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

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/employees/upload', {
        method: 'POST',
        body: formData
      });
      const result = await res.json();
      if (result.success) {
        alert(`Successfully imported/updated ${result.imported} employees!`);
        fetchEmployees();
      } else {
        alert("Import error: " + result.error);
      }
    } catch (e) {
      alert("Network error: " + e.message);
    }
    setLoading(false);
    event.target.value = null; // reset input
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const openAddModal = () => {
    setEditId(null);
    setFormData({ employeeId: '', firstName: '', lastName: '', department: '', position: '', email: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (emp) => {
    setEditId(emp.id);
    setFormData({
      employeeId: emp.employeeId || '',
      firstName: emp.firstName,
      lastName: emp.lastName,
      department: emp.department || '',
      position: emp.position || '',
      email: emp.email || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this employee?")) return;
    try {
      await fetch(`http://localhost:3001/api/employees/${id}`, { method: 'DELETE' });
      fetchEmployees();
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        // Update
        await fetch(`http://localhost:3001/api/employees/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      } else {
        // Create
        await fetch('http://localhost:3001/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      }
      setIsModalOpen(false);
      fetchEmployees();
    } catch (err) {
      console.error("Save failed", err);
    }
  };

  return (
    <div>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title text-gradient">Employees</h1>
          <p className="page-description">Manage your workforce list and profiles.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".xlsx, .xls, .csv" 
            style={{ display: 'none' }} 
          />
          <button className="btn-success" onClick={() => fileInputRef.current.click()}>
            <Upload size={20} />
            Import Excel
          </button>
          <button className="btn-primary" onClick={openAddModal}>
            <Plus size={20} />
            Add Employee
          </button>
        </div>
      </header>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid var(--surface-border)' }}>
            <tr>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>ID #</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>First Name</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Last Name</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Department</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Position</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No employees found in the database.</td></tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} style={{ borderBottom: '1px solid var(--surface-border)', transition: 'var(--transition)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '1rem', fontFamily: 'monospace', color: 'var(--primary-color)' }}>{emp.employeeId || '-'}</td>
                  <td style={{ padding: '1rem' }}>{emp.firstName}</td>
                  <td style={{ padding: '1rem' }}>{emp.lastName}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{emp.department || '-'}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{emp.position || '-'}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button onClick={() => openEditModal(emp)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', marginRight: '1rem' }}>
                      <Pencil size={18} />
                    </button>
                    <button onClick={() => handleDelete(emp.id)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ padding: '2rem', width: '400px', background: 'var(--bg-color)', border: '1px solid var(--surface-border)' }}>
            <h2 className="h2" style={{ marginBottom: '1.5rem' }}>{editId ? 'Edit Employee Data' : 'Add Employee'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>ID Number / Badge ID</label>
                <input className="input-glass" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>First Name</label>
                  <input required className="input-glass" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Last Name</label>
                  <input required className="input-glass" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Department</label>
                <input className="input-glass" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Position</label>
                <input className="input-glass" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Save</button>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--surface-border)', color: 'white', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
