import { useState, useEffect } from 'react';
import './LegalModal.css';

export default function LegalModal({ isOpen, onClose }) {
  const [cookiesAccepted, setCookiesAccepted] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const accepted = localStorage.getItem("cookiesAccepted");
      setCookiesAccepted(accepted ? JSON.parse(accepted) : null);
    }
  }, [isOpen]);

  const handleAcceptCookies = () => {
    localStorage.setItem("cookiesAccepted", "true");
    setCookiesAccepted(true);
  };

  const handleDeclineCookies = () => {
    localStorage.setItem("cookiesAccepted", "false");
    setCookiesAccepted(false);
  };

  if (!isOpen) return null;

  return (
    <div className="legal-modal-overlay" onClick={onClose}>
      <div className="legal-modal-content" onClick={e => e.stopPropagation()}>
        <button className="legal-modal-close" onClick={onClose}>✕</button>

        <h1>Consumd – Privacy Policy & Terms of Service</h1>
        <p><strong>Effective Date:</strong> April 23, 2026</p>

        <div className="legal-modal-body">
          <h2>1. Introduction</h2>
          <p>Consumd ("we", "our", or "us") is operated by Consumd UB in Norway. By using our platform, you agree to this policy and our terms.</p>

          <h2>2. Data We Collect</h2>
          <ul>
            <li>Email, username, full name, password (securely hashed)</li>
            <li>User content (reviews, comments, messages, threads)</li>
            <li>Profile info (profile pictures)</li>
            <li>Technical data (device, browser)</li>
          </ul>

          <h2>3. How We Use Data</h2>
          <p>We use your data to operate the service, enable social features, improve performance, and ensure security.</p>

          <h2>4. Advertising & Cookies</h2>
          <p>We use third-party advertising providers (such as Google Ads). These may use cookies and tracking technologies to display relevant ads.</p>

          <h2>5. Payments</h2>
          <p>Subscriptions are handled by third-party providers. We do not store payment details.</p>

          <h2>6. GDPR Rights</h2>
          <p>You may request access, correction, or deletion of your data at any time.</p>

          <h2>7. User Content</h2>
          <p>You are responsible for content you post. You must not upload illegal, harmful, or copyrighted material without permission.</p>

          <h2>8. Content Moderation</h2>
          <p>We may remove content or ban users at any time, without notice, to protect the platform.</p>

          <h2>9. Third-Party Content</h2>
          <p>We display data from third-party APIs including TMDB, RAWG, and Open Library. We do not own this content.</p>

          <div className="legal-note">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </div>

          <h2>10. Accounts</h2>
          <p>You are responsible for maintaining your account security.</p>

          <h2>11. Termination</h2>
          <p>We may suspend or terminate accounts at our discretion.</p>

          <h2>12. Disclaimer</h2>
          <p>The service is provided "as is" without warranties.</p>

          <h2>13. Limitation of Liability</h2>
          <p>We are not liable for damages, data loss, or interruptions.</p>

          <h2>14. Governing Law</h2>
          <p>These terms are governed by Norwegian law.</p>

          <h2>15. Contact</h2>
          <p>Email: consumdapp@gmail.com</p>

          <footer className="legal-footer">
            © 2026 Consumd UB
          </footer>
        </div>

        {cookiesAccepted === null && (
          <div className="legal-cookie-banner">
            <span>This site uses cookies and third-party services for ads and functionality.</span>
          </div>
        )}
      </div>
    </div>
  );
}