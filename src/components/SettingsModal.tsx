import { useRef } from "react";

interface SettingsModalProps {
  showDebugTools: boolean;
  setShowDebugTools(next: boolean): void;
  swVersion: string;
  logicalDay: string;
  logicalOffset: number;
  dayStartHour: number;
  soundVolume: number;
  showStatus: boolean;
  theme: "light" | "wow";
  isCheckingUpdate: boolean;
  isApplyingUpdate: boolean;
  closeSettingsPopup(): void;
  checkForUpdates(): Promise<void>;
  exportData(): Promise<void>;
  importData(file: File): Promise<void>;
  deleteAllData(): Promise<void>;
  decrementLogicalDay(): Promise<void>;
  incrementLogicalDay(): Promise<void>;
  resetLogicalDayToToday(): Promise<void>;
  setLogicalDay(day: string): Promise<void>;
  setDayStartHour(hour: number): Promise<void>;
  setSoundVolume(volume: number): Promise<void>;
  setShowStatus(next: boolean): Promise<void>;
  setTheme(next: "light" | "wow"): Promise<void>;
  openCompleteLog(): void;
}

export function SettingsModal({
  showDebugTools,
  setShowDebugTools,
  swVersion,
  logicalDay,
  logicalOffset,
  dayStartHour,
  soundVolume,
  showStatus,
  theme,
  isCheckingUpdate,
  isApplyingUpdate,
  closeSettingsPopup,
  checkForUpdates,
  exportData,
  importData,
  deleteAllData,
  decrementLogicalDay,
  incrementLogicalDay,
  resetLogicalDayToToday,
  setLogicalDay,
  setDayStartHour,
  setSoundVolume,
  setShowStatus,
  setTheme,
  openCompleteLog,
}: SettingsModalProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="modal-backdrop" onClick={closeSettingsPopup}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-top">
          <h3>App Settings</h3>
          <button onClick={closeSettingsPopup}>Close</button>
        </div>
        <div className="card">
          <div className="title">Application Version</div>
          <div className="tags">Version: {swVersion}</div>
          <div className="actions">
            <button onClick={() => void checkForUpdates()} disabled={isCheckingUpdate || isApplyingUpdate}>
              {isApplyingUpdate ? "Applying update..." : isCheckingUpdate ? "Checking updates..." : "Check for update"}
            </button>
            <button onClick={() => setShowDebugTools(!showDebugTools)}>{showDebugTools ? "Hide debug tools" : "Debug tools"}</button>
          </div>
        </div>
        <div className="card">
          <div className="title">Data Management</div>
          <div className="tags">Export, import, or reset your app data.</div>
          <div className="actions">
            <button onClick={() => void exportData()}>Export data to JSON</button>
            <button onClick={() => importInputRef.current?.click()}>Import data from JSON</button>
            <button onClick={openCompleteLog}>Complete log</button>
            <button className="danger" onClick={() => void deleteAllData()}>
              Delete all data
            </button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) {
                void importData(file);
              }
              e.currentTarget.value = "";
            }}
          />
        </div>
        <div className="card">
          <div className="title">Day Boundary</div>
          <div className="tags">A new calendar day starts at {String(dayStartHour).padStart(2, "0")}:00 local time.</div>
          <div className="actions">
            <button
              onClick={() => {
                const raw = window.prompt("Set day boundary hour (0-23)", String(dayStartHour));
                if (raw === null) return;
                const hour = Number(raw);
                if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
                  window.alert("Please enter an hour from 0 to 23.");
                  return;
                }
                void setDayStartHour(hour);
              }}
            >
              Set Day Boundary
            </button>
          </div>
        </div>
        <div className="card">
          <div className="title">Sound</div>
          <div className="tags">Button click volume is muted by default.</div>
          <div className="settings-volume-row">
            <input
              className="settings-volume-slider"
              type="range"
              min={0}
              max={100}
              value={soundVolume}
              onChange={(e) => {
                void setSoundVolume(Number(e.currentTarget.value));
              }}
            />
            <div className="meta-row settings-volume-value">{soundVolume === 0 ? "Muted" : `${soundVolume}%`}</div>
          </div>
        </div>
        <div className="card">
          <div className="title">Display</div>
          <div className="tags">Show or hide item status labels on cards.</div>
          <div className="actions">
            <button onClick={() => void setShowStatus(!showStatus)}>{showStatus ? "Show status: On" : "Show status: Off"}</button>
          </div>
        </div>
        <div className="card">
          <div className="title">Theme</div>
          <div className="tags">Choose visual style.</div>
          <div className="actions settings-theme-options">
            <button className={theme === "light" ? "active" : ""} onClick={() => void setTheme("light")}>
              Light
            </button>
            <button className={theme === "wow" ? "active" : ""} onClick={() => void setTheme("wow")}>
              WOW
            </button>
          </div>
        </div>
        {showDebugTools && (
          <div className="card">
            <div className="title">Debug Date Control</div>
            <div className="tags">
              Logical Day: {logicalDay} (offset {logicalOffset >= 0 ? `+${logicalOffset}` : logicalOffset})
            </div>
            <div className="actions">
              <button onClick={() => void decrementLogicalDay()}>-1 Day</button>
              <button onClick={() => void incrementLogicalDay()}>+1 Day</button>
              <button onClick={() => void resetLogicalDayToToday()}>Reset to Today</button>
              <button
                onClick={() => {
                  const day = window.prompt("Set logical day YYYY-MM-DD", logicalDay);
                  if (day) void setLogicalDay(day);
                }}
              >
                Set Date
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
