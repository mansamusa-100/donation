import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  MailIcon,
  Shield,
  Target,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { BRAND_NAME } from '../lib/brand';
import { mediaUrl } from '../lib/mediaUrl';
import type { Category } from '../types/campaign';

const TOTAL_STEPS = 5;
const MAX_CAMPAIGN_PHOTOS = 5;
const MAX_GALLERY_PHOTOS = MAX_CAMPAIGN_PHOTOS - 1;

type GallerySlot = {
  id: string;
  preview: string;
  url: string | null;
  uploading: boolean;
  error: string;
};

function stepLabel(n: number) {
  switch (n) {
    case 1:
      return 'Basics';
    case 2:
      return 'Campaign images';
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
  const { user, isAuthenticated, refreshUser } = useAuth();
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
    deadline: '',
    showPublicContact: false,
    contactPhone: '',
    contactWhatsApp: ''
  });

  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverFieldError, setCoverFieldError] = useState('');
  const [gallerySlots, setGallerySlots] = useState<GallerySlot[]>([]);
  const [galleryFieldError, setGalleryFieldError] = useState('');

  const gallerySlotsRef = useRef<GallerySlot[]>([]);
  gallerySlotsRef.current = gallerySlots;

  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [verificationFileName, setVerificationFileName] = useState('');
  const [verificationUploading, setVerificationUploading] = useState(false);
  const [verificationFieldError, setVerificationFieldError] = useState('');
  const [reusingExistingId, setReusingExistingId] = useState(false);

  useEffect(() => {
    if (!user?.kycDocumentUrl) {
      return;
    }
    if (user.kycStatus === 'Verified' || user.kycStatus === 'Pending') {
      setVerificationUrl(user.kycDocumentUrl);
      setVerificationFileName(
        user.kycStatus === 'Verified' ? 'Verified ID on file' : 'ID on file (under review)'
      );
      setReusingExistingId(true);
    }
  }, [user?.kycDocumentUrl, user?.kycStatus]);

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

  useEffect(() => {
    return () => {
      gallerySlotsRef.current.forEach((s) => {
        if (s.preview.startsWith('blob:')) {
          URL.revokeObjectURL(s.preview);
        }
      });
    };
  }, []);

  const loadCategories = async () => {
    try {
      const list = await api.getCategories();
      setCategories(list.map((c) => ({ name: c.name })));
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  useEffect(() => {
    if (!user?.phoneNumber) {
      return;
    }
    setFormData((prev) => {
      if (prev.contactPhone || prev.contactWhatsApp) {
        return prev;
      }
      return {
        ...prev,
        contactPhone: user.phoneNumber ?? '',
        contactWhatsApp: user.phoneNumber ?? ''
      };
    });
  }, [user?.phoneNumber]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const checked = e.target instanceof HTMLInputElement && e.target.type === 'checkbox'
      ? e.target.checked
      : undefined;
    setFormData((prev) => ({
      ...prev,
      [name]: checked !== undefined ? checked : value
    }));
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
    setReusingExistingId(false);
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

  const removeGallerySlot = (id: string) => {
    setGalleryFieldError('');
    setGallerySlots((prev) => {
      const row = prev.find((r) => r.id === id);
      if (row?.preview.startsWith('blob:')) {
        URL.revokeObjectURL(row.preview);
      }
      return prev.filter((r) => r.id !== id);
    });
  };

  const handleGalleryFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const raw = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (!raw.length) {
      return;
    }
    setGalleryFieldError('');

    setGallerySlots((prev) => {
      const room = MAX_GALLERY_PHOTOS - prev.length;
      if (room <= 0) {
        Promise.resolve().then(() =>
          setGalleryFieldError(
            `You can upload up to ${MAX_CAMPAIGN_PHOTOS} images total (1 cover + ${MAX_GALLERY_PHOTOS} extra).`
          )
        );
        return prev;
      }

      const typedOk = raw.filter(
        (file) => /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 5 * 1024 * 1024
      );
      if (typedOk.length === 0) {
        Promise.resolve().then(() =>
          setGalleryFieldError('Additional images must be JPEG, PNG, or WebP, up to 5MB each.')
        );
        return prev;
      }

      const validFiles = typedOk.slice(0, room);
      if (validFiles.length < raw.length) {
        Promise.resolve().then(() =>
          setGalleryFieldError('Some files were skipped (type/size) or the gallery limit was reached.')
        );
      }

      const additions: GallerySlot[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        preview: URL.createObjectURL(file),
        url: null,
        uploading: true,
        error: ''
      }));

      validFiles.forEach((file, i) => {
        const id = additions[i].id;
        void api.uploadCampaignCoverImage(file).then(
          ({ url }) => {
            setGallerySlots((rows) =>
              rows.map((row) => (row.id === id ? { ...row, url, uploading: false, error: '' } : row))
            );
          },
          (err: unknown) => {
            const message = err instanceof Error ? err.message : 'Upload failed';
            setGallerySlots((rows) =>
              rows.map((row) => (row.id === id ? { ...row, uploading: false, error: message } : row))
            );
          }
        );
      });

      return [...prev, ...additions];
    });
  };

  const computeDerived = () => {
    const desc = formData.description.trim();
    const shortDescription = desc.slice(0, 240);
    const fullDescription =
      desc.length >= 40
        ? desc
        : `${desc}\n\nThis campaign is raising funds transparently through ${BRAND_NAME}.`;

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
    if (formData.showPublicContact) {
      const phone = formData.contactPhone.trim();
      const wa = formData.contactWhatsApp.trim();
      if (!phone && !wa) {
        return 'Add a phone or WhatsApp number to show contact details on your campaign.';
      }
    }
    return null;
  };

  const canGoNext = (): boolean => {
    if (step === 1) {
      return validateStep1() === null;
    }
    if (step === 2) {
      return (
        Boolean(coverImageUrl) &&
        !coverUploading &&
        !gallerySlots.some((s) => s.uploading) &&
        !gallerySlots.some((s) => s.error && !s.url)
      );
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
    if (
      step === 2 &&
      (gallerySlots.some((s) => s.uploading) || gallerySlots.some((s) => s.error && !s.url))
    ) {
      setError('Wait for gallery uploads to finish, or remove any failed images.');
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
      const { shortDescription, fullDescription } = computeDerived();
      const galleryUrls = gallerySlots
        .filter((s): s is GallerySlot & { url: string } => Boolean(s.url))
        .map((s) => s.url);
      const campaign = await api.createCampaign({
        title: formData.title.trim(),
        creatorName: user?.fullName ?? 'Campaign organizer',
        category: formData.category as Category,
        shortDescription,
        fullDescription,
        goalAmount: Math.round(Number(formData.targetAmount)),
        campaignEndDate: formData.deadline,
        coverImage: coverImageUrl,
        ...(galleryUrls.length > 0 ? { galleryImages: galleryUrls } : {}),
        verificationDocumentUrl: verificationUrl,
        termsAcceptedAt: new Date().toISOString(),
        showPublicContact: formData.showPublicContact,
        contactPhone: formData.contactPhone.trim() || null,
        contactWhatsApp: formData.contactWhatsApp.trim() || null
      });

      try {
        await refreshUser();
      } catch {
        /* non-fatal */
      }

      navigate('/dashboard', {
        replace: true,
        state: {
          campaignSubmitted: true,
          submittedTitle: campaign.title,
          submittedSlug: campaign.slug
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated && user?.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  if (isAuthenticated && user && user.emailVerified === false) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full rounded-2xl border border-surface-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-800">
            <MailIcon className="h-7 w-7" />
          </div>
          <h1 className="font-display text-2xl font-bold text-surface-900 mb-2">
            Verify your email first
          </h1>
          <p className="text-sm text-surface-600 mb-6">
            Confirm <span className="font-semibold">{user.email}</span> to create a campaign on {BRAND_NAME}.
            You can still explore and donate while you wait.
          </p>
          <Link
            to="/verify-email"
            className="inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            Verify email
          </Link>
        </div>
      </div>
    );
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

              <div className="rounded-2xl border border-surface-200 bg-surface-50/80 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-surface-900">Public contact (optional)</h3>
                  <p className="text-xs text-surface-500 mt-1">
                    Let donors call or WhatsApp you for inquiries. Off by default — only shown if you enable it.
                    Include country code (e.g. +220…).
                  </p>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="showPublicContact"
                    checked={formData.showPublicContact}
                    onChange={handleChange}
                    className="mt-1 h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-surface-800">
                    Show my contact details on the campaign page
                  </span>
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="contactPhone" className="block text-xs font-semibold text-surface-700 mb-1.5">
                      Mobile (call)
                    </label>
                    <input
                      id="contactPhone"
                      type="tel"
                      name="contactPhone"
                      value={formData.contactPhone}
                      onChange={handleChange}
                      placeholder="+220 4512233"
                      className="w-full px-3 py-2.5 border border-surface-200 rounded-xl bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="contactWhatsApp" className="block text-xs font-semibold text-surface-700 mb-1.5">
                      WhatsApp
                    </label>
                    <input
                      id="contactWhatsApp"
                      type="tel"
                      name="contactWhatsApp"
                      value={formData.contactWhatsApp}
                      onChange={handleChange}
                      placeholder="+220 6612610"
                      className="w-full px-3 py-2.5 border border-surface-200 rounded-xl bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-surface-600 text-sm">
                Add a <strong className="text-surface-800">cover image</strong> (required), then up to{' '}
                {MAX_GALLERY_PHOTOS} more photos ({MAX_CAMPAIGN_PHOTOS} total). JPEG, PNG, or WebP, up to 5MB each.
                They are resized and compressed on the server for faster loading (especially on mobile).
              </p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-surface-200 rounded-2xl p-8 cursor-pointer hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
                <ImageIcon className="w-10 h-10 text-brand-600 mb-2" />
                <span className="text-sm font-semibold text-surface-800">Cover image</span>
                <span className="text-xs text-surface-500 mt-1">
                  Main photo for cards and the top of your page
                </span>
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

              {coverImageUrl && !coverUploading && (
                <div className="pt-4 border-t border-surface-100 space-y-3">
                  <p className="text-sm font-semibold text-surface-800">
                    Additional photos ({gallerySlots.length}/{MAX_GALLERY_PHOTOS})
                  </p>
                  <p className="text-xs text-surface-500">
                    Optional. Shown as a gallery on your public campaign page.
                  </p>
                  {gallerySlots.length < MAX_GALLERY_PHOTOS && (
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-surface-200 rounded-xl p-6 cursor-pointer hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
                      <span className="text-sm font-semibold text-surface-800">Add more images</span>
                      <span className="text-xs text-surface-500 mt-1">Select one or more files</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        multiple
                        aria-label="Upload optional campaign gallery images"
                        onChange={(e) => handleGalleryFiles(e)}
                      />
                    </label>
                  )}
                  {galleryFieldError && (
                    <p className="text-sm text-amber-700 flex items-center gap-1">
                      <AlertCircle size={16} /> {galleryFieldError}
                    </p>
                  )}
                  {gallerySlots.length > 0 && (
                    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {gallerySlots.map((slot) => (
                        <li
                          key={slot.id}
                          className="relative group rounded-xl overflow-hidden border border-surface-200 aspect-[4/3] bg-surface-100">
                          <img src={slot.preview} alt="" className="w-full h-full object-cover" />
                          {slot.uploading && (
                            <div className="absolute inset-0 bg-surface-900/50 flex items-center justify-center text-white text-xs font-semibold">
                              Uploading…
                            </div>
                          )}
                          {slot.error && !slot.url && (
                            <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center p-2 text-white text-[10px] text-center leading-tight">
                              {slot.error}
                            </div>
                          )}
                          {!slot.uploading && (
                            <button
                              type="button"
                              aria-label="Remove image"
                              onClick={() => removeGallerySlot(slot.id)}
                              className="absolute top-1.5 right-1.5 p-1 rounded-full bg-surface-900/75 text-white opacity-80 hover:opacity-100">
                              <X size={14} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
                    public campaign page. Verified organizers can withdraw raised funds.
                  </p>
                  {user?.kycStatus === 'Verified' && (
                    <p className="mt-2 text-emerald-800 font-medium">
                      Your ID is already verified. You can continue with the document on file, or upload a
                      new one (new uploads need re-review).
                    </p>
                  )}
                  {user?.kycStatus === 'Pending' && (
                    <p className="mt-2 text-amber-800 font-medium">
                      Your ID is under review. You can continue with the document on file.
                    </p>
                  )}
                  {user?.kycStatus === 'Rejected' && (
                    <p className="mt-2 text-red-700 font-medium">
                      Previous ID was rejected
                      {user.kycNotes ? `: ${user.kycNotes}` : ''}. Please upload a clearer document.
                    </p>
                  )}
                </div>
              </div>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-surface-200 rounded-2xl p-8 cursor-pointer hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
                <FileText className="w-10 h-10 text-brand-600 mb-2" />
                <span className="text-sm font-semibold text-surface-800">
                  {reusingExistingId ? 'Replace ID document' : 'Upload ID document'}
                </span>
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
                  <CheckCircle2 size={16} />{' '}
                  {reusingExistingId ? verificationFileName : `Received: ${verificationFileName}`}
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
              {gallerySlots.some((s) => s.url) && (
                <div>
                  <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">
                    Gallery preview
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {gallerySlots
                      .filter((s): s is GallerySlot & { url: string } => Boolean(s.url))
                      .map((s) => (
                        <div key={s.id} className="rounded-lg overflow-hidden border border-surface-200 h-20">
                          <img src={mediaUrl(s.url)} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                  </div>
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
                those internal fees.
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
                    <strong>1.9%</strong> fee applies to each donation. This is deducted from each donation 
                    and will be deducted from the total amount received by the campaign organizer before the payout is processed.                   
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
