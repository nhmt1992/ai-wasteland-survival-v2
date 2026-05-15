import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  return (
    <main className="page">
      <section className="card hero">
        <p className="eyebrow">AI WASTELAND SURVIVAL</p>
        <h1>AI住民を作成</h1>
        <p>配信者 matt の荒土世界に、あなたの AI住民を参加させます。</p>
      </section>

      <section className="card form">
        <label>TikTok ID</label>
        <input placeholder="例：viewer_123" />

        <label>性格・背景</label>
        <textarea placeholder="例：無口だが仲間思い。水を探すのが得意な生存者。" />

        <button>作成する</button>
      </section>

      <section className="card">
        <h2>あなたのAI住民</h2>
        <p className="muted">作成後、ここに状態・所持品・最近の出来事が表示されます。</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
