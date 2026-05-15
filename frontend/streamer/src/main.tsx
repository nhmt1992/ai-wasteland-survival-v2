import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const overlayUrl = 'http://localhost:5174/overlay/matt/default-world';
  const createUrl = 'http://localhost:5175/s/matt/create';

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">AI WASTELAND SURVIVAL v2</p>
        <h1>配信者コンソール</h1>
        <p className="lead">多主播 SaaS 版の管理画面。MVP ではデフォルト配信者 matt のワールドを表示します。</p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>契約状態</h2>
          <p className="value">Free Trial</p>
          <p>ワールド 1 / NPC 上限 10</p>
        </article>
        <article className="card">
          <h2>現在のワールド</h2>
          <p className="value">荒土世界 Alpha</p>
          <p>状態: active</p>
        </article>
        <article className="card">
          <h2>AI住民</h2>
          <p className="value">5</p>
          <p>生存者 5 / 死亡者 0</p>
        </article>
      </section>

      <section className="panel">
        <h2>配信用リンク</h2>
        <label>OBS Overlay URL</label>
        <code>{overlayUrl}</code>
        <label>視聴者作成リンク</label>
        <code>{createUrl}</code>
      </section>

      <section className="panel">
        <h2>危機リスト</h2>
        <ul>
          <li>レン：安定</li>
          <li>ミナ：水を探している</li>
          <li>タク：食料不足に注意</li>
        </ul>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
