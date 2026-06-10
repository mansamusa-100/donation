import { useRef, useState } from 'react';
import { CameraIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Avatar } from './Avatar';

/**
 * Lets a signed-in user upload (or remove) their own profile picture.
 * The photo is shown as the organizer photo on all their campaigns.
 */
export function ProfileAvatarEditor() {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user) {
    return null;
  }

  const handleFileChange = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { url } = await api.uploadProfilePicture(file);
      await api.updateMyAvatar(url);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your profile picture');
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError('');
    try {
      await api.updateMyAvatar(null);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your profile picture');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <Avatar
          name={user.fullName}
          src={user.avatarUrl}
          sizeClassName="w-14 h-14"
          textClassName="text-lg"
          className="ring-2 ring-white shadow-sm"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow hover:bg-brand-700 disabled:opacity-60"
          aria-label={user.avatarUrl ? 'Change profile picture' : 'Upload profile picture'}
          title={user.avatarUrl ? 'Change profile picture' : 'Upload profile picture'}>
          {busy ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <CameraIcon className="h-3.5 w-3.5" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label="Profile picture file"
          onChange={(e) => void handleFileChange(e.target.files?.[0])}
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-surface-900">Your profile photo</p>
        <p className="text-xs text-surface-500">
          {user.avatarUrl
            ? 'Shown as the organizer photo on your campaigns.'
            : 'Add a photo so donors can see who is behind your campaigns.'}
        </p>
        {user.avatarUrl && (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={busy}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-60">
            <Trash2Icon className="h-3 w-3" /> Remove photo
          </button>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
