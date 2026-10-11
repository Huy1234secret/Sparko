import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AnimatedIcon,
  assetRegistry,
  getDiscordMedia,
  type AssetTheme,
  type MotionPreference,
} from '../src';

function Gallery() {
  const [theme, setTheme] = useState<AssetTheme>('light');
  const [motion, setMotion] = useState<MotionPreference>('system');
  const [run, setRun] = useState(false);
  return (
    <main
      style={{
        padding: 32,
        minHeight: '100vh',
        background: theme === 'light' ? '#FFFCF3' : '#111110',
        color: theme === 'light' ? '#1C1917' : '#FAFAF5',
        fontFamily: 'system-ui',
      }}
    >
      <h1>Sparko asset previews</h1>
      <p>
        Owned website JSON, static SVG and supported Discord media. Hover an
        icon to play once.
      </p>
      <label>
        Theme{' '}
        <select
          aria-label="Theme"
          value={theme}
          onChange={(event) => setTheme(event.target.value as AssetTheme)}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>{' '}
      <label>
        Motion{' '}
        <select
          aria-label="Motion"
          value={motion}
          onChange={(event) =>
            setMotion(event.target.value as MotionPreference)
          }
        >
          <option value="system">System preference</option>
          <option value="off">Off</option>
          <option value="on">On, respecting reduced motion</option>
        </select>
      </label>{' '}
      <button onClick={() => setRun(!run)}>
        {run ? 'Reset animations' : 'Play animations once'}
      </button>
      <section
        aria-label="Website animation variants"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 24,
          margin: '24px 0',
        }}
      >
        {assetRegistry.map((asset) => (
          <article
            key={asset.id}
            style={{
              border: '1px solid #A8A29E',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <AnimatedIcon
              name={asset.id}
              label={`${asset.id} icon`}
              size={96}
              theme={theme}
              motion={motion}
              state={run ? 'active' : 'idle'}
            />
            <p>{asset.id}</p>
            <small>
              {asset.byteSize} bytes · {asset.version}
            </small>
          </article>
        ))}
      </section>
      <h2>Discord PNG equivalents</h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {assetRegistry.map((asset) => (
          <img
            key={asset.id}
            src={getDiscordMedia(asset.id).url}
            width={72}
            height={72}
            alt={`${asset.id} Discord PNG`}
          />
        ))}
      </div>
      <h2>Discord animated GIF equivalents</h2>
      <p>
        Discord attachments use exported GIF, not the website Lottie runtime.
      </p>
      <img
        src={getDiscordMedia('spark', true).url}
        width={128}
        height={128}
        alt="Animated Sparko spark GIF"
      />
      <img
        src={getDiscordMedia('setup-success', true).url}
        width={128}
        height={128}
        alt="Animated setup success GIF"
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Gallery />);
