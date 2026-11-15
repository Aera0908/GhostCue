import React from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";

interface AudioMetersProps {
  micLevel: number;
  loopbackLevel: number;
  micActive: boolean;
  loopbackActive: boolean;
  sensitivity?: number;
  micMuted?: boolean;
  loopbackMuted?: boolean;
  onToggleMicMute?: () => void;
  onToggleLoopbackMute?: () => void;
  isPaused?: boolean;
}

const Source: React.FC<{
  name: string;
  level: number;
  muted: boolean;
  speaking: boolean;
  onToggle?: () => void;
  icon: React.ReactNode;
  mutedIcon: React.ReactNode;
}> = ({ name, level, muted, speaking, onToggle, icon, mutedIcon }) => (
  <div className="flex min-w-0 flex-1 items-center gap-2">
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={muted ? `Unmute ${name.toLowerCase()}` : `Mute ${name.toLowerCase()}`}
      title={muted ? `${name} is muted. Click to unmute.` : `Mute ${name.toLowerCase()}`}
      className={
        "flex h-6 shrink-0 items-center gap-1.5 rounded px-1.5 text-xs hover:bg-g-hover active:bg-g-base " +
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-g-accent " +
        (muted ? "text-g-danger" : speaking ? "text-g-text" : "text-g-muted")
      }
    >
      {muted ? mutedIcon : icon}
      <span>{muted ? `${name} muted` : name}</span>
    </button>
    <div
      role="meter"
      aria-label={`${name} level`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={level}
      className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-g-line"
    >
      <div
        className="h-full origin-left bg-g-accent transition-transform duration-100 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${level / 100})` }}
      />
    </div>
  </div>
);

/** The two voices of an interview. A moving bar is the only sign of sound; nothing pulses. */
export const AudioMeters: React.FC<AudioMetersProps> = ({
  micLevel,
  loopbackLevel,
  micActive,
  loopbackActive,
  micMuted = false,
  loopbackMuted = false,
  onToggleMicMute,
  onToggleLoopbackMute,
  isPaused = false,
}) => {
  const micPct = isPaused || micMuted ? 0 : Math.min(100, Math.max(micActive ? 8 : 0, Math.round(micLevel * 100)));
  const loopbackPct =
    isPaused || loopbackMuted ? 0 : Math.min(100, Math.max(loopbackActive ? 8 : 0, Math.round(loopbackLevel * 100)));

  return (
    <div
      role="region"
      aria-label="Sound levels"
      className="flex h-8 shrink-0 select-none items-center gap-4 border-b border-g-line px-2.5"
    >
      {isPaused && <span className="shrink-0 text-xs font-medium text-g-accent">Paused</span>}
      <Source
        name="Interviewer"
        level={loopbackPct}
        muted={loopbackMuted}
        speaking={loopbackActive && !isPaused}
        onToggle={onToggleLoopbackMute}
        icon={<Volume2 className="h-3.5 w-3.5" aria-hidden="true" />}
        mutedIcon={<VolumeX className="h-3.5 w-3.5" aria-hidden="true" />}
      />
      <Source
        name="You"
        level={micPct}
        muted={micMuted}
        speaking={micActive && !isPaused}
        onToggle={onToggleMicMute}
        icon={<Mic className="h-3.5 w-3.5" aria-hidden="true" />}
        mutedIcon={<MicOff className="h-3.5 w-3.5" aria-hidden="true" />}
      />
    </div>
  );
};
