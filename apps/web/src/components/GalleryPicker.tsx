import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
} from '@sparko/ui';
import {
  getAssets,
  uploadAsset,
  fileBase64,
  type MediaAsset,
} from '../services/assets';
import { errorMessage } from '../services/http';
import { useActionIdentity } from '../hooks/useActionIdentity';

export function GalleryPicker({
  guildId,
  onSelect,
}: {
  guildId: string;
  onSelect: (asset: MediaAsset) => void;
}) {
  const identity = useActionIdentity(),
    queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null),
    [name, setName] = useState(''),
    [alt, setAlt] = useState(''),
    [visibility, setVisibility] = useState<'public' | 'private'>('private'),
    [acknowledged, setAcknowledged] = useState(false),
    [validation, setValidation] = useState('');
  const query = useQuery({
    queryKey: ['assets', guildId],
    queryFn: ({ signal }) => getAssets(guildId, signal),
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose an image first.');
      if (file.size > 4 * 1024 * 1024)
        throw new Error('Choose an image smaller than 4 MiB.');
      const input = {
        name,
        alt,
        base64: await fileBase64(file),
        visibility,
        publicSharingAcknowledged: acknowledged,
      };
      return uploadAsset(guildId, input, identity('asset-upload', input));
    },
    onSuccess: () => {
      setFile(null);
      setName('');
      setAlt('');
      setAcknowledged(false);
      void queryClient.invalidateQueries({ queryKey: ['assets', guildId] });
    },
  });
  return (
    <div className="stack">
      <p className="muted">
        Add PNG, JPEG or WebP images up to 4 MiB and 2048 × 2048 pixels. Public
        images can be included in published Discord messages. Private images
        stay in your authorized library.
      </p>
      <Card>
        <h3>Add an image</h3>
        <Field label="Image file" htmlFor="asset-file">
          <input
            id="asset-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const selected = e.target.files?.[0] ?? null;
              setFile(selected);
              setName(selected?.name.replace(/\.[^.]+$/, '') ?? '');
              setValidation(
                selected && selected.size > 4 * 1024 * 1024
                  ? 'Choose an image smaller than 4 MiB.'
                  : '',
              );
              upload.reset();
            }}
          />
        </Field>
        <Field label="Image name" htmlFor="asset-name">
          <Input
            id="asset-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          label="Alternative text"
          htmlFor="asset-alt"
          hint="Describe the useful content for members who cannot see the image."
        >
          <Input
            id="asset-alt"
            value={alt}
            maxLength={500}
            onChange={(e) => setAlt(e.target.value)}
          />
        </Field>
        <Field label="Who can view this image?" htmlFor="asset-visibility">
          <select
            id="asset-visibility"
            value={visibility}
            onChange={(e) => {
              setVisibility(e.target.value === 'public' ? 'public' : 'private');
              setAcknowledged(false);
            }}
          >
            <option value="private">Authorized staff only</option>
            <option value="public">Anyone with the image link</option>
          </select>
        </Field>
        {visibility === 'public' && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I allow members and visitors with this link to view this image.
          </label>
        )}
        {validation && <p role="alert">{validation}</p>}
        {upload.error && <ErrorState message={errorMessage(upload.error)} />}
        <Button
          disabled={
            !file ||
            !name.trim() ||
            !alt.trim() ||
            !!validation ||
            (visibility === 'public' && !acknowledged)
          }
          busy={upload.isPending}
          onClick={() => upload.mutate()}
        >
          Upload image
        </Button>
        {upload.isSuccess && <p role="status">Image added to your library.</p>}
      </Card>
      <div>
        <h3>Your media library</h3>
        {query.isPending ? (
          <LoadingState label="Opening your media library…" />
        ) : query.error ? (
          <ErrorState
            message={errorMessage(query.error)}
            retry={() => void query.refetch()}
          />
        ) : query.data?.length ? (
          <div className="feature-grid">
            {query.data.map((asset) => (
              <Card key={asset.id}>
                <img
                  src={asset.previewUrl}
                  alt={asset.alt}
                  width={asset.width}
                  height={asset.height}
                  style={{ width: '100%', height: 140, objectFit: 'contain' }}
                />
                <h4>{asset.name}</h4>
                <p className="field-hint">
                  {asset.width} × {asset.height} ·{' '}
                  {Math.ceil(asset.bytes / 1024)} KiB · {asset.visibility}
                </p>
                <Button
                  variant="secondary"
                  disabled={asset.visibility === 'private'}
                  onClick={() => onSelect(asset)}
                >
                  Use this image
                </Button>
                {asset.visibility === 'private' && (
                  <p className="field-hint">
                    This image is private. Upload a public copy to use it in a
                    channel publication.
                  </p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No uploaded images yet"
            description="Your original artwork can be reused across saved message designs."
          />
        )}
      </div>
    </div>
  );
}
