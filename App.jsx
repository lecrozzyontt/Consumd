import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Discover from './pages/Discover';
import Social from './pages/Social';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Auth from './pages/Auth';
import LogPage from './pages/LogPage';
import MediaDetailPage from './pages/MediaDetailPage';
import ReviewDetailPage from './pages/ReviewDetailPage';
import MessagesPage from './pages/MessagesPage';
import './styles/globals.css';
import PublicProfile from './pages/PublicProfilePage';
import GroupChatsPage from './pages/GroupChatsPage';
import CreateGroup from './pages/CreateGroup';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return user ? children : <Navigate to="/auth" replace />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <div className="app-container">
      {user && <Navbar />}
      <main className={user ? 'main-content' : ''}>
        <Routes>
          <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/discover" element={<ProtectedRoute><Discover /></ProtectedRoute>} />
          <Route path="/social" element={<ProtectedRoute><Social /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/log" element={<ProtectedRoute><LogPage /></ProtectedRoute>} />
          <Route path="/media" element={<ProtectedRoute><MediaDetailPage /></ProtectedRoute>} />
          <Route path="/media/:id" element={<ProtectedRoute><MediaDetailPage /></ProtectedRoute>} />
          <Route path="/review/:logId" element={<ProtectedRoute><ReviewDetailPage /></ProtectedRoute>} />
          <Route path="/messages/:friendId" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
          <Route path="/user/:userId" element={<PublicProfile />} />
          <Route path="/group-chats" element={<ProtectedRoute><GroupChatsPage /></ProtectedRoute>} />
          <Route path="/group-chats/:groupId" element={<ProtectedRoute><GroupChatsPage /></ProtectedRoute>} />
          <Route path="/create-group" element={<ProtectedRoute><CreateGroup /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}