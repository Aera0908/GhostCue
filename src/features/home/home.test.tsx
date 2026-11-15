import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(() => {}) }));

import { Home } from "./Home";
import { NewInterview, NEW_INTERVIEW_DRAFT_KEY } from "./NewInterview";
import { DEFAULT_CONFIG } from "../../services/tauriApi";
import type { AppConfig } from "../../types/config";
import type { InterviewSession } from "../../types/session";

type Handler = (args: Record<string, unknown>) => unknown;
let keys: Record<string, boolean> = {};
let whisper = [{ name: "base.en", size: "142 MB", downloaded: true, path: "C:\\m\\base.bin" }];

function backend(extra: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = {
    get_key_status: () => keys,
    get_available_whisper_models: () => whisper,
    ...extra,
  };
  invoke.mockImplementation((cmd: string, args: Record<string, unknown>) => {
    const handler = handlers[cmd];
    if (!handler) return Promise.reject(new Error(`unexpected command ${cmd}`));
    try {
      return Promise.resolve(handler(args ?? {}));
    } catch (e) {
      return Promise.reject(e);
    }
  });
}

const callsTo = (cmd: string) => invoke.mock.calls.filter((c) => c[0] === cmd);
const ready: AppConfig = { ...DEFAULT_CONFIG, llm_provider: "groq", groq_model: "llama-test", stt_provider: "local_whisper" };

const session = (patch: Partial<InterviewSession>): InterviewSession => ({
  id: "s1",
  title: "Platform team loop",
  role: "Staff engineer",
  company: "Example Co",
  createdAt: "2026-11-01T10:00:00.000Z",
  lastActive: "2026-11-02T10:00:00.000Z",
  transcripts: [],
  aiLogs: [],
  ...patch,
});

const homeProps = () => ({
  config: ready,
  sessions: [] as InterviewSession[],
  onNew: vi.fn(),
  onOpen: vi.fn(),
  onDelete: vi.fn(),
  onExport: vi.fn(),
  onSettings: vi.fn(),
});

beforeEach(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockReset();
  localStorage.clear();
  keys = { groq: true };
  whisper = [{ name: "base.en", size: "142 MB", downloaded: true, path: "C:\\m\\base.bin" }];
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("Home", () => {
  it("shows one clear next step and says what is set up", async () => {
    backend();
    const props = homeProps();
    render(<Home {...props} />);

    expect(await screen.findByText(/Answers from Groq using llama-test/)).toBeInTheDocument();
    expect(screen.getByText(/No interviews yet/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "New interview" }));
    expect(props.onNew).toHaveBeenCalledTimes(1);
  });

  it("will not start an interview that cannot be answered, and sends the user to the fix", async () => {
    keys = { groq: false };
    backend();
    const props = { ...homeProps(), sessions: [session({})] };
    const user = userEvent.setup();
    render(<Home {...props} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Groq needs an API key");
    expect(screen.queryByRole("button", { name: "New interview" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue Platform team loop" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(props.onSettings).toHaveBeenCalledWith("answers");
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("checks again after settings were open, so a key saved there unblocks the start", async () => {
    keys = { groq: false };
    backend();
    const props = homeProps();
    const { rerender } = render(<Home {...props} refreshToken={0} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Groq needs an API key");

    keys = { groq: true };
    rerender(<Home {...props} refreshToken={1} />);

    expect(await screen.findByRole("button", { name: "New interview" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("will not start an interview that cannot be heard", async () => {
    whisper = [{ name: "base.en", size: "142 MB", downloaded: false, path: "" }];
    backend();
    const props = homeProps();
    render(<Home {...props} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no Whisper model is downloaded/);
    await userEvent.setup().click(screen.getByRole("button", { name: "Open settings" }));
    expect(props.onSettings).toHaveBeenCalledWith("listening");
  });

  it("lists interviews newest first and opens one", async () => {
    backend();
    const props = {
      ...homeProps(),
      sessions: [
        session({ id: "old", title: "Older", lastActive: "2026-10-01T10:00:00.000Z" }),
        session({ id: "new", title: "Newer", lastActive: "2026-11-10T10:00:00.000Z", company: undefined }),
      ],
    };
    render(<Home {...props} />);

    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((r) => within(r).getByRole("heading").textContent)).toEqual(["Newer", "Older"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue Newer" })).toBeEnabled());
    await userEvent.setup().click(screen.getByRole("button", { name: "Continue Newer" }));
    expect(props.onOpen).toHaveBeenCalledWith("new");
  });

  it("asks before deleting, in the page, and deletes once", async () => {
    backend();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const props = { ...homeProps(), sessions: [session({})] };
    const user = userEvent.setup();
    render(<Home {...props} />);

    await user.click(await screen.findByRole("button", { name: "Delete Platform team loop" }));
    expect(props.onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("button", { name: "Keep" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Platform team loop" }));
    await user.dblClick(screen.getByRole("button", { name: "Delete for good" }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledWith("s1");
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("survives sessions with missing or broken fields", async () => {
    backend();
    const broken = { id: "x", title: "", role: "", createdAt: "not a date", lastActive: "", transcripts: [] } as InterviewSession;
    render(<Home {...homeProps()} sessions={[broken]} />);

    expect(await screen.findByRole("heading", { name: "Untitled interview" })).toBeInTheDocument();
  });
});

describe("NewInterview", () => {
  const props = () => ({ config: ready, onCreate: vi.fn(), onCancel: vi.fn() });

  it("asks about the role first and will not continue without one", async () => {
    backend();
    const p = props();
    const user = userEvent.setup();
    render(<NewInterview {...p} />);

    expect(screen.getByRole("heading", { name: "The role" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Your background")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Role"));
    await user.type(screen.getByLabelText("Role"), "   ");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter the role you are interviewing for.");
    expect(screen.getByRole("heading", { name: "The role" })).toBeInTheDocument();
  });

  it("does not prefill the app's built-in sample text as if it were the user's", () => {
    backend();
    render(<NewInterview {...props()} config={DEFAULT_CONFIG} />);

    expect(screen.getByLabelText("Role")).toHaveValue("");
    expect(screen.getByLabelText("Job description")).toHaveValue("");
  });

  it("creates the interview once, trimmed, with what was entered on both steps", async () => {
    backend();
    const p = props();
    const user = userEvent.setup();
    render(<NewInterview {...p} config={DEFAULT_CONFIG} />);

    await user.type(screen.getByLabelText("Role"), "  Staff engineer ");
    await user.type(screen.getByLabelText("Company"), "Example Co");
    await user.type(screen.getByLabelText("Job description"), "Own the platform.");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Your background"), "Ten years of backend work.");
    await user.dblClick(screen.getByRole("button", { name: "Start interview" }));

    expect(p.onCreate).toHaveBeenCalledTimes(1);
    expect(p.onCreate).toHaveBeenCalledWith({
      title: "Staff engineer at Example Co",
      role: "Staff engineer",
      company: "Example Co",
      jobDescription: "Own the platform.",
      candidateResume: "Ten years of backend work.",
      projectDirectory: undefined,
      projectDirectories: [],
      projectContext: undefined,
    });
    expect(localStorage.getItem(NEW_INTERVIEW_DRAFT_KEY)).toBeNull();
  });

  it("keeps a draft across a restart and going back keeps what was typed", async () => {
    backend();
    const user = userEvent.setup();
    const { unmount } = render(<NewInterview {...props()} config={DEFAULT_CONFIG} />);
    await user.type(screen.getByLabelText("Role"), "Data engineer");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Your background"), "SQL");
    unmount();

    render(<NewInterview {...props()} config={DEFAULT_CONFIG} />);
    expect(await screen.findByLabelText("Your background")).toHaveValue("SQL");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByLabelText("Role")).toHaveValue("Data engineer");
  });

  it("ignores an unreadable draft", () => {
    backend();
    for (const bad of ["{", "null", "[]", '{"step":7,"role":5}']) {
      localStorage.setItem(NEW_INTERVIEW_DRAFT_KEY, bad);
      const { unmount } = render(<NewInterview {...props()} config={DEFAULT_CONFIG} />);
      expect(screen.getByLabelText("Role")).toHaveValue("");
      unmount();
    }
  });

  it("adds a project folder once, scans it, and can remove it", async () => {
    localStorage.setItem(NEW_INTERVIEW_DRAFT_KEY, JSON.stringify({ step: 2, role: "Dev" }));
    backend({
      select_directory_dialog: () => "C:\\code\\app",
      scan_multiple_project_directories: () => "### Project summary with enough text",
    });
    const p = props();
    const user = userEvent.setup();
    render(<NewInterview {...p} />);

    await user.click(await screen.findByRole("button", { name: "Add a project folder" }));
    expect(await screen.findByText("C:\\code\\app")).toBeInTheDocument();
    expect(await screen.findByText(/Read 1 folder/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a project folder" }));
    await waitFor(() => expect(callsTo("select_directory_dialog")).toHaveLength(2));
    expect(screen.getAllByText("C:\\code\\app")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Start interview" }));
    expect(p.onCreate.mock.calls[0][0]).toMatchObject({
      projectDirectories: ["C:\\code\\app"],
      projectDirectory: "C:\\code\\app",
      projectContext: "### Project summary with enough text",
    });
  });

  it("reports a folder that cannot be read and still lets the interview start", async () => {
    localStorage.setItem(NEW_INTERVIEW_DRAFT_KEY, JSON.stringify({ step: 2, role: "Dev" }));
    backend({
      select_directory_dialog: () => "C:\\locked",
      scan_multiple_project_directories: () => {
        throw "Access is denied.";
      },
    });
    const p = props();
    const user = userEvent.setup();
    render(<NewInterview {...p} />);

    await user.click(await screen.findByRole("button", { name: "Add a project folder" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Access is denied.");
    await user.click(screen.getByRole("button", { name: "Start interview" }));
    expect(p.onCreate).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the folder dialog is dismissed", async () => {
    localStorage.setItem(NEW_INTERVIEW_DRAFT_KEY, JSON.stringify({ step: 2, role: "Dev" }));
    backend({ select_directory_dialog: () => null });
    render(<NewInterview {...props()} />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Add a project folder" }));

    await waitFor(() => expect(callsTo("select_directory_dialog")).toHaveLength(1));
    expect(callsTo("scan_multiple_project_directories")).toHaveLength(0);
  });
});
