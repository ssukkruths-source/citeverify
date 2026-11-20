import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  ArrowRight,
  BookOpen,
  Info,
  ExternalLink
} from 'lucide-react';
import { uploadPdf, loadSampleAudit } from '../api/client';
import { ResearchPaper } from '../types';

interface UploadViewProps {
  onUploadSuccess: (auditId: string) => void;
  onNavigate: (view: string) => void;
  pendingPaper?: ResearchPaper | null;
  onClearPendingPaper?: () => void;
}

export const UploadView: React.FC<UploadViewProps> = ({
  onUploadSuccess,
  onNavigate,
  pendingPaper,
  onClearPendingPaper,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateAndSelectFile = (file: File) => {
    setErrorMessage(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Invalid file type. CiteVerify only processes scientific PDF manuscripts.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 50MB research threshold.');
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSelectFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadProgress(20);
    setErrorMessage(null);

    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => (prev < 90 ? prev + 15 : prev));
    }, 200);

    try {
      const res = await uploadPdf(selectedFile);
      clearInterval(progressTimer);
      setUploadProgress(100);
      setTimeout(() => {
        onUploadSuccess(res.audit_id);
      }, 500);
    } catch (err: any) {
      clearInterval(progressTimer);
      setIsUploading(false);
      setUploadProgress(0);
      setErrorMessage(err.message || 'Failed to upload document. Please try again.');
    }
  };

  const handleSampleAudit = async () => {
    setIsUploading(true);
    try {
      const res = await loadSampleAudit();
      onUploadSuccess(res.audit_id);
    } catch (err: any) {
      setIsUploading(false);
      setErrorMessage('Failed to initialize sample audit.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 sm:p-10 max-w-4xl mx-auto space-y-8 font-sans">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <span className="text-xs font-mono uppercase tracking-wider text-[#3268BB] font-bold">
          New Verification Session
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#14233F] tracking-tight">
          Upload Research Paper
        </h1>
        <p className="text-sm text-[#687387] leading-relaxed">
          Upload your scientific paper or literature review in PDF format. Our engine extracts claims, maps citations, and audits evidence against academic literature.
        </p>
      </div>

      {pendingPaper && (
        <div className="p-4 rounded-xl bg-[#FFF3D8]/30 border border-[#FFF3D8] text-xs text-[#14233F] flex items-start gap-3">
          <BookOpen className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold">Audit requested for a discovered publication:</strong>{' '}
            {pendingPaper.title}{' '}
            {pendingPaper.year ? `(${pendingPaper.year})` : ''}
            {pendingPaper.doi ? ` · doi:${pendingPaper.doi}` : ''}
            <div className="text-[11px] text-[#4B5563] mt-1">
              Upload the publication's PDF below. If it is open access, download it from the
              publisher first — CiteVerify never bypasses paywalls.
            </div>
            {pendingPaper.oa_url && (
              <a
                href={pendingPaper.oa_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3268BB] hover:underline mt-1"
              >
                Open access copy <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {onClearPendingPaper && (
            <button onClick={onClearPendingPaper} className="p-1 rounded hover:bg-white/60" title="Dismiss">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Notice Banner */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold">Academic Documents Recommended:</strong> Please upload research manuscripts with an abstract, structured claims, and a bibliography (APA, IEEE, Vancouver, Harvard). Random or non-scholarly documents may yield unmapped citations.
        </div>
      </div>

      {/* Main Upload Card */}
      <div className="bg-white rounded-3xl border border-[#E8E7E1] shadow-editorial p-6 sm:p-10 space-y-6">
        {/* Drag and Drop Zone */}
        {!selectedFile ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 sm:p-14 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-4 ${
              dragActive
                ? 'border-[#3268BB] bg-[#3268BB]/5 scale-[0.99]'
                : 'border-[#E8E7E1] hover:border-[#3268BB] bg-[#FAF9F5]/50 hover:bg-[#FAF9F5]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleChange}
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-white border border-[#E8E7E1] shadow-subtle flex items-center justify-center text-[#3268BB]">
              <UploadCloud className="w-8 h-8" />
            </div>

            <div>
              <p className="text-base font-bold text-[#14233F]">
                Drag and drop your research PDF here
              </p>
              <p className="text-xs text-[#687387] mt-1">
                or click to browse files from your computer
              </p>
            </div>

            <div className="text-[11px] font-mono text-[#687387] bg-white px-3 py-1 rounded-full border border-[#E8E7E1]">
              Supports PDF up to 50MB
            </div>
          </div>
        ) : (
          /* Selected File View */
          <div className="p-6 rounded-2xl bg-[#FAF9F5] border border-[#E8E7E1] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#E8E7E1] flex items-center justify-center text-[#3268BB] shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-[#14233F] truncate">
                    {selectedFile.name}
                  </h4>
                  <p className="text-xs font-mono text-[#687387]">
                    {formatFileSize(selectedFile.size)} &bull; Research Manuscript
                  </p>
                </div>
              </div>

              {!isUploading && (
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-1.5 rounded-lg text-[#687387] hover:text-[#14233F] hover:bg-white transition-colors"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Progress bar if uploading */}
            {isUploading && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs font-mono text-[#687387]">
                  <span>Uploading and parsing structure...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-[#E8E7E1]">
                  <div
                    className="h-full bg-[#3268BB] transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Upload Action */}
            {!isUploading && (
              <div className="pt-2 flex justify-end gap-3">
                <button
                  onClick={() => setSelectedFile(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#687387] hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  className="px-6 py-2.5 rounded-xl bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-bold transition-all shadow-editorial flex items-center gap-2 cursor-pointer"
                >
                  <span>Begin Verification Audit</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Divider with Sample Audit Option */}
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E8E7E1]" />
          </div>
          <div className="relative flex justify-center text-xs uppercase font-mono">
            <span className="bg-white px-4 text-[#687387]">or explore immediately</span>
          </div>
        </div>

        {/* Try Sample Audit Button */}
        <div className="p-5 rounded-2xl bg-[#FFF3D8]/20 border border-[#FFF3D8] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#14233F]" />
              <h4 className="text-sm font-bold text-[#14233F]">
                Try Bundled Benchmark Sample
              </h4>
            </div>
            <p className="text-xs text-[#687387]">
              "Empirical Evaluation of Generative AI Hallucinations in Biomedicine" (6 real citations, 1 contradicted finding, 1 unverified reference).
            </p>
          </div>

          <button
            onClick={handleSampleAudit}
            disabled={isUploading}
            className="px-5 py-2.5 rounded-xl bg-[#14233F] hover:bg-[#3268BB] text-white text-xs font-bold transition-all shadow-subtle shrink-0 cursor-pointer"
          >
            Load Sample Paper
          </button>
        </div>
      </div>

      {/* Privacy Guarantee Box */}
      <div className="p-4 rounded-2xl bg-white border border-[#E8E7E1] flex items-center justify-between text-xs text-[#687387]">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Local session isolation. Documents are never used to train public AI models.</span>
        </div>
        <button
          onClick={() => onNavigate('settings')}
          className="text-[#3268BB] font-semibold hover:underline"
        >
          Privacy settings &rarr;
        </button>
      </div>
    </div>
  );
};
