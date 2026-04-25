import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Shield,
  Target
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { mediaUrl } from '../lib/mediaUrl';
import type { Category } from '../types/campaign';

const TOTAL_STEPS = 5;

function stepLabel(n: number) {
  switch (n) {
    case 1:
      return 'Basics';
    case 2:
      return 'Cover image';
    case 3:
      return 'ID verification';
    case 4:
      return 'Preview';
    case 5:
      return 'Terms';
    default:
      return '';
  }
}

export function CreateCampaignPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<{ name: Category }[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetAmount: '',
    category: '' as '' | Category,
    deadline: ''
  });

  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverFieldError, setCoverFieldError] = useState('');

  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [verificationFileName, setVerificationFileName] = useState('');
  const [verificationUploading, setVerificationUploading] = useState(false);
  const [verificationFieldError, setVerificationFieldError] = useState('');

  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: '/create' } } });
      return;
    }
    if (user?.role === 'ADMIN') {
      return;
    }
    void loadCategories();
  }, [isAuthenticated, navigate, user?.role]);

  useEffect(() => {
    return () => {
      if (coverPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [coverPreview]);

  const loadCategories = async () => {
    try {
      const list = await api.getCategories();
      setCategories(list.map((c) => ({ name: c.name })));
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setCoverFieldError('');
    if (!file) {
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setCoverFieldError('Please upload a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCoverFieldError('Image must be 5MB or smaller.');
      return;
    }
    if (coverPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreview);
    }
    setCoverPreview(URL.createObjectURL(file));
    setCoverImageUrl(null);
    setCoverUploading(true);
    try {
      const { url } = await api.uploadCampaignCoverImage(file);
      setCoverImageUrl(url);
    } catch (err) {
      setCoverFieldError(err instanceof Error ? err.message : 'Upload failed');
      setCoverImageUrl(null);
    } finally {
      setCoverUploading(false);
    }
  };

  const handleVerificationFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setVerificationFieldError('');
    if (!file) {
      return;
    }
    const okType =
      /^image\/(jpeg|png|webp)$/.test(file.type) || file.type === 'application/pdf';
    if (!okType) {
      setVerificationFieldError('Please upload a JPEG, PNG, WebP image, or a PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setVerificationFieldError('File must be 10MB or smaller.');
      return;
    }
    setVerificationFileName(file.name);
    setVerificationUrl(null);
    setVerificationUploading(true);
    try {
      const { url } = await api.uploadVerificationId(file);
      setVerificationUrl(url);
    } catch (err) {
      setVerificationFieldError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setVerificationUploading(false);
    }
  };

  const computeDerived = () => {
    const desc = formData.description.trim();
    const shortDescription = desc.slice(0, 240);
    const fullDescription =
      desc.length >= 40
        ? desc
        : `${desc}\n\nThis campaign is raising funds transparently through GambiaFund.`;

    const end = new Date(formData.deadline);
    const startOfEnd = new Date(end);
    startOfEnd.setHours(0, 0, 0, 0);
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const daysLeft = Math.min(
      365,
      Math.max(1, Math.ceil((startOfEnd.getTime() - startToday.getTime()) / 86_400_000))
    );

    return { shortDescription, fullDescription, daysLeft, end, startOfEnd, startToday };
  };

  const validateStep1 = (): string | null => {
    const title = formData.title.trim();
    if (title.length < 5) {
      return 'Title must be at least 5 characters.';
    }
    if (formData.description.trim().length < 40) {
      return 'Description must be at least 40 characters.';
    }
    if (!formData.category) {
      return 'Please select a category.';
    }
    const goal = Number(formData.targetAmount);
    if (!Number.isFinite(goal) || goal < 1) {
      return 'Enter a valid goal amount (at least 1).';
    }
    if (!formData.deadline) {
      return 'Please choose a campaign end date.';
    }
    const { startOfEnd, startToday } = computeDerived();
    if (startOfEnd < startToday) {
      return 'Campaign end date cannot be in the past.';
    }
    return null;
  };

  const canGoNext = (): boolean => {
    if (step === 1) {
      return validateStep1() === null;
    }
    if (step === 2) {
      return Boolean(coverImageUrl) && !coverUploading;
    }
    if (step === 3) {
      return Boolean(verificationUrl) && !verificationUploading;
    }
    if (step === 4) {
      return true;
    }
    return false;
  };

  const goNext = () => {
    setError('');
    if (step === 1) {
      const msg = validateStep1();
      if (msg) {
        setError(msg);
        return;
      }
    }
    if (step === 2 && (!coverImageUrl || coverUploading)) {
      setError('Please finish uploading your cover image.');
      return;
    }
    if (step === 3 && (!verificationUrl || verificationUploading)) {
      setError('Please finish uploading your ID document.');
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const goBack = () => {
    setError('');
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!termsAccepted) {
      setError('Please confirm that you have read and agree to the terms.');
      return;
    }
    if (!coverImageUrl || !verificationUrl) {
      setError('Missing uploads. Go back and complete each step.');
      return;
    }

    setLoading(true);
    try {
      const { shortDescription, fullDescription, daysLeft } = computeDerived();
      const campaign = await api.createCampaign({
        title: formData.title.trim(),
        creatorName: user?.fullName ?? 'Campaign organizer',
        category: formData.category as Category,
        shortDescription,
        fullDescription,
        goalAmount: Math.round(Number(formData.targetAmount)),
        daysLeft,
        coverImage: coverImageUrl,
        verificationDocumentUrl: verificationUrl,
        termsAcceptedAt: new Date().toISOString()
      });

      navigate(`/campaign/${campaign.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated && user?.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  const { shortDescription, fullDescription, daysLeft } = computeDerived();

  return (
    <div className="min-h-screen bg-surface-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-warm border border-surface-100 p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-surface-900 mb-1">
          Create a campaign
        </h1>
        <p className="text-surface-600 text-sm mb-6">
          Step {step} of {TOTAL_STEPS}: {stepLabel(step)}
        </p>

        <div className="flex gap-1 mb-8">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className={`h-2 flex-1 rounded-full transition-colors ${
                n <= step ? 'bg-brand-600' : 'bg-surface-200'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-800 text-sm">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={step === TOTAL_STEPS ? handleSubmit : (e) => e.preventDefault()}>
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-2">
                  Campaign title
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 text-surface-400" size={20} />
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Give your campaign a clear, compelling title"
                    required
                    minLength={5}
                    maxLength={120}
                    className="w-full pl-10 pr-4 py-2.5 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-surface-800 mb-2">
                  Story & details
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Explain the need, how funds will be used, and who benefits (at least 40 characters)."
                  required
                  minLength={40}
                  rows={6}
                  className="w-full px-4 py-2.5 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-surface-800 mb-2">
                    Goal (GMD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-surface-400 text-sm">D</span>
                    <input
                      type="number"
                      name="targetAmount"
                      value={formData.targetAmount}
                      onChange={handleChange}
                      placeholder="10000"
                      required
                      min="1"
                      step="1"
                      className="w-full pl-8 pr-4 py-2.5 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="campaign-category"
                    className="block text-sm font-semibold text-surface-800 mb-2">
                    Category
                  </label>
                  <select
                    id="campaign-category"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2.5 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                    <option value="">Select a category</option>
                    {categories.map((cat) => (
                      <option key={cat.name} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="campaign-end-date"
                  className="block text-sm font-semibold text-surface-800 mb-2">
                  Campaign end date
                </label>
                <div className="relative">
                  <Target className="absolute left-3 top-3 text-surface-400" size={20} />
                  <input
                    id="campaign-end-date"
                    type="date"
                    name="deadline"
                    value={formData.deadline}
                    onChange={handleChange}
                    required
                    className="w-full pl-10 pr-4 py-2.5 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-surface-600 text-sm">
                Upload a photo that represents your campaign. JPEG, PNG, or WebP, up to 5MB.
              </p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-surface-200 rounded-2xl p-8 cursor-pointer hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
                <ImageIcon className="w-10 h-10 text-brand-600 mb-2" />
                <span className="text-sm font-semibold text-surface-800">Choose image</span>
                <span className="text-xs text-surface-500 mt-1">or drag and drop (browser permitting)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  aria-label="Upload campaign cover image"
                  onChange={(e) => void handleCoverFile(e)}
                />
              </label>
              {coverUploading && (
                <p className="text-sm text-brand-700 font-medium">Uploading…</p>
              )}
              {coverFieldError && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle size={16} /> {coverFieldError}
                </p>
              )}
              {coverImageUrl && coverPreview && (
                <div className="rounded-xl overflow-hidden border border-surface-200 max-h-64">
                  <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                </div>
              )}
              {coverImageUrl && !coverUploading && (
                <p className="text-sm text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 size={16} /> Cover image saved
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex gap-3 p-4 rounded-xl bg-surface-50 border border-surface-100">
                <Shield className="w-8 h-8 text-brand-600 shrink-0" />
                <div className="text-sm text-surface-700">
                  <p className="font-semibold text-surface-900 mb-1">Identity verification</p>
                  <p>
                    Upload a clear photo or scan of a government-issued ID (e.g. national ID or
                    passport). This is only used by our team to reduce fraud and is not shown on your
                    public campaign page.
                  </p>
                </div>
              </div>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-surface-200 rounded-2xl p-8 cursor-pointer hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
                <FileText className="w-10 h-10 text-brand-600 mb-2" />
                <span className="text-sm font-semibold text-surface-800">Upload ID document</span>
                <span className="text-xs text-surface-500 mt-1">JPEG, PNG, WebP, or PDF · up to 10MB</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  aria-label="Upload government ID for verification"
                  onChange={(e) => void handleVerificationFile(e)}
                />
              </label>
              {verificationUploading && (
                <p className="text-sm text-brand-700 font-medium">Uploading…</p>
              )}
              {verificationFieldError && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle size={16} /> {verificationFieldError}
                </p>
              )}
              {verificationUrl && verificationFileName && (
                <p className="text-sm text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 size={16} /> Received: {verificationFileName}
                </p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 text-surface-800">
              <p className="text-sm text-surface-600">
                Review how your campaign will appear. You can go back to edit earlier steps.
              </p>
              {coverImageUrl && (
                <div className="rounded-xl overflow-hidden border border-surface-200 h-44">
                  <img
                    src={mediaUrl(coverImageUrl)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div>
                <h2 className="font-display font-bold text-lg text-surface-900">{formData.title.trim()}</h2>
                <p className="text-xs text-surface-500 mt-1">
                  {formData.category} · Goal D{Math.round(Number(formData.targetAmount) || 0).toLocaleString()}{' '}
                  · {daysLeft} days left (from end date)
                </p>
              </div>
              <p className="text-sm text-surface-700 whitespace-pre-wrap line-clamp-6">{shortDescription}</p>
              <p className="text-xs text-surface-500">
                Full story on the public page will include your complete description (
                {fullDescription.length} characters).
              </p>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-900 text-xs">
                <strong className="font-semibold">Fees (summary):</strong> platform fees apply as described
                in the next step. Amounts shown to donors and on your page are donation totals before
                those internal fees — similar to common crowdfunding platforms.
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="max-h-[min(420px,55vh)] overflow-y-auto rounded-xl border border-surface-200 p-4 text-sm text-surface-700 space-y-3 bg-surface-50/80">
                <h3 className="font-display font-bold text-surface-900">Terms & fee disclosure</h3>
                <p>
                  By submitting this campaign, you confirm that the information you provide is accurate to
                  the best of your knowledge and that you will use raised funds for the stated purpose.
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong className="text-surface-900">Donation processing:</strong> A{' '}
                    <strong>1.9%</strong> fee applies to each donation. This is handled on our side;{' '}
                    <strong>
                      donors and campaign pages still show the full donated amounts
                    </strong>{' '}
                    (the experience is similar to platforms like GoFundMe).
                  </li>
                  <li>
                    <strong className="text-surface-900">Payout / withdrawal:</strong> When your campaign
                    ends or if you request a withdrawal, a <strong>3%</strong> processing fee may apply to
                    the relevant payout. Details will be confirmed in your organizer dashboard and payout
                    flows.
                  </li>
                  <li>
                    We may hold or delay payouts if verification or compliance checks are required.
                  </li>
                </ul>
                <p className="text-xs text-surface-500">
                  Fee reporting for administrators is separate from what donors see on the public campaign.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <input
                  id="campaign-terms-accept"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="campaign-terms-accept" className="text-sm text-surface-800 cursor-pointer">
                  I have read and agree to these terms, including the fee summary above.
                </label>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={goBack}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-surface-200 font-semibold text-surface-800 hover:bg-surface-50">
                <ArrowLeft size={18} />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex-1 px-4 py-3 rounded-xl border border-surface-200 font-semibold text-surface-800 hover:bg-surface-50">
                Cancel
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700 disabled:opacity-45 disabled:cursor-not-allowed">
                Next
                <ArrowRight size={18} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !termsAccepted}
                className="flex-1 px-4 py-3 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700 disabled:opacity-45">
                {loading ? 'Submitting…' : 'Submit campaign'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
