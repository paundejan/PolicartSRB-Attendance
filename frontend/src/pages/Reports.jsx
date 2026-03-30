import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Download } from 'lucide-react';

export default function Reports() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/api/events')
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          // Process data for charts
          const processed = processChartData(result.data);
          setData(processed);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const processChartData = (records) => {
    // Group records by date
    const summary = {};
    records.forEach(r => {
      if (!summary[r.date]) {
        summary[r.date] = { date: r.date, Entries: 0, Exits: 0 };
      }
      if (r.eventType === 'Prijava') summary[r.date].Entries += 1;
      if (r.eventType === 'Odjava') summary[r.date].Exits += 1;
    });

    // Convert to array and sort by date ascending
    return Object.values(summary).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-14); // last 14 days
  };

  const exportCSV = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/events');
      const result = await res.json();
      if (!result.success) return;

      const records = result.data;
      if (records.length === 0) {
        alert("No data to export");
        return;
      }

      const headers = "ID,Date,Time,Event Type,Details\n";
      const csv = headers + records.map(r => 
        `${r.id},${r.date},${r.timestamp},${r.eventType},"${r.details || ''}"`
      ).join("\n");

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('hidden', '');
      a.setAttribute('href', url);
      a.setAttribute('download', 'policatsrb_attendance.csv');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      alert("Failed to export: " + e.message);
    }
  };

  return (
    <div>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title text-gradient">Data & Reports</h1>
          <p className="page-description">Visualize your 14-day activity and export reports.</p>
        </div>
        <button className="btn-primary" onClick={exportCSV} style={{ background: '#10b981' }}>
          <Download size={20} />
          Export CSV
        </button>
      </header>

      <div className="glass-panel" style={{ padding: '2rem', height: '500px' }}>
        {loading ? (
          <div>Loading analytics...</div>
        ) : data.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>No reporting data available. Start syncing!</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" allowDecimals={false} />
              <Tooltip 
                contentStyle={{ background: 'var(--bg-color)', border: '1px solid var(--surface-border)', borderRadius: '8px' }}
                itemStyle={{ color: 'var(--text-main)' }}
              />
              <Legend />
              <Bar dataKey="Entries" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Exits" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
