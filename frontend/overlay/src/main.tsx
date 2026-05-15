import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  return (
    <main className="overlay">
      <header className="topbar">
        <span>世界時間 Day 001 12:00</span>
        <span>天気: 晴れ</span>
        <span>生存者 5 / 死亡者 0</span>
      </header>

      <aside className="left-panel">
        <h2>AI住民</h2>
        <div className="npc-card"><b>レン</b><span>HP 100 / 水 70 / 食料 70</span></div>
        <div className="npc-card"><b>ミナ</b><span>水を探している</span></div>
        <div className="npc-card"><b>タク</b><span>食料不足に注意</span></div>
      </aside>

      <section className="world">
        <div className="diamond d1">レン</div>
        <div className="diamond d2">ミナ</div>
        <div className="diamond d3">タク</div>
      </section>

      <aside className="right-panel">
        <h2>最近の支援</h2>
        <p>DevMock: Rose ×10</p>
        <h2>世界事件</h2>
        <p>レンが周囲を確認している。</p>
      </aside>

      <footer className="ticker">今日の出来事：荒土世界 Alpha は静かに動き始めた。</footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
