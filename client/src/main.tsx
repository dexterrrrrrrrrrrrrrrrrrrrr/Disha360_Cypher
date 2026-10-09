import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { AuthProvider } from './features/auth/AuthProvider';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import './styles.css';
import { StudentDashboard } from './pages/StudentDashboard';
import { Resumes } from './pages/Resumes';
import { ResumeEditor } from './pages/ResumeEditor';
import { ResumeAnalyzer } from './pages/ResumeAnalyzer';
import { Interviews } from './pages/Interviews';
import { InterviewChat } from './pages/InterviewChat';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><AuthProvider>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">Skip to main content</a>
    <Routes>
      <Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/>
      <Route element={<ProtectedRoute role="student"/>}><Route path="/dashboard/student" element={<StudentDashboard/>}/><Route path="/resumes" element={<Resumes/>}/><Route path="/resumes/new" element={<ResumeEditor/>}/><Route path="/resumes/:id" element={<ResumeEditor/>}/><Route path="/resume-analyzer" element={<ResumeAnalyzer/>}/><Route path="/interviews" element={<Interviews/>}/><Route path="/interviews/:id" element={<InterviewChat/>}/></Route>
      {(['trainer', 'admin'] as const).map(role => <Route key={role} element={<ProtectedRoute role={role}/>}><Route path={`/dashboard/${role}`} element={<Dashboard role={role}/>}/></Route>)}
      <Route path="*" element={<Navigate to="/login" replace/>}/>
    </Routes>
  </AuthProvider></BrowserRouter></React.StrictMode>
);
