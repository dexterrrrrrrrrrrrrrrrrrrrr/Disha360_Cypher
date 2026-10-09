import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">Skip to main content</a><Routes><Route path="/login" element={<Login/>}/><Route path="/preview/:role" element={<Dashboard/>}/><Route path="*" element={<Navigate to="/login" replace/>}/></Routes></BrowserRouter></React.StrictMode>);
