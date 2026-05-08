import { useState } from 'react';
import { submitReport } from '../services/moderation';
import { useAuth } from '../context/AuthContext';
import './ReportModal.css';

const REPORT_REASONS = [
  'Harassment',
  'Hate Speech',
  'Spam',
  'Sexual Content',
  'Violence',
  'Other',
];

/**
 * ReportModal
 *
 * Props:
 *  isOpen        – boolean
 *  onClose       – () => void
 *  contentId     – string | number  (id of the reported item)
 *  contentType   – 'thread' | 'comment' | 'message' | 'profile' | 'review' | 'ai_content'
 *  reportedUserId – string (user who owns the content)
 */
export default function ReportModal({
  isOpen,
  onClose,
  contentId,
  contentType,
  reportedUserId,
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState('');

  if (!isOpen) return null;

  async function handleSubmit() {
    if (!reason || submitting) return;
    setErr('');
    setSubmitting(true);
    const { error } = await submitReport({
      reportedUserId,
      contentId,
      contentType,
      reason,
      reporterId: user.id,
    });
    setSubmitting(false);
    if (error) {
      setErr('Could not submit report. Please try again.');
    } else {
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setReason('');
        onClose();
      }, 2000);
    }
  }

  function handleOverlayClick() {
    setReason('');
    setErr('');
    onClose();
  }

  return (
    <div className="report-overlay" onClick={handleOverlayClick}>
      <div className="report-modal" onClick={e => e.stopPropagation()}>
        <div className="report-header">
          <h3>Report</h3>
          <button className="report-close" onClick={handleOverlayClick} aria-label="Close">✕</button>
        </div>

        {submitted ? (
          <div className="report-success">
            <div className="report-success-icon">✓</div>
            <p>Report submitted. We'll review it within 24 hours.</p>
          </div>
        ) : (
          <>
            <p className="report-subtitle">Why are you reporting this?</p>
            <div className="report-reasons">
              {REPORT_REASONS.map(r => (
                <button
                  key={r}
                  className={`report-reason-btn ${reason === r ? 'selected' : ''}`}
                  onClick={() => setReason(r)}
                  type="button"
                >
                  {r}
                </button>
              ))}
            </div>
            {err && <p className="report-error">{err}</p>}
            <div className="report-footer">
              <p className="report-disclaimer">
                Reports are reviewed by our team. Abusive content and accounts may be removed.
              </p>
              <button
                className="report-submit"
                onClick={handleSubmit}
                disabled={!reason || submitting}
                type="button"
              >
                {submitting ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
