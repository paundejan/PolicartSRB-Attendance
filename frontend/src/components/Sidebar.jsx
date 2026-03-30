import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, TableProperties, BarChart3, Settings, Users } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
  const menuItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Employees', path: '/employees', icon: <Users size={20} /> },
    { name: 'Records', path: '/records', icon: <TableProperties size={20} /> },
    { name: 'Reports', path: '/reports', icon: <BarChart3 size={20} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
  ];

  return (
    <aside className="sidebar glass-panel">
      <div className="sidebar-brand">
        <h2 className="h2" style={{ color: 'var(--danger)', fontWeight: 800 }}>PolicatSRB</h2>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>Attendance Hub</p>
      </div>
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <NavLink 
            key={item.name} 
            to={item.path} 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.name}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
