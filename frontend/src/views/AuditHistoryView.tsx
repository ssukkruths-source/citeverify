import React, { useEffect, useState } from 'react';
import { 
  FileText, 
  Trash2, 
  Download, 
  Eye, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  Layers, 
  UploadCloud,
  SplitSquareVertical,
  X
} from 'lucide-react';
import { Audit } from '../types';
import { fetchAudits, deleteAudit, getReportDownloadUrl } from '../api/client';

interface AuditHistoryViewProps {
  onSelectAudit: (auditId: string) => void;
  onNavigate: (view: string, auditId?: string) => void;
}

export const AuditHistoryView: React.FC<AuditHistoryViewProps> = ({
  onSelectAudit,
  onNavigate,
}) => {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalAuditId, setDeleteModalAuditId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAudits();
      setAudits(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteAudit(id);
      setDeleteModalAuditId(null);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8E7E1]">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#3268BB] font-bold">
            Auditing Records & History
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14233F] tracking-tight mt-1">
            My Manuscript Audits
          </h1>
          <p className="text-sm text-[#687387] mt-1">
            Browse previous citation verification sessions, view evidence reports, and manage stored findings.
          </p>
        </div>

        <button
          onClick={() => onNavigate('upload')}
          className="px-5 py-2.5 rounded-xl bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-bold transition-all shadow-editorial flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <UploadCloud className="w-4 h-4" />
          <span>New Audit</span>
        </button>
      </div>

      {/* Audits List */}
      {loading ? (
        <div className="p-12 text-center text-[#687387] font-mono text-sm">
          Loading audit history from database...
        </div>
      ) : audits.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white border border-[#E8E7E1] space-y-3">
          <FileText className="w-10 h-10 text-[#687387] mx-auto opacity-40" />
          <h3 className="text-base font-bold text-[#14233F]">No audits recorded yet</h3>
          <p className="text-xs text-[#687387] max-w-sm mx-auto">
            You haven't uploaded any research papers yet. Start your first verification session now.
          </p>
          <button
            onClick={() => onNavigate('upload')}
            className="px-4 py-2 rounded-xl bg-[#14233F] text-white text-xs font-bold hover:bg-[#3268BB] transition-colors"
          >
            Upload Research PDF
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {audits.map((audit) => {
            const isCompleted = audit.status === 'completed';
            const claimsTotal = audit.summary?.claims?.total || 0;
            const refsTotal = audit.summary?.references?.total || 0;
            const supported = audit.summary?.claims?.supported || 0;
            const contradicted = audit.summary?.claims?.contradicted || 0;

            return (
              <div
                key={audit.id}
                className="p-6 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle hover:border-[#3268BB] transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      isCompleted ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-blue-50 text-blue-800 border border-blue-200 animate-pulse'
                    }`}>
                      {audit.status}
                    </span>
                    <span className="text-xs font-mono text-[#687387] flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(audit.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-xs font-mono text-stone-400">
                      ID: {audit.id.slice(0, 10)}
                    </span>
                  </div>

                  <h3
                    onClick={() => {
                      onSelectAudit(audit.id);
                      onNavigate('results', audit.id);
                    }}
                    className="text-base font-bold text-[#14233F] truncate hover:text-[#3268BB] cursor-pointer transition-colors"
                  >
                    {audit.title || audit.filename}
                  </h3>

                  <p className="text-xs text-[#687387] font-serif italic truncate">
                    Authors: {audit.authors || 'Unknown'} &bull; {audit.total_pages} pages &bull; File: {audit.filename}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#687387] pt-1">
                    <span>Claims: <strong className="text-[#14233F]">{claimsTotal}</strong></span>
                    <span>References: <strong className="text-[#14233F]">{refsTotal}</strong></span>
                    <span>Supported: <strong className="text-emerald-700">{supported}</strong></span>
                    {contradicted > 0 && (
                      <span className="text-rose-700 font-bold">Contradicted: {contradicted}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={() => {
                      onSelectAudit(audit.id);
                      onNavigate('results', audit.id);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-subtle cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Results</span>
                  </button>

                  <button
                    onClick={() => {
                      onSelectAudit(audit.id);
                      onNavigate('pdf-viewer', audit.id);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-stone-50 text-[#14233F] text-xs font-semibold border border-[#E8E7E1] shadow-subtle flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <SplitSquareVertical className="w-3.5 h-3.5 text-[#3268BB]" />
                    <span>PDF Reader</span>
                  </button>

                  <a
                    href={getReportDownloadUrl(audit.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl border border-[#E8E7E1] hover:bg-stone-50 text-[#687387] hover:text-[#14233F] transition-colors"
                    title="Download ReportLab PDF"
                  >
                    <Download className="w-4 h-4" />
                  </a>

                  <button
                    onClick={() => setDeleteModalAuditId(audit.id)}
                    className="p-2 rounded-xl border border-[#E8E7E1] hover:bg-rose-50 text-[#687387] hover:text-rose-600 transition-colors cursor-pointer"
                    title="Delete audit"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalAuditId && (
        <div className="fixed inset-0 z-50 bg-[#14233F]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#E8E7E1] shadow-floating p-6 sm:p-8 max-w-md w-full space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-[#14233F]">
                Permanently Delete Audit?
              </h3>
              <p className="text-xs text-[#687387] leading-relaxed">
                This will delete the audit record, extracted claims, mapped citations, and uploaded PDF file from the database. This action cannot be undone.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeleteModalAuditId(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#E8E7E1] text-xs font-semibold text-[#14233F] hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteModalAuditId)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-subtle"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
