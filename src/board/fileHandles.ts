'use client';

/**
 * Remembers WHICH FILE each board was imported from, so the Boards panel can
 * re-read it on demand without sending the user back through a file picker.
 *
 * Chrome's File System Access API hands back a handle when the user picks a
 * file, and that handle can be read again for as long as the page lives. That
 * turns the edit-the-file loop into: save in your editor, click refresh, see
 * the result -- no dialog.
 *
 * Deliberately NOT in the Zustand store: a handle is not serialisable, so it
 * must stay out of the design file, the share link, autosave and undo. It is
 * session-only by design -- after a reload the map is empty and refresh falls
 * back to opening the picker, which is exactly the old behaviour.
 */

/** The slice of FileSystemFileHandle we use, so this compiles without the DOM lib. */
export interface BoardFileHandle {
  name: string;
  getFile(): Promise<File>;
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
}

interface PickerWindow {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<BoardFileHandle[]>;
}

const handles = new Map<string, BoardFileHandle>();

function key(boardName: string): string {
  return boardName.trim().toLowerCase();
}

export function rememberHandle(boardName: string, handle: BoardFileHandle | null): void {
  if (handle) handles.set(key(boardName), handle);
}

export function forgetHandle(boardName: string): void {
  handles.delete(key(boardName));
}

/** True when this board can be refreshed silently, with no file picker. */
export function hasHandle(boardName: string): boolean {
  return handles.has(key(boardName));
}

export function getHandle(boardName: string): BoardFileHandle | null {
  return handles.get(key(boardName)) ?? null;
}

function picker(): PickerWindow['showOpenFilePicker'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as PickerWindow).showOpenFilePicker;
}

/**
 * Synchronous support check. Callers must test this BEFORE any `await`, so the
 * fallback `input.click()` still runs inside the click's user activation --
 * both the picker and a programmatic file-input click require it.
 *
 * Note showOpenFilePicker can be absent even where FileSystemFileHandle exists:
 * a Chrome extension's isolated world is one such place. Feature-detect the
 * method itself, never the interface.
 */
export function supportsFilePicker(): boolean {
  return typeof picker() === 'function';
}

/**
 * Ask for a board file. Uses the File System Access API when available so a
 * handle comes back with the file; otherwise returns null and the caller falls
 * back to a plain <input type="file">.
 *
 * No type filter is applied -- see the note on the file input in
 * BoardsControls: a filter greys out unexpected extensions with no explanation,
 * and the parser gives a far better error than an unclickable filename.
 *
 * Returns null when the user cancels.
 */
export async function pickBoardFile(): Promise<
  { file: File; handle: BoardFileHandle } | null | 'unsupported'
> {
  const show = picker();
  if (!show) return 'unsupported';
  try {
    const [handle] = await show({ multiple: false });
    if (!handle) return null;
    return { file: await handle.getFile(), handle };
  } catch (err) {
    // AbortError is the user cancelling the dialog -- not worth reporting.
    if ((err as DOMException)?.name === 'AbortError') return null;
    throw err;
  }
}

/**
 * Re-read a board's file. Returns null when there is no handle, or when the
 * user declines to re-grant read permission (which Chrome may ask for if the
 * page has been idle).
 */
export async function rereadBoardFile(boardName: string): Promise<File | null> {
  const handle = handles.get(key(boardName));
  if (!handle) return null;
  try {
    if (handle.queryPermission) {
      let state = await handle.queryPermission({ mode: 'read' });
      if (state === 'prompt' && handle.requestPermission) {
        state = await handle.requestPermission({ mode: 'read' });
      }
      if (state !== 'granted') return null;
    }
    return await handle.getFile();
  } catch (err) {
    // The file may have been moved, renamed or deleted since it was imported.
    console.warn('[BoxMaker] could not re-read board file:', err);
    return null;
  }
}
