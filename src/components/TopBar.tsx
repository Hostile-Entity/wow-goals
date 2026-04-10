interface TopBarProps {
  logicalDay: string;
  onOpenSettings(): void;
}

export function TopBar({ logicalDay, onOpenSettings }: TopBarProps) {
  return (
    <header className="topbar">
      <h1>WowGoals</h1>
      <div className="topbar-actions">
        <div className="meta">Day {logicalDay}</div>
        <button className="settings-btn" onClick={onOpenSettings} aria-label="Open app settings">
          Settings
        </button>
      </div>
    </header>
  );
}
