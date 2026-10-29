import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';

const MiniApp = lazy(() => import('./miniapp/App.jsx'));
const Admin = lazy(() => import('./admin/App.jsx'));

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Suspense fallback={<div className="loader-page"><div className="spinner" /></div>}>
      <Routes>
        <Route path="/app/*" element={<MiniApp />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Suspense>
  </BrowserRouter>,
);
