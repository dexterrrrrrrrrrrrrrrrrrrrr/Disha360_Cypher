import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { AuthProvider } from './features/auth/AuthProvider';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><AuthProvider>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">Skip to main content</a>
    <Routes>
      <Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/>
      {(['student', 'trainer', 'admin'] as const).map(role => <Route key={role} element={<ProtectedRoute role={role}/>}><Route path={`/dashboard/${role}`} element={<Dashboard role={role}/>}/></Route>)}
      <Route path="*" element={<Navigate to="/login" replace/>}/>
    </Routes>
  </AuthProvider></BrowserRouter></React.StrictMode>
);
