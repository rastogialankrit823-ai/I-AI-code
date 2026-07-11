import { FileCode2, Pin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * VS Code-style tab bar shared by DSA (CodeEditor) and LLD (SystemDesignMode).
 *
 * tabs: [{ id, name, pinned?, dirty? }]
 * Handlers are optional — omitted ones hide the matching action.
 */
export default function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNewTab,
  onRename,          // (id, newName) — omit to disable rename
  onReorder,         // (fromId, toId) — omit to disable drag
  onTogglePin,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  compact = false,   // smaller tabs for the LLD editor header
}) {
  const [menu, setMenu] = useState(null)        // {x, y, tabId}
  const [renaming, setRenaming] = useState(null) // tabId
  const [renameVal, setRenameVal] = useState('')
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const renameRef = useRef(null)

  // Pinned tabs first, like VS Code
  const ordered = [...tabs].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus()
      renameRef.current.select()
    }
  }, [renaming])

  const startRename = (tab) => {
    if (!onRename) return
    setRenaming(tab.id)
    setRenameVal(tab.name)
    setMenu(null)
  }

  const commitRename = () => {
    if (renaming && renameVal.trim()) onRename(renaming, renameVal.trim())
    setRenaming(null)
  }

  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : null
  const menuIdx = menu ? ordered.findIndex((t) => t.id === menu.tabId) : -1

  const menuItems = menuTab ? [
    onRename    && { label: 'Rename…', act: () => startRename(menuTab) },
    onTogglePin && { label: menuTab.pinned ? 'Unpin' : 'Pin', act: () => { onTogglePin(menuTab.id); setMenu(null) } },
    onClose     && !menuTab.pinned && { label: 'Close', act: () => { onClose(menuTab.id); setMenu(null) }, key: '⌥W' },
    onCloseOthers && tabs.length > 1 && { label: 'Close Others', act: () => { onCloseOthers(menuTab.id); setMenu(null) } },
    onCloseRight  && menuIdx < ordered.length - 1 && { label: 'Close to the Right', act: () => { onCloseRight(menuTab.id); setMenu(null) } },
    onCloseAll  && { label: 'Close All', act: () => { onCloseAll(); setMenu(null) } },
  ].filter(Boolean) : []

  return (
    <div
      className={`vtab-bar${compact ? ' compact' : ''}`}
      onDoubleClick={(e) => {
        if (e.target.classList.contains('vtab-bar') && onNewTab) onNewTab()
      }}
    >
      {ordered.map((tab) => (
        <div
          key={tab.id}
          className={
            `vtab${tab.id === activeTabId ? ' active' : ''}` +
            `${tab.pinned ? ' pinned' : ''}` +
            `${dragOverId === tab.id && dragId !== tab.id ? ' drag-over' : ''}`
          }
          title={tab.name}
          draggable={Boolean(onReorder) && renaming !== tab.id}
          onClick={() => onSelect?.(tab.id)}
          onDoubleClick={(e) => { e.stopPropagation(); startRename(tab) }}
          onAuxClick={(e) => {
            // middle-click closes (not pinned)
            if (e.button === 1 && onClose && !tab.pinned) { e.preventDefault(); onClose(tab.id) }
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id })
          }}
          onDragStart={(e) => { setDragId(tab.id); e.dataTransfer.effectAllowed = 'move' }}
          onDragOver={(e) => { e.preventDefault(); setDragOverId(tab.id) }}
          onDragLeave={() => setDragOverId((cur) => (cur === tab.id ? null : cur))}
          onDrop={(e) => {
            e.preventDefault()
            if (dragId && dragId !== tab.id) onReorder?.(dragId, tab.id)
            setDragId(null); setDragOverId(null)
          }}
          onDragEnd={() => { setDragId(null); setDragOverId(null) }}
        >
          {tab.pinned
            ? <Pin size={11} className="vtab-pin" />
            : <FileCode2 size={compact ? 11 : 13} />}
          {renaming === tab.id ? (
            <input
              ref={renameRef}
              className="vtab-rename"
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(null)
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="vtab-name">{tab.name}</span>
          )}
          {tab.dirty && <span className="vtab-dirty" title="Unsaved changes">●</span>}
          {onClose && !tab.pinned && (tabs.length > 1 || onNewTab) && (
            <button
              className="vtab-close"
              title="Close (middle-click)"
              onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
            >×</button>
          )}
        </div>
      ))}
      {onNewTab && (
        <button className="vtab-add" title="New tab (double-click bar · ⌥T)" onClick={onNewTab}>+</button>
      )}

      {menu && menuItems.length > 0 && (
        <div
          className="vtab-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menuItems.map((mi, i) => (
            <button key={i} className="vtab-menu-item" onClick={mi.act}>
              {mi.label}
              {mi.key && <span className="vtab-menu-key">{mi.key}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
