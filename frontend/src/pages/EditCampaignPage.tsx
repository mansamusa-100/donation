import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Image as ImageIcon, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { mediaUrl } from '../lib/mediaUrl';
import type { Campaign, Category, CategorySummary } from '../types/campaign';

const MAX_GALLERY = 4;

type GallerySlot = {
  id: string;
  preview: string;
  url: string | null;
  uploading: boolean;
  error: string;
};

/**
 * Organizer campaign content editor.
 * - PendingReview / Rejected: updates apply immediately (still needs admin to publish).
 * - Active: submits a revision for admin approval before the public page changes.
 */
export function EditCampaignPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [title, setTitle] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [fullDescription, setFullDescription] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [goalAmount, setGoalAmount] = useState('');
  const [reason, setReason] = useState('');

  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [gallerySlots, setGallerySlots] = useState<GallerySlot[]>([]);
  const gallerySlotsRef = useRef<GallerySlot[]>([]);
  gallerySlotsRef.current = gallerySlots;

  useEffect(() => {
    if (!isAuthenticated || !slug) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([api.getCreatorDashboard(), api.getCategories()])
      .then(([dash, cats]) => {
        if (cancelled) {
          return;
        }
        setCategories(cats);
        const found = dash.campaigns.find((c) => c.slug === slug) ?? null;
        if (!found) {
          setLoadError('Campaign not found on your account.');
          setCampaign(null);
          return;
        }
        setCampaign(found);
        setTitle(found.title);
        setShortDescription(found.shortDescription);
        setFullDescription(found.fullDescription);
        setCategory(found.category);
        setGoalAmount(String(found.goalAmount));
        setCoverImageUrl(found.coverImage);
        setCoverPreview(mediaUrl(found.coverImage));
        setGallerySlots(
          (found.galleryImages ?? []).map((url) => ({
            id: crypto.randomUUID(),
            preview: mediaUrl(url),
            url,
            uploading: false,
            error: ''
          }))
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load campaign');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, slug]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  const handleCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Cover must be JPEG, PNG, or WebP up to 5MB.');
      return;
    }
    setCoverUploading(true);
    setError('');
    try {
      const { url } = await api.uploadCampaignCoverImage(file);
      setCoverImageUrl(url);
      setCoverPreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cover upload failed');
    } finally {
      setCoverUploading(false);
    }
  };

  const handleGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const raw = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (!raw.length) {
      return;
    }
    setGallerySlots((prev) => {
      const room = MAX_GALLERY - prev.length;
      if (room <= 0) {
        return prev;
      }
      const files = raw
        .filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 5 * 1024 * 1024)
        .slice(0, room);
      const additions: GallerySlot[] = files.map((file) => ({
        id: crypto.randomUUID(),
        preview: URL.createObjectURL(file),
        url: null,
        uploading: true,
        error: ''
      }));
      files.forEach((file, i) => {
        const id = additions[i].id;
        void api
          .uploadCampaignCoverImage(file)
          .then(({ url }) => {
            setGallerySlots((cur) =>
              cur.map((s) => (s.id === id ? { ...s, url, uploading: false } : s))
            );
          })
          .catch((err) => {
            setGallerySlots((cur) =>
              cur.map((s) =>
                s.id === id
                  ? {
                      ...s,
                      uploading: false,
                      error: err instanceof Error ? err.message : 'Upload failed'
                    }
                  : s
              )
            );
          });
      });
      return [...prev, ...additions];
    });
  };

  const removeGallery = (id: string) => {
    setGallerySlots((prev) => {
      const row = prev.find((r) => r.id === id);
      if (row?.preview.startsWith('blob:')) {
        URL.revokeObjectURL(row.preview);
      }
      return prev.filter((r) => r.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!campaign || !coverImageUrl || !category) {
      setError('Fill in all required fields and finish image uploads.');
      return;
    }
    if (gallerySlots.some((s) => s.uploading) || gallerySlots.some((s) => s.error && !s.url)) {
      setError('Wait for gallery uploads to finish, or remove failed images.');
      return;
    }
    const goal = Math.round(Number(goalAmount));
    if (!Number.isFinite(goal) || goal < 1) {
      setError('Enter a valid goal amount.');
      return;
    }
    if (campaign.status === 'Active' && goal < Math.ceil(campaign.raisedAmount)) {
      setError(
        `Goal cannot be below the amount already raised (D${Math.ceil(campaign.raisedAmount).toLocaleString()}).`
      );
      return;
    }

    setSaving(true);
    try {
      const galleryUrls = gallerySlots
        .filter((s): s is GallerySlot & { url: string } => Boolean(s.url))
        .map((s) => s.url);
      const res = await api.updateCampaignContent(campaign.slug, {
        title: title.trim(),
        shortDescription: shortDescription.trim(),
        fullDescription: fullDescription.trim(),
        category,
        goalAmount: goal,
        coverImage: coverImageUrl,
        galleryImages: galleryUrls,
        ...(reason.trim() ? { reason: reason.trim() } : {})
      });
      setSuccess(res.message);
      setCampaign(res.campaign);
      window.setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-surface-500 text-sm">
        Loading campaign…
      </div>
    );
  }

  if (loadError || !campaign) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-surface-700 mb-4">{loadError || 'Campaign not found'}</p>
        <Link to="/dashboard" className="text-brand-600 font-bold hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (campaign.status === 'Closed' || campaign.status === 'Ended') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-surface-700 mb-4">Ended or closed campaigns cannot be edited.</p>
        <Link to="/dashboard" className="text-brand-600 font-bold hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (campaign.pendingContentRevision) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-surface-800 font-semibold">Changes already pending review</p>
        <p className="text-sm text-surface-600">
          You submitted content edits that an admin still needs to approve or reject. The public page stays
          unchanged until then.
        </p>
        <Link to="/dashboard" className="inline-block text-brand-600 font-bold hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const needsApproval = campaign.status === 'Active';

  return (
    <div className="min-h-screen bg-surface-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-warm border border-surface-100 p-6 sm:p-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-surface-600 hover:text-brand-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-surface-900 mb-1">
          Edit campaign
        </h1>
        <p className="text-surface-600 text-sm mb-6">
          {needsApproval
            ? 'Because this campaign is live, your changes go to an admin for approval before the public page updates.'
            : campaign.status === 'Rejected'
              ? 'Update your campaign and resubmit it to the admin review queue.'
              : 'Update details while your campaign awaits admin approval.'}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-800 text-sm flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-sm flex gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            {success}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-surface-800 mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={5}
              maxLength={120}
              className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-surface-800 mb-1.5">
              Short description
            </label>
            <textarea
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              required
              minLength={20}
              maxLength={240}
              rows={3}
              className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-surface-800 mb-1.5">Full story</label>
            <textarea
              value={fullDescription}
              onChange={(e) => setFullDescription(e.target.value)}
              required
              minLength={40}
              rows={8}
              className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-surface-800 mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                required
                className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm bg-white">
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-surface-800 mb-1.5">
                Goal (GMD)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm"
              />
              {campaign.status === 'Active' && (
                <p className="text-xs text-surface-500 mt-1">
                  Raised so far: D{campaign.raisedAmount.toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-surface-800 mb-2">Cover image</p>
            {coverPreview && (
              <div className="rounded-xl overflow-hidden border border-surface-200 h-40 mb-2">
                <img src={coverPreview} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 text-sm font-semibold cursor-pointer hover:bg-surface-50">
              <ImageIcon className="w-4 h-4" />
              {coverUploading ? 'Uploading…' : 'Replace cover'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void handleCover(e)}
              />
            </label>
          </div>

          <div>
            <p className="text-sm font-semibold text-surface-800 mb-2">
              Gallery (optional, up to {MAX_GALLERY})
            </p>
            {gallerySlots.length > 0 && (
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                {gallerySlots.map((s) => (
                  <li key={s.id} className="relative rounded-lg overflow-hidden border border-surface-200 h-20">
                    <img src={s.preview} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeGallery(s.id)}
                      className="absolute top-1 right-1 p-0.5 rounded bg-white/90 text-surface-700"
                      aria-label="Remove gallery image">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {gallerySlots.length < MAX_GALLERY && (
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 text-sm font-semibold cursor-pointer hover:bg-surface-50">
                Add photos
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleGallery}
                />
              </label>
            )}
          </div>

          {needsApproval && (
            <div>
              <label className="block text-sm font-semibold text-surface-800 mb-1.5">
                Note to admin (optional)
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="Why are you updating this campaign?"
                className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || coverUploading}
              className="px-5 py-3 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-50">
              {saving
                ? 'Saving…'
                : needsApproval
                  ? 'Submit for admin approval'
                  : campaign.status === 'Rejected'
                    ? 'Save & resubmit for review'
                    : 'Save changes'}
            </button>
            <Link
              to="/dashboard"
              className="px-5 py-3 rounded-xl border border-surface-200 text-sm font-bold text-surface-700 hover:bg-surface-50">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
