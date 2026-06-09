import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import { ToastProvider } from '@/components/Toast';
import ToastBridge from '@/components/ToastBridge';
import Generator from '@/pages/Generator';
import Splitter from '@/pages/Splitter';
import Library from '@/pages/Library';

export default function App() {
  return (
    <ToastProvider>
      <ToastBridge />
      <Router>
        <div className="h-screen w-screen flex bg-ink-950 bg-grid bg-radial-glow overflow-hidden">
          <Sidebar />
          <main className="flex-1 min-w-0 h-full overflow-hidden">
            <Routes>
              <Route path="/" element={<Navigate to="/generator" replace />} />
              <Route path="/generator" element={<Generator />} />
              <Route path="/splitter" element={<Splitter />} />
              <Route path="/library" element={<Library />} />
              <Route path="*" element={<Navigate to="/generator" replace />} />
            </Routes>
          </main>
        </div>
      </Router>
    </ToastProvider>
  );
}
