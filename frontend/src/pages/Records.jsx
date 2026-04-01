import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar } from 'lucide-react';
import DatePicker from 'react-datepicker';
import Select, { components } from 'react-select';
import { format, parseISO } from 'date-fns';
import 'react-datepicker/dist/react-datepicker.css';

// Custom Checkbox Option component for react-select
const CheckboxOption = (props) => {
  return (
    <components.Option {...props}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input 
          type="checkbox" 
          checked={props.isSelected} 
          onChange={() => null} // Handled by library
          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--primary-color)' }}
        />
        <label style={{ margin: 0, cursor: 'pointer', fontSize: '0.9rem' }}>{props.label}</label>
      </div>
    </components.Option>
  );
};

export default function Records() {
  const getTodayStr = () => {
    const today = new Date();
    return format(today, 'yyyy-MM-dd');
  };

  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Date filter
  const [filterDate, setFilterDate] = useState(getTodayStr());

  // Additional Multi-Select Filters (Arrays of Objects from react-select)
  const [filterDept, setFilterDept] = useState([]);
  const [filterPos, setFilterPos] = useState([]);
  const [filterName, setFilterName] = useState([]);

  const fetchRecords = async (dateStr = '') => {
    setLoading(true);
    try {
      const url = new URL('http://localhost:3001/api/events');
      if (dateStr) {
        url.searchParams.append('date', dateStr);
      }
      const res = await fetch(url);
      const result = await res.json();
      if (result.success) setRecords(result.data);
    } catch (err) {
      console.error("Fetch error", err);
    }
    setLoading(false);
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/employees');
      const result = await res.json();
      if (result.success) setEmployees(result.data);
    } catch (err) {
      console.error("Employees fetch error", err);
    }
  };

  useEffect(() => {
    fetchRecords(filterDate);
  }, [filterDate]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Prepare select options (React-Select uses { value, label } arrays)
  const deptOptions = [...new Set(employees.map(e => e.department).filter(Boolean))].sort().map(d => ({ value: d, label: d }));
  const posOptions = [...new Set(employees.map(e => e.position).filter(Boolean))].sort().map(p => ({ value: p, label: p }));
  
  // Names: combine employees from DB + names from scraped records so ALL appear
  const allNames = new Set();
  employees.forEach(e => allNames.add(`${e.firstName} ${e.lastName}`));
  records.forEach(r => { if (r.employeeName) allNames.add(r.employeeName); });
  const nameOptions = [...allNames].sort().map(n => ({ value: n, label: n }));

  // Glassmorphic React-Select Custom Styles
  const customStyles = {
    control: (base) => ({
      ...base,
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid var(--surface-border)',
      boxShadow: 'none',
      color: 'white',
      borderRadius: '8px',
      minHeight: '42px',
      '&:hover': { border: '1px solid rgba(255, 255, 255, 0.2)' }
    }),
    menu: (base) => ({
      ...base,
      background: '#1a1a20', // Solid dark so checkboxes are readable
      border: '1px solid var(--surface-border)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      marginTop: '6px',
      borderRadius: '8px',
      overflow: 'hidden'
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999 // Escapes all stacking contexts
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? 'rgba(255,255,255,0.05)' : 'transparent',
      color: 'white',
      cursor: 'pointer',
      padding: '8px 12px',
      '&:active': { backgroundColor: 'rgba(255,255,255,0.1)' }
    }),
    singleValue: (base) => ({ ...base, color: 'white' }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: 'rgba(99, 102, 241, 0.15)',
      borderRadius: '6px',
      border: '1px solid rgba(99, 102, 241, 0.3)'
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: '#e2e8f0', // Slight offwhite for pill text
      fontSize: '0.85rem'
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: 'var(--text-muted)',
      borderRadius: '0 6px 6px 0',
      ':hover': {
        backgroundColor: 'rgba(239, 68, 68, 0.8)', // red danger hover
        color: 'white',
      },
    }),
    input: (base) => ({ ...base, color: 'white' }),
    placeholder: (base) => ({ ...base, color: 'var(--text-muted)', fontSize: '0.9rem' }),
    noOptionsMessage: (base) => ({ ...base, color: 'var(--text-muted)' })
  };

  // Active Map-Filter algorithm
  const filteredRecords = records.filter(record => {
    // Values extracted from selected options
    const nameFilterVals = filterName.map(opt => opt.value);
    const deptFilterVals = filterDept.map(opt => opt.value);
    const posFilterVals = filterPos.map(opt => opt.value);

    // 1. Filter by Name (exact scraped name)
    if (nameFilterVals.length > 0 && !nameFilterVals.includes(record.employeeName)) return false;

    // 2. Filter by Department or Position (requires mapping to Employee DB)
    if (deptFilterVals.length > 0 || posFilterVals.length > 0) {
      const recNameLower = (record.employeeName || '').toLowerCase();
      
      const matchedEmp = employees.find(e => {
         const firstLower = e.firstName.toLowerCase();
         const lastLower = e.lastName.toLowerCase();
         return recNameLower.includes(firstLower) && recNameLower.includes(lastLower);
      });

      if (deptFilterVals.length > 0 && (!matchedEmp || !deptFilterVals.includes(matchedEmp.department))) return false;
      if (posFilterVals.length > 0 && (!matchedEmp || !posFilterVals.includes(matchedEmp.position))) return false;
    }
    
    return true;
  });

  return (
    <div>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title text-gradient">Attendance Records</h1>
          <p className="page-description">Istorijski prikaz događaja sa interaktivnim Multi-Select pretraživačima.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Calendar size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', zIndex: 10 }} />
            <DatePicker 
              selected={filterDate ? parseISO(filterDate) : null}
              onChange={(date) => setFilterDate(date ? format(date, "yyyy-MM-dd") : "")}
              dateFormat="dd.MM.yyyy"
              className="input-glass pl-10"
              placeholderText="Nema pretrage (Svi dani)"
            />
          </div>
          {filterDate && (
             <button className="btn-primary" onClick={() => setFilterDate('')} style={{ background: 'var(--surface-color)', border: '1px solid var(--surface-border)', color: 'white' }}>
               Skinite Datum
             </button>
          )}
        </div>
      </header>

      {/* Advanced React-Select Filter Panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 250px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            <Filter size={14}/> Sektor (Department)
          </label>
          <Select
            menuPortalTarget={document.body}
            isMulti
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            options={deptOptions}
            value={filterDept}
            onChange={setFilterDept}
            components={{ Option: CheckboxOption }}
            styles={customStyles}
            placeholder="Pretraži i štikliraj Sektor..."
            noOptionsMessage={() => "Nema sektora u bazi zaposlenih"}
          />
        </div>

        <div style={{ flex: '1 1 250px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            <Filter size={14}/> Pozicija (Position)
          </label>
          <Select
            menuPortalTarget={document.body}
            isMulti
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            options={posOptions}
            value={filterPos}
            onChange={setFilterPos}
            components={{ Option: CheckboxOption }}
            styles={customStyles}
            placeholder="Pretraži i štikliraj Poziciju..."
            noOptionsMessage={() => "Nema pozicija u bazi zaposlenih"}
          />
        </div>

        <div style={{ flex: '1 1 250px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            <Search size={14}/> Ime Zaposlenog (Multi-Select)
          </label>
          <Select
            menuPortalTarget={document.body}
            isMulti
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            options={nameOptions}
            value={filterName}
            onChange={setFilterName}
            components={{ Option: CheckboxOption }}
            styles={customStyles}
            placeholder="Pretraži i štikliraj Radnika..."
            noOptionsMessage={() => "Nema radnika za ovaj datum"}
          />
        </div>

        {(filterDept.length > 0 || filterPos.length > 0 || filterName.length > 0) && (
            <button className="btn-primary" onClick={() => { setFilterDept([]); setFilterPos([]); setFilterName([]); }} style={{ alignSelf: 'flex-end', minHeight: '42px', background: 'var(--surface-color)', border: '1px solid var(--surface-border)', color: 'white' }}>
              Resetuj Filtere
            </button>
        )}
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
          <thead style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid var(--surface-border)' }}>
            <tr>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Datum (Date)</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Vreme (Time)</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Ime (Employee Name)</th>
              <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Vrsta (Event Type)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center' }}>Učitavanje pečata...</td></tr>
            ) : filteredRecords.length === 0 ? (
              <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nema pronađenih događaja za ovu kombinaciju filtera.</td></tr>
            ) : (
              filteredRecords.map((record) => (
                <tr key={record.id} style={{ borderBottom: '1px solid var(--surface-border)', transition: 'var(--transition)' }} 
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '1rem' }}>{record.date.split('-').reverse().join('.')}</td>
                  <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.1rem' }}>{record.timestamp}</td>
                  <td style={{ padding: '1rem', fontWeight: 500 }}>{record.employeeName || '-'}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      padding: '0.25rem 0.75rem', 
                      borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600,
                      background: record.eventType === 'Prijava' ? 'rgba(16, 185, 129, 0.2)' : 
                                 record.eventType === 'Odjava' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                      color: record.eventType === 'Prijava' ? 'var(--success)' : 
                             record.eventType === 'Odjava' ? 'var(--danger)' : 'var(--primary-color)'
                    }}>
                      {record.eventType}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      <style>{`
        .react-datepicker-wrapper { display: inline-block; }
        .pl-10 { padding-left: 2.5rem !important; }
      `}</style>
    </div>
  );
}
