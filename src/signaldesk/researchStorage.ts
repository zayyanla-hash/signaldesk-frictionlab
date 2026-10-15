import { RESEARCH_STORAGE, isWorkspace, type ResearchWorkspace } from './researchModel';
export interface ResearchStore { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; }
export type WriteResult = { status: 'saved'; raw: string } | { status: 'conflict' | 'unavailable' | 'invalid'; message: string };
/** Compare the exact saved snapshot before replacing it. This is optimistic
 * concurrency protection for ordinary browser tabs, not a transactional database.
 * The synchronous read/write pair prevents stale tabs from silently overwriting
 * a prior committed snapshot. In-memory edits remain available for backup. */
export function writeWorkspace(store: ResearchStore, workspace: ResearchWorkspace, expectedRaw: string | null): WriteResult {
  if (!isWorkspace(workspace)) return { status: 'invalid', message: 'Research data failed schema or size validation. Current saved research is unchanged.' };
  try {
    if (store.getItem(RESEARCH_STORAGE) !== expectedRaw) return { status: 'conflict', message: 'Another tab changed the saved workspace. This tab’s changes are in memory only. Download this tab’s backup before loading the latest saved research.' };
    const raw = JSON.stringify(workspace);
    store.setItem(RESEARCH_STORAGE, raw);
    return { status: 'saved', raw };
  } catch { return { status: 'unavailable', message: 'Could not save to browser storage. Your changes are in memory only. Download a workspace backup before leaving.' }; }
}
