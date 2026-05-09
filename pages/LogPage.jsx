import { useNavigate, useLocation } from 'react-router-dom';
import LogModal from '../components/LogModal';
import './LogPage.css';

export default function LogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const media = location.state?.media;

  if (!media) {
    navigate('/');
    return null;
  }

  return (
    <div className="log-page">
      <button className="back-arrow" onClick={() => navigate(-1)}>←</button>
      <LogModal
        media={media}
        onClose={() => navigate(-1)}
        onSaved={() => navigate('/')}
      />
    </div>
  );
}
