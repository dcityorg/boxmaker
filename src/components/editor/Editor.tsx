'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { HelpPanel } from './HelpPanel';
import { Viewport } from '@/components/viewport/Viewport';
import { useAutoSave } from '@/store/useAutoSave';
import { useUndoRedo } from '@/store/useUndoRedo';

export function Editor() {
  const [helpOpen, setHelpOpen] = useState(false);
  useAutoSave();
  const history = useUndoRedo();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        helpOpen={helpOpen}
        onToggleHelp={() => setHelpOpen((h) => !h)}
        undo={history.undo}
        redo={history.redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
      />
      <div className="flex-1 min-w-0">
        <Viewport />
      </div>
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
