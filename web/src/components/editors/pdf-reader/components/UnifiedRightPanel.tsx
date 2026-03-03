import React, {
  useState,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";
import { cn } from "@/lib/utils";
import { X, Tag, FileText, Send } from "lucide-react";
import { TagPanel, NotesPanel } from "./rightPanels";
import { componentEventBus } from "@/lib/events";
// import { ChatPanel } from './rightPanels'; // Chat feature temporarily disabled
import { NotesPanelRef } from "./rightPanels/NotesPanel";
import Image from "next/image";
import { api } from "@/lib/api";
import { Apis } from "@/constants/api";
import { toast } from "sonner";

type PanelType = "tags" | "notes"; // | 'chat'; // Chat feature temporarily disabled

// Note type definition
export interface NoteRecord {
  id: number;
  block_id: number;
  user_id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

interface UnifiedRightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCanvas?: () => void;
  onWidthChange?: (width: number) => void;
  className?: string;
  // TagPanel props
  tags?: any[];
  onTagClick?: (tag: any) => void;
  onTagVisibilityToggle?: (tagId: string) => void;
  onTagDelete?: (tagId: string) => void;
  onAddComment?: (tagId: string, content: string) => void;
  onLikeTag?: (tagId: string) => void;
  onLikeComment?: (tagId: string, commentId: string) => void;
  categories?: any[];
  onToggleCategoriesManager?: () => void;
  // NotesPanel props
  notesInitialValue?: string;
  onNotesChange?: (value: string) => void;
  paperId: number;
  // ChatPanel props - chat feature temporarily disabled
  // pdfOutline?: any[];
  // pdfText?: string;
  // pdfUrl?: string;
}

export interface UnifiedRightPanelRef {
  insertContentToNotes: (content: string, type?: "text" | "quote") => void;
  switchToNotesPanel: () => void;
  getNotesPanelRef: () => NotesPanelRef | null;
}

const minWidth = 320;
const getMaxWidth = () => (typeof window !== "undefined" ? window.innerWidth : 900);
const defaultWidth = 380;

export const UnifiedRightPanel = forwardRef<
  UnifiedRightPanelRef,
  UnifiedRightPanelProps
>(
  (
    {
      isOpen,
      onClose,
      onAddToCanvas,
      onWidthChange,
      className,
      // TagPanel props
      tags,
      onTagClick,
      onTagVisibilityToggle,
      onTagDelete,
      onAddComment,
      onLikeTag,
      onLikeComment,
      categories,
      onToggleCategoriesManager,
      // NotesPanel props
      notesInitialValue = "",
      onNotesChange,
      // ChatPanel props - chat feature temporarily disabled
      // pdfOutline,
      // pdfText,
      // pdfUrl,
      paperId,
    },
    ref
  ) => {
    const [width, setWidth] = useState(defaultWidth);
    const [isResizing, setIsResizing] = useState(false);
    const [activePanel, setActivePanel] = useState<PanelType>("tags");
    const panelRef = useRef<HTMLDivElement>(null);
    const notesPanelRef = useRef<NotesPanelRef>(null);

    // Methods exposed to the parent component
    useImperativeHandle(
      ref,
      () => ({
        insertContentToNotes: (
          content: string,
          type: "text" | "quote" = "text"
        ) => {
          // Automatically switch to the notes panel
          setActivePanel("notes");

          // Wait for panel switch to complete before inserting content
          setTimeout(() => {
            if (notesPanelRef.current) {
              notesPanelRef.current.insertContent(content, type);
            }
          }, 100);

          console.log("Inserting content to notes via right panel:", {
            content,
            type,
            activePanel: "notes",
          });
        },

        switchToNotesPanel: () => {
          setActivePanel("notes");
        },

        getNotesPanelRef: () => {
          return notesPanelRef.current;
        },
      }),
      []
    );

    useEffect(() => {
      if (isOpen && activePanel === "notes") {
        // getNotesData();
      }
    }, [isOpen, activePanel]);

    // Save new note
    const handleSaveNewNote = () => {
      api
        .post(Apis["pdf-notes"], {
          content: notesInitialValue,
          block_id: paperId,
        })
        .then(() => {
          toast.success("Note saved successfully!");
        })
        .catch((error) => {
          console.error("Error saving note:", error);
        });
    };

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);

        const startX = e.clientX;
        const startWidth = width;

        const handleMouseMove = (e: MouseEvent) => {
          const maxWidth = getMaxWidth();
          const deltaX = startX - e.clientX;
          const newWidth = Math.max(
            minWidth,
            Math.min(maxWidth, startWidth + deltaX)
          );
          setWidth(newWidth);
          onWidthChange?.(newWidth);
        };

        const handleMouseUp = () => {
          setIsResizing(false);
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
      },
      [width, minWidth, onWidthChange]
    );

    const panelTabs = [
      { id: "tags" as PanelType, label: "Tags", icon: Tag },
      { id: "notes" as PanelType, label: "Notes", icon: FileText },
      // { id: 'chat' as PanelType, label: 'AI Assistant', icon: MessageSquare }, // Chat feature temporarily disabled
    ];

    const renderPanelContent = () => {
      switch (activePanel) {
        case "tags":
          return (
            <TagPanel
              tags={tags}
              onTagClick={onTagClick}
              onTagVisibilityToggle={onTagVisibilityToggle}
              onTagDelete={onTagDelete}
              onAddComment={onAddComment}
              onLikeTag={onLikeTag}
              onLikeComment={onLikeComment}
              categories={categories}
              onToggleCategoriesManager={onToggleCategoriesManager}
            />
          );
        case "notes":
          return (
            <NotesPanel
              ref={notesPanelRef}
              initialValue={notesInitialValue}
              onChange={onNotesChange}
              onInsertContent={(content: string) => {
                console.log("Notes editor content insert:", content);
              }}
            />
          );
        default:
          return null;
      }
    };

    return (
      <>
        {isOpen && (
          <div
            ref={panelRef}
            className={cn(
              "flex-shrink-0 h-full bg-[#faf8f5] backdrop-blur-md shadow-xl z-40 border-l border-[#e5e2dd]",
              className
            )}
            style={{ width: `${width}px` }}
          >
            {/* Resize Handle */}
            <div
              className={cn(
                "absolute left-0 top-0 w-1 h-full cursor-col-resize bg-transparent hover:bg-[var(--main-color)] transition-colors",
                "flex items-center justify-center group",
                isResizing && "bg-[var(--main-color)]"
              )}
              onMouseDown={handleMouseDown}
            >
              <div className="w-0.5 h-12 bg-[var(--stroke-nor)] group-hover:bg-[var(--main-color)] transition-colors rounded-full" />
            </div>

            {/* Panel Content */}
            <div className="h-full flex flex-col pl-2">
              {/* Header with tabs */}
              <div className="border-b border-[var(--stroke-nor)]">
                <div className="flex items-center justify-between p-4">
                  {/* Tab Navigation */}
                  <div className="flex bg-[var(--bg-box-nor)] rounded-lg p-1">
                    {panelTabs.map((tab) => {
                      const IconComponent = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActivePanel(tab.id)}
                          className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200",
                            activePanel === tab.id
                              ? "bg-[var(--main-color)] text-white shadow-sm"
                              : "text-[var(--text-3)] hover:bg-[var(--bg-box-act)] hover:text-[var(--text-2)]"
                          )}
                          title={tab.label}
                        >
                          <IconComponent className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    {activePanel === "notes" && (
                      <>
                        <button
                          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--main-color-lite)] transition"
                          title="Send to Workspace Notes"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (notesInitialValue) {
                              componentEventBus.emit({
                                component: 'ai-editor',
                                type: 'notesInsert',
                                payload: { result: notesInitialValue, message: 'pdf-reader' },
                                timestamp: Date.now(),
                              });
                              toast.success('Sent to Workspace Notes');
                            }
                          }}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--main-color-lite)] transition"
                          title="To Canvas"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onAddToCanvas) onAddToCanvas();
                          }}
                        >
                          <Image
                            src="/assets/img/to-canvas.png"
                            alt="To Canvas"
                            width={20}
                            height={20}
                            className="w-5 h-5"
                          />
                        </button>
                        <button
                          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--main-color-lite)] transition"
                          title="Save Note"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveNewNote();
                          }}
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                      </>
                    )}

                    <button
                      onClick={onClose}
                      className="p-1.5 hover:bg-[var(--bg-box-nor)] rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-[var(--text-3)]" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-hidden">
                {renderPanelContent()}
              </div>
            </div>

            {/* Resize cursor overlay */}
            {isResizing && (
              <div className="fixed inset-0 cursor-col-resize z-50" />
            )}
          </div>
        )}
      </>
    );
  }
);

UnifiedRightPanel.displayName = "UnifiedRightPanel";
